import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { io } from "socket.io-client";
import { SoloCommandSchema, formatSoloTime, SOLO_LIMIT_MS, type SoloReply } from "schema/solo";
import { createSoloRun, advanceSolo, createSoloService, saveSoloRun } from "../src/solo";
import { createGameServer } from "../src/server";

test("solo only accepts moves, never client-supplied times, boards or rewards", () => {
  assert.equal(SoloCommandSchema.safeParse({ t: "start", mode: "time-attack", elapsedMs: 1 }).success, false);
  assert.equal(SoloCommandSchema.safeParse({ t: "move", id: randomUUID(), seq: 1, dir: "diagonal" }).success, false);
  assert.equal(SoloCommandSchema.safeParse({ t: "move", id: randomUUID(), seq: -1, dir: "left" }).success, false);
  assert.equal(formatSoloTime(65_432), "01:05.43");
  assert.equal(formatSoloTime(600_000), "10:00.00");
});

test("2048 wins once, moves and score are server computed, invalid moves do not spawn", () => {
  const run = createSoloRun(null, 1000, "time-attack");
  run.state.board = [{ id: 1, value: 1024, row: 0, col: 0 }, { id: 2, value: 1024, row: 0, col: 1 }];
  advanceSolo(run, "up", 2000, () => 0);
  assert.equal(run.state.moves, 0); assert.equal(run.state.board.length, 2);
  advanceSolo(run, "left", 301000, () => 0);
  assert.equal(run.state.status, "won"); assert.equal(run.state.elapsedMs, 300000);
  assert.equal(run.state.moves, 1); assert.equal(run.state.score, 2048);
  const final = structuredClone(run.state);
  advanceSolo(run, "right", 999000); assert.deepEqual(run.state, final);
  const expired = createSoloRun(null, 0, "time-attack");
  advanceSolo(expired, "left", SOLO_LIMIT_MS); assert.equal(expired.state.status, "expired");
  assert.equal(expired.state.moves, 0);
});

test("failed saves retain the exact finish and retry without duplicate rewards", async () => {
  const run = createSoloRun("account", 1000, "time-attack");
  run.state.board = [{ id: 1, value: 1024, row: 0, col: 0 }, { id: 2, value: 1024, row: 0, col: 1 }];
  advanceSolo(run, "left", 123456);
  await saveSoloRun(run, async () => { throw Error("offline"); });
  assert.equal(run.state.saving, "error");
  const records: unknown[] = [];
  const writer = async (record: unknown) => { records.push(record); };
  await saveSoloRun(run, writer);
  await saveSoloRun(run, writer);
  assert.equal(run.state.saving, "saved");
  assert.deepEqual(records, [{ id: run.state.id, playerId: "account", elapsedMs: 122456, moves: 1, score: 2048, mode: "time-attack", maxTile: 2048 }]);
  const guest = createSoloRun(null, 0, "time-attack"); guest.state.status = "won";
  await saveSoloRun(guest, writer); assert.equal(records.length, 1);
});

test("solo detects a full board with no remaining moves", () => {
  const run = createSoloRun(null, 0, "time-attack");
  run.state.board = Array.from({ length: 16 }, (_, i) => ({ id: 100+i, row: Math.floor(i/4), col: i%4, value: (Math.floor(i/4)+i%4)%2 ? 4 : 2 }));
  // Open the final cell and shift its neighbour; spawning a 2 seals the board.
  run.state.board.pop();
  run.state.board[14].col = 3;
  advanceSolo(run, "left", 100, () => 0);
  assert.equal(run.state.status, "lost");
});

test("account starts fail closed on unavailable or suspended accounts", async t => {
  const unavailable = createSoloService({}); t.after(() => unavailable.close());
  assert.equal((await unavailable.handle("a", "account", { t: "start", mode: "time-attack" }, () => true)).error, "solo_unavailable");
  const suspended = createSoloService({ writeSolo: async () => {}, readSuspensions: async ids => ids }); t.after(() => suspended.close());
  assert.equal((await suspended.handle("a", "account", { t: "start", mode: "time-attack" }, () => true)).error, "account_suspended");
  assert.equal((await suspended.handle("b", null, { t: "start", mode: "time-attack" }, () => false)).error, "already_in_game");
});

test("real socket solo protocol resumes the same run and ignores duplicate move sequence", async t => {
  const server = createGameServer();
  await new Promise<void>(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
  const socket = io(`http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`, { transports: ["websocket"], auth: { sessionToken: randomBytes(32).toString("hex") }, autoConnect: false });
  t.after(async () => { socket.disconnect(); await server.close(); });
  const connect = () => new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect(); });
  const send = (command: unknown) => socket.timeout(2000).emitWithAck("solo", command) as Promise<SoloReply>;
  await connect();
  const start = (await send({ t: "start", mode: "time-attack" })).state!;
  assert.equal(start.board.length, 2); assert.equal(start.saving, "guest");
  const command = { t: "move", id: start.id, seq: 1, dir: "left" };
  const first = (await send(command)).state!;
  const duplicate = (await send(command)).state!;
  assert.equal(first.seq, 1); assert.equal(duplicate.seq, 1); assert.deepEqual(duplicate.board, first.board);
  socket.disconnect(); await connect();
  const resumed = (await send({ t: "state" })).state!;
  assert.equal(resumed.id, start.id); assert.ok(resumed.elapsedMs >= first.elapsedMs);
  assert.equal((await send({ t: "save", id: randomUUID() })).error, "run_expired");
});

test("database records best times atomically, awards threshold skins, protects writes and removes deleted players", async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;`);
  const dir = new URL("../../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(dir)).filter(f => f.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(file, dir), "utf8"));
  const a = randomUUID(), b = randomUUID();
  await db.query("insert into auth.users(id) values($1),($2)", [a,b]);
  const as = async (role: string, user: string, fn: () => Promise<unknown>) => {
    await db.exec(`set role ${role}`); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    try { return await fn(); } finally { await db.exec("reset role"); }
  };
  const record = (ms: number, player = a, moves = 1000, id = randomUUID()) => as("service_role", "", () => db.query("select public.record_solo($1,$2,$3,$4,20480)", [id,player,ms,moves]));
  await db.query("insert into public.player_preferences(player_id) values($1),($2)", [a,b]);
  const unlocks = async () => (await db.query<{ achievement_id: string }>("select achievement_id from public.achievement_unlocks where player_id=$1 order by achievement_id", [a])).rows.map(x=>x.achievement_id);
  await as("authenticated", a, () => assert.rejects(db.query("select public.record_solo($1,$2,1,1,1)", [randomUUID(),a]), /permission denied/));
  await as("authenticated", a, () => assert.rejects(db.query("insert into public.solo_records(player_id,run_id,elapsed_ms,moves,score) values($1,$2,1,1,1)",[a,randomUUID()]), /permission denied/));
  await as("authenticated", a, () => assert.rejects(db.query("update public.player_preferences set skin_id='golden-flash' where player_id=$1",[a]), /Achievement required/));
  await record(600001); assert.deepEqual(await unlocks(), ["solo-first"]);
  await record(600000); assert.deepEqual(await unlocks(), ["solo-10min","solo-first"]);
  await record(360001); assert.deepEqual(await unlocks(), ["solo-10min","solo-first"]);
  await record(360000); assert.deepEqual(await unlocks(), ["solo-10min","solo-6min","solo-first"]);
  await record(240001); assert.equal((await unlocks()).includes("solo-4min"), false);
  await record(240000); assert.equal((await unlocks()).includes("solo-4min"), true);
  await record(120001); assert.equal((await unlocks()).includes("solo-2min"), false);
  await record(120000); assert.equal((await unlocks()).includes("solo-2min"), true);
  await record(800000);
  assert.equal((await db.query<{ elapsed_ms: number }>("select elapsed_ms from public.solo_records where player_id=$1",[a])).rows[0].elapsed_ms, 120000);
  await as("authenticated", a, () => db.query("update public.player_preferences set skin_id='golden-flash' where player_id=$1",[a]));
  await as("authenticated", b, async () => assert.equal((await db.query("select * from public.solo_records")).rows.length,0));
  await record(120000,b,900);
  await as("anon","",async () => assert.deepEqual((await db.query<{ player_id: string }>("select * from public.solo_leaderboard()")).rows.map(x=>x.player_id),[b,a]));
  await as("authenticated",a,async () => {
    const state=(await db.query<{ state: { soloBestMs: number } }>("select public.achievement_state() as state")).rows[0].state;
    assert.equal(state.soloBestMs,120000);
  });
  await assert.rejects(record(0), /Invalid solo record/);
  await assert.rejects(record(SOLO_LIMIT_MS), /Invalid solo record/);
  await db.query("update public.players set suspended_at=now(),suspension_reason='Test suspension' where id=$1",[b]);
  await assert.rejects(record(100000,b), /Account unavailable/);
  await as("anon","",async () => assert.equal((await db.query("select * from public.solo_leaderboard()")).rows.length,1));
  const endless = (tile: number) => as("service_role", "", () => db.query("select public.record_solo_endless($1,$2,$3)", [randomUUID(), a, tile]));
  await as("authenticated", a, () => assert.rejects(db.query("select public.record_solo_endless($1,$2,8192)",[randomUUID(),a]), /permission denied/));
  await as("authenticated", a, () => assert.rejects(db.query("insert into public.solo_endless_records(player_id,run_id,max_tile) values($1,$2,8192)",[a,randomUUID()]), /permission denied/));
  await assert.rejects(endless(2049), /Invalid endless milestone/);
  for (const [tile, skin] of [[2048,"jade-path"],[4096,"twilight-orbit"],[8192,"star-phoenix"]] as const) {
    await as("authenticated", a, () => assert.rejects(db.query("update public.player_preferences set skin_id=$1 where player_id=$2",[skin,a]), /Achievement required/));
    await endless(tile);
    await as("authenticated", a, () => db.query("update public.player_preferences set skin_id=$1 where player_id=$2",[skin,a]));
  }
  await endless(2048);
  assert.equal((await db.query<{ max_tile: number }>("select max_tile from public.solo_endless_records where player_id=$1",[a])).rows[0].max_tile,8192);
  await as("authenticated", b, async () => assert.equal((await db.query("select * from public.solo_endless_records")).rows.length,0));
  await as("authenticated", a, async () => {
    const state=(await db.query<{ state: { soloHighestTile: number } }>("select public.achievement_state() as state")).rows[0].state;
    assert.equal(state.soloHighestTile,8192);
  });
  // Own position is available even when the account is outside the public top 50.
  for (let i=0;i<51;i++) {
    const id=randomUUID(); await db.query("insert into auth.users(id) values($1)",[id]);
    await record(1000+i,id);
  }
  await as("authenticated", a, async () => assert.equal(Number((await db.query<{ rank_position: number }>("select * from public.my_solo_rank()")).rows[0].rank_position),52));
  await as("anon", "", async () => {
    assert.equal((await db.query("select * from public.solo_leaderboard() where player_id=$1",[a])).rows.length,0);
    await assert.rejects(db.query("select * from public.my_solo_rank()"), /permission denied/);
  });
  const season=(await db.query<{id:string}>("select id from public.rank_seasons where ends_at is null")).rows[0].id;
  await db.query("insert into public.player_ratings(player_id,display_name,rating,wins,season_id,placement_games,tier) values($1,'Test',1300,10,$2,10,'Gold')",[a,season]);
  await as("authenticated",a,async () => assert.equal(Number((await db.query<{rank_position:number}>("select * from public.my_season_rank($1)",[season])).rows[0].rank_position),1));
  // Repeated automatic check-ins on the same KST day never double-increment attendance.
  await as("authenticated",a,async () => {
    await db.query("select public.check_in()"); await db.query("select public.check_in()");
    const state=(await db.query<{state:{attendance:{streak:number;checkedInToday:boolean}}}>("select public.achievement_state() as state")).rows[0].state;
    assert.equal(state.attendance.streak,1); assert.equal(state.attendance.checkedInToday,true);
  });
  await db.query("delete from auth.users where id=$1",[a]);
  assert.equal((await db.query("select * from public.solo_records where player_id=$1",[a])).rows.length,0);
  assert.equal((await db.query("select * from public.solo_endless_records where player_id=$1",[a])).rows.length,0);
});


test("endless crosses 2048, 4096 and 8192 without a time cap and saves each milestone once", async () => {
  const run = createSoloRun("account", 0, "endless");
  const records: number[] = [];
  const writer = async (record: { maxTile: number }) => { records.push(record.maxTile); };
  for (const target of [2048,4096,8192,16384]) {
    run.state.board = [{ id: 1, value: target/2, row: 0, col: 0 }, { id: 2, value: target/2, row: 0, col: 1 }];
    advanceSolo(run, "left", SOLO_LIMIT_MS*2 + target, () => 0);
    assert.equal(run.state.status,"playing");
    assert.equal(run.state.maxTile,target);
    if (target === 4096) {
      await saveSoloRun(run, async () => { throw Error("offline"); });
      assert.equal(run.state.saving,"error");
    }
    await saveSoloRun(run,writer); await saveSoloRun(run,writer);
  }
  assert.deepEqual(records,[2048,4096,8192]);
});

test("solo validates mode and throttles inputs across reconnects without consuming a sequence", async t => {
  assert.equal(SoloCommandSchema.safeParse({t:"start", mode:"custom"}).success,false);
  const service=createSoloService({}); t.after(()=>service.close());
  const start=(await service.handle("a",null,{t:"start",mode:"endless"},()=>true)).state!;
  assert.equal(start.mode,"endless"); assert.ok(start.board.every(tile=>tile.row<4&&tile.col<4));
  for(let seq=1;seq<=20;seq++) {
    const reply=await service.handle("a",null,{t:"move",id:start.id,seq,dir:"left"},()=>true);
    assert.equal(reply.error,undefined); assert.equal(reply.state!.seq,seq);
  }
  const blocked=await service.handle("a",null,{t:"move",id:start.id,seq:21,dir:"left"},()=>true);
  assert.equal(blocked.error,"move_rate_limited"); assert.equal(blocked.state!.seq,20);
  const resumed=await service.handle("a",null,{t:"state"},()=>true);
  assert.equal(resumed.state!.id,start.id);
  assert.equal((await service.handle("a",null,{t:"move",id:start.id,seq:21,dir:"left"},()=>true)).error,"move_rate_limited");
});
