import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { readFile, readdir } from "node:fs/promises";
import { FeedbackInputSchema, type FeedbackInput } from "schema/feedback";
import { createAuthDatabase } from "./helpers/pglite";
import { createGameServer } from "../src/server";

const ID = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const report: FeedbackInput = {
  id: ID,
  category: "bug",
  subject: "Mobile input",
  message: "Arrow keys stop working after opening settings.",
};

test("feedback validates category, lengths and fields without accepting forged reporter IDs", () => {
  assert.equal(FeedbackInputSchema.parse({ ...report, subject: "  제목  " }).subject, "제목");
  for (const patch of [
    { id: "bad" },
    { category: "other" },
    { subject: " " },
    { subject: "x".repeat(121) },
    { message: "short" },
    { message: "x".repeat(3001) },
    { reporter_id: USER },
  ]) {
    assert.equal(FeedbackInputSchema.safeParse({ ...report, ...patch }).success, false);
  }
});

test("feedback endpoint supports guests, verifies accounts, reports storage errors and limits requests", async (t) => {
  const received: Array<{ input: FeedbackInput; reporterId: string | null }> = [];
  let fail = false;
  const server = createGameServer({
    writeFeedback: async (input, reporterId) => {
      if (fail) throw Error("private database detail");
      received.push({ input, reporterId });
    },
    resolveAccount: async (token) => {
      if (token !== "valid") throw Error();
      return { id: USER, name: "QA" };
    },
  });
  await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}/feedback`;
  const post = (body: unknown = report, token?: string) =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3001",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await fetch(url, { method: "POST", headers: { Origin: "https://evil.example" } })).status,
    403,
  );
  assert.equal((await fetch(url)).status, 405);
  const preflight = await fetch(url, {
    method: "OPTIONS",
    headers: { Origin: "http://localhost:3001" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:3001");
  assert.equal((await post()).status, 201);
  assert.equal((await post(report, "valid")).status, 201);
  assert.deepEqual(
    received.map((row) => row.reporterId),
    [null, USER],
  );
  assert.equal((await post(report, "invalid")).status, 401);
  assert.equal((await post({ ...report, message: "x".repeat(17_000) })).status, 413);
  fail = true;
  const failed = await post();
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "feedback_unavailable" });
  const limited = await post();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.equal(received.length, 2);
});

test("feedback limits ignore spoofed proxy headers off Fly and separate valid Fly client addresses", async (t) => {
  const previousApp = process.env.FLY_APP_NAME;
  t.after(() => {
    if (previousApp === undefined) delete process.env.FLY_APP_NAME;
    else process.env.FLY_APP_NAME = previousApp;
  });
  const start = async () => {
    const server = createGameServer({ writeFeedback: async () => {} });
    await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
    t.after(() => server.close());
    const url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}/feedback`;
    return async (headers: Record<string, string>) =>
      (
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify(report),
        })
      ).status;
  };
  delete process.env.FLY_APP_NAME;
  const direct = await start();
  for (let i = 1; i <= 5; i++)
    assert.equal(
      await direct({ "Fly-Client-IP": `192.0.2.${i}`, "X-Forwarded-For": `192.0.2.${i}` }),
      201,
    );
  assert.equal(await direct({ "Fly-Client-IP": "192.0.2.6", "X-Forwarded-For": "192.0.2.6" }), 429);

  process.env.FLY_APP_NAME = "rate-limit-test";
  const fly = await start();
  for (let i = 0; i < 5; i++) assert.equal(await fly({ "Fly-Client-IP": "192.0.2.1" }), 201);
  assert.equal(await fly({ "Fly-Client-IP": "192.0.2.1" }), 429);
  assert.equal(await fly({ "Fly-Client-IP": "192.0.2.2" }), 201);
  assert.equal(await fly({ "Fly-Client-IP": "2001:db8::1" }), 201);
  for (const address of ["invalid", "192.0.2.3, 192.0.2.4", "999.0.0.1", "unknown", "::invalid"]) {
    assert.equal(await fly({ "Fly-Client-IP": address }), 201);
  }
  assert.equal(await fly({ "X-Forwarded-For": "192.0.2.5" }), 429);
});

test("feedback storage permits only the server to submit and administrators to read", async (t) => {
  const db = await createAuthDatabase();
  t.after(() => db.close());
  const migrations = new URL("../../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(migrations)).filter((file) => file.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  await db.query(
    "insert into auth.users(id,email) values($1,'reporter@example.test'),($2,'admin@example.test')",
    [USER, ADMIN],
  );
  await db.query("insert into public.admin_roles(user_id) values($1)", [ADMIN]);
  const insert = () =>
    db.query(
      "insert into public.feedback(id,reporter_id,category,subject,message) values($1,$2,$3,$4,$5) on conflict(id) do nothing",
      [ID, USER, report.category, report.subject, report.message],
    );
  await db.exec("set role anon");
  await assert.rejects(insert(), /permission denied/);
  await assert.rejects(db.query("select * from public.feedback"), /permission denied/);
  await db.exec("reset role; set role service_role");
  await insert();
  await insert();
  assert.equal((await db.query("select * from public.feedback")).rows.length, 1);
  await db.exec("reset role; set role authenticated");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal','aal2',false)",
    [USER],
  );
  assert.deepEqual((await db.query("select * from public.feedback")).rows, []);
  await assert.rejects(insert(), /permission denied/);
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal','aal2',false)",
    [ADMIN],
  );
  assert.equal((await db.query("select * from public.feedback")).rows.length, 1);
  await assert.rejects(db.query("delete from public.feedback"), /permission denied/);
  await db.exec("reset role");
  await db.query("delete from auth.users where id=$1", [USER]);
  assert.equal(
    (await db.query<{ reporter_id: string | null }>("select reporter_id from public.feedback"))
      .rows[0].reporter_id,
    null,
  );
  await assert.rejects(db.query("update public.feedback set message='short'"), /check constraint/);
});
