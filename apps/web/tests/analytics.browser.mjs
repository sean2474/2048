import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const origin = process.env.ANALYTICS_TEST_ORIGIN || "http://[::1]:3001";
const enabled = process.env.ANALYTICS_EXPECT_ENABLED === "true";

test("analytics respects the deployment gate and reports only explicit catalog/navigation actions", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({ locale: "en-US" });
    // No Vercel traffic leaves this test, even when exercising a production build.
    await context.route("**/*", (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      // Vercel can randomize its script URLs; only application bundles are needed here.
      if (
        path.startsWith("/_vercel/") ||
        (request.resourceType() === "script" && !path.startsWith("/_next/"))
      )
        return route.fulfill({ contentType: "application/javascript", body: "" });
      return route.continue();
    });
    await context.addInitScript(() => {
      window.analyticsProbe = { events: [], hooks: [] };
      window.va = (kind, value) => {
        if (kind === "event") window.analyticsProbe.events.push(value);
        if (kind === "beforeSend") window.analyticsProbe.hooks.push(value);
      };
      window.si = (kind, value) => {
        if (kind === "beforeSend") window.analyticsProbe.hooks.push(value);
      };
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/loadout`);
    await page.getByRole("button", { name: "Legendary", exact: true }).click();
    await page
      .getByRole("button", { name: "Kitty Club · Locked · View unlock conditions", exact: true })
      .click();
    await page.getByRole("button", { name: "Preview merge effect", exact: true }).click();
    await page.locator('[data-phase="finished"]').waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Coin shop", exact: true }).click();
    await page.getByRole("button", { name: "Legendary", exact: true }).click();
    await page.getByRole("button", { name: "Kitty Club · Preview shop item", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    const events = await page.evaluate(() => window.analyticsProbe.events);
    if (enabled) {
      assert.deepEqual(
        events.map((event) => event.name),
        [
          "skin_filter_changed",
          "cosmetic_previewed",
          "merge_previewed",
          "navigation_clicked",
          "skin_filter_changed",
          "cosmetic_previewed",
        ],
      );
      assert.deepEqual(events[1].data, { item: "kitty", source: "loadout" });
      assert.deepEqual(events[3].data, { destination: "/shop" });
      assert.deepEqual(events[5].data, { item: "kitty", source: "shop" });
      assert.ok(events.every((event) => Object.keys(event.data).length <= 2));
      assert.equal(await page.locator('script[data-sdkn^="@vercel/"]').count(), 2);
      const sanitized = await page.evaluate(() =>
        window.analyticsProbe.hooks.map((hook) =>
          hook({ type: "pageview", url: "https://2048duo.io/play/secret-room?code=secret#secret" }),
        ),
      );
      assert.ok(sanitized.length >= 2);
      assert.ok(sanitized.every((event) => event.url === "https://2048duo.io/play/[id]"));
    } else {
      assert.deepEqual(events, []);
      assert.equal(await page.locator('script[data-sdkn^="@vercel/"]').count(), 0);
      assert.equal(await page.evaluate(() => window.analyticsProbe.hooks.length), 0);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
