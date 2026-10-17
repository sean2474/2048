import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ACHIEVEMENT_REWARDS, achievementForItem } from "schema/achievements";
import { SKINS } from "schema/loadout";
import { PROFILE_ICONS } from "schema/profile-icons";
import { achievementMessages } from "../../web/src/lib/i18n/achievement-messages";

test("achievement rewards have unique, localized cosmetics and preserve the free catalog", () => {
  assert.equal(new Set(ACHIEVEMENT_REWARDS.map(item => item.id)).size, 4);
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
