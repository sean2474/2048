import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { startServerFixture } from "./server-fixture.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const meta = {
  status: "published",
  publishedOnce: true,
  revision: 1,
  updatedAt: "2026-10-17T00:00:00Z",
  sortOrder: 0,
  description: "",
};
const skin = {
  ...meta,
  id: "custom-sprint",
  name: "Custom Sprint",
  rarity: "rare",
  price: 0,
  acquisition: "achievement",
  tokens: { boardBackground: "#123456", emptyBackground: "#ccddee", tileRadius: "0.5rem" },
};
const icon = {
  ...meta,
  id: "custom-medal",
  name: "Custom Medal",
  price: 0,
  acquisition: "achievement",
  color: "#123456",
  imagePath: "profiles/medal.svg",
};

test(
  "attendance and solo reward panels follow edited, archived and new catalog entries",
  { timeout: 90000 },
  async (t) => {
    const catalog = {
      skins: [skin],
      profileIcons: [icon],
      achievements: [
        {
          ...meta,
          id: "checkin-custom",
          name: "Custom Attendance",
          metric: "attendance_streak",
          target: 14,
          reward: { kind: "icon", iconId: icon.id },
        },
        {
          ...meta,
          id: "solo-custom",
          name: "Custom Time",
          metric: "solo_time",
          target: 180000,
          reward: { kind: "skin", skinId: skin.id },
        },
        {
          ...meta,
          id: "solo-archived",
          name: "Hidden Milestone",
          status: "archived",
          metric: "solo_time",
          target: 120000,
          reward: { kind: "skin", skinId: skin.id },
        },
        {
          ...meta,
          id: "endless-custom",
          name: "Custom Endless",
          metric: "solo_tile",
          target: 4096,
          reward: { kind: "icon", iconId: icon.id },
        },
      ],
    };
    const fixture = await startServerFixture({
      handle: async (url) => {
        if (url.pathname.endsWith("/rpc/content_catalog")) return { data: catalog };
        if (url.pathname.endsWith("/rpc/sync_achievements"))
          return {
            data: {
              attendance: { streak: 3, bestStreak: 3, checkedInToday: true },
              wins: 0,
              highestTile: 0,
              unlocks: [],
            },
          };
      },
    });
    t.after(fixture.close);
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    t.after(() => browser.close());
    const context = await browser.newContext({ locale: "en-US" });
    await context.addCookies([fixture.cookie()]);
    const page = await context.newPage();
    await page.goto(fixture.origin + "/achievements");
    const attendance = page.getByRole("region", { name: "Daily attendance" });
    await attendance.getByText("14-day reward", { exact: true }).waitFor();
    await attendance.getByText("Custom Medal", { exact: true }).waitFor();
    catalog.achievements[0].status = "archived";
    await page.reload();
    await page.locator("#solo-custom").waitFor();
    assert.equal(await attendance.getByText("14-day reward").count(), 0);
    await page.goto(fixture.origin + "/solo");
    const rewards = page.locator("aside");
    await rewards.getByText("Custom Sprint", { exact: true }).waitFor();
    assert.equal(
      await rewards.getByText("Custom Sprint", { exact: true }).count(),
      1,
      "unowned archived milestones are hidden",
    );
    await rewards.getByText("Target time: 03:00.00", { exact: true }).waitFor();
    await page.getByRole("button", { name: /^Endless mode/ }).click();
    await rewards.getByText("Custom Medal", { exact: true }).waitFor();
    await rewards.getByText("Reach 4096", { exact: true }).waitFor();
  },
);
