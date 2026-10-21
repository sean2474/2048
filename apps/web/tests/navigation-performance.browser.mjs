import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { startServerFixture } from "./server-fixture.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("collection requests overlap and mobile navigation closes before the destination responds", { timeout: 180000 }, async t => {
  let preferencesGate, authGate, walletStarted;
  const fixture = await startServerFixture({ handle: async url => {
    if (url.pathname.endsWith("/player_preferences")) await preferencesGate?.promise;
    if (url.pathname === "/auth/v1/user") await authGate?.promise;
    if (url.pathname.endsWith("/rpc/cosmetic_state")) {
      walletStarted?.resolve();
      return { data: { balance: 12, purchases: [] } };
    }
  } });
  t.after(fixture.close);
  const cookie = fixture.cookie();
  const headers = { cookie: `${cookie.name}=${cookie.value}`, "accept-language": "en" };
  await (await fetch(fixture.origin + "/shop", { headers })).text();

  await t.test("wallet reads do not wait for preferences or page translations", async () => {
    preferencesGate = deferred();
    walletStarted = deferred();
    const response = fetch(fixture.origin + "/shop", { headers }).then(value => value.text());
    let timer;
    try {
      const started = await Promise.race([
        walletStarted.promise.then(() => true),
        new Promise(resolve => { timer = setTimeout(() => resolve(false), 3000); }),
      ]);
      assert.equal(started, true, "wallet query must start while the preferences query is still held");
    } finally {
      clearTimeout(timer);
      preferencesGate.resolve();
      preferencesGate = undefined;
      walletStarted = undefined;
      await response;
    }
  });

  await t.test("the mobile menu dismisses immediately on an internal navigation", async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US" });
      await context.addCookies([cookie]);
      const page = await context.newPage();
      let documents = 0;
      page.on("request", request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++; });
      await page.goto(fixture.origin + "/settings");
      await page.getByRole("button", { name: "Main navigation", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      authGate = deferred();
      await dialog.getByRole("link", { name: "Feedback" }).click();
      try {
        await dialog.waitFor({ state: "hidden", timeout: 2000 });
        assert.equal(documents, 1, "internal links must not reload the document");
      } finally {
        authGate.resolve();
        authGate = undefined;
      }
      await page.waitForURL("**/feedback");
      assert.equal(documents, 1);
    } finally { authGate?.resolve(); authGate = undefined; await browser.close(); }
  });
});
