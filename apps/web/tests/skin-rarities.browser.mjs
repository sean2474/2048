import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");
import { mockAccount, mockCatalog } from "./browser-fixtures.mjs";
const origin = process.env.WEB_TEST_ORIGIN ?? "http://[::1]:3001";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const artifacts = path.join(root, "docs/skin-expansion");

test("rarity filters, persistence, paging and readable character tiles", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  fs.mkdirSync(artifacts, { recursive: true });
  try {
    const context = await browser.newContext({ locale: "ko-KR", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await mockCatalog(page);
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const account = await mockAccount(page);
    account.cosmetics.purchases = ["confetti", "gingham", "pinstripe", "weave", "runes", "meadow", "tide", "aurora", "obsidian", "astral", "kitty", "bunny", "sentinel", "runeknight", "arcanist"].map(item_id => ({ kind: "skin", item_id }));
    await page.goto(`${origin}/loadout`);
    await page.locator("#skin-results button:enabled").first().waitFor();
    assert.equal(await page.locator("#skin-results button").count(), 12);
    await page.getByRole("button", { name: "다음 페이지", exact: true }).click();
    assert.equal(await page.locator("#skin-results button").count(), 12);
    await page.getByRole("button", { name: "다음 페이지", exact: true }).click();
    assert.equal(await page.locator("#skin-results button").count(), 4);
    assert.equal(await page.getByRole("button", { name: "다음 페이지", exact: true }).isDisabled(), true);
    const measurements = [];
    for (const [width, height] of [[1440, 900], [768, 1024], [375, 812]]) {
      await page.setViewportSize({ width, height });
      for (const [rarity, name, count] of [["all", "전체", 12], ["common", "일반", 5], ["rare", "희귀", 8], ["epic", "에픽", 8], ["legendary", "레전더리", 7]]) {
        const filter = page.getByRole("group", { name: "스킨 등급 필터" }).getByRole("button", { name, exact: true });
        await filter.click();
        assert.equal(await filter.getAttribute("aria-pressed"), "true");
        assert.equal(await page.locator("#skin-results button").count(), count);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        assert.ok((await filter.boundingBox()).height >= 44);
        await page.screenshot({ path: path.join(artifacts, `${rarity}-${width}x${height}.png`), fullPage: true, animations: "disabled" });
        measurements.push({ width, rarity, count });
      }
    }
    for (const [rarity, skins] of [
      ["일반", [["charcoal", "차콜"], ["espresso", "에스프레소"]]],
      ["희귀", [["pinstripe", "핀스트라이프"], ["weave", "리넨 직조"], ["runes", "룬 각인"]]],
      ["에픽", [["aurora", "오로라"], ["obsidian", "흑요석"], ["astral", "별빛 서고"]]],
      ["레전더리", [["kitty", "냥냥 클럽"], ["bunny", "토끼 정원"], ["sentinel", "아이언 센티널"], ["runeknight", "룬 나이트"], ["arcanist", "아케인 오더"]]],
    ]) {
      await page.getByRole("button", { name: rarity, exact: true }).click();
      for (const [id, name] of skins) {
        await page.locator("#skin-results button").filter({ hasText: name }).click();
        await page.getByRole("dialog").getByRole("button", { name: "장착하기", exact: true }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.equal(account.row.skin_id, id);
        assert.match(await page.getByRole("region", { name: "현재 선택" }).innerText(), new RegExp(name));
      }
    }
    await page.reload();
    await page.getByRole("region", { name: "현재 선택" }).getByText(/아케인 오더/).waitFor();
    await page.goto(`${origin}/settings`);
    await page.getByText("English", { exact: true }).click();
    await page.getByRole("heading", { name: "Game preferences", exact: true }).waitFor();
    await page.goto(`${origin}/loadout`);
    await page.getByRole("button", { name: "Legendary", exact: true }).click();
    assert.match(await page.locator("#skin-results").innerText(), /Arcane Order/);
    const filter = page.getByRole("button", { name: "Epic", exact: true });
    await filter.focus();
    await page.keyboard.press("Enter");
    assert.equal(await filter.getAttribute("aria-pressed"), "true");
    assert.notEqual(await filter.evaluate(el => getComputedStyle(el).outlineStyle), "none");
    await page.screenshot({ path: path.join(artifacts, "english-keyboard.png"), fullPage: true, animations: "disabled" });
    await page.goto(`${origin}/tutorial`);
    await page.locator('.game-you [data-skin="arcanist"]').waitFor();
    assert.equal(await page.locator('.game-opponent [data-skin="classic"]').count(), 1);
    await page.screenshot({ path: path.join(artifacts, "equipped-game.png"), fullPage: true, animations: "disabled" });
    assert.deepEqual(errors, []);

    await page.goto(`${origin}/loadout`);
    await page.getByRole("button", { name: "All skins", exact: true }).waitFor();
    const fixture = execFileSync("pnpm", ["--filter", "socket", "exec", "tsx", "--tsconfig", "../web/tsconfig.json", "../web/tests/skin-tiles.fixture.tsx"], { cwd: root, encoding: "utf8" });
    await page.locator("main").evaluate((el, html) => { el.innerHTML = html; }, fixture);
    const tiles = [];
    for (const width of [500, 343, 210]) {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.locator("main").evaluate((el, width) => el.style.setProperty("--fixture-width", `${width}px`), width);
      const measurements = await page.locator('[data-skin] [role="img"]').evaluateAll(elements => elements.map(el => {
        const number = el.querySelector("span > span");
        const face = el.firstElementChild;
        const rect = face?.getBoundingClientRect();
        const range = document.createRange();
        if (number) range.selectNodeContents(number);
        const text = number ? range.getBoundingClientRect() : null;
        const character = ["kitty", "bunny", "sentinel", "runeknight", "arcanist"].includes(el.closest("[data-skin]").dataset.skin);
        const inset = character && rect ? rect.width * .1 : 0;
        return { skin: el.closest("[data-skin]").dataset.skin, label: el.getAttribute("aria-label"), number: number?.textContent, fits: !text || text.left >= rect.left + inset - 1 && text.right <= rect.right - inset + 1 && text.bottom <= rect.bottom + 1, foreground: face && getComputedStyle(face).color, background: getComputedStyle(el).backgroundColor, characters: el.querySelectorAll(":scope > span > svg").length };
      }));
      for (const item of measurements) {
        assert.equal(item.fits, true, `${item.skin}: ${item.label}, board ${width}`);
        if (item.label.startsWith("X block")) { assert.equal(item.background, "rgb(255, 107, 107)"); assert.equal(item.characters, 0); }
        if (item.label.startsWith("Hard block")) { assert.equal(item.background, "rgb(44, 44, 44)"); assert.equal(item.characters, 0); }
        if (item.number && ["kitty", "bunny", "sentinel", "runeknight", "arcanist"].includes(item.skin)) { assert.equal(item.characters, 1); assert.equal(item.foreground, "rgb(73, 59, 64)"); }
      }
      for (const skin of ["kitty", "bunny", "sentinel", "runeknight", "arcanist", "astral", "runes", "rank-bronze", "rank-silver", "rank-gold", "rank-platinum", "rank-diamond", "rank-master"]) await page.locator(`[data-skin="${skin}"]`).screenshot({ path: path.join(artifacts, `${skin}-board-${width}.png`), animations: "disabled" });
      tiles.push({ width, measurements });
    }
    fs.writeFileSync(path.join(artifacts, "measurements.json"), JSON.stringify({ measurements, tiles, errors }, null, 2));
  } finally { await browser.close(); }
});
