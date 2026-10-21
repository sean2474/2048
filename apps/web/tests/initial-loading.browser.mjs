import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { startServerFixture } from "./server-fixture.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");

test(
  "initial route loading preserves geometry and static solo instructions before session data arrives",
  { timeout: 240000 },
  async (t) => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    t.after(() => browser.close());
    for (const route of [
      { path: "settings", heading: "Game preferences" },
      { path: "solo", heading: "Single player" },
    ]) {
      for (const width of [375, 1440]) {
        let release;
        const hold = new Promise((resolve) => {
          release = resolve;
        });
        // Each case starts with an empty public cache, as on a deployment's first request.
        const fixture = await startServerFixture({
          handle: async (url) => {
            if (url.pathname.endsWith("/rpc/content_catalog")) await hold;
          },
        });
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          locale: "en-US",
          reducedMotion: "reduce",
          extraHTTPHeaders: { "x-2048-route": "/shop", "x-2048-loading-member": "1" },
        });
        try {
          const page = await context.newPage();
          const navigation = page.goto(fixture.origin + "/" + route.path, {
            waitUntil: "domcontentloaded",
          });
          const loading = page.locator(`[data-route-loading="${route.path}"]:visible`);
          await loading.waitFor({ state: "visible" });
          if (route.path === "settings") {
            assert.equal(await loading.locator('[data-loading-panel="guest-account"]').count(), 1);
            assert.equal(
              await loading.locator('[data-loading-panel="profile"]').count(),
              0,
              "caller cannot forge a member loading hint",
            );
          }
          if (route.path === "solo") {
            await loading
              .getByText("Swipe your board or use the arrow keys to move.", { exact: true })
              .waitFor();
          }
          assert.equal(
            await page.locator('[data-route-loading="shop"]').count(),
            0,
            "caller-supplied layout hints must be overwritten",
          );
          await page.waitForFunction(() => getComputedStyle(document.body).margin === "0px");
          const before = {
            header: await page.locator("header:visible").boundingBox(),
            main: await loading.boundingBox(),
          };
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            true,
          );
          release();
          await navigation;
          await loading.waitFor({ state: "detached" });
          await page.getByRole("heading", { name: route.heading, exact: true }).waitFor();
          const after = {
            header: await page.locator("header:visible").boundingBox(),
            main: await page.locator("main:visible").boundingBox(),
          };
          for (const region of ["header", "main"]) {
            for (const axis of ["x", "y", "width"])
              assert.ok(
                Math.abs(before[region][axis] - after[region][axis]) <= 1,
                `${width}px ${region} ${axis}: ${before[region][axis]} → ${after[region][axis]}`,
              );
          }
          assert.equal(before.header.height, after.header.height);
        } finally {
          release();
          await context.close();
          await fixture.close();
        }
      }
    }
  },
);
