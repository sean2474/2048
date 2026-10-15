import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mockAccount } from "./browser-fixtures.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const origin = "http://[::1]:3001";

test("guest loadout is fixed, locked cards explain access, and owned filters keep defaults", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({ locale: "ko-KR", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}/loadout`);
    const current = page.getByRole("region", { name: "현재 선택" });
    await current.getByText("게스트 아이콘", { exact: true }).waitFor();
    assert.match(await current.innerText(), /클래식/);
    assert.equal(await page.locator("#skin-results button").count(), 12);
    await page.getByRole("button", { name: "다음 페이지", exact: true }).click();
    assert.equal(await page.locator("#skin-results button").count(), 8);
    await page.getByRole("checkbox", { name: "보유 중인 것만" }).check();
    assert.equal(await page.locator("#skin-results button").count(), 1);
    assert.equal(await page.getByRole("navigation", { name: "목록 페이지" }).count(), 0);
    await page.getByRole("button", { name: "희귀", exact: true }).click();
    await page.getByText("이 필터에 해당하는 보유 항목이 없어요.").waitFor();
    await page.getByRole("button", { name: "전체", exact: true }).click();
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    assert.equal(await page.locator("#icons-panel button").count(), 1);
    await page.getByRole("checkbox", { name: "보유 중인 것만" }).uncheck();
    assert.equal(await page.locator("#icons-panel button").count(), 7);
    const locked = page.getByRole("button", { name: "불꽃 여우 · 잠김 · 해금 조건 보기", exact: true });
    await locked.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("로그인하면 사용할 수 있어요.").waitFor();
    assert.match(await dialog.innerText(), /업적 달성/);
    assert.equal(await dialog.getByRole("link", { name: "로그인", exact: true }).getAttribute("href"), "/login");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await locked.evaluate(el => el === document.activeElement), true);
    for (const [width, height] of [[1440, 900], [768, 1024], [375, 812], [320, 740]]) {
      await page.setViewportSize({ width, height });
      for (const category of ["skins", "icons"]) {
        await page.locator(`#${category}-tab`).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        assert.ok(await page.locator(`#${category}-panel button[aria-haspopup=dialog]`).evaluateAll(cards => cards.every(card => card.getBoundingClientRect().height >= 44)));
      }
    }
    await page.locator("#icons-tab").focus();
    await page.keyboard.press("Home");
    assert.equal(await page.locator("#skins-tab").getAttribute("aria-selected"), "true");
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#icons-tab").getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("#icons-panel img").evaluateAll(images => images.every(image => parseFloat(getComputedStyle(image).borderRadius) >= image.width / 2)), true);
    await page.reload();
    await current.getByText("게스트 아이콘", { exact: true }).waitFor();
    assert.match(await current.innerText(), /클래식/);
    assert.equal(await page.locator("#abilities-tab").count(), 0);
    await page.goto(`${origin}/find-match`);
    await page.getByRole("button", { name: /특수 능력/ }).click();
    await dialog.getByRole("button", { name: /알박기/ }).click();
    assert.match(await dialog.innerText(), /최고 숫자 타일 고정/);
    assert.match(await dialog.innerText(), /최고 숫자 타일 1개/);
    assert.equal(await dialog.locator("button[aria-expanded]").count(), 5);
    assert.equal(await dialog.locator("[data-ability-icon]").count(), 5);
    assert.match(await dialog.innerText(), /기본 능력은 X 제거/);
    assert.equal(await dialog.getByRole("link", { name: "로그인", exact: true }).getAttribute("href"), "/login");
    await dialog.getByRole("button", { name: "닫기" }).click();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("account skin and abilities are selected from details and persist", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({ locale: "ko-KR" });
    const page = await context.newPage();
    const account = await mockAccount(page);
    await page.goto(`${origin}/loadout`);
    await page.getByRole("button", { name: "페이퍼 · 자세히 보기", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "장착하기", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(account.row.skin_id, "paper");
    await page.goto(`${origin}/find-match`);
    await page.getByRole("button", { name: /특수 능력/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: /알박기/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "장착하기", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(account.row.ability_id, "anchor-tile");
    await page.reload();
    await page.getByRole("button", { name: /특수 능력.*알박기/ }).waitFor();
    await page.getByRole("button", { name: /특수 능력/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: /X 제거/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "장착하기", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(account.row.ability_id, null);
  } finally { await browser.close(); }
});
