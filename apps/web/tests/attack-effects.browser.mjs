import assert from "node:assert/strict";
import test from "node:test";
import { tmpdir } from "node:os";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { createGameServer } = require("../../socket/src/server.ts");
const { rooms } = require("../../socket/src/state.ts");
const { broadcast } = require("../../socket/src/game.ts");
const origin = "http://[::1]:3001";

test(
  "merges auto-fire X and hard attacks with queued warnings and actual impacts on both boards",
  { timeout: 90000 },
  async () => {
    const server = createGameServer();
    server.io.engine.opts.allowUpgrades = false;
    await new Promise((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
    const socketOrigin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const pages = [],
      errors = [];
    try {
      for (const width of [1440, 375]) {
        const context = await browser.newContext({
          locale: "en-US",
          viewport: { width, height: 900 },
        });
        await context.route("**/socket.io/**", async (route) => {
          const url = new URL(route.request().url());
          const response = await route.fetch({
            url: `${socketOrigin}${url.pathname}${url.search}`,
          });
          await route.fulfill({
            response,
            headers: { ...response.headers(), "access-control-allow-origin": "*" },
          });
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => errors.push(error.message));
        pages.push(page);
        await page.goto(`${origin}/play/online`);
      }
      const [a, b] = pages;
      for (const page of pages) {
        await page.waitForURL(/\/play\/[a-f\d-]{36}$/);
        await page.locator("[data-ability-control]").waitFor();
        assert.equal(
          await page.locator("[data-attack-control], .charge-rail, .opponent-stock").count(),
          0,
        );
        assert.equal(await page.locator("[data-attack-effect]").count(), 0);
        assert.equal(
          await page.locator(".game-player-heading [data-profile-icon=guest]").count(),
          2,
        );
        assert.equal(await page.locator(".match-toolbar [data-emblem=duel]").count(), 1);
      }
      const room = [...rooms.values()][0],
        [first, second] = room.players;
      const me = room.state[first],
        opp = room.state[second];
      let tileId = 9_000_000;
      const mergeBoard = (values) =>
        values.flatMap((value, row) => [0, 1].map((col) => ({ id: tileId++, row, col, value })));
      const prepare = async (values) => {
        me.board = mergeBoard(values);
        broadcast(room, server.io);
        await a
          .locator(".game-you")
          .getByRole("img", { name: `${values[0]} tile, row 1, column 1`, exact: true })
          .waitFor();
      };
      opp.board = [
        { id: tileId++, row: 0, col: 1, value: 4 },
        { id: tileId++, row: 1, col: 1, value: 8 },
      ];
      opp.ability.charge = 1024;
      me.ability.charge = 600;
      broadcast(room, server.io);
      await a.locator("[data-opponent-ability]").filter({ hasText: "Ability ready" }).waitFor();
      assert.ok((await a.locator("[data-opponent-ability] img").boundingBox()).width >= 32);
      const evidence = join(tmpdir(), "2048-controls-ui-evidence");
      await mkdir(evidence, { recursive: true });
      for (const [width, height] of [
        [320, 660],
        [375, 812],
        [768, 1024],
        [1024, 650],
        [1440, 900],
      ]) {
        await a.setViewportSize({ width, height });
        await a.locator(".game-stage").evaluate(async (stage) => {
          await Promise.allSettled(
            stage.getAnimations({ subtree: true }).map((animation) => animation.finished),
          );
          window.scrollTo(0, 0);
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
        });
        await a.screenshot({
          path: join(evidence, `match-${width}x${height}.png`),
          fullPage: true,
        });
        const layout = await a.evaluate(() => {
          const ability = document.querySelector("[data-ability-control]");
          return {
            width: document.documentElement.scrollWidth,
            abilityTop: ability.getBoundingClientRect().top,
            boardBottom: document.querySelector('.game-you [role="group"]').getBoundingClientRect()
              .bottom,
            opponentBottom: document.querySelector(".game-opponent").getBoundingClientRect().bottom,
            controlsTop: document.querySelector(".match-controls").getBoundingClientRect().top,
            controlsVisible:
              getComputedStyle(document.querySelector(".match-controls")).display !== "none",
            opponentAbilityFits:
              document.querySelector("[data-opponent-ability]").scrollWidth <=
              document.querySelector("[data-opponent-ability]").clientWidth + 1,
            keyLeft: ability.querySelector("kbd").getBoundingClientRect().left,
            textRight: ability.children[1].getBoundingClientRect().right,
            directions: [...document.querySelectorAll(".direction-pad button")].map((button) => ({
              width: button.getBoundingClientRect().width,
              height: button.getBoundingClientRect().height,
            })),
          };
        });
        assert.equal(layout.width, width, `horizontal overflow at ${width}`);
        assert.ok(layout.abilityTop >= layout.boardBottom, "the ability belongs below your board");
        assert.ok(
          !layout.controlsVisible || layout.opponentBottom <= layout.controlsTop,
          `boards overlap controls at ${width}x${height}: ${JSON.stringify(layout)}`,
        );
        assert.ok(layout.textRight <= layout.keyLeft, "ability text and key must not overlap");
        assert.ok(
          layout.opponentAbilityFits,
          "opponent ability and readiness must fit their panel",
        );
        assert.equal(layout.controlsVisible, width < 700, "only mobile keeps the direction pad");
        assert.ok(
          layout.directions.every((button) =>
            width < 700
              ? button.width >= 44 && button.height >= 44
              : button.width === 0 && button.height === 0,
          ),
        );
      }

      room.ready.delete(second);
      broadcast(room, server.io);
      await a.getByRole("heading", { name: "Waiting for opponent…", exact: true }).waitFor();
      me.telemetry.sent.xblock++;
      const pausedId = tileId++;
      opp.board.push({
        id: pausedId,
        row: 3,
        col: 3,
        value: -1,
        blockType: "xblock",
        spawned: true,
      });
      broadcast(room, server.io);
      await b
        .locator(".game-you")
        .getByRole("img", { name: /X block/ })
        .waitFor();
      room.ready.add(second);
      broadcast(room, server.io);
      await a.getByRole("heading", { name: "Match in progress", exact: true }).waitFor();
      for (const page of pages)
        assert.equal(
          await page.locator("[data-attack-effect]").count(),
          0,
          "resumed snapshots do not replay sends or hits",
        );
      opp.board = opp.board.filter((tile) => tile.id !== pausedId);
      opp.pending = Array.from({ length: 6 }, () => ({ type: "addBlock", blockType: "xblock" }));
      await prepare([128]);
      const sent = me.telemetry.sent.xblock;
      await a.keyboard.press("ArrowLeft");
      await a.waitForFunction(
        () => document.querySelector('[data-testid="your-score"]')?.textContent === "256",
      );
      assert.equal(me.telemetry.sent.xblock, sent);
      assert.equal(
        await a.locator("[data-attack-effect]").count(),
        0,
        "a full incoming queue cannot show a successful send",
      );
      opp.pending = [];
      broadcast(room, server.io);

      for (const [type, value] of [
        ["xblock", 128],
        ["hardblock", 256],
      ]) {
        if (type === "hardblock") await b.emulateMedia({ reducedMotion: "reduce" });
        await prepare([value]);
        const before = opp.board.filter((tile) => tile.blockType === type).length;
        await a.keyboard.press("ArrowLeft");
        for (const [page, ownPhase, otherPhase] of [
          [a, "sent", "incoming"],
          [b, "incoming", "sent"],
        ]) {
          await page
            .locator(`.game-you [data-attack-effect=${type}][data-attack-phase=${ownPhase}]`)
            .waitFor();
          await page
            .locator(`.game-opponent [data-attack-effect=${type}][data-attack-phase=${otherPhase}]`)
            .waitFor();
        }
        assert.equal(
          opp.board.filter((tile) => tile.blockType === type).length,
          before,
          "the warning precedes block placement",
        );
        assert.match(await a.locator('.game-you [role="status"]').innerText(), /You sent/);
        assert.match(await b.locator('.game-you [role="status"]').innerText(), /next move/);
        assert.equal(
          await b
            .locator(".match-controls")
            .getByText(/Incoming:/)
            .count(),
          0,
        );
        for (const page of pages) {
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth),
            page.viewportSize().width,
          );
          await page.screenshot({
            path: `${tmpdir()}/2048-attack-${type}-queued-${page.viewportSize().width}.png`,
            fullPage: true,
          });
        }
        await b.keyboard.press("ArrowDown");
        const impact = b.locator(
          `.game-you [data-attack-effect=${type}][data-attack-phase=landed]`,
        );
        await impact.waitFor();
        await a
          .locator(`.game-opponent [data-attack-effect=${type}][data-attack-phase=landed]`)
          .waitFor();
        assert.equal(opp.board.filter((tile) => tile.blockType === type).length, before + 1);
        assert.match(
          await b.locator('.game-you [role="status"]').innerText(),
          /landed on your board/,
        );
        assert.equal(await impact.evaluate((el) => getComputedStyle(el).pointerEvents), "none");
        if (type === "hardblock")
          assert.equal(await impact.evaluate((el) => getComputedStyle(el).animationName), "none");
        await b.screenshot({
          path: `${tmpdir()}/2048-attack-${type}-landed-375.png`,
          fullPage: true,
        });
        await b.keyboard.press("ArrowUp");
        for (const page of pages)
          await page.waitForFunction(() => !document.querySelector("[data-attack-effect]"));
      }
      await prepare([128, 256]);
      await a.keyboard.press("ArrowLeft");
      await b.waitForFunction(
        () => document.querySelectorAll('.game-you [data-attack-phase="incoming"]').length === 2,
      );
      await b.keyboard.press("ArrowDown");
      await b.waitForFunction(
        () => document.querySelectorAll('.game-you [data-attack-phase="landed"]').length === 2,
      );
      assert.match(
        await b.locator('.game-you [role="status"]').innerText(),
        /X attack.*Hard attack/,
      );
      assert.deepEqual(errors, []);
    } finally {
      for (const context of browser.contexts())
        await context.unrouteAll({ behavior: "ignoreErrors" });
      await browser.close();
      await server.close();
    }
  },
);
