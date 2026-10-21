import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { startServerFixture, fixturePlayer } from "./server-fixture.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");

const metadata = {
  status: "published",
  publishedOnce: true,
  revision: 1,
  updatedAt: "2026-10-01T00:00:00Z",
  sortOrder: 0,
  description: "Cosmetic preview",
};
const tokens = { boardBackground: "#ffffff", emptyBackground: "#ffffff", tileRadius: "1px" };

test(
  "purchase dialog uses authenticated Server Actions and renders refreshed wallet/ownership",
  { timeout: 180000 },
  async (t) => {
    let price = 40,
      balance = 120,
      purchaseCalls = 0;
    const purchases = [];
    const catalog = () => ({
      skins: [
        {
          ...metadata,
          id: "classic",
          name: "Classic",
          rarity: "common",
          tokens,
          acquisition: "free",
          price: 0,
        },
        {
          ...metadata,
          id: "fixture-skin",
          name: "Fixture Skin",
          rarity: "rare",
          tokens,
          acquisition: "coins",
          price,
        },
      ],
      profileIcons: [],
      achievements: [],
    });
    const fixture = await startServerFixture({
      handle: async (url, request) => {
        if (url.pathname.endsWith("/rpc/content_catalog")) return { data: catalog() };
        if (url.pathname.endsWith("/rpc/cosmetic_state")) return { data: { balance, purchases } };
        if (url.pathname.endsWith("/rpc/purchase_cosmetic")) {
          purchaseCalls++;
          let body = "";
          for await (const chunk of request) body += chunk;
          assert.deepEqual(JSON.parse(body), {
            p_kind: "skin",
            p_item_id: "fixture-skin",
            p_expected_price: price,
          });
          balance -= price;
          purchases.push({ kind: "skin", item_id: "fixture-skin" });
          return { data: { balance, purchases, purchased: true } };
        }
      },
    });
    t.after(fixture.close);
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    t.after(() => browser.close());
    const context = await browser.newContext({ locale: "en-US" });
    await context.addCookies([fixture.cookie()]);
    const page = await context.newPage();
    let actionId;
    page.on("request", (request) => {
      if (request.headers()["next-action"]) actionId = request.headers()["next-action"];
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(fixture.origin + "/shop");
    await page
      .getByRole("button", { name: "Fixture Skin · Preview shop item", exact: true })
      .click();
    await page.getByRole("button", { name: "Buy for 40 coins", exact: true }).waitFor();
    price = 50;
    await page.getByRole("button", { name: "Buy for 40 coins", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Price changed. Review the updated price before buying." })
      .waitFor();
    assert.equal(purchaseCalls, 0, "outdated price must be rejected before mutation");
    await page.getByRole("button", { name: "Buy for 50 coins", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Purchase complete." }).waitFor();
    assert.equal(purchaseCalls, 1);
    await page.getByRole("link", { name: "View in loadout", exact: true }).waitFor();
    await page
      .locator('[aria-labelledby="shop-wallet-title"]')
      .getByText("70", { exact: true })
      .waitFor();
    assert.ok(actionId, "purchase is submitted to a Next.js server action");

    const invalid = await context.request.post(fixture.origin + "/shop", {
      headers: { "next-action": actionId, "content-type": "text/plain;charset=UTF-8" },
      data: JSON.stringify([
        { kind: "skin", id: "fixture-skin", expectedPrice: -1 },
        fixturePlayer,
      ]),
    });
    assert.match(await invalid.text(), /Could not complete your purchase/);
    assert.equal(purchaseCalls, 1);
    const stale = await context.request.post(fixture.origin + "/shop", {
      headers: { "next-action": actionId, "content-type": "text/plain;charset=UTF-8" },
      data: JSON.stringify([
        { kind: "skin", id: "fixture-skin", expectedPrice: 50 },
        "20000000-0000-4000-8000-000000000099",
      ]),
    });
    assert.match(await stale.text(), /Could not complete your purchase/);
    assert.equal(
      purchaseCalls,
      1,
      "a stale account snapshot cannot purchase for the current account",
    );
    const guest = await browser.newContext({ locale: "en-US" });
    const unauthorized = await guest.request.post(fixture.origin + "/shop", {
      headers: { "next-action": actionId, "content-type": "text/plain;charset=UTF-8" },
      data: JSON.stringify([
        { kind: "skin", id: "fixture-skin", expectedPrice: 50 },
        fixturePlayer,
      ]),
    });
    assert.match(await unauthorized.text(), /Log in to unlock this item/);
    assert.equal(purchaseCalls, 1, "a forged guest action cannot reach the purchase RPC");
    await guest.close();
    assert.deepEqual(errors, []);
  },
);
