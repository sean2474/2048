import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const artifacts = path.join(root, "docs/achievement-rewards");

test("achievement portraits crop cleanly and board reward numbers fit even at opponent size", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  mkdirSync(artifacts, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
    await page.goto("http://[::1]:3001/login");
    const fixture = execFileSync("pnpm", ["--filter", "socket", "exec", "tsx", "--tsconfig", "../web/tsconfig.json", "../web/tests/skin-tiles.fixture.tsx"], { cwd: root, encoding: "utf8" });
    await page.locator("main").evaluate((el, html) => {
      el.innerHTML = html;
      el.querySelectorAll("[data-skin]").forEach(skin => {
        if (!["dawn-oath", "rune-sanctum"].includes(skin.dataset.skin)) skin.remove();
      });
    }, fixture);
    const measurements = [];
    for (const width of [500, 343, 210]) {
      await page.locator("main").evaluate((el, size) => el.style.setProperty("--fixture-width", `${size}px`), width);
      const result = await page.locator('[data-skin] [role="img"]').evaluateAll(elements => elements.map(el => {
        const number = el.querySelector("span > span");
        const face = el.firstElementChild?.getBoundingClientRect();
        const range = document.createRange();
        if (number) range.selectNodeContents(number);
        const text = number ? range.getBoundingClientRect() : null;
        return { skin: el.closest("[data-skin]").dataset.skin, value: number?.textContent, label: el.getAttribute("aria-label"), fits: !text || text.left >= face.left - 1 && text.right <= face.right + 1 && text.bottom <= face.bottom + 1, decorations: el.querySelectorAll("svg").length };
      }));
      assert.equal(result.length, 34);
      for (const tile of result) {
        assert.equal(tile.fits, true, `${tile.skin} ${tile.label} at ${width}px`);
        assert.equal(tile.decorations, tile.value ? 1 : 0, `${tile.skin} ${tile.label}`);
      }
      for (const skin of ["dawn-oath", "rune-sanctum"]) await page.locator(`[data-skin="${skin}"]`).screenshot({ path: path.join(artifacts, `${skin}-${width}.png`) });
      measurements.push({ width, tiles: result });
    }
    await page.locator("main").evaluate(el => {
      el.innerHTML = "";
      for (const id of ["attendance-king", "victory-vanguard"]) {
        const row = document.createElement("section");
        row.dataset.portrait = id;
        row.style.cssText = "display:flex;align-items:center;gap:24px;padding:24px;background:#fff;margin:16px";
        for (const size of [24, 40, 80]) {
          const image = document.createElement("img");
          image.src = `/profile-icons/${id}.svg`;
          image.width = image.height = size;
          image.style.borderRadius = "50%";
          image.alt = `${id} ${size}px`;
          row.append(image);
        }
        el.append(row);
      }
    });
    assert.equal(await page.locator("main img").evaluateAll(async images => {
      await Promise.all(images.map(image => image.decode()));
      return images.every(image => image.naturalWidth > 0 && image.width === image.height && getComputedStyle(image).borderRadius === "50%");
    }), true);
    await page.locator("main").screenshot({ path: path.join(artifacts, "portraits-24-40-80.png") });
    writeFileSync(path.join(artifacts, "asset-measurements.json"), JSON.stringify(measurements, null, 2));
  } finally { await browser.close(); }
});
