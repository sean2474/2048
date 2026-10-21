import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mockAccount } from "./browser-fixtures.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const origin = process.env.WEB_TEST_ORIGIN ?? "http://localhost:3061";
const metadata = {
  status: "published",
  publishedOnce: true,
  revision: 1,
  updatedAt: "2026-10-17T00:00:00Z",
  sortOrder: 0,
  description: "Only in the database",
};
const catalog = {
  skins: [
    {
      ...metadata,
      id: "new-moon",
      name: "New Moon",
      nameKo: "새로운 달",
      rarity: "rare",
      acquisition: "coins",
      price: 300,
      tokens: {
        boardBackground: "#123456",
        emptyBackground: "#ccddee",
        tileRadius: "0.5rem",
        boardImagePath: "boards/moon.png",
        tileImagePath: "tiles/moon.png",
      },
    },
  ],
  profileIcons: [
    {
      ...metadata,
      id: "new-star",
      name: "New Star",
      nameKo: "새로운 별",
      acquisition: "coins",
      price: 150,
      color: "#123456",
      imagePath: "profiles/star.png",
    },
    {
      ...metadata,
      id: "new-award",
      name: "Moon medal",
      nameKo: "달의 훈장",
      acquisition: "achievement",
      price: 0,
      color: "#123456",
      imagePath: "profiles/star.png",
    },
  ],
  achievements: [
    {
      ...metadata,
      id: "new-victory",
      name: "Moon victory",
      nameKo: "달의 승리",
      descriptionKo: "세 번 승리하세요.",
      metric: "wins",
      target: 3,
      reward: { kind: "icon", iconId: "new-award" },
    },
  ],
};

test("database-only items purchase, equip, persist and render Storage artwork without a release", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ locale: "ko-KR", reducedMotion: "reduce" });
    page.setDefaultTimeout(8000);
    const account = await mockAccount(page);
    account.cosmetics.balance = 1000;
    let reads = 0,
      syncs = 0;
    await page.route("**/rest/v1/rpc/sync_achievements", (route) => {
      assert.equal(route.request().method(), "POST");
      syncs++;
      if (account.achievements.wins >= 3 && !account.achievements.unlocks.length)
        account.achievements.unlocks.push({
          achievementId: "new-victory",
          unlockedAt: "2026-10-17T00:00:00Z",
        });
      return route.fulfill({ json: account.achievements });
    });
    await page.route("**/rest/v1/rpc/content_catalog*", (route) => {
      reads++;
      return route.fulfill({ json: catalog });
    });
    await page.route("**/storage/v1/object/public/catalog-assets/**", (route) =>
      route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
          "base64",
        ),
      }),
    );
    await page.route("**/rest/v1/rpc/purchase_cosmetic", (route) => {
      const { p_kind: kind, p_item_id: item_id } = route.request().postDataJSON();
      account.cosmetics.balance -= kind === "skin" ? 300 : 150;
      account.cosmetics.purchases.push({ kind, item_id });
      return route.fulfill({ json: { ...account.cosmetics, purchased: true } });
    });
    await page.goto(`${origin}/shop`);
    await page.getByRole("button", { name: "새로운 달 · 상품 미리보기", exact: true }).click();
    await page.getByRole("button", { name: "코인 300개로 구매", exact: true }).click();
    await page.getByRole("dialog").getByText("구매 완료", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    await page.getByRole("button", { name: "새로운 별 · 상품 미리보기", exact: true }).click();
    await page.getByRole("button", { name: "코인 150개로 구매", exact: true }).click();
    await page.getByRole("dialog").getByText("구매 완료", { exact: true }).waitFor();
    await page.getByRole("link", { name: "꾸미기에서 보기", exact: true }).click();
    await page.getByRole("button", { name: "새로운 달 · 자세히 보기", exact: true }).click();
    await page.getByRole("button", { name: "장착하기", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    await page.getByRole("button", { name: "새로운 별 · 자세히 보기", exact: true }).click();
    await page.getByRole("button", { name: "장착하기", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(account.row.skin_id, "new-moon");
    assert.equal(account.row.icon_id, "new-star");
    await page.reload();
    await page
      .getByRole("region", { name: "현재 선택" })
      .getByText("새로운 별", { exact: true })
      .waitFor();
    assert.match(
      await page.locator('[data-profile-icon="new-star"]').first().getAttribute("src"),
      /storage\/v1\/object\/public\/catalog-assets\/profiles\/star.png$/,
    );
    await page.goto(`${origin}/tutorial`);
    await page.locator('[data-skin="new-moon"]').waitFor();
    assert.match(
      await page.locator('[data-skin="new-moon"]').first().getAttribute("style"),
      /boards\/moon.png/,
    );
    assert.match(
      await page
        .locator('[data-skin="new-moon"] span[style*="tiles/moon.png"]')
        .first()
        .textContent(),
      /2|4/,
    );
    account.achievements.wins = 3;
    await page.goto(`${origin}/achievements`);
    await page.locator("#new-victory").getByText("세 번 승리하세요.").waitFor();
    await page.setViewportSize({ width: 320, height: 740 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
    await page.locator("#new-victory").getByText("영구 해금 완료", { exact: true }).waitFor();
    assert.ok(reads >= 1);
    assert.ok(syncs >= 1);
    await page.goto(`${origin}/loadout`);
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    await page.getByRole("button", { name: "달의 훈장 · 자세히 보기", exact: true }).click();
    await page.getByRole("button", { name: "장착하기", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(account.row.icon_id, "new-award");
  } finally {
    await browser.close();
  }
});

test("catalog failures stay visible and retry; archived items remain available only to owners", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ locale: "ko-KR" });
    page.setDefaultTimeout(8000);
    const account = await mockAccount(page);
    account.cosmetics.purchases.push({ kind: "skin", item_id: "new-moon" });
    account.row.skin_id = "new-moon";
    let failed = true;
    const archived = structuredClone(catalog);
    archived.skins[0].status = "archived";
    archived.profileIcons[0].status = "archived";
    await page.route("**/rest/v1/rpc/content_catalog*", (route) =>
      route.fulfill({ json: failed ? { skins: [{ id: "broken" }] } : archived }),
    );
    await page.goto(`${origin}/loadout`);
    await page.getByRole("alert").filter({ hasText: "컬렉션을 불러오지 못했어요" }).waitFor();
    assert.equal(await page.getByRole("button", { name: /새로운 달/ }).count(), 0);
    failed = false;
    await page.getByRole("button", { name: "컬렉션 다시 불러오기" }).click();
    await page.getByRole("button", { name: "새로운 달 · 자세히 보기", exact: true }).waitFor();
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: /새로운 별/ }).count(), 0);
    await page.goto(`${origin}/shop`);
    await page.getByRole("heading", { name: "코인 상점", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /새로운 달/ }).count(), 0);
  } finally {
    await browser.close();
  }
});

test("catalog caches navigation, refreshes edited metadata, and retains verified content on errors", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ locale: "ko-KR" });
    page.setDefaultTimeout(8000);
    await page.clock.install();
    const account = await mockAccount(page);
    account.row.skin_id = "new-moon";
    account.cosmetics.purchases.push({ kind: "skin", item_id: "new-moon" });
    const edited = structuredClone(catalog);
    let reads = 0,
      failed = false;
    await page.route("**/rest/v1/rpc/content_catalog*", (route) => {
      reads++;
      return route.fulfill({ json: failed ? null : edited });
    });
    await page.goto(`${origin}/loadout`);
    await page.getByRole("button", { name: "새로운 달 · 자세히 보기", exact: true }).waitFor();
    const initial = reads;
    // Client navigation retains the provider and its cached catalog.
    await page.getByRole("main").getByRole("link", { name: "대전 찾기", exact: true }).click();
    assert.equal(reads, initial);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    assert.equal(reads, initial);
    edited.skins[0].nameKo = "달의 새 이름";
    await page.clock.fastForward(60_001);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.locator('a[href="/loadout"]').first().click();
    await page.getByRole("button", { name: "달의 새 이름 · 자세히 보기", exact: true }).waitFor();
    assert.equal(reads, initial + 1);
    failed = true;
    await page.clock.fastForward(60_001);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByRole("alert").filter({ hasText: "컬렉션을 불러오지 못했어요" }).waitFor();
    await page.getByRole("button", { name: "달의 새 이름 · 자세히 보기", exact: true }).waitFor();
  } finally {
    await browser.close();
  }
});

test("existing solo rewards render inverse time progress and their original three characters", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      locale: "ko-KR",
      reducedMotion: "reduce",
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(8000);
    const account = await mockAccount(page);
    const characters = ["fox", "dragon", "phoenix"];
    account.catalog.skins = characters.map((character) => ({
      ...metadata,
      id: `new-${character}`,
      name: character,
      nameKo: character,
      rarity: "legendary",
      acquisition: "achievement",
      price: 0,
      tokens: {
        boardBackground: "#456789",
        emptyBackground: "#ccddee",
        tileRadius: "0.5rem",
        character,
      },
    }));
    account.catalog.achievements = characters.map((character, index) => ({
      ...metadata,
      id: `reward-${character}`,
      name: character,
      description: "Solo milestone",
      metric: index === 1 ? "solo_tile" : "solo_time",
      target: index === 1 ? 4096 : 600_000,
      reward: { kind: "skin", skinId: `new-${character}` },
    }));
    account.achievements.soloBestMs = 1_200_000;
    account.achievements.soloHighestTile = 2048;
    account.achievements.unlocks.push({
      achievementId: "reward-phoenix",
      unlockedAt: "2026-10-17T00:00:00Z",
    });
    await page.goto(`${origin}/achievements`);
    await page.locator('#reward-fox progress[value="50"]').waitFor();
    await page.locator("#reward-fox").getByText("최고 기록: 20:00.00", { exact: true }).waitFor();
    await page.locator("#reward-fox").getByText("목표 기록: 10:00.00", { exact: true }).waitFor();
    assert.equal(await page.locator("#reward-dragon progress").getAttribute("value"), "2048");
    assert.equal(await page.locator("#reward-phoenix progress").getAttribute("value"), "100");
    await page.goto(`${origin}/loadout`);
    for (const character of characters) {
      await page.getByRole("button", { name: new RegExp(`^${character} ·`) }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "합성 효과 미리보기", exact: true })
        .click();
      const tile = page.locator(
        `[data-skin-preview="new-${character}"] [data-merge-effect="${character}"]`,
      );
      await tile.waitFor();
      assert.equal(await tile.locator("svg").count(), 2);
      assert.equal(await tile.getByText("4", { exact: true }).count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
      await page.keyboard.press("Escape");
    }
  } finally {
    await browser.close();
  }
});

test("a changed price requires a new explicit confirmation and never charges the stale quote", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ locale: "ko-KR" });
    page.setDefaultTimeout(8000);
    const account = await mockAccount(page);
    account.cosmetics.balance = 1000;
    const calls = [];
    await page.route("**/rest/v1/rpc/purchase_cosmetic", (route) => {
      const input = route.request().postDataJSON();
      calls.push(input);
      if (input.p_expected_price !== 300)
        return route.fulfill({
          status: 409,
          json: { message: "Price changed. Review the updated price before buying." },
        });
      account.cosmetics.balance -= 300;
      account.cosmetics.purchases.push({ kind: "icon", item_id: "owl" });
      return route.fulfill({ json: { ...account.cosmetics, purchased: true } });
    });
    await page.goto(`${origin}/shop`);
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    await page.getByRole("button", { name: "달빛 부엉이 · 상품 미리보기", exact: true }).click();
    account.catalog.profileIcons.find((icon) => icon.id === "owl").price = 300;
    await page.getByRole("button", { name: "코인 150개로 구매", exact: true }).click();
    await page
      .getByRole("alert")
      .getByText("가격이 변경됐어요. 새 가격을 확인하고 다시 구매해 주세요.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "코인 300개로 구매", exact: true }).waitFor();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].p_expected_price, 150);
    assert.equal(account.cosmetics.balance, 1000);
    await page.getByRole("button", { name: "코인 300개로 구매", exact: true }).click();
    await page.getByRole("dialog").getByText("구매 완료", { exact: true }).waitFor();
    assert.equal(calls.length, 2);
    assert.equal(calls[1].p_expected_price, 300);
    assert.equal(account.cosmetics.balance, 700);
  } finally {
    await browser.close();
  }
});

test("shop returns to an available page when catalog items are archived", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ locale: "ko-KR" });
    page.setDefaultTimeout(8000);
    await page.clock.install();
    const account = await mockAccount(page);
    await page.goto(`${origin}/shop`);
    await page.getByRole("button", { name: "다음 페이지", exact: true }).click();
    account.catalog.skins.forEach((skin) => {
      if (skin.id !== "classic") skin.status = "archived";
    });
    await page.clock.fastForward(60_001);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByRole("button", { name: "클래식 · 상품 미리보기", exact: true }).waitFor();
    assert.equal(await page.locator("#shop-items > li").count(), 1);
    assert.equal(
      await page.getByRole("navigation", { name: "목록 페이지", exact: true }).count(),
      0,
    );
  } finally {
    await browser.close();
  }
});

test("unlock conditions prefer the active rule and only explain archived rewards already earned", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ locale: "ko-KR" });
    page.setDefaultTimeout(8000);
    const account = await mockAccount(page);
    account.catalog.skins = [{ ...catalog.skins[0], acquisition: "achievement", price: 0 }];
    account.catalog.achievements = [
      {
        ...metadata,
        id: "old-rule",
        status: "archived",
        name: "Old rule",
        description: "Old earned reward",
        metric: "wins",
        target: 3,
        reward: { kind: "skin", skinId: "new-moon" },
      },
      {
        ...metadata,
        id: "active-rule",
        name: "Active rule",
        description: "Current unlock rule",
        metric: "wins",
        target: 5,
        reward: { kind: "skin", skinId: "new-moon" },
      },
    ];
    await page.goto(`${origin}/loadout`);
    await page
      .getByRole("button", { name: "새로운 달 · 잠김 · 해금 조건 보기", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "업적으로 해금하기", exact: true })
        .getAttribute("href"),
      "/achievements#active-rule",
    );
    account.catalog.achievements[1].status = "archived";
    await page.reload();
    await page
      .getByRole("button", { name: "새로운 달 · 잠김 · 해금 조건 보기", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "현재 획득 불가", exact: true })
        .isDisabled(),
      true,
    );
    account.achievements.unlocks.push({
      achievementId: "old-rule",
      unlockedAt: "2026-10-17T00:00:00Z",
    });
    await page.reload();
    await page.getByRole("button", { name: "새로운 달 · 자세히 보기", exact: true }).click();
    await page.getByRole("dialog").getByText("Old earned reward", { exact: true }).waitFor();
    await page.getByRole("button", { name: "장착하기", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(account.row.skin_id, "new-moon");
  } finally {
    await browser.close();
  }
});

test("dark, transparent and image palettes keep opaque high-contrast numbers", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ locale: "ko-KR", viewport: { width: 320, height: 740 } });
    page.setDefaultTimeout(8000);
    const account = await mockAccount(page);
    const variants = [
      { name: "Dark", color: "#493b40" },
      { name: "Transparent", color: "#493b4000" },
      { name: "Image", color: "#493b4080", tileImagePath: "tiles/moon.png" },
      { name: "Character", color: "#493b40", character: "fox" },
    ];
    account.catalog.skins = variants.map((item) => ({
      ...metadata,
      id: item.name.toLowerCase(),
      name: item.name,
      rarity: "rare",
      acquisition: "free",
      price: 0,
      tokens: {
        boardBackground: "#000000",
        emptyBackground: "#000000",
        tileRadius: "0.5rem",
        tilePalette: [item.color],
        ...(item.tileImagePath ? { tileImagePath: item.tileImagePath } : {}),
        ...(item.character ? { character: item.character } : {}),
      },
    }));
    await page.goto(`${origin}/loadout`);
    for (const item of variants) {
      const number = page
        .getByRole("button", { name: `${item.name} · 자세히 보기`, exact: true })
        .getByText("2", { exact: true });
      await number.waitFor();
      const colors = await number.evaluate((element) => {
        const style = getComputedStyle(element);
        return { fg: style.color, bg: style.backgroundColor };
      });
      const rgb = (css) => css.match(/[\d.]+/g).map(Number);
      const bg = rgb(colors.bg),
        fg = rgb(colors.fg);
      assert.equal(bg[3] ?? 1, 1, `${item.name} numeral backing must be opaque`);
      const light = (rgb) =>
        rgb
          .slice(0, 3)
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const a = light(bg),
        b = light(fg);
      assert.ok(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5,
        `${item.name}: ${JSON.stringify(colors)}`,
      );
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
  } finally {
    await browser.close();
  }
});
