import assert from "node:assert/strict";
import test from "node:test";
import { ACHIEVEMENTS, SHOP_ITEMS } from "schema/economy";
import { achievementForItem } from "schema/achievements";
import { SKINS } from "schema/loadout";
import { PROFILE_ICONS } from "schema/profile-icons";
import { economyMessages } from "../../web/src/lib/i18n/economy-messages";

test("draft catalog references real cosmetics and never enables rewards or purchases", () => {
  assert.equal(new Set(ACHIEVEMENTS.map(item => item.id)).size, ACHIEVEMENTS.length);
  assert.equal(new Set(SHOP_ITEMS.map(item => item.skinId)).size, SHOP_ITEMS.length);
  assert.equal(SHOP_ITEMS.length, 19);
  assert.ok(SHOP_ITEMS.every(item => item.skinId !== "classic" && !achievementForItem("skin", item.skinId)));
  for (const item of SHOP_ITEMS) {
    assert.ok(SKINS.some(skin => skin.id === item.skinId));
    assert.equal(item.status, "planned");
    assert.ok(Number.isSafeInteger(item.plannedPrice) && item.plannedPrice > 0);
  }
  for (const achievement of ACHIEVEMENTS) {
    assert.equal(achievement.status, "planned");
    assert.ok(Number.isSafeInteger(achievement.target) && achievement.target > 0);
    assert.ok(economyMessages[achievement.name]);
    assert.ok(economyMessages[achievement.description]);
    const reward = achievement.reward;
    if (reward.kind === "coins") assert.ok(Number.isSafeInteger(reward.amount) && reward.amount > 0);
    else assert.ok(PROFILE_ICONS.some(icon => icon.id === reward.iconId));
  }
  // Planning prices must not silently revoke today's free catalog access.
  assert.ok(SKINS.every(skin => skin.price === 0));
});
