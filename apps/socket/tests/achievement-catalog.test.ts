import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ACHIEVEMENT_REWARDS, achievementForItem } from "schema/achievements";
import { SKINS } from "schema/loadout";
import { PROFILE_ICONS } from "schema/profile-icons";
import { achievementMessages } from "../../web/src/lib/i18n/achievement-messages";

test("achievement rewards have unique, localized cosmetics and preserve the shop catalog", () => {
  assert.equal(new Set(ACHIEVEMENT_REWARDS.map(item => item.id)).size, 10);
  assert.equal(SKINS.filter(skin => !achievementForItem("skin", skin.id)).length, 20);
  assert.equal(PROFILE_ICONS.filter(icon => !achievementForItem("icon", icon.id)).length, 6);
  const seen = new Set<string>();
  for (const achievement of ACHIEVEMENT_REWARDS) {
    const { reward } = achievement;
    assert.ok(Number.isSafeInteger(achievement.target) && achievement.target > 0);
    assert.ok(achievementMessages[achievement.name]);
    assert.ok(achievementMessages[achievement.description]);
    const items = [
      ...("skinId" in reward ? [{ kind: "skin" as const, id: reward.skinId }] : []),
      ...("iconId" in reward ? [{ kind: "icon" as const, id: reward.iconId }] : []),
    ];
    for (const { kind, id } of items) {
      assert.ok(!seen.has(`${kind}:${id}`));
      seen.add(`${kind}:${id}`);
      assert.equal(achievementForItem(kind, id), achievement);
      const cosmetic = kind === "skin" ? SKINS.find(skin => skin.id === id) : PROFILE_ICONS.find(icon => icon.id === id);
      assert.ok(cosmetic);
      assert.ok(achievementMessages[cosmetic.name]);
      if (kind === "icon") {
        const source = readFileSync(new URL(`../../web/public/profile-icons/${id}.svg`, import.meta.url), "utf8");
        assert.match(source, /viewBox="0 0 160 160"/);
        assert.doesNotMatch(source, /<script|<foreignObject|<text\b|(?:href|src)=/i);
      }
    }
  }
  const rankRewards = ACHIEVEMENT_REWARDS.filter(item => item.metric === "rank_tier");
  assert.deepEqual(rankRewards.map(item => item.target), [1, 2, 3, 4, 5, 6]);
  assert.ok(rankRewards.every(item => item.reward.kind === "set" && item.reward.skinId === item.id && item.reward.iconId === item.id));
  assert.equal(achievementForItem("skin", "classic"), undefined);
  assert.equal(achievementForItem("icon", "dawn-oath"), undefined);
  assert.equal(achievementForItem("skin", "missing"), undefined);
});
