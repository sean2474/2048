import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { startServerFixture } from "./server-fixture.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const preferences = { locale: "en", skin_id: "classic", icon_id: "fox", ability_id: null, custom_shortcuts: true,
  keybindings: { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD", ability: "Digit1" } };

test("server preferences hydrate once and a failed server read still retries in the browser", { timeout: 120000 }, async t => {
  let failNext = false;
  const fixture = await startServerFixture({ handle: async url => {
    if (!url.pathname.endsWith("/player_preferences")) return;
    if (failNext) { failNext = false; return { status: 503, data: { message: "Temporary fixture failure" } }; }
    return { data: [preferences] };
  } });
  t.after(fixture.close);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ locale: "en-US" });
  await context.addCookies([fixture.cookie()]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const failure of [false, true]) {
    fixture.requests.length = 0;
    failNext = failure;
    await page.goto(fixture.origin + "/settings");
    await page.getByRole("button", { name: "Keybindings", exact: true }).click();
    await page.getByRole("button", { name: "Move up W", exact: true }).waitFor();
    await page.waitForFunction(() => !document.body.textContent.includes("Loading saved settings"));
    assert.equal(fixture.requests.filter(row => row.path.endsWith("/player_preferences")).length, failure ? 2 : 1);
  }
  assert.deepEqual(errors, []);
});
