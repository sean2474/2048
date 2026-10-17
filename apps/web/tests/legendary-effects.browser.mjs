import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mockAccount, trackAudio } from "./browser-fixtures.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const artifacts = fileURLToPath(new URL("../../../docs/legendary-motion", import.meta.url));
const origin = process.env.TEST_WEB_ORIGIN || "http://[::1]:3001";

test("legendary merge motion, real audio routing, mute and reduced motion", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  fs.mkdirSync(artifacts, { recursive: true });
  const measurements = [];
  try {
    const context = await browser.newContext({ locale: "en-US", viewport: { width: 375, height: 812 } });
    context.setDefaultTimeout(12000);
    await trackAudio(context);
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const account = await mockAccount(page); account.row.locale = "en";
    await page.goto(`${origin}/tutorial`);
    await page.getByRole("button", { name: "Move left", exact: true }).click();
    assert.equal(await page.locator(".legendary-merge-flair").count(), 0);
    assert.equal(await page.getByTestId("your-score").innerText(), "4");
    for (const [skin, effect, animation, flair, frequencies] of [
      ["kitty", "cat", "legendary-cat", "merge-paws", [520, 1040]],
      ["bunny", "bunny", "legendary-bunny", "merge-petals", [620, 1240]],
      ["sentinel", "sentinel", "legendary-sentinel", "merge-lock", [170, 860, 1290]],
      ["runeknight", "runeknight", "legendary-runeknight", "merge-runes", [294, 587, 881]],
      ["arcanist", "arcanist", "legendary-arcanist", "merge-orbit", [523, 784, 1568]],
      ["rank-diamond", "diamond", "legendary-diamond", "merge-prism", [1047, 1568, 2093]],
      ["rank-master", "crown", "legendary-crown", "merge-coronation", [392, 587, 988]],
    ]) {
      account.row.skin_id = skin;
      await page.goto(`${origin}/tutorial`);
      await page.locator(`.game-you [data-skin="${skin}"]`).waitFor();
      await page.getByRole("button", { name: "Move left", exact: true }).click();
      const tile = page.locator(`.game-you [data-merge-effect="${effect}"]`);
      await tile.waitFor();
      assert.equal(await tile.evaluate(el => getComputedStyle(el).animationName), animation);
      const art = tile.locator(".legendary-merge-flair");
      assert.equal(await art.evaluate(el => getComputedStyle(el).animationName), flair);
      assert.equal(await art.getAttribute("aria-hidden"), "true");
      await page.waitForFunction(frequencies => JSON.stringify(window.audioProbe.notes) === JSON.stringify(frequencies), frequencies);
      assert.equal(await page.locator('.game-opponent [data-merge-effect]').count(), 0);
      assert.equal(await page.locator('.game-you [role="img"][aria-hidden="true"] .legendary-merge-flair').count(), 0);
      await tile.evaluate(el => { for (const animation of el.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = 100; } });
      assert.ok(Number(await art.evaluate(el => getComputedStyle(el).opacity)) > .5);
      assert.notEqual(await tile.evaluate(el => getComputedStyle(el).transform), "none");
      await page.locator(".game-you").screenshot({ path: path.join(artifacts, `merge-${skin}.png`), animations: "allow" });
      await tile.evaluate(el => { for (const animation of el.getAnimations({ subtree: true })) animation.finish(); });
      assert.equal(await art.evaluate(el => getComputedStyle(el).opacity), "0");
      assert.equal(await tile.evaluate(el => { const transform = getComputedStyle(el).transform; return transform === "none" || new DOMMatrixReadOnly(transform).isIdentity; }), true);
      measurements.push({ skin, animation, flair, frequencies });
    }
    account.row.skin_id = "arcanist";
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${origin}/tutorial`);
    await page.locator('.game-you [data-skin="arcanist"]').waitFor();
    await page.getByRole("button", { name: "Game sound", exact: true }).click();
    await page.getByRole("button", { name: "Move left", exact: true }).click();
    const tile = page.locator('.game-you [data-merge-effect="arcanist"]');
    await tile.waitFor();
    assert.equal(await tile.evaluate(el => getComputedStyle(el).animationName), "none");
    assert.equal(await tile.locator(".legendary-merge-flair").evaluate(el => getComputedStyle(el).display), "none");
    assert.deepEqual(await page.evaluate(() => window.audioProbe.notes), []);
    assert.equal(await page.getByTestId("your-score").innerText(), "4");
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(artifacts, "legendary-effects.json"), JSON.stringify({ measurements, muted: true, reducedMotion: true, errors }, null, 2));
  } finally { await browser.close(); }
});
