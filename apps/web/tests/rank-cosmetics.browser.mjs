import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mockAccount, mockCatalog } from "./browser-fixtures.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const origin = process.env.WEB_TEST_ORIGIN ?? process.env.TEST_WEB_ORIGIN ?? "http://[::1]:3001";
const artifacts = fileURLToPath(new URL("../../../docs/rank-cosmetics/", import.meta.url));
const ranks = ["bronze", "silver", "gold", "platinum", "diamond", "master"];
const names = ["브론즈의 성채", "실버의 검문장", "골드의 월계관", "플래티넘의 나침반", "다이아몬드 프리즘", "마스터의 왕관"];

async function setup(browser, viewport = { width: 375, height: 812 }) {
  const context = await browser.newContext({ locale: "ko-KR", viewport, reducedMotion: "reduce" });
  await context.addCookies([{ name: "duo.locale", value: "ko", url: origin }]);
  const page = await context.newPage();
    await mockCatalog(page);
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const account = await mockAccount(page);
  account.achievements.attendance.checkedInToday = true;
  return { context, page, account, errors };
}

async function decoded(page) {
  assert.equal(await page.locator("main img").evaluateAll(async images => {
    await Promise.all(images.map(image => image.decode()));
    return images.every(image => image.naturalWidth > 0);
  }), true);
}

test("rank sets stay locked without a server unlock and never appear in the coin shop", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    await mkdir(artifacts, { recursive: true });
    const { page, account, errors } = await setup(browser);
    account.achievements.highestRank = 6; // A progress number alone is not ownership.
    await page.goto(`${origin}/loadout`);
    await page.getByRole("button", { name: "레전더리", exact: true }).click();
    await page.getByRole("button", { name: `${names[4]} · 잠김 · 해금 조건 보기`, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("경쟁전에서 다이아몬드 이상 달성 · 배치 완료 후").waitFor();
    assert.equal(await dialog.getByRole("button", { name: "장착하기", exact: true }).count(), 0);
    await page.screenshot({ path: `${artifacts}diamond-locked-375.png`, fullPage: true });
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    await page.getByRole("button", { name: `${names[5]} · 잠김 · 해금 조건 보기`, exact: true }).click();
    await dialog.getByText("경쟁전에서 마스터 이상 달성 · 배치 완료 후").waitFor();
    assert.equal(account.row.icon_id, "fox");
    await page.goto(`${origin}/shop`);
    for (const name of names) assert.equal(await page.getByText(name, { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("earned rank sets equip both items, survive reload, and render themed legendary merges", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    await mkdir(artifacts, { recursive: true });
    const { page, account, errors } = await setup(browser);
    account.achievements.highestRank = 6;
    account.achievements.unlocks = ranks.map(rank => ({ achievementId: `rank-${rank}`, unlockedAt: "2026-10-17T12:00:00Z" }));
    await page.goto(`${origin}/loadout`);
    await page.getByRole("button", { name: "레전더리", exact: true }).click();
    for (const [rank, name, effect] of [["diamond", names[4], "diamond"], ["master", names[5], "crown"]]) {
      const card = page.getByRole("button", { name: `${name} · 자세히 보기`, exact: true });
      await card.focus(); await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "합성 효과 미리보기", exact: true }).click();
      const preview = dialog.locator(`[data-skin-preview="rank-${rank}"][data-phase="finished"]`);
      await preview.waitFor();
      assert.equal(await preview.locator(`[data-merge-effect="${effect}"] .legendary-merge-flair path`).count() > 0, true);
      assert.equal(await preview.locator(".legendary-merge-flair").evaluate(el => getComputedStyle(el).display), "none");
      await page.screenshot({ path: `${artifacts}${rank}-merge-375.png`, fullPage: true });
      await dialog.getByRole("button", { name: "장착하기", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(account.row.skin_id, `rank-${rank}`);
    }
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    await page.getByRole("button", { name: `${names[5]} · 자세히 보기`, exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "장착하기", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(account.row.icon_id, "rank-master");
    await page.reload();
    await page.getByRole("region", { name: "현재 선택" }).locator('[data-profile-icon="rank-master"]').waitFor();
    await page.goto(`${origin}/tutorial`);
    await page.locator('.game-you [data-skin="rank-master"]').waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("tier set cards show paired rewards and stay readable at mobile, tablet and desktop widths", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    await mkdir(artifacts, { recursive: true });
    const { page, account, errors } = await setup(browser);
    account.achievements.highestRank = 4;
    account.achievements.unlocks = ranks.slice(0, 4).map(rank => ({ achievementId: `rank-${rank}`, unlockedAt: "2026-10-17T12:00:00Z" }));
    await page.goto(`${origin}/achievements`);
    await page.locator('#rank-platinum progress[value="100"]').waitFor();
    for (const rank of ranks) {
      const card = page.locator(`#rank-${rank}`);
      assert.equal(await card.locator(`[data-profile-icon="rank-${rank}"]`).count(), 1);
      await card.getByText("티어 전용 보드 + 프로필").waitFor();
    }
    for (const [width, height] of [[320, 740], [375, 812], [768, 1024], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await decoded(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      await page.locator("#rank-bronze").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${artifacts}collection-${width}.png` });
    }
    await page.route("**/rest/v1/rpc/sync_achievements*", route => route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"Fixture failure"}' }));
    await page.goto(`${origin}/loadout`);
    await page.getByRole("button", { name: "해금 정보 다시 불러오기" }).waitFor();
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    await page.getByRole("button", { name: `${names[0]} · 잠김 · 해금 조건 보기`, exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
