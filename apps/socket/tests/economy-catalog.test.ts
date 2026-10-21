import assert from "node:assert/strict";
import test from "node:test";
import { SHOP_ITEMS } from "schema/economy";
import { achievementForItem } from "schema/achievements";
import { SKINS } from "schema/loadout";
import { PROFILE_ICONS } from "schema/profile-icons";

test("shop includes free defaults and priced cosmetics without selling achievement rewards", () => {
  assert.equal(
    new Set(SHOP_ITEMS.map((item) => `${item.kind}:${item.id}`)).size,
    SHOP_ITEMS.length,
  );
  assert.equal(SHOP_ITEMS.length, 26);
  assert.ok(SHOP_ITEMS.every((item) => !achievementForItem(item.kind, item.id)));
  assert.deepEqual(
    SHOP_ITEMS.filter((item) => item.price === 0)
      .map((item) => item.id)
      .sort(),
    ["charcoal", "classic", "espresso", "fox", "paper", "slate"],
  );
  for (const item of SHOP_ITEMS) {
    const cosmetic =
      item.kind === "skin"
        ? SKINS.find((skin) => skin.id === item.id)
        : PROFILE_ICONS.find((icon) => icon.id === item.id);
    assert.ok(cosmetic);
    assert.ok(Number.isSafeInteger(item.price) && item.price >= 0);
    assert.equal(
      item.price,
      item.kind === "icon"
        ? item.id === "fox"
          ? 0
          : 150
        : { common: 0, rare: 300, epic: 600, legendary: 1200 }[
            SKINS.find((skin) => skin.id === item.id)!.rarity
          ],
    );
  }
});
