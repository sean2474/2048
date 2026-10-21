import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createAuthDatabase } from "./helpers/pglite";
import type { PGlite } from "@electric-sql/pglite";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const GUEST = "33333333-3333-4333-8333-333333333333";
const migration = "20261017030000_achievement_unlocks.sql";
type State = {
  attendance: {
    streak: number;
    bestStreak: number;
    lastDay: string | null;
    today: string;
    checkedInToday: boolean;
    nextCheckInAt: string;
  };
  wins: number;
  highestTile: number;
  unlocks: Array<{ achievementId: string; unlockedAt: string }>;
};
async function database(
  t: TestContext,
  beforeUpgrade?: (record: ReturnType<typeof createRecord>, db: PGlite) => Promise<void>,
) {
  const db = await createAuthDatabase();
  t.after(() => db.close());
  const dir = new URL("../../../supabase/migrations/", import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files.filter((f) => f < migration))
    await db.exec(await readFile(new URL(file, dir), "utf8"));
  await db.query("insert into auth.users(id,is_anonymous) values($1,false),($2,false),($3,true)", [
    A,
    B,
    GUEST,
  ]);
  const rpc = async <T>(sql: string, args: unknown[] = []) =>
    (await db.query<{ value: T }>(`select ${sql} as value`, args)).rows[0].value;
  const as = async <T>(
    role: "anon" | "authenticated" | "service_role",
    id: string,
    fn: () => Promise<T>,
  ) => {
    await db.exec(`set role ${role}`);
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal','aal2',false)",
      [id],
    );
    try {
      return await fn();
    } finally {
      await db.exec("reset role");
    }
  };
  const record = createRecord(rpc, as);
  if (beforeUpgrade) await beforeUpgrade(record, db);
  await db.exec(await readFile(new URL(migration, dir), "utf8"));
  const state = (id = A) => as("authenticated", id, () => rpc<State>("public.achievement_state()"));
  const checkAt = (instant: string, id = A) => rpc("private.check_in_at($1,$2)", [id, instant]);
  return { db, rpc, as, record, state, checkAt };
}
function createRecord(
  rpc: <T>(sql: string, args?: unknown[]) => Promise<T>,
  as: <T>(
    role: "anon" | "authenticated" | "service_role",
    id: string,
    fn: () => Promise<T>,
  ) => Promise<T>,
) {
  return (
    options: {
      mode?: string;
      first?: string | null;
      second?: string | null;
      winner?: number | null;
      tile?: number;
      id?: string;
    } = {},
  ) => {
    const {
      mode = "casual",
      first = A,
      second = B,
      winner = 1,
      tile = 64,
      id = randomUUID(),
    } = options;
    const participants = [
      {
        userId: first,
        score: 20480,
        maxTile: tile,
        telemetry: {
          moves: 40,
          charged: { xblock: 0, hardblock: 0 },
          sent: { xblock: 0, hardblock: 0 },
          received: { xblock: 0, hardblock: 0 },
        },
      },
      { userId: second, score: 10, maxTile: 8 },
    ];
    return as("service_role", "", () =>
      rpc<boolean>(
        "public.record_match($1,'2026-10-15T00:00:00Z','2026-10-15T00:01:00Z',$2,$3::smallint,$4::jsonb,$5)",
        [id, winner === null ? "draw" : "surrender", winner, JSON.stringify(participants), mode],
      ),
    );
  };
}

test("check-in is account-only, idempotent and cannot accept a client-controlled date", async (t) => {
  const { db, rpc, as, state } = await database(t);
  assert.equal((await state()).attendance.streak, 0);
  assert.deepEqual((await state()).unlocks, []);
  for (const role of ["anon", "authenticated"] as const) {
    await as(role, role === "anon" ? "" : GUEST, () =>
      assert.rejects(rpc("public.check_in()"), /permission denied|Account required/),
    );
    await as(role, role === "anon" ? "" : GUEST, () =>
      assert.rejects(rpc("public.achievement_state()"), /permission denied|Account required/),
    );
  }
  await as("authenticated", A, async () => {
    const first = await rpc<State>("public.check_in()");
    const second = await rpc<State>("public.check_in()");
    assert.deepEqual(first, second);
    assert.equal(first.attendance.streak, 1);
    assert.equal(first.attendance.checkedInToday, true);
    assert.equal(first.attendance.lastDay, first.attendance.today);
    assert.equal(new Date(first.attendance.nextCheckInAt).getUTCHours(), 15);
    await assert.rejects(rpc("public.check_in('2099-01-01')"), /does not exist/);
    await assert.rejects(rpc("private.check_in_at($1,'2099-01-01')", [A]), /permission denied/);
    await assert.rejects(
      db.query(
        "insert into public.achievement_unlocks(player_id,achievement_id) values($1,'checkin-30')",
        [A],
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update public.player_attendance set streak=30"),
      /permission denied/,
    );
    await assert.rejects(db.query("delete from public.player_attendance"), /permission denied/);
  });
  await as("authenticated", B, async () =>
    assert.deepEqual((await db.query("select * from public.player_attendance")).rows, []),
  );
});

test("KST days, gaps, seven and thirty day thresholds preserve earned rewards permanently", async (t) => {
  const { db, checkAt, state } = await database(t);
  await checkAt("2026-09-01T14:59:59Z");
  await checkAt("2026-09-01T15:00:00Z");
  assert.equal(
    (
      await db.query<{ streak: number }>(
        "select streak from public.player_attendance where player_id=$1",
        [A],
      )
    ).rows[0].streak,
    2,
  );
  await checkAt("2026-09-01T15:00:01Z");
  for (let day = 3; day <= 29; day++) {
    await checkAt(`2026-09-${String(day).padStart(2, "0")}T00:00:00Z`);
    if (day === 6) assert.deepEqual((await state()).unlocks, []);
    if (day === 7)
      assert.deepEqual(
        (await state()).unlocks.map((u) => u.achievementId),
        ["checkin-7"],
      );
  }
  assert.deepEqual(
    (await state()).unlocks.map((u) => u.achievementId),
    ["checkin-7"],
  );
  await checkAt("2026-09-30T00:00:00Z");
  const unlocked = (await state()).unlocks;
  assert.deepEqual(
    unlocked.map((u) => u.achievementId),
    ["checkin-30", "checkin-7"],
  );
  assert.equal((await state()).attendance.streak, 0, "old streak expires in the read-only state");
  assert.equal((await state()).attendance.bestStreak, 30);
  await checkAt("2026-10-02T00:00:00Z");
  assert.equal(
    (
      await db.query<{ streak: number }>(
        "select streak from public.player_attendance where player_id=$1",
        [A],
      )
    ).rows[0].streak,
    1,
  );
  assert.equal((await state()).attendance.bestStreak, 30);
  assert.deepEqual((await state()).unlocks, unlocked);
  await checkAt("2026-10-02T01:00:00Z");
  assert.deepEqual((await state()).unlocks, unlocked);
});

test("recorded casual and ranked milestones unlock once while friends, guests and self matches do not count", async (t) => {
  const { db, record, state, as, rpc } = await database(t);
  for (const options of [{ mode: "friend" }, { second: null }, { second: GUEST }, { second: A }])
    await record({ ...options, tile: 2048 });
  assert.equal((await state()).wins, 0);
  assert.equal((await state()).highestTile, 0);
  assert.deepEqual((await state()).unlocks, []);
  for (let i = 0; i < 9; i++) await record({ mode: i % 2 ? "ranked" : "casual" });
  assert.equal((await state()).wins, 9);
  assert.deepEqual((await state()).unlocks, []);
  const id = randomUUID();
  assert.equal(await record({ id, tile: 2048 }), true);
  assert.equal(await record({ id, tile: 2048 }), false);
  const unlocked = (await state()).unlocks;
  assert.deepEqual(
    unlocked.map((u) => u.achievementId),
    ["tile-2048-reward", "wins-10"],
  );
  assert.equal((await state()).wins, 10);
  assert.equal((await state()).highestTile, 2048);
  assert.equal(
    (
      await db.query<{ telemetry: { moves: number } }>(
        "select telemetry from public.match_participants where match_id=$1 and slot=1",
        [id],
      )
    ).rows[0].telemetry.moves,
    40,
  );
  await record({ winner: 2 });
  await record({ winner: null });
  assert.equal((await state()).wins, 10);
  assert.equal((await state(B)).wins, 1);
  await as("authenticated", A, () =>
    assert.rejects(rpc("public.record_match(null,null,null,null,null,null)"), /permission denied/),
  );
  await db.query("delete from auth.users where id=$1", [B]);
  assert.equal((await state()).wins, 10, "opponent deletion must not erase qualified wins");
  assert.deepEqual((await state()).unlocks, unlocked);
});

test("existing valid history is backfilled without rewarding excluded games", async (t) => {
  const { state } = await database(t, async (record) => {
    for (let i = 0; i < 10; i++) await record({ tile: i === 9 ? 2048 : 64 });
    for (let i = 0; i < 10; i++) await record({ first: B, second: A, mode: "friend", tile: 2048 });
  });
  assert.deepEqual(
    (await state()).unlocks.map((u) => u.achievementId),
    ["tile-2048-reward", "wins-10"],
  );
  assert.equal((await state(B)).wins, 0);
  assert.equal((await state(B)).highestTile, 8);
  assert.deepEqual((await state(B)).unlocks, []);
});

test("ranked history retains its proven qualification when an opponent was deleted before upgrade", async (t) => {
  const { state } = await database(t, async (record, db) => {
    for (let i = 0; i < 10; i++) await record({ mode: "ranked", tile: 2048 });
    await db.query("delete from auth.users where id=$1", [B]);
  });
  assert.equal((await state()).wins, 10);
  assert.equal((await state()).highestTile, 2048);
  assert.deepEqual(
    (await state()).unlocks.map((u) => u.achievementId),
    ["tile-2048-reward", "wins-10"],
  );
});

test("reward equipment is gated on insert and update and unlock rows remain private", async (t) => {
  const { db, as, checkAt, record } = await database(t);
  await as("authenticated", A, async () => {
    await assert.rejects(
      db.query("insert into public.player_preferences(player_id,skin_id) values($1,'dawn-oath')", [
        A,
      ]),
      /Achievement required/,
    );
    await assert.rejects(
      db.query(
        "insert into public.player_preferences(player_id,icon_id) values($1,'attendance-king')",
        [A],
      ),
      /Achievement required/,
    );
    await db.query("insert into public.player_preferences(player_id) values($1)", [A]);
    await assert.rejects(
      db.query("update public.player_preferences set skin_id='rune-sanctum' where player_id=$1", [
        A,
      ]),
      /Achievement required/,
    );
    await assert.rejects(
      db.query(
        "update public.player_preferences set icon_id='victory-vanguard' where player_id=$1",
        [A],
      ),
      /Achievement required/,
    );
  });
  for (let day = 1; day <= 30; day++)
    await checkAt(`2026-09-${String(day).padStart(2, "0")}T00:00:00Z`);
  for (let i = 0; i < 10; i++) await record({ tile: 2048 });
  await as("authenticated", A, async () => {
    await db.query(
      "update public.player_preferences set skin_id='dawn-oath',icon_id='attendance-king' where player_id=$1",
      [A],
    );
    await db.query(
      "update public.player_preferences set skin_id='rune-sanctum',icon_id='victory-vanguard' where player_id=$1",
      [A],
    );
    assert.equal((await db.query("select * from public.achievement_unlocks")).rows.length, 4);
    await assert.rejects(
      db.query("update public.achievement_unlocks set unlocked_at=now()"),
      /permission denied/,
    );
  });
  await as("authenticated", B, async () => {
    assert.deepEqual((await db.query("select * from public.achievement_unlocks")).rows, []);
    await assert.rejects(
      db.query("insert into public.player_preferences(player_id,skin_id) values($1,'dawn-oath')", [
        A,
      ]),
      /row-level security/,
    );
    await assert.rejects(
      db.query("insert into public.player_preferences(player_id,skin_id) values($1,'dawn-oath')", [
        B,
      ]),
      /Achievement required/,
    );
  });
  await as("authenticated", GUEST, async () => {
    await assert.rejects(
      db.query(
        "insert into public.player_preferences(player_id,icon_id) values($1,'attendance-king')",
        [GUEST],
      ),
      /Achievement required/,
    );
  });
  await db.query("delete from auth.users where id=$1", [A]);
  assert.deepEqual((await db.query("select * from public.achievement_unlocks")).rows, []);
  assert.deepEqual((await db.query("select * from public.player_attendance")).rows, []);
});
