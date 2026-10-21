import assert from "node:assert/strict";
import test from "node:test";
import { boardBackground, catalogAssetUrl } from "../../web/src/lib/catalog-assets";

test("catalog artwork stays in the configured Storage bucket and preserves color backgrounds", () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
  try {
    assert.equal(
      catalogAssetUrl("profiles/new-star.webp"),
      "https://fixture.supabase.co/storage/v1/object/public/catalog-assets/profiles/new-star.webp",
    );
    for (const path of [
      undefined,
      "",
      "../secret.png",
      "https://evil.test/image.png",
      'x")url(//evil.test/x.png)',
      "data:image/svg+xml,x",
      "profiles//x.png",
    ])
      assert.equal(catalogAssetUrl(path), undefined);
    assert.equal(boardBackground({ boardBackground: "#123456" }), "#123456");
    assert.equal(
      boardBackground({ boardBackground: "#123456", boardImagePath: "boards/new-moon.png" }),
      'url("https://fixture.supabase.co/storage/v1/object/public/catalog-assets/boards/new-moon.png") center / cover, #123456',
    );
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
  }
});

test("catalog solo progress uses milliseconds, inverse time targets, and permanent unlocks", async () => {
  const { achievementProgress, formatAchievementTime } = await import("schema/achievements");
  const data = {
    attendance: {
      streak: 0,
      bestStreak: 0,
      lastDay: null,
      today: "2026-10-17",
      checkedInToday: true,
      nextCheckInAt: "2026-10-18T00:00:00Z",
    },
    wins: 0,
    highestTile: 0,
    soloBestMs: null as number | null,
    soloHighestTile: 0,
    unlocks: [] as { achievementId: string; unlockedAt: string }[],
  };
  const timed = { id: "new-solo", metric: "solo_time" as const, target: 600_000 };
  assert.deepEqual(achievementProgress(timed, data), { unlocked: false, current: 0, percent: 0 });
  data.soloBestMs = 1_200_000;
  assert.equal(achievementProgress(timed, data).percent, 50);
  data.soloBestMs = 600_000;
  assert.equal(achievementProgress(timed, data).percent, 100);
  data.soloBestMs = 120_010;
  assert.equal(achievementProgress(timed, data).percent, 100);
  for (const [metric, target, percent] of [
    ["attendance_streak", 7, 42],
    ["wins", 10, 70],
    ["highest_tile", 1024, 50],
    ["rank_tier", 6, 50],
  ] as const) {
    assert.equal(
      achievementProgress(
        { id: "progress", metric, target },
        {
          ...data,
          wins: 7,
          highestTile: 512,
          highestRank: 3,
          attendance: { ...data.attendance, streak: 3 },
        },
      ).percent,
      percent,
    );
  }
  assert.equal(
    achievementProgress({ id: "rank", metric: "rank_tier", target: 1 }, data).percent,
    0,
  );
  assert.equal(formatAchievementTime(data.soloBestMs), "02:00.01");
  assert.equal(formatAchievementTime(-1), "00:00.00");
  assert.equal(formatAchievementTime(3_600_000), "60:00.00");
  data.soloHighestTile = 2048;
  assert.equal(
    achievementProgress({ id: "new-tile", metric: "solo_tile", target: 4096 }, data).percent,
    50,
  );
  data.unlocks.push({ achievementId: timed.id, unlockedAt: "2026-10-17T00:00:00Z" });
  data.soloBestMs = null;
  assert.deepEqual(achievementProgress(timed, data), { unlocked: true, current: 0, percent: 100 });
});

test("custom tile palettes select a readable foreground even at contrast boundaries", async () => {
  const { tileTextColor } = await import("../../web/src/lib/tile-colors");
  const luminance = (hex: string) => {
    const value = hex.slice(1, 7);
    const channels = value.length === 3 ? [...value].map((c) => c + c) : value.match(/../g)!;
    return channels
      .map((channel) => parseInt(channel, 16) / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
      .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
  };
  for (const background of [
    "#493b40",
    "#493b4000",
    "#000000",
    "#ffffff",
    "#777777",
    "#767676",
    "#ccc",
    "#12345680",
  ]) {
    const foreground = tileTextColor(background);
    const a = luminance(background),
      b = luminance(foreground);
    assert.ok(
      (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5,
      `${background}: ${foreground}`,
    );
  }
});
