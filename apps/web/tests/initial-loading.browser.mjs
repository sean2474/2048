import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { startServerFixture } from "./server-fixture.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");

test("initial settings loading uses the same header and page width before session data arrives", { timeout: 120000 }, async t => {
  let hold;
  const fixture = await startServerFixture({ handle: async url => {
    if (url.pathname.endsWith("/rpc/content_catalog")) await hold;
  } });
  t.after(fixture.close);
  // Compile before measuring held responses, independently of any browser cache.
  await (await fetch(fixture.origin + "/settings")).text();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  for (const width of [375, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "en-US", reducedMotion: "reduce", extraHTTPHeaders: { "x-2048-route": "/shop" } });
    let release;
    hold = new Promise(resolve => { release = resolve; });
    try {
      const page = await context.newPage();
      const navigation = page.goto(fixture.origin + "/settings", { waitUntil: "domcontentloaded" });
      const loading = page.locator('[data-route-loading="settings"]:visible');
      await loading.waitFor({ state: "visible" });
      assert.equal(await page.locator('[data-route-loading="shop"]').count(), 0, "caller-supplied layout hints must be overwritten");
      await page.waitForFunction(() => getComputedStyle(document.body).margin === "0px");
      const before = { header: await page.locator("header:visible").boundingBox(), main: await loading.boundingBox() };
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      release(); hold = undefined;
      await navigation;
      await loading.waitFor({ state: "detached" });
      await page.getByRole("heading", { name: "Game preferences", exact: true }).waitFor();
      const after = { header: await page.locator("header:visible").boundingBox(), main: await page.locator("main:visible").boundingBox() };
      for (const region of ["header", "main"]) {
        for (const axis of ["x", "y", "width"]) assert.ok(Math.abs(before[region][axis] - after[region][axis]) <= 1, `${width}px ${region} ${axis}: ${before[region][axis]} → ${after[region][axis]}`);
      }
      assert.equal(before.header.height, after.header.height);
    } finally { release(); hold = undefined; await context.close(); }
  }
});
