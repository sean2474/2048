import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const origin = "http://[::1]:3001";

test("country defaults survive hydration; manual language persists and mobile controls remain tappable", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const [country, browserLocale, expected] of [
      ["KR", "en-US", "ko"],
      ["US", "ko-KR", "en"],
      [null, "ko-KR", "ko"],
      [null, "en-US", "en"],
    ]) {
      const context = await browser.newContext({
        locale: browserLocale,
        extraHTTPHeaders: country ? { "x-vercel-ip-country": country } : {},
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const response = await page.goto(`${origin}/settings`);
      assert.match(await response.text(), new RegExp(`<html[^>]+lang="${expected}"`));
      await page.waitForFunction(() =>
        document.querySelector('input[name="language"]')?.matches(":enabled"),
      );
      assert.equal(await page.locator("html").getAttribute("lang"), expected);
      assert.equal(
        await page
          .getByRole("radio", { name: expected === "ko" ? "한국어" : "English", exact: true })
          .isChecked(),
        true,
      );
      assert.equal(await page.getByRole("combobox").count(), 0);
      assert.equal(await page.locator("body > header").getByRole("radio").count(), 0);
      assert.deepEqual(errors, []);
      await context.close();
    }

    const context = await browser.newContext({
      locale: "en-US",
      extraHTTPHeaders: { "x-vercel-ip-country": "KR" },
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(`${origin}/settings`);
    await page.getByText("English", { exact: true }).tap();
    await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      const choice = await page.getByText("English", { exact: true }).boundingBox();
      assert.ok(choice.height >= 44);
    }
    await page.reload();
    await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
    assert.equal(await page.getByRole("radio", { name: "English", exact: true }).isChecked(), true);
    await page.getByRole("radio", { name: "English", exact: true }).focus();
    await page.keyboard.press("ArrowLeft");
    await page.getByRole("heading", { name: "설정", exact: true }).waitFor();
    assert.equal(await page.getByRole("radio", { name: "한국어", exact: true }).isChecked(), true);
    await context.setExtraHTTPHeaders({ "x-vercel-ip-country": "US" });
    await page.reload();
    await page.getByRole("heading", { name: "설정", exact: true }).waitFor();
    assert.equal(await page.locator("html").getAttribute("lang"), "ko");

    // Block only guest writes: the UI must keep the current choice and offer retry.
    await page.evaluate(() => {
      const cookie = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
      Object.defineProperty(document, "cookie", {
        configurable: true,
        get() {
          return cookie.get.call(this);
        },
        set(value) {
          if (value.startsWith("duo.guest-settings=")) throw new Error("Test blocked cookie");
          cookie.set.call(this, value);
        },
      });
    });
    await page.getByText("English", { exact: true }).tap();
    await page.getByRole("main").getByRole("alert").waitFor();
    assert.equal(await page.getByRole("radio", { name: "한국어", exact: true }).isChecked(), true);
    await page.evaluate(() => {
      delete document.cookie;
    });
    await page.getByText("English", { exact: true }).tap();
    await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
    assert.equal(await page.getByRole("main").getByRole("alert").count(), 0);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${origin}/tutorial`);
    assert.equal(await page.getByRole("combobox").count(), 0);
    const directions = page.getByRole("group", { name: "Direction controls", exact: true });
    assert.equal(await page.locator("[data-attack-control], .charge-rail").count(), 0);
    for (const direction of ["up", "left", "down", "right"]) {
      const button = directions.getByRole("button", { name: `Move ${direction}`, exact: true });
      const box = await button.boundingBox();
      assert.equal(box.width, 52);
      assert.equal(box.height, 52);
      assert.equal(
        await button.evaluate((element) => getComputedStyle(element).touchAction),
        "manipulation",
      );
    }
    await directions.getByRole("button", { name: "Move left", exact: true }).tap();
    await page.getByRole("heading", { name: "You’ve got the basics", exact: true }).waitFor();
    assert.equal(await page.getByTestId("your-score").innerText(), "4");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
    await page.getByRole("button", { name: "Skip ahead to 128 + 128", exact: true }).tap();
    await directions.getByRole("button", { name: "Move left", exact: true }).tap();
    await page.getByRole("heading", { name: "Your X block landed", exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("group", { name: "Opponent’s game board", exact: true })
        .getByRole("img", { name: /X block, movable obstacle/ })
        .count(),
      1,
    );
    await page.getByRole("button", { name: "Try a hard block", exact: true }).tap();
    await directions.getByRole("button", { name: "Move left", exact: true }).tap();
    await page
      .getByRole("heading", { name: "A fixed obstacle on their board", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("group", { name: "Opponent’s game board", exact: true })
        .getByRole("img", { name: /Hard block, fixed obstacle/ })
        .count(),
      1,
    );
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      for (const button of [directions.getByRole("button", { name: "Move left", exact: true })]) {
        const box = await button.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44);
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }
});
