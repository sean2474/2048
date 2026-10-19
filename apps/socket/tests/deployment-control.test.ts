import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { createGameServer } from "../src/server";
import { deploymentControl } from "../src/deployment-control";

test("only the deployment that owns a drain can resume admission", async t => {
  const game = createGameServer();
  const control = deploymentControl(game);
  await new Promise<void>(resolve => control.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise<void>(resolve => control.close(() => resolve())); await game.close(); });
  const origin = `http://127.0.0.1:${(control.address() as AddressInfo).port}`;
  const post = (path: string, owner: string) => fetch(origin + path, { method: "POST", headers: { "x-deployment-id": owner } });
  assert.equal((await post("/drain", "")).status, 400);
  assert.equal((await post("/drain", "first")).status, 200);
  assert.equal((await post("/drain", "second")).status, 409);
  assert.equal((await post("/resume", "second")).status, 409);
  assert.equal(game.deploymentStatus().draining, true);
  assert.equal((await post("/resume", "first")).status, 200);
  assert.equal(game.deploymentStatus().draining, false);
});
