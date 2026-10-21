import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { startServerFixture, fixturePlayer } from "./server-fixture.mjs";

const source = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
const visibleHTML = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");

test("game routes keep server-owned frames, rules and loading states outside client bundles", async () => {
  for (const route of ["solo", "play/[id]", "test", "play/online", "play/ranked"]) {
    assert.doesNotMatch(await source(`app/${route}/page.tsx`), /["']use client["']/);
  }
  const solo = await source("app/solo/page.tsx");
  assert.match(solo, /PageHeading/);
  assert.match(solo, /SoloDetails/);
  assert.match(solo, /Suspense/);
  assert.match(solo, /<aside/);
  const details = await source("app/solo/solo-details.tsx");
  assert.match(details, /getAchievementSnapshot/);
  assert.match(details, /getCatalogSnapshot/);
  assert.doesNotMatch(details, /useI18n|useAchievements|useCatalog|["']use client["']/);
  assert.doesNotMatch(
    await source("app/solo/solo-session.tsx"),
    /from ["'][^"']*(?:skeleton|solo-details)["']/,
  );
  assert.match(await source("app/play/[id]/page.tsx"), /notFound/);
});

test(
  "game routes render account-gated lobbies, records and rules without browser data fetching",
  { timeout: 120000 },
  async (t) => {
    let failProgress = false,
      hold,
      requested;
    const fixture = await startServerFixture({
      handle: async (url, _request, id) => {
        if (url.pathname.endsWith("/rpc/achievement_state")) {
          requested?.();
          if (hold) await hold;
          if (failProgress) return { status: 503, data: { message: "Fixture unavailable" } };
          return {
            data: {
              attendance: {
                streak: 0,
                bestStreak: 0,
                lastDay: null,
                today: "2026-10-22",
                checkedInToday: false,
                nextCheckInAt: "2026-10-23T00:00:00Z",
              },
              wins: 0,
              highestTile: 0,
              soloBestMs: id === fixturePlayer ? 123450 : 234560,
              soloHighestTile: 4096,
              unlocks: [],
            },
          };
        }
      },
    });
    t.after(fixture.close);
    const read = async (path, authenticated = false) => {
      const cookie = fixture.cookie(
        typeof authenticated === "string" ? authenticated : fixturePlayer,
      );
      return fetch(fixture.origin + path, {
        headers: {
          "accept-language": "en",
          ...(authenticated ? { cookie: `${cookie.name}=${cookie.value}` } : {}),
        },
      });
    };
    const solo = visibleHTML(await (await read("/solo", true)).text());
    assert.match(solo, /Single player/);
    assert.match(solo, /02:03\.45/);
    assert.match(solo, /No abilities or undo/);
    assert.match(solo, /href="\/leaderboard\?mode=solo"/);
    assert.ok(fixture.requests.some((request) => request.path.endsWith("/rpc/achievement_state")));
    assert.equal(
      fixture.requests.filter((request) =>
        ["/rpc/sync_achievements", "/rpc/check_in"].some((path) => request.path.endsWith(path)),
      ).length,
      0,
    );
    fixture.requests.length = 0;
    const guestSolo = visibleHTML(await (await read("/solo")).text());
    assert.doesNotMatch(guestSolo, /02:03\.45/);
    assert.match(guestSolo, /Sign in for records/);
    assert.equal(
      fixture.requests.filter((request) => request.path.endsWith("/rpc/achievement_state")).length,
      0,
    );
    const other = "20000000-0000-4000-8000-000000000099";
    const [first, second] = await Promise.all([read("/solo", true), read("/solo", other)]);
    assert.match(visibleHTML(await first.text()), /02:03\.45/);
    assert.match(visibleHTML(await second.text()), /03:54\.56/);
    failProgress = true;
    assert.match(
      visibleHTML(await (await read("/solo", true)).text()),
      /Could not load achievement progress/,
    );
    failProgress = false;
    const ranked = visibleHTML(await (await read("/play/ranked")).text());
    assert.match(ranked, /Sign in to play ranked matches/);
    assert.match(ranked, /Sign in for ranked/);
    assert.doesNotMatch(ranked, /Checking your account/);
    assert.match(
      visibleHTML(await (await read("/play/online")).text()),
      /Casual matches do not affect Elo/,
    );
    const invalidRoom = await read("/play/not-a-room");
    assert.ok(
      [200, 404].includes(invalidRoom.status),
      "streamed Next not-found responses may have already sent HTTP 200",
    );
    const invalidHTML = visibleHTML(await invalidRoom.text());
    assert.match(invalidHTML, /noindex/);
    assert.doesNotMatch(invalidHTML, /Joining your game/);
    const game = visibleHTML(
      await (await read("/play/33333333-3333-4333-8333-333333333333")).text(),
    );
    assert.match(game, /Getting your board ready/);
    assert.match(game, /aria-label="Joining your game…"/);
    const lab = visibleHTML(await (await read("/test")).text());
    assert.match(lab, /2048 - Obstacle Test/);
    assert.match(lab, /HardBlock/);
    let release;
    hold = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      requested = resolve;
    });
    const responsePromise = read("/solo", true);
    await started;
    const response = await responsePromise,
      reader = response.body.getReader(),
      decoder = new TextDecoder();
    let streamed = "";
    try {
      while (!streamed.includes('aria-label="Loading records…"')) {
        const { done, value } = await reader.read();
        assert.equal(done, false, "solo server skeleton streams while private progress is pending");
        streamed += decoder.decode(value);
      }
      assert.match(streamed, /motion-reduce:animate-none/);
    } finally {
      release();
      hold = null;
      requested = null;
    }
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      streamed += decoder.decode(value);
    }
    assert.match(visibleHTML(streamed), /02:03\.45/);
  },
);
