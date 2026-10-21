import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { startServerFixture } from "./server-fixture.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");

test("collection body keeps its wallet and controls while the private wallet query is held", { timeout: 120000 }, async t => {
  let hold;
  const fixture = await startServerFixture({ handle: async url => {
    if (url.pathname.endsWith("/rpc/cosmetic_state")) {
      await hold;
      return { data: { balance: 12, purchases: [] } };
    }
  } });
  t.after(fixture.close);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  for (const width of [375, 1440]) {
    for (const mode of ["shop", "loadout"]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "en-US", reducedMotion: "reduce" });
      await context.addCookies([fixture.cookie()]);
      const page = await context.newPage();
      await page.goto(fixture.origin + "/settings");
      let release;
      hold = new Promise(resolve => { release = resolve; });
      try {
        const navigation = page.goto(fixture.origin + "/" + mode, { waitUntil: "domcontentloaded" });
        const loading = page.locator(`[data-collection-loading="${mode}"]:visible`);
        await loading.waitFor();
        await page.waitForFunction(() => getComputedStyle(document.body).margin === "0px");
        const before = await loading.locator("[data-loading-wallet]").boundingBox();
        assert.equal(await loading.locator("[data-loading-history]").count(), mode === "shop" ? 1 : 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        release(); hold = undefined;
        await navigation;
        await loading.waitFor({ state: "detached" });
        const after = await page.locator(`section[aria-labelledby="${mode}-wallet-title"]:visible`).boundingBox();
        for (const axis of ["x", "y", "width", "height"]) assert.ok(Math.abs(before[axis] - after[axis]) <= 1, `${mode} ${width}px wallet ${axis}: ${before[axis]} → ${after[axis]}`);
      } finally { release(); hold = undefined; await context.close(); }
    }
  }
});
