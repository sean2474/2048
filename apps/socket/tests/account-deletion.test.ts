import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { accountDeletionHandler } from "../src/account-deletion";
import { createSupabaseServices } from "../src/supabase";
import { createGameServer } from "../src/server";
import { io as client } from "socket.io-client";
import { matchmakingQueue, waitingByCode } from "../src/state";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("account deletion authenticates the caller, bounds input and blocks live/pending matches", async t => {
  let playing = false, pending = false, disconnected = false, calls = 0;
  let release: (() => void) | undefined;
  const deleting = new Set<string>();
  const handler = accountDeletionHandler({ origins: ["https://game.example"], deleting,
    resolveAccount: async token => { if (token !== "valid") throw Error(); return { id: A }; },
    deleteAccount: async (id, email, token) => {
      assert.equal(id, A); assert.equal(token, "valid"); assert.ok(deleting.has(A));
      assert.equal(disconnected, true);
      if (email !== "qa@example.com") throw Error("confirmation_mismatch");
      calls++; await new Promise<void>(resolve => { release = resolve; });
    },
    isPlaying: () => playing, hasPending: () => pending, disconnect: () => { disconnected = true; },
  });
  const server = createServer((req, res) => { void handler(req, res); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/account/delete`;
  const post = (body: unknown = { confirmationEmail: "qa@example.com" }, token = "valid", origin = "https://game.example") => fetch(url, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body),
  });
  assert.equal((await post({}, "valid", "https://evil.example")).status, 403);
  assert.equal((await post({}, "invalid")).status, 400);
  assert.equal((await post(undefined, "invalid")).status, 401);
  assert.equal((await post({ confirmationEmail: "x".repeat(2100) })).status, 413);
  assert.equal((await post({ confirmationEmail: "wrong@example.com" })).status, 400);
  assert.equal(deleting.size, 0);
  playing = true; assert.equal((await (await post()).json()).error, "active_match");
  playing = false; pending = true; assert.equal((await (await post()).json()).error, "pending_result");
  pending = false;
  const deletingRequest = post();
  for (let i = 0; i < 50 && !release; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(release);
  assert.equal((await (await post()).json()).error, "deletion_in_progress");
  release();
  assert.equal((await deletingRequest).status, 200);
  assert.equal(calls, 1); assert.equal(disconnected, true); assert.equal(deleting.size, 0);
  for (let i = 0; i < 20; i++) await post(undefined, "invalid");
  assert.equal((await post(undefined, "invalid")).status, 429);
});

test("privileged deletion checks confirmation/admin status and revokes sessions before deleting", async t => {
  const calls: string[] = [];
  let admin = false;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    calls.push(`${init?.method ?? "GET"} ${path}`);
    const body = path.includes("admin/users") ? { user: { id: A, email: "qa@example.com" } }
      : path.includes("admin_roles") ? admin ? { user_id: A } : null : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const services = createSupabaseServices({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-key", SUPABASE_SECRET_KEY: "private-key" });
  await assert.rejects(services.deleteAccount!(A, "wrong@example.com", "token"), /confirmation_mismatch/);
  admin = true; await assert.rejects(services.deleteAccount!(A, "qa@example.com", "token"), /admin_account/);
  assert.ok(!calls.some(call => call.startsWith("DELETE")));
  admin = false; calls.length = 0;
  await services.deleteAccount!(A, " QA@example.com ", "token");
  assert.deepEqual(calls.slice(-2), ["POST /auth/v1/logout", `DELETE /auth/v1/admin/users/${A}`]);
});

test("account deletion limits separate Fly clients sharing a socket peer", async t => {
  const previousApp = process.env.FLY_APP_NAME;
  process.env.FLY_APP_NAME = "rate-limit-test";
  t.after(() => { if (previousApp === undefined) delete process.env.FLY_APP_NAME; else process.env.FLY_APP_NAME = previousApp; });
  let deletions = 0;
  const handler = accountDeletionHandler({ origins: [], deleting: new Set(),
    resolveAccount: async () => ({ id: A }), deleteAccount: async () => { deletions++; },
    isPlaying: () => false, hasPending: () => false, disconnect: () => {},
  });
  const server = createServer((req, res) => { void handler(req, res); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/account/delete`;
  const post = async (address: string) => (await fetch(url, {
    method: "POST", headers: { Authorization: "Bearer valid", "Content-Type": "application/json", "Fly-Client-IP": address },
    body: JSON.stringify({ confirmationEmail: "qa@example.com" }),
  })).status;
  for (let i = 0; i < 20; i++) assert.equal(await post("192.0.2.1"), 200);
  assert.equal(await post("192.0.2.1"), 429);
  assert.equal(await post("192.0.2.2"), 200);
  assert.equal(deletions, 21);
});

test("deletion disconnects a waiting account and invalidates its pending matchmaking callback", async t => {
  let finishAccess: ((ids: string[]) => void) | undefined;
  let finishDelete: (() => void) | undefined;
  const server = createGameServer({
    resolveAccount: async () => ({ id: A, name: "QA" }),
    readSuspensions: () => new Promise(resolve => { finishAccess = resolve; }),
    deleteAccount: () => new Promise(resolve => { finishDelete = resolve; }),
  });
  await new Promise<void>(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  const socket = client(url, { auth: { sessionToken: "a".repeat(64), accessToken: "valid" }, transports: ["websocket"], reconnection: false, autoConnect: false });
  t.after(async () => { socket.disconnect(); await server.close(); });
  await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect(); });
  socket.emit("message", { t: "findMatch", mode: "casual" });
  for (let i = 0; i < 50 && !finishAccess; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(finishAccess);
  const deleted = fetch(`${url}/account/delete`, { method: "POST", headers: { Authorization: "Bearer valid", "Content-Type": "application/json" }, body: JSON.stringify({ confirmationEmail: "qa@example.com" }) });
  for (let i = 0; i < 50 && !finishDelete; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(finishDelete);
  finishAccess([]);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(socket.connected, false);
  assert.equal(matchmakingQueue.length, 0); assert.equal(waitingByCode.size, 0);
  finishDelete(); assert.equal((await deleted).status, 200);
});

test("profile names sync to standings, deletion removes owned data and anonymizes only its participant", async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`);
  const dir = new URL("../../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(dir)).filter(file => file.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(file, dir), "utf8"));
  await db.query("insert into auth.users(id) values($1),($2)", [A, B]);
  await db.query("insert into public.player_ratings(player_id,display_name,season_id) select $1,'Old',id from public.rank_seasons where ends_at is null", [A]);
  await db.query("insert into public.season_ratings(player_id,display_name,season_id) select $1,'Old',id from public.rank_seasons where ends_at is null", [A]);
  await db.query("update public.players set name='New name' where id=$1", [A]);
  assert.equal((await db.query<{ display_name: string }>("select display_name from public.season_ratings where player_id=$1", [A])).rows[0].display_name, "New name");
  assert.equal((await db.query<{ display_name: string }>("select display_name from public.player_ratings where player_id=$1", [A])).rows[0].display_name, "New name");
  await db.exec(`insert into public.matches(id,started_at,ended_at,reason,winner_slot,mode) values('${B}',now(),now(),'surrender',1,'friend');`);
  await db.query("insert into public.match_participants(match_id,slot,player_id,display_name,score,max_tile,result) values($1,1,$2,'Old',0,2,'win'),($1,2,$3,'Keep name',0,2,'loss')", [B, A, B]);
  await db.query("delete from auth.users where id=$1", [A]);
  assert.deepEqual((await db.query("select player_id,display_name from public.match_participants order by slot")).rows, [{ player_id: null, display_name: "Deleted player" }, { player_id: B, display_name: "Keep name" }]);
  assert.equal((await db.query("select * from public.player_wallets where player_id=$1", [A])).rows.length, 0);
  assert.equal((await db.query("select * from public.player_ratings where player_id=$1", [A])).rows.length, 0);
  assert.equal((await db.query("select * from public.season_ratings where player_id=$1", [A])).rows.length, 0);
});
