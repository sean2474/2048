import assert from "node:assert/strict";
import test from "node:test";
import { startServerFixture, fixturePlayer } from "./server-fixture.mjs";

const common = { description: "Server catalog description", status: "published", publishedOnce: true, revision: 1, updatedAt: "2026-10-01T00:00:00Z", sortOrder: 0, price: 20, acquisition: "coins" };
const makeSkin = (id, extra = {}) => ({ ...common, id, name: id, rarity: "common", tokens: { boardBackground: "#ffffff", emptyBackground: "#ffffff", tileRadius: "1px" }, ...extra });
const catalog = {
  skins: [makeSkin("classic", { acquisition: "free", price: 0 }), ...Array.from({ length: 15 }, (_, index) => makeSkin(`server-skin-${index + 1}`)), makeSkin("owned-archive", { status: "archived" }), makeSkin("invisible-draft", { status: "draft" }), makeSkin("earned-reward", { acquisition: "achievement", price: 0, rarity: "rare" })],
  profileIcons: [{ ...common, id: "orb", name: "Server Icon", color: "#ffffff", imagePath: "profile-icons/owl.svg", acquisition: "free", price: 0 }],
  achievements: [{ status: "published", publishedOnce: true, revision: 1, updatedAt: common.updatedAt, sortOrder: 0, id: "reward-unlock", name: "Reward Achievement", description: "Win once to unlock", metric: "wins", target: 1, reward: { kind: "skin", skinId: "earned-reward" } }],
};
const visible = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");

test("shop/loadout server-render ownership, URL filters, pagination, errors and streamed skeletons", { timeout: 180000 }, async t => {
  let failed = false, hold, requested;
  const fixture = await startServerFixture({ handle: async (url, _request, id) => {
    if (url.pathname.endsWith("/rpc/content_catalog")) {
      return failed ? { status: 503, data: { message: "fixture failure" } } : { data: catalog };
    }
    if (url.pathname.endsWith("/rpc/cosmetic_state")) {
      requested?.();
      if (hold) await hold;
      return { data: { balance: id === fixturePlayer ? 120 : 55, purchases: id === fixturePlayer ? [{ kind: "skin", item_id: "owned-archive" }] : [] } };
    }
    if (url.pathname.endsWith("/achievement_unlocks")) return { data: id === fixturePlayer ? [{ achievement_id: "reward-unlock" }] : [] };
    if (url.pathname.endsWith("/coin_transactions")) return { data: [{ id: 1, delta: 30, balance_after: 120, reason: "win", created_at: "2026-10-01T00:00:00Z" }] };
  } });
  t.after(fixture.close);
  const read = async (path, id) => {
    const cookie = fixture.cookie(id);
    const response = await fetch(fixture.origin + path, { headers: { "accept-language": "en", ...(id ? { cookie: `${cookie.name}=${cookie.value}` } : {}) } });
    assert.equal(response.status, 200);
    return visible(await response.text());
  };
  const guest = await read("/shop");
  assert.match(guest, /server-skin-1/);
  assert.doesNotMatch(guest, /owned-archive|invisible-draft|earned-reward/);
  assert.match(guest, /href="\/shop\?page=2"/);
  assert.equal(fixture.requests.filter(row => row.path.endsWith("/rpc/cosmetic_state")).length, 0);
  const page2 = await read("/shop?page=2", fixturePlayer);
  assert.match(page2, /server-skin-15/);
  assert.doesNotMatch(page2, /server-skin-1 ·/);
  assert.match(page2, /Recent coin activity/);
  assert.match(await read("/shop?category=icon", fixturePlayer), /Server Icon/);
  const owned = await read("/loadout?owned=1", fixturePlayer);
  assert.match(owned, /owned-archive/);
  assert.match(owned, /earned-reward/);
  assert.doesNotMatch(owned, /invisible-draft|server-skin-1/);
  assert.match(await read("/loadout?rarity=rare", fixturePlayer), /earned-reward/);
  const other = await read("/loadout?owned=1", "20000000-0000-4000-8000-000000000099");
  assert.doesNotMatch(other, /owned-archive|earned-reward/);
  assert.match(await read("/loadout?category=icon&owned=1"), /data-profile-icon="guest"/);
  assert.equal(fixture.requests.some(row => row.method !== "GET" && /\/rest\/v1\//.test(row.path)), false, "rendering must never write or call mutating RPCs");
  failed = true;
  assert.match(await read("/shop", fixturePlayer), /Could not load the collection/);
  failed = false;
  let release;
  hold = new Promise(resolve => { release = resolve; });
  const queryStarted = new Promise(resolve => { requested = resolve; });
  const cookie = fixture.cookie();
  const responsePromise = fetch(fixture.origin + "/shop", { headers: { "accept-language": "en", cookie: `${cookie.name}=${cookie.value}` } });
  await queryStarted;
  const response = await responsePromise, reader = response.body.getReader(), decoder = new TextDecoder();
  let html = "";
  try {
    while (!html.includes('aria-label="Loading collection…"')) {
      const { done, value } = await reader.read();
      assert.equal(done, false, "server skeleton must arrive before wallet request finishes");
      html += decoder.decode(value);
    }
    assert.match(html, /animate-pulse|skeleton/);
    assert.doesNotMatch(visible(html), /server-skin-1/);
  } finally { release(); hold = null; requested = null; }
  while (true) { const { done, value } = await reader.read(); if (done) break; html += decoder.decode(value); }
  assert.match(visible(html), /server-skin-1/);
});
