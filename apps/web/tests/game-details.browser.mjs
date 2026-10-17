import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");
const artifacts = fileURLToPath(new URL("../../../docs/skin-preview-icons", import.meta.url));
const origin = "http://[::1]:3001";

test("arena details preserve the palette and fit every user page at three sizes", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  fs.mkdirSync(artifacts, { recursive: true });
  try {
    const context = await browser.newContext({ locale: "ko-KR", reducedMotion: "reduce" });
    const page = await context.newPage(), errors = [], measurements = [];
    page.on("pageerror", error => errors.push(error.message));
    // Lobby screenshots must not enter the public matchmaking queue.
    await page.route("**/socket.io/**", route => route.abort());
    for (const [width, height] of [[1440, 900], [768, 1024], [375, 812]]) {
      await page.setViewportSize({ width, height });
      for (const route of ["/", "/find-match", "/loadout", "/history", "/settings", "/how-to-play", "/feedback", "/login", "/signup", "/auth/error", "/play/join", "/play/create", "/play/online", "/play/ranked", "/tutorial"]) {
        await page.goto(`${origin}${route}`);
        await page.getByRole("main").getByRole("heading", { level: 1 }).waitFor();
        if (route === "/") assert.equal(await page.getByRole("link", { name: "튜토리얼 하기", exact: true }).getAttribute("href"), "/tutorial");
        const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, background: getComputedStyle(document.body).backgroundColor, primary: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(), emblems: document.querySelectorAll("main [data-emblem]").length }));
        assert.equal(size.width, width, `${route} overflows ${width}`);
        assert.equal(size.background, "rgb(246, 243, 235)");
        assert.equal(size.primary, "#a4432d");
        assert.ok(size.emblems > 0, `${route} needs its original artwork`);
        assert.equal(await page.locator("[data-emblem]").evaluateAll(icons => icons.every(icon => icon.getAttribute("aria-hidden") === "true" && icon.getAttribute("viewBox") === "0 0 24 24" && icon.getAttribute("stroke") === "currentColor" && !icon.querySelector("defs, [fill]:not([fill=none])"))), true);
        await page.screenshot({ path: path.join(artifacts, `page-${route.replaceAll("/", "-") || "home"}-${width}x${height}.png`), fullPage: true, animations: "disabled" });
        measurements.push({ route, viewport: `${width}x${height}`, ...size });
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(artifacts, "pages.json"), JSON.stringify({ measurements, errors }, null, 2));
  } finally { await browser.close(); }
});
