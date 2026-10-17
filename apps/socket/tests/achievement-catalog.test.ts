import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ACHIEVEMENT_REWARDS, achievementForItem } from "schema/achievements";
import { SKINS } from "schema/loadout";
import { PROFILE_ICONS } from "schema/profile-icons";
import { achievementMessages } from "../../web/src/lib/i18n/achievement-messages";

test("achievement rewards have unique, localized cosmetics and preserve the free catalog", () => {
  assert.equal(new Set(ACHIEVEMENT_REWARDS.map(item => item.id)).size, 12);
  assert.equal(SKINS.filter(skin => !achievementForItem("skin", skin.id)).length, 20);
  assert.equal(PROFILE_ICONS.filter(icon => !achievementForItem("icon", icon.id)).length, 6);
  const seen = new Set<string>();
  for (const achievement of ACHIEVEMENT_REWARDS) {
    const { reward } = achievement;
    const id = reward.kind === "skin" ? reward.skinId : reward.iconId;
    assert.ok(!seen.has(`${reward.kind}:${id}`));
    seen.add(`${reward.kind}:${id}`);
    assert.equal(achievementForItem(reward.kind, id), achievement);
    assert.ok(Number.isSafeInteger(achievement.target) && achievement.target > 0);
    assert.ok(achievementMessages[achievement.name]);
    assert.ok(achievementMessages[achievement.description]);
    const cosmetic = reward.kind === "skin" ? SKINS.find(skin => skin.id === id) : PROFILE_ICONS.find(icon => icon.id === id);
    assert.ok(cosmetic);
    assert.ok(achievementMessages[cosmetic.name]);
    if (reward.kind === "icon") {
      const source = readFileSync(new URL(`../../web/public/profile-icons/${reward.iconId}.svg`, import.meta.url), "utf8");
      assert.match(source, /viewBox="0 0 160 160"/);
      assert.doesNotMatch(source, /<script|<foreignObject|<text\b|(?:href|src)=/i);
    }
  }
  assert.equal(achievementForItem("skin", "classic"), undefined);
  assert.equal(achievementForItem("icon", "dawn-oath"), undefined);
  assert.equal(achievementForItem("skin", "missing"), undefined);
});


test("solo milestones have the requested rarity and distinct legendary characters", () => {
  const expected = { "solo-first": "rare", "solo-10min": "rare", "solo-6min": "epic", "solo-4min": "legendary", "solo-2min": "legendary", "endless-2048": "rare", "endless-4096": "epic", "endless-8192": "legendary" };
  const characters = new Set<string>();
  for (const [id, rarity] of Object.entries(expected)) {
    const reward = ACHIEVEMENT_REWARDS.find(item => item.id === id)!.reward;
    assert.equal(reward.kind, "skin");
    if (reward.kind !== "skin") continue;
    const skin = SKINS.find(item => item.id === reward.skinId)!;
    assert.equal(skin.rarity, rarity);
    if (skin.rarity === "legendary") characters.add(skin.tokens.character);
  }
  assert.equal(characters.size, 3);
});
