import assert from "node:assert/strict";
import test from "node:test";
import {
  collectionQuery,
  collectionHref,
  ownsCosmetic,
  visibleCollection,
  purchaseInput,
  localizeCatalog,
  isCosmeticState,
} from "../src/lib/collection";
import type { ContentCatalog } from "schema/catalog";

const metadata = {
  name: "Item",
  description: "Description",
  status: "published",
  publishedOnce: true,
  revision: 1,
  updatedAt: "2026-10-01T00:00:00Z",
  sortOrder: 0,
  price: 20,
  acquisition: "coins",
} as const;
const skin = (id: string, extra = {}) => ({
  ...metadata,
  id,
  rarity: "common",
  tokens: { boardBackground: "#ffffff", emptyBackground: "#ffffff", tileRadius: "1px" },
  ...extra,
});
const catalog = {
  skins: [
    skin("classic", { acquisition: "free", price: 0 }),
    skin("coin"),
    skin("retired", { status: "archived" }),
    skin("draft", { status: "draft" }),
    skin("reward", { acquisition: "achievement", price: 0 }),
  ],
  profileIcons: [],
  achievements: [
    {
      ...metadata,
      id: "reward-unlock",
      metric: "wins",
      target: 1,
      reward: { kind: "skin", skinId: "reward" },
    },
  ],
} as unknown as ContentCatalog;

test("URL filters reject invalid, duplicate and oversized values and preserve other filters", () => {
  assert.deepEqual(
    collectionQuery({ category: ["icon", "skin"], rarity: "__proto__", page: "-1", owned: "true" }),
    { category: "skin", rarity: "all", page: 0, ownedOnly: false },
  );
  assert.deepEqual(collectionQuery({ category: "icon", rarity: "rare", page: "2", owned: "1" }), {
    category: "icon",
    rarity: "rare",
    page: 1,
    ownedOnly: true,
  });
  assert.equal(collectionQuery({ page: "Infinity" }).page, 0);
  assert.equal(collectionQuery({ page: "9007199254740993" }).page, 0);
  assert.equal(
    collectionHref("/loadout", collectionQuery({ rarity: "rare", owned: "1" }), {
      category: "icon",
      page: 0,
    }),
    "/loadout?category=icon&rarity=rare&owned=1",
  );
});
test("ownership distinguishes guests, free published cosmetics, purchases and achievement rewards", () => {
  const account = {
    userId: "account",
    purchases: [{ kind: "skin" as const, item_id: "retired" }],
    unlockedIds: ["reward-unlock"],
  };
  assert.equal(ownsCosmetic(catalog, account, "skin", "classic"), true);
  assert.equal(ownsCosmetic(catalog, account, "skin", "retired"), true);
  assert.equal(ownsCosmetic(catalog, account, "skin", "reward"), true);
  assert.equal(ownsCosmetic(catalog, account, "skin", "coin"), false);
  assert.equal(ownsCosmetic(catalog, { purchases: [], unlockedIds: [] }, "icon", "guest"), true);
  assert.equal(ownsCosmetic(catalog, { purchases: [], unlockedIds: [] }, "skin", "reward"), false);
});
test("shop excludes drafts, archives and achievement rewards; loadout retains owned archives", () => {
  const account = {
    userId: "account",
    purchases: [{ kind: "skin" as const, item_id: "retired" }],
    unlockedIds: [],
  };
  assert.deepEqual(
    visibleCollection(catalog, account, "shop", collectionQuery({})).map((item) => item.id),
    ["classic", "coin"],
  );
  assert.deepEqual(
    visibleCollection(catalog, account, "loadout", collectionQuery({ owned: "1" })).map(
      (item) => item.id,
    ),
    ["classic", "retired"],
  );
  assert.equal(
    visibleCollection(catalog, account, "loadout", collectionQuery({}), "draft").some(
      (item) => item.id === "draft",
    ),
    false,
  );
});
test("purchase input validates identity and exact integer price, never trusting supplied names", () => {
  for (const value of [
    null,
    undefined,
    [],
    "skin",
    {},
    { kind: "skin", id: "coin", expectedPrice: -1 },
    { kind: "skin", id: "coin", expectedPrice: 1.1 },
    { kind: "skin", id: "🪙", expectedPrice: 20 },
    { kind: "icon", id: "x';drop", expectedPrice: 20 },
  ])
    assert.equal(purchaseInput(value), null);
  assert.deepEqual(purchaseInput({ kind: "skin", id: "coin", expectedPrice: 20 }), {
    kind: "skin",
    id: "coin",
    expectedPrice: 20,
  });
});
test("localized metadata keeps stable identifiers and does not mutate catalog snapshots", () => {
  const source = {
    ...catalog,
    skins: [{ ...catalog.skins[0], nameKo: "기본", descriptionKo: "설명" }],
  };
  assert.equal(localizeCatalog(source, "ko").skins[0].name, "기본");
  assert.equal(source.skins[0].name, "Item");
  assert.equal(localizeCatalog(source, "en").skins[0].id, "classic");
});

test("wallet state rejects malformed and unsafe amounts, while empty and large collections remain valid", () => {
  for (const state of [
    null,
    {},
    { balance: -1, purchases: [] },
    { balance: Infinity, purchases: [] },
    { balance: 1.5, purchases: [] },
    { balance: 0, purchases: null },
    { balance: 0, purchases: [null] },
    { balance: 0, purchases: [{ kind: "other", item_id: "test" }] },
  ])
    assert.equal(isCosmeticState(state), false);
  assert.equal(isCosmeticState({ balance: 0, purchases: [] }), true);
  const purchases = Array.from({ length: 10000 }, (_, index) => ({
    kind: "skin",
    item_id: `skin-${index}`,
  }));
  assert.equal(isCosmeticState({ balance: Number.MAX_SAFE_INTEGER, purchases }), true);
  assert.equal(
    visibleCollection(
      { skins: [], profileIcons: [], achievements: [] },
      { purchases: [], unlockedIds: [] },
      "shop",
      collectionQuery({}),
    ).length,
    0,
  );
});
