import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mockAccount, trackAudio } from "./browser-fixtures.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const artifacts = fileURLToPath(new URL("../../../test-results/legendary-motion", import.meta.url));
const origin = process.env.TEST_WEB_ORIGIN || "http://[::1]:3001";

test("legendary details preview the viewed skin, replay, cancel and respect audio/motion settings", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  fs.mkdirSync(artifacts, { recursive: true });
  try {
    const context = await browser.newContext({
      locale: "en-US",
      viewport: { width: 375, height: 812 },
    });
    context.setDefaultTimeout(12000);
    await trackAudio(context);
    const page = await context.newPage(),
      errors = [],
      measurements = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const account = await mockAccount(page);
    account.row.locale = "en";
    account.cosmetics.purchases = ["kitty", "bunny", "sentinel", "runeknight", "arcanist"].map(
      (item_id) => ({ kind: "skin", item_id }),
    );
    await page.goto(`${origin}/loadout`);
    await page.getByRole("button", { name: "Legendary", exact: true }).click();
    for (const [skin, name, effect, animation, frequencies] of [
      ["kitty", "Kitty Club", "cat", "legendary-cat", [520, 1040]],
      ["bunny", "Bunny Garden", "bunny", "legendary-bunny", [620, 1240]],
      ["sentinel", "Iron Sentinel", "sentinel", "legendary-sentinel", [170, 860, 1290]],
      ["runeknight", "Rune Knight", "runeknight", "legendary-runeknight", [294, 587, 881]],
      ["arcanist", "Arcane Order", "arcanist", "legendary-arcanist", [523, 784, 1568]],
    ]) {
      await page.evaluate(() => {
        window.audioProbe.notes = [];
      });
      const card = page.getByRole("button", { name: `${name} · View details`, exact: true });
      await card.click();
      const preview = page.locator(`[data-skin-preview="${skin}"]`),
        dialog = page.getByRole("dialog");
      assert.equal(await preview.getAttribute("data-phase"), "idle");
      assert.deepEqual(await page.evaluate(() => window.audioProbe.notes), []);
      const play = dialog.getByRole("button", { name: "Preview merge effect", exact: true });
      await dialog.evaluate((el) => {
        for (const animation of el.getAnimations()) animation.finish();
      });
      assert.ok((await play.boundingBox()).height >= 44);
      await play.focus();
      await page.keyboard.press("Enter");
      await page.locator('[data-phase="moving"]').waitFor();
      assert.equal(
        await preview
          .locator(".skin-preview-source")
          .evaluate((el) => getComputedStyle(el).animationName),
        "skin-preview-slide",
      );
      assert.equal(
        await dialog.getByRole("button", { name: "Playing merge…" }).getAttribute("aria-disabled"),
        "true",
      );
      const merged = preview.locator(`[data-merge-effect="${effect}"]`);
      await merged.waitFor();
      assert.equal(await merged.innerText(), "4");
      assert.equal(await merged.evaluate((el) => getComputedStyle(el).animationName), animation);
      assert.equal(await merged.locator(".legendary-merge-flair").count(), 1);
      await page.waitForFunction(
        (notes) => JSON.stringify(window.audioProbe.notes) === JSON.stringify(notes),
        frequencies,
      );
      await dialog.getByRole("button", { name: "Replay merge effect", exact: true }).waitFor();
      await dialog.getByRole("button", { name: "Replay merge effect", exact: true }).click();
      await page.waitForFunction(
        (count) => window.audioProbe.notes.length === count,
        frequencies.length * 2,
      );
      assert.deepEqual(await page.evaluate(() => window.audioProbe.notes), [
        ...frequencies,
        ...frequencies.map((note) => note * 1.125),
      ]);
      assert.equal(account.row.skin_id, "classic");
      await merged.evaluate((el) => {
        for (const animation of el.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = 100;
        }
      });
      for (const [width, height] of skin === "arcanist"
        ? [
            [1440, 900],
            [768, 1024],
            [375, 812],
          ]
        : [[375, 812]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        await dialog.evaluate((el) =>
          Promise.all(el.getAnimations().map((animation) => animation.finished)),
        );
        const box = await dialog.boundingBox();
        assert.ok(
          box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height,
        );
        assert.ok(box.width <= 512);
        assert.equal(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
        await page.screenshot({
          path: path.join(artifacts, `preview-${skin}-${width}x${height}.png`),
          animations: "allow",
        });
      }
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await card.evaluate((el) => el === document.activeElement), true);
      measurements.push({ skin, effect, animation, frequencies, replay: true });
    }
    const card = page.getByRole("button", { name: "Arcane Order · View details", exact: true });
    await card.click();
    await page.evaluate(() => {
      window.audioProbe.notes = [];
    });
    await page.getByRole("button", { name: "Preview merge effect", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(750);
    assert.deepEqual(await page.evaluate(() => window.audioProbe.notes), []);
    await card.click();
    assert.equal(await page.locator("[data-skin-preview]").getAttribute("data-phase"), "idle");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Game sound", exact: true }).click();
    await page.getByText("Sound off · motion only", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Preview merge effect", exact: true }).click();
    assert.equal(
      await page
        .locator(".skin-preview-source")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    const merged = page.locator('[data-merge-effect="arcanist"]');
    await merged.waitFor();
    assert.equal(await merged.evaluate((el) => getComputedStyle(el).animationName), "none");
    assert.equal(
      await merged.locator(".legendary-merge-flair").evaluate((el) => getComputedStyle(el).display),
      "none",
    );
    assert.deepEqual(await page.evaluate(() => window.audioProbe.notes), []);
    assert.equal(account.row.skin_id, "classic");
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(artifacts, "preview.json"),
      JSON.stringify(
        { measurements, cancelled: true, muted: true, reducedMotion: true, errors },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
});

test("guests can preview locked skins without audio hardware or changing their loadout", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      locale: "ko-KR",
      viewport: { width: 375, height: 812 },
    });
    context.setDefaultTimeout(12000);
    await context.addInitScript(() => {
      window.AudioContext = undefined;
      window.webkitAudioContext = undefined;
    });
    const page = await context.newPage();
    await page.goto(`${origin}/loadout`);
    await page.getByRole("button", { name: "레전더리", exact: true }).click();
    await page.locator("#skin-results button").first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("로그인하면 사용할 수 있어요.").waitFor();
    await dialog.getByRole("button", { name: "합성 효과 미리보기", exact: true }).click();
    await dialog.getByText("소리 사용 불가 · 모션만 재생", { exact: true }).waitFor();
    await dialog.locator('[data-phase="finished"]').waitFor();
    assert.equal(await dialog.locator("[data-merge-effect]").innerText(), "4");
    await dialog.screenshot({
      path: path.join(artifacts, "guest-silent-preview-375x812.png"),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    assert.match(await page.getByRole("region", { name: "현재 선택" }).innerText(), /클래식/);
  } finally {
    await browser.close();
  }
});
