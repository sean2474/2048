import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { startServerFixture } from "./server-fixture.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");

test(
  "route loading preserves mobile and desktop page geometry while backend reads are held",
  { timeout: 180000 },
  async (t) => {
    let hold = null;
    const app = await startServerFixture({
      handle: async (url) => {
        if (url.pathname.endsWith("/player_preferences") && hold) {
          hold.requested();
          await hold.pending;
        }
      },
    });
    t.after(async () => {
      hold?.release();
      await app.close();
    });
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    t.after(() => browser.close());
    const evidence = new URL("../.next/route-loading/", import.meta.url);
    await mkdir(evidence, { recursive: true });

    for (const width of [375, 1440]) {
      for (const route of [
        {
          path: "settings",
          link: "Settings",
          heading: "Settings",
          panel: "audio",
          resolved: "section[aria-labelledby='audio-title']",
        },
        {
          path: "find-match",
          link: "Find match",
          heading: "Find match",
          panel: "menu",
          resolved: "section[aria-labelledby='game-menu-title']",
        },
        {
          path: "feedback",
          link: "Feedback",
          heading: "Bugs & feedback",
          panel: "form",
          resolved: "form",
        },
      ]) {
        await t.test(`${route.path} at ${width}px`, async () => {
          // Fresh contexts avoid warmed route caches and use a verified fixture account.
          const context = await browser.newContext({
            locale: "en-US",
            viewport: { width, height: 900 },
          });
          try {
            await context.addCookies([
              app.cookie(),
              { name: "duo.locale", value: "en", url: app.origin },
            ]);
            const page = await context.newPage();
            page.setDefaultTimeout(20000);
            const errors = [];
            page.on("pageerror", (error) => errors.push(error.message));
            await page.goto(app.origin + "/");
            await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
            // A visible server heading can precede hydration; exercise a client control
            // so the desktop link performs an RSC navigation rather than a document load.
            await page.getByRole("button", { name: "Pause duel animation", exact: true }).click();
            await page.getByRole("button", { name: "Play duel animation", exact: true }).waitFor();

            let release, requested;
            const pending = new Promise((resolve) => {
              release = resolve;
            });
            const backendRequested = new Promise((resolve) => {
              requested = resolve;
            });
            hold = { pending, release, requested };
            if (width < 1024)
              await page.getByRole("button", { name: "Main navigation", exact: true }).click();
            await page
              .getByRole("navigation", { name: "Main navigation", exact: true })
              .filter({ visible: true })
              .getByRole("link", { name: route.link, exact: true })
              .click();
            await backendRequested;
            const loading = page.locator(`[data-route-loading="${route.path}"]`);
            await loading.waitFor({ state: "visible" });
            await loading.evaluate((element) =>
              Promise.all(element.getAnimations().map((animation) => animation.finished)),
            );
            const before = {
              main: await loading.boundingBox(),
              panel: await loading.locator(`[data-loading-panel="${route.panel}"]`).boundingBox(),
            };
            assert.ok(
              before.main && before.panel,
              "route-specific content streams before the backend responds",
            );
            if (route.path === "settings") {
              for (const name of ["preferences", "profile", "delete-account"]) {
                before[name] = await loading
                  .locator(`[data-loading-panel="${name}"]`)
                  .boundingBox();
                assert.ok(before[name], `signed-in loading reserves ${name}`);
              }
            }
            assert.equal(await loading.getAttribute("aria-busy"), "true");
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
              true,
            );
            const shimmer = loading.locator("[data-skeleton]").first();
            assert.equal(
              await shimmer.evaluate((element) => getComputedStyle(element).animationName),
              "skeleton-shimmer",
            );
            await page.emulateMedia({ reducedMotion: "reduce" });
            assert.equal(
              await shimmer.evaluate((element) => getComputedStyle(element).animationName),
              "none",
            );
            await page.screenshot({
              path: new URL(`${route.path}-${width}-loading.png`, evidence).pathname,
              fullPage: true,
            });

            release();
            hold = null;
            await loading.waitFor({ state: "detached" });
            await page.getByRole("heading", { name: route.heading, exact: true }).waitFor();
            await page
              .locator("main")
              .evaluate((element) =>
                Promise.all(element.getAnimations().map((animation) => animation.finished)),
              );
            const after = {
              main: await page.locator("main").boundingBox(),
              panel: await page.locator("main").locator(route.resolved).boundingBox(),
            };
            await page.screenshot({
              path: new URL(`${route.path}-${width}-ready.png`, evidence).pathname,
              fullPage: true,
            });
            if (route.path === "settings") {
              for (const name of ["preferences", "profile", "delete-account"]) {
                after[name] = await page
                  .locator(`section[aria-labelledby="${name}-title"]`)
                  .boundingBox();
              }
            }
            for (const region of Object.keys(before)) {
              for (const axis of ["x", "y", "width"])
                assert.ok(
                  Math.abs(before[region][axis] - after[region][axis]) <= 1,
                  `${route.path} ${region} ${axis}: ${before[region][axis]} → ${after[region][axis]}`,
                );
            }
            assert.ok(
              Math.abs(before.panel.height - after.panel.height) <= 16,
              `${route.path} first panel height: ${before.panel.height} → ${after.panel.height}`,
            );
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
              true,
            );
            if (route.path === "find-match")
              assert.equal(
                await page.locator("section[aria-label='Duel preview']").isVisible(),
                width >= 768,
                "preview stays hidden on mobile",
              );
            assert.deepEqual(errors, []);
          } finally {
            hold?.release();
            hold = null;
            await context.close();
          }
        });
      }
    }
  },
);
