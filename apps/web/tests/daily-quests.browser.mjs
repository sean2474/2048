import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { mockAccount } from "./browser-fixtures.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const origin = "http://[::1]:3001";
const screenshots = new URL("../../../docs/daily-quests/", import.meta.url).pathname;

test("dashboard rewards, retries and guest states stay separate from the achievement collection", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  await mkdir(screenshots, { recursive: true });
  try {
    const page = await browser.newPage({ locale: "ko-KR", reducedMotion: "reduce" });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const matchTopics = new Set();
    await page.routeWebSocket("wss://*.supabase.co/**", (socket) =>
      socket.onMessage((raw) => {
        const message = JSON.parse(String(raw));
        if (message.event !== "phx_join") return;
        if (message.topic.includes("duo:match_participants:")) matchTopics.add(message.topic);
        socket.send(
          JSON.stringify({
            topic: message.topic,
            event: "phx_reply",
            ref: message.ref,
            payload: {
              status: "ok",
              response: {
                postgres_changes: (message.payload.config.postgres_changes ?? []).map(
                  (change, id) => ({ ...change, id }),
                ),
              },
            },
          }),
        );
      }),
    );
    const account = await mockAccount(page);
    await page.goto(origin);
    const quests = page.getByRole("region", { name: "일일 퀘스트", exact: true });
    await quests.getByText("오늘 받은 보상 20코인", { exact: true }).waitFor();
    assert.equal(await quests.locator("[data-quest-id]").count(), 3);
    assert.equal(account.cosmetics.balance, 20);
    await page.waitForTimeout(200);
    assert.ok(matchTopics.size >= 2, "quest and recent-match widgets subscribe independently");
    await page.reload();
    await quests.getByText("오늘 받은 보상 20코인", { exact: true }).waitFor();
    assert.equal(account.cosmetics.balance, 20);

    account.dailyQuests.quests[1].progress = 3;
    account.dailyQuests.quests[2].progress = 1;
    await page.reload();
    await quests.getByText("오늘 받은 보상 120코인", { exact: true }).waitFor();
    assert.equal(await quests.getByText("코인 지급 완료", { exact: true }).count(), 3);
    assert.equal(account.cosmetics.balance, 120);
    for (const [width, height] of [
      [375, 812],
      [768, 1024],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      await quests.screenshot({ path: `${screenshots}dashboard-${width}.png` });
    }

    let fail = true;
    await page.route("**/rest/v1/rpc/sync_daily_quests", (route) =>
      fail
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: '{"message":"Fixture unavailable"}',
          })
        : route.fallback(),
    );
    await page.reload();
    await quests.getByRole("alert").waitFor();
    assert.equal(await quests.getByText("코인 지급 완료", { exact: true }).count(), 0);
    fail = false;
    await quests.getByRole("button", { name: "일일 퀘스트 다시 확인", exact: true }).click();
    await quests.getByText("오늘 받은 보상 120코인", { exact: true }).waitFor();
    assert.equal(account.cosmetics.balance, 120);
    await page.goto(`${origin}/achievements`);
    await page.getByRole("heading", { name: "업적", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "일일 퀘스트", exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    await page.close();

    const guest = await browser.newPage({ locale: "ko-KR", viewport: { width: 375, height: 812 } });
    await guest.goto(origin);
    const preview = guest.getByRole("region", { name: "일일 퀘스트", exact: true });
    await preview
      .getByText("로그인하고 일일 퀘스트를 완료해 코인을 모으세요.", { exact: true })
      .waitFor();
    assert.equal(await preview.getByRole("progressbar").count(), 0);
    await preview.getByRole("link", { name: "로그인", exact: true }).waitFor();
  } finally {
    await browser.close();
  }
});

test("achievement summary, nearest target, filters and earned king profile are readable on mobile", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ locale: "ko-KR", reducedMotion: "reduce" });
    page.setDefaultTimeout(10000);
    const account = await mockAccount(page);
    account.achievements.attendance.checkedInToday = true;
    account.achievements.soloBestMs = 480000;
    account.achievements.unlocks = ["checkin-7", "solo-first", "solo-10min", "endless-2048"].map(
      (achievementId) => ({ achievementId, unlockedAt: "2026-10-17T01:00:00Z" }),
    );
    await page.goto(`${origin}/achievements`);
    await page.getByRole("progressbar", { name: "달성한 업적", exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("progressbar", { name: "달성한 업적", exact: true })
        .getAttribute("value"),
      "4",
    );
    assert.equal(await page.locator("#achievement-king progress").getAttribute("value"), "80");
    await page.locator("#achievement-king").getByText("앞으로 1개", { exact: true }).waitFor();
    await page
      .getByRole("region", { name: "내 업적 현황", exact: true })
      .getByText("업적왕", { exact: true })
      .waitFor();
    const filters = page.getByRole("group", { name: "업적 상태 필터", exact: true });
    await filters.getByRole("button", { name: "달성 완료 4", exact: true }).click();
    assert.equal(await page.locator("#achievement-rewards > li").count(), 4);
    await filters.getByRole("button", { name: "도전 중 15", exact: true }).click();
    assert.equal(await page.locator("#achievement-rewards > li").count(), 15);
    assert.equal(await page.locator("#solo-6min progress").getAttribute("value"), "75");
    await filters.getByRole("button", { name: "전체 19", exact: true }).click();
    for (const [width, height] of [
      [375, 812],
      [768, 1024],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      await page.screenshot({ path: `${screenshots}achievements-${width}.png`, fullPage: true });
    }
    await page.locator('header a[href="/"]').click();
    await page.getByRole("heading", { name: "대시보드", exact: true }).waitFor();
    account.achievements.unlocks.push(
      { achievementId: "endless-4096", unlockedAt: "2026-10-17T02:00:00Z" },
      { achievementId: "achievement-king", unlockedAt: "2026-10-17T02:00:00Z" },
    );
    await page
      .getByRole("region", { name: "매일 출석", exact: true })
      .getByRole("link", { name: "업적", exact: true })
      .click();
    await page.locator("#achievement-king").getByText("영구 해금 완료", { exact: true }).waitFor();
    await page
      .locator("#achievement-king")
      .getByRole("link", { name: "내 꾸미기", exact: true })
      .click();
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    await page.getByRole("button", { name: "업적왕 · 자세히 보기", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "장착하기", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(account.row.icon_id, "achievement-king");
  } finally {
    await browser.close();
  }
});
