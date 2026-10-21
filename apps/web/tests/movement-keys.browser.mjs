import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { createGameServer } = require("../../socket/src/server.ts");
const origin = "http://[::1]:3001";

test(
  "held movement has the same cadence for arrows and letters and stops with input locks",
  { timeout: 60000 },
  async () => {
    const server = createGameServer();
    server.io.engine.opts.allowUpgrades = false;
    await new Promise((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
    const socketOrigin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const moves = [];
    let socket;
    const player = {
      board: [{ id: 1, row: 0, col: 0, value: 2 }],
      score: 0,
      maxTile: 2,
      skinId: "classic",
      attacksSent: { xblock: 0, hardblock: 0 },
      ability: {
        id: "clear-x",
        charge: 0,
        spawnPauseMoves: 0,
        anchorMoves: 0,
        slowStartsAt: 0,
        slowEndsAt: 0,
        nextMoveAt: 0,
      },
    };
    const state = {
      t: "state",
      serverTime: Date.now(),
      mode: "casual",
      you: player,
      opp: player,
      names: { you: "Guest", opp: "Opponent" },
      paused: false,
      pendingAttacks: 0,
      incomingAttacks: { xblock: 0, hardblock: 0 },
    };
    const send = () => socket.emit("message", state);
    server.io.on("connection", (connected) => {
      socket = connected;
      socket.removeAllListeners("message");
      socket.on("message", (message) => {
        if (message.t === "input") {
          moves.push(message.dir);
          player.score = moves.length;
        }
        if (message.t === "joinRoom" || message.t === "input") send();
      });
    });
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ locale: "en-US" });
    try {
      await context.route("**/socket.io/**", async (route) => {
        const url = new URL(route.request().url());
        const response = await route.fetch({ url: `${socketOrigin}${url.pathname}${url.search}` });
        await route.fulfill({
          response,
          headers: { ...response.headers(), "access-control-allow-origin": "*" },
        });
      });
      const page = await context.newPage();
      await page.goto(`${origin}/play/20000000-0000-4000-8000-000000000001`);
      await page.getByTestId("your-score").waitFor();
      for (const code of ["KeyW", "ArrowUp"]) {
        const beforeTap = moves.length;
        await page.keyboard.down(code);
        await page.evaluate((code) => {
          for (let i = 0; i < 5; i++)
            document.body.dispatchEvent(
              new KeyboardEvent("keydown", { code, repeat: true, bubbles: true, cancelable: true }),
            );
        }, code);
        await page.waitForTimeout(100);
        await page.keyboard.up(code);
        await page.waitForTimeout(100);
        assert.equal(moves.length - beforeTap, 1, `${code}: a normal tap must only move once`);
        const before = moves.length;
        await page.keyboard.down(code);
        await page.waitForTimeout(350);
        await page.keyboard.up(code);
        await page.waitForTimeout(100);
        assert.ok(moves.length - before >= 3, `${code} must repeat without OS keydown repeats`);
        assert.ok(moves.slice(before).every((dir) => dir === "up"));
        const afterRelease = moves.length;
        await page.waitForTimeout(150);
        assert.equal(moves.length, afterRelease, "keyup must stop movement");
      }
      const beforeQuick = moves.length;
      await page.keyboard.press("KeyA");
      await page.keyboard.press("KeyD");
      await page.waitForTimeout(100);
      assert.deepEqual(
        moves.slice(beforeQuick),
        ["left", "right"],
        "quick distinct taps must not be discarded by a shared throttle",
      );

      for (const event of ["blur", "visibilitychange"]) {
        await page.keyboard.down("KeyW");
        await page.evaluate(
          (event) => (event === "blur" ? window : document).dispatchEvent(new Event(event)),
          event,
        );
        await page.keyboard.up("KeyW");
        await page.waitForTimeout(100);
        const stopped = moves.length;
        await page.waitForTimeout(150);
        assert.equal(moves.length, stopped, `${event} must stop movement`);
      }
      await page.keyboard.down("KeyW");
      state.paused = true;
      send();
      await page.getByText("Waiting for opponent…", { exact: true }).waitFor();
      const paused = moves.length;
      await page.waitForTimeout(150);
      assert.equal(moves.length, paused);
      state.paused = false;
      send();
      await page.getByText("Match in progress", { exact: true }).waitFor();
      await page.waitForTimeout(150);
      assert.equal(moves.length, paused, "resume requires a fresh key press");
      await page.keyboard.up("KeyW");
      await page.keyboard.down("KeyW");
      await page.getByRole("button", { name: "Keybindings", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Keybindings", exact: true });
      await dialog.waitFor();
      const modal = moves.length;
      await page.waitForTimeout(150);
      assert.equal(moves.length, modal);
      await page.keyboard.up("KeyW");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await page.evaluate(() => {
        const input = document.createElement("input");
        input.id = "movement-input-fixture";
        document.body.append(input);
        input.focus();
      });
      const focused = moves.length;
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(150);
      await page.keyboard.up("KeyW");
      assert.equal(moves.length, focused);
      await page.evaluate(() => document.querySelector("#movement-input-fixture").remove());
      const guarded = moves.length;
      await page.evaluate(() => {
        for (const options of [
          { isComposing: true },
          { shiftKey: true },
          { ctrlKey: true },
          { altKey: true },
          { metaKey: true },
        ]) {
          document.body.dispatchEvent(
            new KeyboardEvent("keydown", {
              code: "KeyW",
              bubbles: true,
              cancelable: true,
              ...options,
            }),
          );
        }
      });
      await page.waitForTimeout(250);
      assert.equal(moves.length, guarded, "IME and modified keys must not begin movement");
      Object.assign(player.ability, {
        slowStartsAt: Date.now() - 100,
        slowEndsAt: Date.now() + 10000,
        nextMoveAt: Date.now() + 5000,
      });
      state.serverTime = Date.now();
      send();
      await page.waitForFunction(
        () => document.querySelector('button[aria-label="Move up"]')?.disabled,
      );
      const slowed = moves.length;
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(350);
      await page.keyboard.up("KeyW");
      assert.equal(moves.length, slowed, "the ability movement delay remains enforced");
      Object.assign(player.ability, { slowStartsAt: 0, slowEndsAt: 0, nextMoveAt: 0 });
      send();
      await page.waitForFunction(
        () => !document.querySelector('button[aria-label="Move up"]')?.disabled,
      );
      await page.getByRole("button", { name: "Keybindings", exact: true }).click();
      await page.getByRole("checkbox", { name: "Enable custom shortcuts", exact: true }).uncheck();
      await dialog.getByRole("button", { name: "Save keys", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      const disabled = moves.length;
      await page.keyboard.press("KeyW");
      await page.keyboard.press("ArrowUp");
      await page.waitForTimeout(100);
      assert.deepEqual(moves.slice(disabled), ["up"]);
      await page.getByRole("button", { name: "Keybindings", exact: true }).click();
      await page.getByRole("checkbox", { name: "Enable custom shortcuts", exact: true }).check();
      await dialog.getByRole("button", { name: "Move up W", exact: true }).click();
      await page.keyboard.press("KeyI");
      await dialog.getByRole("button", { name: "Save keys", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      const rebound = moves.length;
      await page.keyboard.press("KeyW");
      await page.waitForTimeout(100);
      assert.equal(moves.length, rebound, "the old movement binding must no longer act");
      await page.keyboard.down("KeyI");
      await page.waitForTimeout(350);
      await page.keyboard.up("KeyI");
      await page.waitForTimeout(100);
      assert.ok(moves.length - rebound >= 3, "remapped movement also uses the shared repeat timer");
      await page.keyboard.down("KeyI");
      socket.disconnect(true);
      await page.getByText("Reconnecting…", { exact: true }).waitFor();
      const disconnected = moves.length;
      await page.waitForTimeout(250);
      await page.keyboard.up("KeyI");
      assert.equal(moves.length, disconnected, "disconnect must stop held input");
    } finally {
      await context.unrouteAll({ behavior: "ignoreErrors" });
      await browser.close();
      await server.close();
    }
  },
);
