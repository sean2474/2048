import { startServerFixture, fixtureSeason } from "./server-fixture.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");

// SSR and browser requests share the local fixture server.
test("rank badges, podium, responsive standings, translations and recovery", async (t) => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const artifacts = fileURLToPath(new URL("../../../docs/rank-polish", import.meta.url));
  fs.mkdirSync(artifacts, { recursive: true });
  try {
    const context = await browser.newContext({
      locale: "ko-KR",
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const fixtures = [1864, 1672, 1428, 1280, 1080, 864].map((rating, index) => ({
      player_id: `rank-test-${index}`,
      display_name: [
        "말랑한왕관",
        "구름고양이",
        "아주긴닉네임도순위표밖으로넘치면안돼요",
        "<img src=x onerror=alert(1)>",
        "Silver tile",
        "새싹",
      ][index],
      tier: ["Master", "Diamond", "Platinum", "Gold", "Silver", "Bronze"][index],
      placement_games: 10,
      season_id: "11111111-1111-4111-8111-111111111111",
      rating,
      peak_rating: rating,
      wins: 20 - index,
      losses: index,
      draws: 0,
      games_played: 20,
      highest_score: 2048,
      highest_tile: 512,
    }));
    let rows = fixtures;
    let mode = "success";
    let releaseLoading;
    const server = await startServerFixture({
      handle: async (url) => {
        if (url.pathname.endsWith("/rank_seasons"))
          return { data: [{ ...fixtureSeason, name: "Season 1" }] };
        if (url.pathname.endsWith("/player_ratings")) {
          if (mode === "loading")
            await new Promise((resolve) => {
              releaseLoading = resolve;
            });
          return {
            status: mode === "error" ? 500 : 200,
            data: mode === "error" ? { message: "Test failure" } : rows,
          };
        }
      },
    });
    t.after(server.close);
    await page.goto(`${server.origin}/leaderboard`);
    await page.locator(".rank-table:visible tbody tr").first().waitFor();
    assert.equal(await page.locator(".rank-table:visible tbody tr").count(), 6);
    assert.equal(await page.locator(".rank-tier-trail:visible dt").count(), 6);
    assert.equal(await page.locator(".rank-podium-place:visible").count(), 3);
    assert.match(
      await page.locator(".rank-podium-place:visible").first().innerText(),
      /말랑한왕관/,
    );
    assert.equal(await page.locator(".rank-table:visible tbody img").count(), 0);
    assert.match(
      await page.locator(".rank-table:visible tbody").innerText(),
      /<img src=x onerror=alert\(1\)>/,
    );
    const measures = [];
    for (const [width, height] of [
      [1440, 900],
      [768, 1024],
      [375, 812],
    ]) {
      await page.setViewportSize({ width, height });
      const dimensions = await page.evaluate(() => ({
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        tableWidth: Array.from(document.querySelectorAll(".rank-table"))
          .find((table) => table.getBoundingClientRect().height > 0)
          .getBoundingClientRect().width,
      }));
      assert.equal(dimensions.documentWidth, width);
      assert.ok(dimensions.tableWidth <= width);
      measures.push(dimensions);
      await page.screenshot({
        path: path.join(artifacts, `${width}x${height}.png`),
        fullPage: true,
      });
    }
    assert.equal(await page.locator("body > header select").count(), 0);
    await page
      .getByRole("navigation", { name: "주 메뉴", exact: true })
      .getByRole("link", { name: "설정", exact: true })
      .click();
    await page.getByText("English", { exact: true }).click();
    await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
    assert.equal(await page.getByRole("radio", { name: "English", exact: true }).isChecked(), true);
    await page.goto(`${server.origin}/leaderboard`);
    await page.getByRole("heading", { name: "Ranked leaderboard", exact: true }).waitFor();
    assert.match(await page.locator("main").innerText(), /Competitive tiers/);
    assert.match(await page.locator(".rank-table:visible tbody").innerText(), /20W \/ 20 played/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
    await page.screenshot({ path: path.join(artifacts, "english-mobile.png"), fullPage: true });
    const play = page.getByRole("link", { name: "Play ranked", exact: true }).first();
    await page.keyboard.press("Tab");
    await play.focus();
    assert.equal(await play.evaluate((el) => el === document.activeElement), true);
    assert.ok((await play.boundingBox()).height >= 44);
    assert.notEqual(await play.evaluate((el) => getComputedStyle(el).outlineStyle), "none");
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.ok(
      parseFloat(
        await page
          .locator(".rank-tier-trail:visible svg")
          .first()
          .evaluate((el) => getComputedStyle(el).transitionDuration),
      ) < 0.01,
    );
    for (const count of [1, 2]) {
      rows = fixtures.slice(0, count);
      await page.reload();
      await page.locator(".rank-table:visible tbody tr").first().waitFor();
      assert.equal(await page.locator(".rank-podium-place:visible").count(), count);
      assert.equal(await page.locator(".rank-table:visible tbody tr").count(), count);
    }
    rows = [];
    await page.reload();
    await page.getByText("No ranked players yet.", { exact: true }).waitFor();
    assert.equal(await page.locator(".rank-podium-place:visible").count(), 0);
    await page.screenshot({ path: path.join(artifacts, "empty.png"), fullPage: true });
    mode = "error";
    await page.reload();
    await page.locator("main").getByRole("alert").waitFor();
    await page.screenshot({ path: path.join(artifacts, "error.png"), fullPage: true });
    mode = "loading";
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    assert.equal(
      await page.getByRole("button", { name: "Try again", exact: true }).getAttribute("aria-busy"),
      "true",
    );
    await page.screenshot({ path: path.join(artifacts, "loading.png"), fullPage: true });
    mode = "success";
    rows = fixtures;
    assert.ok(releaseLoading);
    releaseLoading();
    await page.locator(".rank-table:visible tbody tr").first().waitFor();
    assert.equal(await page.locator(".rank-table:visible tbody tr").count(), 6);
    await page.getByRole("link", { name: "Play ranked", exact: true }).first().click();
    await page.getByRole("link", { name: "Sign in for ranked", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(artifacts, "measurements.json"),
      JSON.stringify(
        {
          measures,
          errors,
          states: [
            "loading",
            "empty",
            "error",
            "retry",
            "one-player",
            "two-players",
            "six-players",
            "guest-ranked-gate",
          ],
          languages: ["ko", "en"],
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
});
