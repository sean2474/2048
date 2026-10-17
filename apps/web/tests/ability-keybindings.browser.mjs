import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mockAccount } from "./browser-fixtures.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { createGameServer } = require("../../socket/src/server.ts");
const origin = "http://[::1]:3001";

test("ability shortcuts use 1 or the saved replacement and respect game input locks", { timeout: 90000 }, async () => {
  const server = createGameServer();
  server.io.engine.opts.allowUpgrades = false;
  await new Promise(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
  const socketOrigin = `http://127.0.0.1:${server.httpServer.address().port}`;
  let socket, uses = 0, manualAttacks = 0;
  const ability = { id: "clear-x", charge: 1024, spawnPauseMoves: 0, anchorMoves: 0, slowStartsAt: 0, slowEndsAt: 0, nextMoveAt: 0 };
  const player = { board: [{ id: 1, row: 0, col: 0, value: 2 }], score: 0, maxTile: 2, skinId: "classic", attacksSent: { xblock: 0, hardblock: 0 }, ability };
  const state = { t: "state", serverTime: Date.now(), mode: "casual", you: player, opp: player, names: { you: "Guest", opp: "Opponent" }, paused: false, pendingAttacks: 0, incomingAttacks: { xblock: 0, hardblock: 0 } };
  const send = () => socket.emit("message", state);
  server.io.on("connection", connected => {
    socket = connected;
    socket.removeAllListeners("message");
    socket.on("message", message => {
      if (message.t === "attack") manualAttacks++;
      if (message.t === "ability") { uses++; player.score = uses; }
      if (message.t === "joinRoom" || message.t === "ability") send();
    });
  });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ locale: "en-US" });
  try {
    await context.route("**/socket.io/**", async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: `${socketOrigin}${url.pathname}${url.search}` });
      await route.fulfill({ response, headers: { ...response.headers(), "access-control-allow-origin": "*" } });
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}/play/20000000-0000-4000-8000-000000000001`);
    const activate = page.locator("[data-ability-control]");
    await activate.waitFor();
    assert.equal(await activate.getAttribute("aria-keyshortcuts"), "1");
    await page.keyboard.press("Digit1");
    await page.waitForFunction(() => document.querySelector('[data-testid="your-score"]')?.textContent === "1");
    assert.equal(uses, 1);
    await page.keyboard.press("Digit2");
    await page.keyboard.press("Digit3");
    await page.evaluate(() => {
      for (const options of [{ repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }]) {
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "1", code: "Digit1", bubbles: true, cancelable: true, ...options }));
      }
      for (const tag of ["input", "textarea", "select", "menu", "dialog", "alertdialog"]) {
        const element = document.createElement(["input", "textarea", "select"].includes(tag) ? tag : "div");
        if (element.tagName === "DIV") element.setAttribute("role", tag);
        document.body.append(element);
        element.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", bubbles: true }));
        element.remove();
      }
      const prevented = new KeyboardEvent("keydown", { code: "Digit1", bubbles: true, cancelable: true });
      prevented.preventDefault(); document.body.dispatchEvent(prevented);
    });
    await page.getByRole("button", { name: "Keybindings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Keybindings", exact: true });
    assert.equal(await dialog.locator("button[aria-pressed]").count(), 5);
    await dialog.getByRole("button", { name: "Use special ability 1", exact: true }).click();
    await page.keyboard.press("KeyW");
    await dialog.getByRole("alert").filter({ hasText: "already used" }).waitFor();
    await page.keyboard.press("KeyF");
    await dialog.getByRole("button", { name: "Save keys", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await activate.getAttribute("aria-keyshortcuts"), "F");
    await page.keyboard.press("Digit1");
    await page.keyboard.press("KeyF");
    await page.waitForFunction(() => document.querySelector('[data-testid="your-score"]')?.textContent === "2");
    assert.equal(uses, 2, "ignored keys and the replaced default must not send abilities");
    await page.reload();
    await activate.waitFor();
    assert.equal(await activate.getAttribute("aria-keyshortcuts"), "F");

    for (const patch of [{ charge: 0 }, { charge: 1024, spawnPauseMoves: 2 }, { spawnPauseMoves: 0, anchorMoves: 2 }]) {
      Object.assign(ability, patch); send();
      await page.waitForFunction(() => document.querySelector("[data-ability-control]").disabled);
      await page.keyboard.press("KeyF");
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(uses, 2);
    }
    Object.assign(ability, { anchorMoves: 0, charge: 1024 }); state.paused = true; send();
    await page.getByText("Waiting for opponent…", { exact: true }).waitFor();
    await page.keyboard.press("KeyF");
    state.paused = false; send();
    await page.waitForFunction(() => !document.querySelector("[data-ability-control]").disabled);
    const shortcuts = page.getByRole("checkbox", { name: "Enable custom shortcuts", exact: true });
    await page.getByRole("button", { name: "Keybindings", exact: true }).click();
    await shortcuts.uncheck();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await activate.getAttribute("aria-keyshortcuts"), "F", "cancel must not change shortcuts");
    await page.getByRole("button", { name: "Keybindings", exact: true }).click();
    await shortcuts.uncheck();
    await page.getByRole("dialog").getByRole("button", { name: "Save keys", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await activate.getAttribute("aria-keyshortcuts"), null);
    assert.equal(await activate.locator("kbd").count(), 0);
    await page.keyboard.press("KeyF");
    await activate.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="your-score"]')?.textContent === "3");
    assert.equal(uses, 3, "on-screen abilities remain available with character shortcuts off");
    await page.getByRole("button", { name: "Keybindings", exact: true }).click();
    await shortcuts.check();
    await page.getByRole("dialog").getByRole("button", { name: "Save keys", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Surrender", exact: true }).click();
    await page.keyboard.press("KeyF");
    await page.getByRole("alertdialog").getByRole("button", { name: "Keep playing", exact: true }).click();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    await page.keyboard.press("KeyF");
    await page.waitForFunction(() => document.querySelector('[data-testid="your-score"]')?.textContent === "4");
    assert.equal(uses, 4);
    assert.equal(manualAttacks, 0, "number keys must not send manual attacks");
    assert.deepEqual(errors, []);
  } finally {
    await context.unrouteAll({ behavior: "ignoreErrors" });
    await browser.close(); await server.close();
  }
});

test("mobile key settings preserve legacy account keys, recover save failures and reset ability to 1", { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 320, height: 660 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    const account = await mockAccount(page);
    account.row.locale = "en";
    account.row.keybindings.up = "Digit1";
    account.row.keybindings.xblock = "Digit3";
    await page.goto(`${origin}/settings`);
    await page.getByRole("button", { name: "Keybindings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Keybindings", exact: true });
    await dialog.getByRole("button", { name: "Use special ability 2", exact: true }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Move up 1", exact: true }).count(), 1);
    assert.equal(Object.hasOwn(account.row.keybindings, "ability"), false, "reading an old row must not overwrite it");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
    const box = await dialog.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 660, "the five-key modal must fit the viewport and scroll");
    await dialog.getByRole("button", { name: "Use special ability 2", exact: true }).tap();
    await page.keyboard.press("KeyF");
    account.failSave = true;
    await dialog.getByRole("button", { name: "Save keys", exact: true }).tap();
    await dialog.getByRole("alert").filter({ hasText: "Could not save" }).waitFor();
    assert.equal(Object.hasOwn(account.row.keybindings, "ability"), false);
    account.failSave = false;
    await dialog.getByRole("button", { name: "Save keys", exact: true }).tap();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(account.row.keybindings.ability, "KeyF");
    assert.equal(Object.keys(account.row.keybindings).length, 5);
    assert.equal(Object.hasOwn(account.row.keybindings, "xblock"), false);
    assert.equal(Object.hasOwn(account.row.keybindings, "hardblock"), false);
    assert.equal(account.row.keybindings.up, "Digit1");
    await page.reload();
    await page.getByRole("button", { name: "Keybindings", exact: true }).click();
    await dialog.getByRole("button", { name: "Use special ability F", exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Reset keys", exact: true }).tap();
    await dialog.getByRole("button", { name: "Use special ability 1", exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Save keys", exact: true }).tap();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(account.row.keybindings.ability, "Digit1");
    assert.equal(account.row.keybindings.up, "KeyW");
  } finally {
    for (const page of context.pages()) await page.unrouteAll({ behavior: "ignoreErrors" });
    await browser.close();
  }
});
