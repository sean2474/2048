import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mockAccount } from "./browser-fixtures.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const origin = "http://[::1]:3001";
const artifacts = fileURLToPath(new URL("../../../docs/economy-preview/", import.meta.url));

test("shop browsing and planned achievements do not spend coins", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  await mkdir(artifacts, { recursive: true });
  try {
    for (const authenticated of [false, true]) {
      const context = await browser.newContext({ locale: "ko-KR", reducedMotion: "reduce" });
      const page = await context.newPage(),
        errors = [],
        writes = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (
          request.url().includes("/rest/v1/") &&
          !["GET", "HEAD", "OPTIONS"].includes(request.method())
        )
          writes.push(request.url());
      });
      const account = authenticated ? await mockAccount(page) : null;
      await page.goto(`${origin}/loadout`);
      await page.getByRole("main").getByRole("link", { name: "코인 상점", exact: true }).click();
      await page.getByRole("heading", { name: "코인 상점", exact: true }).waitFor();
      assert.equal(await page.locator("#shop-items > li").count(), 12);
      await page.getByRole("button", { name: "다음 페이지", exact: true }).click();
      assert.equal(await page.locator("#shop-items > li").count(), 8);
      assert.equal(
        await page.getByRole("button", { name: "다음 페이지", exact: true }).isDisabled(),
        true,
      );
      await page.getByRole("button", { name: "일반", exact: true }).click();
      assert.equal(await page.locator("#shop-items > li").count(), 5);
      await page.getByRole("button", { name: "레전더리", exact: true }).click();
      assert.equal(await page.locator("#shop-items > li").count(), 5);
      const card = page.getByRole("button", { name: "아케인 오더 · 상품 미리보기", exact: true });
      await card.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      assert.equal(await dialog.getByRole("button", { name: "구매 준비 중" }).count(), 0);
      assert.doesNotMatch(await dialog.innerText(), /예정 가격|현재 스킨은 로그인 후/);
      await dialog.getByRole("button", { name: "합성 효과 미리보기", exact: true }).click();
      await dialog.locator('[data-phase="finished"]').waitFor();
      assert.equal(await dialog.locator("[data-merge-effect]").innerText(), "4");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await card.evaluate((el) => el === document.activeElement), true);
      if (account) assert.equal(account.row.skin_id, "classic");
      await page.getByRole("link", { name: "업적", exact: true }).click();
      await page.getByRole("heading", { name: "업적", exact: true }).waitFor();
      await page.getByText("준비 중인 추가 업적", { exact: false }).click();
      assert.equal(
        await page
          .locator("#planned-achievements")
          .getByText("진행도 집계 전", { exact: true })
          .count(),
        6,
      );
      assert.equal(await page.locator("#planned-achievements").getByRole("progressbar").count(), 0);
      assert.equal(await page.getByRole("button", { name: /수령|구매/ }).count(), 0);
      if (!authenticated)
        for (const [width, height] of [
          [375, 812],
          [768, 1024],
          [1440, 900],
        ]) {
          await page.setViewportSize({ width, height });
          for (const route of ["achievements", "shop"]) {
            await page.goto(`${origin}/${route}`);
            await page.getByRole("main").getByRole("heading", { level: 1 }).waitFor();
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
            await page.screenshot({
              path: `${artifacts}${route}-${width}x${height}.png`,
              fullPage: true,
              animations: "disabled",
            });
          }
        }
      assert.deepEqual(writes, []);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser.close();
  }
});
