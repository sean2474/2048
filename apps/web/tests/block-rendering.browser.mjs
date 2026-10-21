import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const origin = process.env.WEB_TEST_ORIGIN ?? "http://[::1]:3001";
const artifacts = process.env.BLOCK_EVIDENCE_DIR ?? join(tmpdir(), "2048-block-rendering");

test(
  "X marks fit mobile, miniature opponent and desktop tiles after spawning and at rest",
  { timeout: 90000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const measurements = [],
      errors = [];
    await mkdir(artifacts, { recursive: true });
    try {
      const page = await browser.newPage({
        locale: "en-US",
        viewport: { width: 390, height: 844 },
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${origin}/tutorial`);
      const move = (direction) =>
        page.getByRole("button", { name: `Move ${direction}`, exact: true }).click();
      const advance = (name) => page.getByRole("button", { name, exact: true }).click();
      const measure = async (stage, side) => {
        const board = page.locator(`.game-${side} [data-skin]`);
        await board
          .getByRole("img", { name: /^X block/ })
          .first()
          .waitFor();
        await page.waitForFunction(() => !document.querySelector("[data-attack-effect]"));
        for (const [width, height] of [
          [320, 660],
          [375, 812],
          [390, 844],
          [1440, 900],
        ]) {
          await page.setViewportSize({ width, height });
          await board.evaluate(async (element) => {
            await Promise.allSettled(
              element.getAnimations({ subtree: true }).map((animation) => animation.finished),
            );
          });
          const tiles = await board.getByRole("img").evaluateAll((elements) =>
            elements.map((element) => {
              const box = element.getBoundingClientRect();
              const glyph = element.getAttribute("aria-label").startsWith("X block")
                ? element.firstElementChild
                : null;
              const mark = glyph?.getBoundingClientRect();
              const border = parseFloat(getComputedStyle(element).borderWidth);
              return {
                label: element.getAttribute("aria-label"),
                width: box.width,
                height: box.height,
                markWidth: mark?.width,
                markHeight: mark?.height,
                centered:
                  !mark ||
                  (Math.abs(mark.left + mark.width / 2 - box.left - box.width / 2) < 0.5 &&
                    Math.abs(mark.top + mark.height / 2 - box.top - box.height / 2) < 0.5),
                fits:
                  !mark ||
                  (mark.width > 0 &&
                    mark.height > 0 &&
                    mark.left >= box.left + border - 0.5 &&
                    mark.right <= box.right - border + 0.5 &&
                    mark.top >= box.top + border - 0.5 &&
                    mark.bottom <= box.bottom - border + 0.5),
              };
            }),
          );
          measurements.push({
            stage,
            side,
            width,
            boardWidth: (await board.boundingBox()).width,
            tiles,
          });
          await board.screenshot({ path: join(artifacts, `${stage}-${width}.png`) });
        }
      };
      await move("left");
      await advance("Skip ahead to 128 + 128");
      await move("left");
      await measure("opponent-spawned", "opponent");
      await advance("Try a hard block");
      await move("left");
      await advance("Try receiving an attack");
      await move("left");
      await measure("own-spawned", "you");
      await move("down");
      await advance("Try the default ability");
      await measure("own-static", "you");
      await writeFile(join(artifacts, "measurements.json"), JSON.stringify(measurements, null, 2));
      for (const sample of measurements) {
        if (sample.side === "opponent" && sample.width < 700) assert.equal(sample.boardWidth, 88);
        for (const tile of sample.tiles) {
          assert.ok(
            Math.abs(tile.width - sample.tiles[0].width) < 1 &&
              Math.abs(tile.height - sample.tiles[0].height) < 1,
            "X, hard and numeric tiles must keep the same cell bounds",
          );
          assert.ok(tile.fits, `${sample.stage} at ${sample.width}px: ${JSON.stringify(tile)}`);
          assert.ok(tile.centered, "X marks must stay centered inside the cell");
          if (tile.markWidth !== undefined)
            assert.ok(
              tile.markWidth >= tile.width * 0.3 && tile.markHeight >= tile.height * 0.3,
              "X marks must remain visible on the miniature opponent board",
            );
        }
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
