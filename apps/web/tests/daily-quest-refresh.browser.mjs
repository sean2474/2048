import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { startServerFixture, fixturePlayer } from "./server-fixture.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const achievements = {
  attendance: {
    streak: 1,
    bestStreak: 1,
    lastDay: "2026-10-22",
    today: "2026-10-22",
    checkedInToday: true,
    nextCheckInAt: "2026-10-22T15:00:00Z",
  },
  wins: 0,
  highestTile: 2,
  unlocks: [],
};

test(
  "quest loads refresh the server wallet only when a reward or balance change requires it",
  { timeout: 120000 },
  async (t) => {
    let balance = 12,
      awarded = 0,
      release;
    const fixture = await startServerFixture({
      handle: async (url) => {
        if (/\/(achievement_state|sync_achievements)$/.test(url.pathname))
          return { data: achievements };
        if (url.pathname.endsWith("/player_wallets")) return { data: [{ balance }] };
        if (url.pathname.endsWith("/sync_daily_quests")) {
          await new Promise((resolve) => {
            release = resolve;
          });
          return {
            data: {
              playerId: fixturePlayer,
              balance,
              awarded,
              day: "2026-10-22",
              nextResetAt: "2026-10-22T15:00:00Z",
              quests: ["check-in", "play-3", "win-1"].map((id) => ({
                id,
                progress: id === "check-in" ? 1 : 0,
                rewardedAt: id === "check-in" ? "2026-10-22T00:00:00Z" : null,
              })),
            },
          };
        }
      },
    });
    t.after(fixture.close);
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    t.after(() => browser.close());
    for (const { reward, syncedBalance } of [
      { reward: 0, syncedBalance: 12 },
      { reward: 20, syncedBalance: 32 },
      { reward: 0, syncedBalance: 52 },
    ]) {
      const context = await browser.newContext({
        locale: "en",
        viewport: { width: 1440, height: 900 },
      });
      await context.addCookies([fixture.cookie()]);
      const page = await context.newPage();
      let refreshes = 0;
      page.on("request", (request) => {
        if (
          request.method() === "GET" &&
          request.headers().rsc &&
          new URL(request.url()).pathname === "/"
        )
          refreshes++;
      });
      await page.goto(fixture.origin);
      await page.getByRole("link", { name: "My loadout · 12 coins", exact: true }).waitFor();
      const deadline = Date.now() + 5000;
      while (!release && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(typeof release, "function");
      balance = syncedBalance;
      awarded = reward;
      release();
      release = undefined;
      await page
        .locator('section[aria-labelledby="daily-quests-title"]')
        .getByText("1 / 3 completed")
        .waitFor();
      if (syncedBalance !== 12)
        await page
          .getByRole("link", { name: `My loadout · ${syncedBalance} coins`, exact: true })
          .waitFor();
      await page.waitForTimeout(600);
      assert.equal(
        refreshes,
        syncedBalance !== 12 ? 1 : 0,
        `first quest response awarding ${reward} coins`,
      );
      await context.close();
      balance = 12;
      awarded = 0;
    }
    // A soft navigation keeps the root layout/header but fetches a new page snapshot.
    const context = await browser.newContext({
      locale: "en",
      viewport: { width: 1440, height: 900 },
    });
    await context.addCookies([fixture.cookie()]);
    const page = await context.newPage();
    await page.goto(`${fixture.origin}/settings`);
    await page.getByRole("link", { name: "My loadout · 12 coins", exact: true }).waitFor();
    balance = 52;
    await page.getByRole("link", { name: "2048 Duo home", exact: true }).click();
    await page.waitForURL(fixture.origin + "/");
    const deadline = Date.now() + 5000;
    while (!release && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(typeof release, "function");
    release();
    release = undefined;
    await page
      .getByRole("link", { name: "My loadout · 52 coins", exact: true })
      .waitFor({ timeout: 10000 });
    await context.close();
  },
);
