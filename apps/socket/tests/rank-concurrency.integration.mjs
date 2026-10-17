import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

// Optional isolated integration runtime; never connects to a configured/live database.
const require = createRequire(import.meta.url);
const { default: EmbeddedPostgres } = await import(require.resolve("embedded-postgres"));

test("real PostgreSQL serializes results, season rollovers, check-ins and milestone grants", { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "2048-rank-concurrency-"));
  const portProbe = createServer();
  await new Promise(resolve => portProbe.listen(0, "127.0.0.1", resolve));
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  const pg = new EmbeddedPostgres({ databaseDir: join(directory, "db"), port, user: "postgres", password: randomUUID(), persistent: false, createPostgresUser: false,
    postgresFlags: ["-c", "listen_addresses=127.0.0.1", "-c", "wal_level=logical"], onLog() {}, onError() {} });
  const clients = [];
  let started = false;
  try {
    await pg.initialise(); await pg.start(); started = true;
    const connect = async (role = "postgres", id = "", name = "rank-test") => {
      const client = pg.getPgClient(); clients.push(client); await client.connect();
      await client.query("select set_config('application_name',$1,false), set_config('request.jwt.claim.sub',$2,false)", [name, id]);
      await client.query(`set role ${role}`);
      return client;
    };
    const admin = await connect();
    await admin.query(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', is_anonymous boolean default false);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated,service_role;`);
    const migrations = new URL("../../../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(migrations)).filter(file => file.endsWith(".sql")).sort()) await admin.query(await readFile(new URL(file, migrations), "utf8"));
    const [a, b, operator] = [randomUUID(), randomUUID(), randomUUID()];
    await admin.query("insert into auth.users(id) values($1),($2),($3)", [a, b, operator]);
    await admin.query("insert into public.admin_roles(user_id) values($1)", [operator]);
    const payload = JSON.stringify([{ userId: a, score: 100, maxTile: 64 }, { userId: b, score: 20, maxTile: 8 }]);
    const start = new Date(Date.now() - 60_000).toISOString();
    const record = (client, id = randomUUID(), startedAt = start) => client.query("select public.record_match($1,$2,clock_timestamp(),'surrender',1::smallint,$3::jsonb,'ranked') as saved", [id, startedAt, payload]);
    const current = async () => (await admin.query("select id from public.rank_seasons where ends_at is null")).rows[0].id;
    const snapshot = async () => (await admin.query("select player_id,season_id,rating,tier,games_played,placement_games,peak_rating from public.player_ratings order by player_id")).rows;
    const rollover = (client, expected, name) => client.query("select public.admin_rollover_season($1,$2,'Concurrency integration test') as id", [expected, name]);
    const waitForLock = async name => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const { rows } = await admin.query("select 1 from pg_stat_activity where application_name=$1 and wait_event_type='Lock' and lower(wait_event)='advisory'", [name]);
        if (rows.length) return;
        await delay(20);
      }
      assert.fail(`${name} did not wait for the season advisory lock`);
    };

    const writers = await Promise.all(Array.from({ length: 6 }, (_, i) => connect("service_role", "", `writer-${i}`)));
    const repeatedId = randomUUID();
    const repeated = await Promise.all(writers.map(client => record(client, repeatedId)));
    assert.equal(repeated.filter(result => result.rows[0].saved).length, 1);
    assert.ok((await snapshot()).every(row => row.games_played === 1));

    // A result commits first: rollover must preserve that just-finished lifetime Elo.
    const operatorClient = await connect("authenticated", operator, "rollover-waiter");
    await writers[0].query("begin");
    await record(writers[0]);
    const latestRatings = (await writers[0].query("select player_id,rating from public.player_ratings order by player_id")).rows;
    const firstSeason = await current();
    const firstTransition = rollover(operatorClient, firstSeason, "Season 2");
    await waitForLock("rollover-waiter");
    await writers[0].query("commit");
    const secondSeason = (await firstTransition).rows[0].id;
    const afterFirst = await snapshot();
    afterFirst.forEach((row, index) => {
      assert.equal(row.season_id, secondSeason); assert.equal(row.games_played, 0);
      assert.equal(row.rating, latestRatings[index].rating);
      assert.equal(row.placement_games, 2); assert.equal(row.peak_rating, null);
    });

    // Rollover commits first: the old result updates lifetime Elo and its own season only.
    await operatorClient.query("begin");
    const thirdSeason = (await rollover(operatorClient, secondSeason, "Season 3")).rows[0].id;
    const lateId = randomUUID();
    const late = record(writers[1], lateId);
    await waitForLock("writer-1");
    await operatorClient.query("commit");
    assert.equal((await late).rows[0].saved, true);
    const afterLate = await snapshot();
    assert.ok(afterLate.every(row => row.season_id === thirdSeason && row.games_played === 0 && row.placement_games === 3 && row.peak_rating === null));
    afterLate.forEach((row, index) => assert.notEqual(row.rating, latestRatings[index].rating));
    assert.equal(afterLate.reduce((total, row) => total + row.rating, 0), 2400);
    assert.equal((await admin.query("select season_id from public.matches where id=$1", [lateId])).rows[0].season_id, firstSeason);
    assert.ok((await admin.query("select games_played from public.season_ratings where season_id=$1", [firstSeason])).rows.every(row => row.games_played === 3));
    assert.equal((await record(writers[2], lateId)).rows[0].saved, false);
    assert.deepEqual(await snapshot(), afterLate);

    // Two operators with the same displayed season cannot reset twice.
    const otherOperator = await connect("authenticated", operator, "other-operator");
    const transitions = await Promise.allSettled([rollover(operatorClient, thirdSeason, "Season 4"), rollover(otherOperator, thirdSeason, "Duplicate")]);
    assert.equal(transitions.filter(result => result.status === "fulfilled").length, 1);
    assert.match(transitions.find(result => result.status === "rejected").reason.message, /Season changed/);
    assert.equal((await admin.query("select count(*)::int as count from public.rank_seasons where ends_at is null")).rows[0].count, 1);

    await record(writers[0], randomUUID(), new Date().toISOString());
    assert.ok((await snapshot()).every(row => row.games_played === 1 && row.placement_games === 4));
    assert.equal((await admin.query(`select count(*)::int as mismatches from public.player_ratings p
      join public.season_ratings s using(player_id,season_id) where p.rating<>s.rating or p.games_played<>s.games_played`)).rows[0].mismatches, 0);

    // Parallel distinct results use one lifetime rating stream and cross evaluation at ten once.
    const beforeBatch = await snapshot();
    const newestSeason = await current();
    const currentStart = (await admin.query("select starts_at::text as start from public.rank_seasons where id=$1", [newestSeason])).rows[0].start;
    await Promise.all(writers.map((client, index) => record(client, randomUUID(), index % 2 ? start : currentStart)));
    const afterBatch = await snapshot();
    assert.ok(afterBatch.every(row => row.games_played === 4 && row.placement_games === 10 && row.tier !== null));
    assert.equal(afterBatch.reduce((total, row) => total + row.rating, 0), 2400);
    assert.ok(afterBatch.every((row, index) => row.rating !== beforeBatch[index].rating));
    const history = (await admin.query("select player_id,rating_before,rating_after from public.match_participants where player_id in ($1,$2) order by player_id", [a, b])).rows;
    for (const playerId of [a, b]) {
      const results = history.filter(row => row.player_id === playerId);
      const ratingsBefore = results.map(row => row.rating_before).sort((x, y) => x - y);
      const ratingsAfter = results.map(row => row.rating_after).sort((x, y) => x - y);
      const final = afterBatch.find(row => row.player_id === playerId).rating;
      assert.deepEqual([...ratingsBefore, final].sort((x, y) => x - y), [...ratingsAfter, 1200].sort((x, y) => x - y));
    }

    // Several tabs must record one attendance day and return the same streak.
    const checkIns = await Promise.all(Array.from({ length: 6 }, (_, i) => connect("authenticated", a, `checkin-${i}`)));
    const attendance = await Promise.all(checkIns.map(client => client.query("select public.check_in() as state")));
    assert.ok(attendance.every(result => result.rows[0].state.attendance.streak === 1));
    assert.ok(attendance.every(result => result.rows[0].state.attendance.checkedInToday));
    assert.equal((await admin.query("select count(*)::int as count from public.player_attendance where player_id=$1", [a])).rows[0].count, 1);
    await admin.query("update public.player_attendance set last_day=(now() at time zone 'Asia/Seoul')::date-1,streak=29,best_streak=29 where player_id=$1", [a]);
    const thirtiethDay = await Promise.all(checkIns.map(client => client.query("select public.check_in() as state")));
    assert.ok(thirtiethDay.every(result => result.rows[0].state.attendance.streak === 30));
    assert.equal((await admin.query("select count(*)::int as count from public.achievement_unlocks where player_id=$1 and achievement_id like 'checkin-%'", [a])).rows[0].count, 2);

    // Casual milestones use account locks too: both simultaneous wins must be counted.
    const [challenger, opponent] = [randomUUID(), randomUUID()];
    await admin.query("insert into auth.users(id) values($1),($2)", [challenger, opponent]);
    const casualPayload = JSON.stringify([{ userId: challenger, score: 100, maxTile: 64 }, { userId: opponent, score: 20, maxTile: 8 }]);
    const casual = client => client.query("select public.record_match($1,$2,clock_timestamp(),'surrender',1::smallint,$3::jsonb,'casual') as saved", [randomUUID(), start, casualPayload]);
    for (let i = 0; i < 8; i++) await casual(writers[0]);
    await Promise.all([casual(writers[0]), casual(writers[1])]);
    const challengerClient = await connect("authenticated", challenger);
    const progress = (await challengerClient.query("select public.achievement_state() as state")).rows[0].state;
    assert.equal(progress.wins, 10);
    assert.deepEqual(progress.unlocks.map(reward => reward.achievementId), ["wins-10"]);
    assert.equal((await admin.query("select count(*)::int as count from public.achievement_unlocks where player_id=$1 and achievement_id='wins-10'", [challenger])).rows[0].count, 1);
  } finally {
    await Promise.allSettled(clients.map(client => client.end()));
    if (started) await pg.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
