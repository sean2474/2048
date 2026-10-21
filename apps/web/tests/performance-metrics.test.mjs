import assert from "node:assert/strict";
import test from "node:test";
import { percentile, summarize } from "./performance-metrics.mjs";
import { routeCase } from "./performance-routes.mjs";

test("benchmark summary isolates cache/device/account and does not invent absent paint values", () => {
  const row = {
    app: "web",
    route: "/",
    auth: true,
    device: "desktop",
    cache: "cold",
    observedDataReadyMs: 200,
    lcpMs: null,
  };
  const result = summarize([
    row,
    { ...row, observedDataReadyMs: 100 },
    { ...row, cache: "warm", observedDataReadyMs: 50 },
  ]);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].observedDataReadyMs, { median: 100, p95: 200 });
  assert.equal(result[0].lcpMs, null);
  assert.throws(() => percentile([NaN], 0.95));
});
test("dynamic and auth route coverage keeps actual games and recovery errors explicit", () => {
  assert.equal(routeCase("web", "/play/[id]").journey, "real-match");
  assert.equal(routeCase("web", "/reset-password").state, "no-recovery-session");
  assert.equal(routeCase("admin", "/players/[id]").path.includes("["), false);
  assert.equal(routeCase("web", "/login").auth, false);
});
