import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { analyticsEnabled, sanitizeAnalyticsEvent, trackGameEvent, trackMatchEvent, trackNavigation } from "../src/lib/analytics";

const environmentKeys = ["NODE_ENV", "NEXT_PUBLIC_APP_ENV", "NEXT_PUBLIC_VERCEL_ENV"] as const;
function production(t: TestContext) {
  const previous = environmentKeys.map(key => process.env[key]);
  Object.assign(process.env, { NODE_ENV: "production", NEXT_PUBLIC_APP_ENV: "production", NEXT_PUBLIC_VERCEL_ENV: "production" });
  t.after(() => environmentKeys.forEach((key, index) => {
    if (previous[index] === undefined) delete process.env[key];
    else Object.assign(process.env, { [key]: previous[index] });
  }));
}

test("telemetry requires an explicit production app AND a production Vercel build", t => {
  production(t);
  assert.equal(analyticsEnabled(), true);
  for (const key of environmentKeys) {
    for (const value of ["development", "preview", "staging", "test", ""]) {
      Object.assign(process.env, { [key]: value });
      assert.equal(analyticsEnabled(), false, `${key}=${value}`);
      assert.equal(sanitizeAnalyticsEvent({ url: "https://2048duo.io/" }), null);
    }
    delete process.env[key];
    assert.equal(analyticsEnabled(), false);
    Object.assign(process.env, { [key]: "production" });
  }
});

test("page and performance events remove query/hash/credentials and anonymize room URLs", t => {
  production(t);
  assert.deepEqual(sanitizeAnalyticsEvent({ type: "pageview", url: "https://private:secret@2048duo.io/loadout?email=player@example.invalid#access_token=secret" }), { type: "pageview", url: "https://2048duo.io/loadout" });
  assert.deepEqual(sanitizeAnalyticsEvent({ type: "vital", url: "https://2048duo.io/play/private-room?code=private#token", route: "/play/private-room" }), { type: "vital", url: "https://2048duo.io/play/[id]", route: "/play/[id]" });
  assert.equal(sanitizeAnalyticsEvent({ url: "https://2048duo.io/play/ranked" })?.url, "https://2048duo.io/play/ranked");
  for (const path of ["/solo", "/friends"]) {
    assert.equal(sanitizeAnalyticsEvent({ type: "vital", url: `https://2048duo.io${path}?private=secret#token` })?.url, `https://2048duo.io${path}`);
  }
  for (const path of ["/auth/callback?code=secret", "/auth/error?message=secret", "/reset-password#access_token=secret", "/forgot-password", "/test", "/players/private-name", "/play/a/private"]) {
    assert.equal(sanitizeAnalyticsEvent({ url: `https://2048duo.io${path}` }), null, path);
  }
  for (const url of ["not a URL", "javascript:alert(1)", "file:///loadout"]) assert.equal(sanitizeAnalyticsEvent({ url }), null);
});

test("custom events are disabled off production and navigation only allows known destinations", t => {
  production(t);
  const events: unknown[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { va: (...event: unknown[]) => events.push(event) } });
  t.after(() => { Reflect.deleteProperty(globalThis, "window"); });
  trackNavigation("/loadout");
  trackNavigation("/loadout?email=private");
  trackNavigation("/play/private-room");
  trackNavigation(null);
  assert.deepEqual(events, [["event", { name: "navigation_clicked", data: { destination: "/loadout" }, options: undefined }]]);
  process.env.NEXT_PUBLIC_APP_ENV = "staging";
  trackGameEvent("queue_started", { mode: "ranked" });
  trackMatchEvent("match_started", "private-room", { mode: "ranked" });
  assert.equal(events.length, 1);
});

test("game events are once per match across reconnects and never send identifiers", t => {
  production(t);
  const events: unknown[] = [], storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { va: (...event: unknown[]) => events.push(event) } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) } });
  t.after(() => { Reflect.deleteProperty(globalThis, "window"); Reflect.deleteProperty(globalThis, "sessionStorage"); });
  for (let i = 0; i < 3; i++) {
    trackMatchEvent("match_started", "private-room-one", { mode: "casual" });
    trackMatchEvent("match_finished", "private-room-one", { mode: "casual", outcome: "win" });
  }
  assert.equal(events.length, 2);
  // A prior page instance already recorded this room in this tab.
  storage.set("2048duo:analytics:match_started", "private-room-two");
  trackMatchEvent("match_started", "private-room-two", { mode: "ranked" });
  assert.equal(events.length, 2);
  trackMatchEvent("match_started", "private-room-three", { mode: "ranked" });
  assert.equal(events.length, 3);
  assert.doesNotMatch(JSON.stringify(events), /private-room|player_id|matchId|roomId/);
});

test("storage and analytics transport failures cannot break gameplay", t => {
  production(t);
  const events: unknown[] = [];
  const fakeWindow = { va: (...event: unknown[]) => { events.push(event); throw new Error("Transport unavailable"); } };
  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get: () => { throw new Error("Storage blocked"); } });
  t.after(() => { Reflect.deleteProperty(globalThis, "window"); Reflect.deleteProperty(globalThis, "sessionStorage"); });
  assert.doesNotThrow(() => trackMatchEvent("match_started", "blocked-storage-room", { mode: "friend" }));
  assert.doesNotThrow(() => trackMatchEvent("match_started", "blocked-storage-room", { mode: "friend" }));
  assert.equal(events.length, 1);
  Reflect.deleteProperty(globalThis, "window");
  assert.doesNotThrow(() => trackGameEvent("queue_started", { mode: "casual" }));
});
