import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { mockAccount, mockCatalog, authCookieName } from "./browser-fixtures.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const origin = process.env.WEB_TEST_ORIGIN ?? "http://[::1]:3001";
const evidence = process.env.SHOP_EVIDENCE_DIR;
const waitForPaint = (page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

async function screenshot(page, name) {
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  await page.screenshot({
    path: `${evidence}/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

test("common skins are included, paid skins and profiles unlock only after one coin purchase", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ locale: "ko-KR", reducedMotion: "reduce" });
    await mockCatalog(page);
    page.setDefaultTimeout(8000);
    const account = await mockAccount(page),
      errors = [],
      calls = [];
    account.cosmetics.balance = 1000;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/rest/v1/rpc/purchase_cosmetic", async (route) => {
      const input = route.request().postDataJSON();
      calls.push(input);
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.ok(
        (input.p_kind === "skin" && input.p_item_id === "confetti") ||
          (input.p_kind === "icon" && input.p_item_id === "owl"),
      );
      account.cosmetics.balance -= input.p_kind === "skin" ? 300 : 150;
      account.cosmetics.purchases.push({ kind: input.p_kind, item_id: input.p_item_id });
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...account.cosmetics, purchased: true }),
      });
    });
    await page.goto(`${origin}/loadout`);
    await page.getByRole("checkbox", { name: "보유 중인 것만" }).check();
    await page.locator("#skin-results button").last().waitFor();
    assert.equal(await page.locator("#skin-results button").count(), 5);
    await page.getByRole("button", { name: "슬레이트 · 자세히 보기", exact: true }).click();
    await page.getByRole("dialog").getByText("기본 지급", { exact: true }).waitFor();
    await page.getByRole("button", { name: "장착하기", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(account.row.skin_id, "slate");
    await page.getByRole("checkbox", { name: "보유 중인 것만" }).uncheck();
    await page
      .getByRole("button", { name: "색종이 파티 · 잠김 · 해금 조건 보기", exact: true })
      .click();
    await page.getByRole("dialog").getByRole("link", { name: "상점에서 구매" }).click();
    await page.getByRole("heading", { name: "코인 상점", exact: true }).waitFor();
    assert.equal(await page.getByText("준비 중", { exact: true }).count(), 0);
    assert.equal(await page.getByText(/예정 가격|게임 능력에 영향을/).count(), 0);
    await page.getByRole("button", { name: "색종이 파티 · 상품 미리보기", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const buy = dialog.getByRole("button", { name: "코인 300개로 구매", exact: true });
    await buy.evaluate((button) => {
      button.click();
      button.click();
    });
    await dialog.getByRole("status").filter({ hasText: "구매 완료" }).waitFor();
    assert.equal(calls.length, 1);
    assert.equal(account.cosmetics.balance, 700);
    assert.equal(await dialog.getByRole("button", { name: /구매/ }).count(), 0);
    await dialog.getByRole("link", { name: "꾸미기에서 보기" }).click();
    await page.getByRole("button", { name: "색종이 파티 · 자세히 보기", exact: true }).click();
    await page.getByRole("button", { name: "장착하기", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(account.row.skin_id, "confetti");
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    await page
      .getByRole("button", { name: "달빛 부엉이 · 잠김 · 해금 조건 보기", exact: true })
      .click();
    await page.getByRole("dialog").getByRole("link", { name: "상점에서 구매" }).click();
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    await page.getByRole("button", { name: "달빛 부엉이 · 상품 미리보기", exact: true }).click();
    await page.getByRole("button", { name: "코인 150개로 구매", exact: true }).click();
    await dialog.getByRole("status").filter({ hasText: "구매 완료" }).waitFor();
    assert.equal(account.cosmetics.balance, 550);
    await screenshot(page, "purchased-profile");
    await dialog.getByRole("link", { name: "꾸미기에서 보기" }).click();
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    await page.getByRole("button", { name: "달빛 부엉이 · 자세히 보기", exact: true }).click();
    await page.getByRole("button", { name: "장착하기", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(account.row.icon_id, "owl");
    await page.reload();
    await page
      .getByRole("region", { name: "현재 선택" })
      .getByText("달빛 부엉이", { exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("shop rejects unavailable or malformed ownership, handles purchase errors, and retries", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ locale: "ko-KR" });
    await mockCatalog(page);
    page.setDefaultTimeout(8000);
    const account = await mockAccount(page);
    account.cosmetics.balance = 300;
    let badRead = true,
      failPurchase = true,
      purchases = 0;
    await page.route("**/rest/v1/rpc/cosmetic_state*", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          badRead
            ? { balance: "300", purchases: [{ kind: "skin", item_id: "confetti" }] }
            : account.cosmetics,
        ),
      }),
    );
    await page.route("**/rest/v1/rpc/purchase_cosmetic", (route) => {
      purchases++;
      if (failPurchase)
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: '{"message":"Not enough coins"}',
        });
      account.cosmetics.balance = 0;
      account.cosmetics.purchases = [{ kind: "skin", item_id: "confetti" }];
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...account.cosmetics, purchased: true }),
      });
    });
    await page.goto(`${origin}/shop`);
    await page.getByRole("alert").filter({ hasText: "꾸미기 정보를 불러오지 못했어요" }).waitFor();
    await screenshot(page, "read-error");
    await page.getByRole("button", { name: "색종이 파티 · 상품 미리보기", exact: true }).click();
    assert.equal(
      await page.getByRole("button", { name: "코인 300개로 구매", exact: true }).isDisabled(),
      true,
    );
    await page.keyboard.press("Escape");
    badRead = false;
    await page.getByRole("button", { name: "다시 시도" }).click();
    await page.getByRole("button", { name: "색종이 파티 · 상품 미리보기", exact: true }).click();
    await page.getByRole("button", { name: "코인 300개로 구매", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("alert")
      .filter({ hasText: "코인이 부족해요" })
      .waitFor();
    assert.equal(account.cosmetics.purchases.length, 0);
    failPurchase = false;
    await page.getByRole("button", { name: "코인 300개로 구매", exact: true }).click();
    await page.getByRole("dialog").getByRole("status").filter({ hasText: "구매 완료" }).waitFor();
    assert.equal(purchases, 2);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "핀스트라이프 · 상품 미리보기", exact: true }).click();
    await page.getByRole("dialog").getByText("코인이 부족해요.", { exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "코인 300개로 구매", exact: true }).isDisabled(),
      true,
    );
    await screenshot(page, "insufficient-coins");
  } finally {
    await browser.close();
  }
});

test("shop supports guest login and mobile catalogs without overflow", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const authenticated of [false, true]) {
      const page = await browser.newPage({ locale: "ko-KR", reducedMotion: "reduce" });
      await mockCatalog(page);
      if (authenticated) (await mockAccount(page)).cosmetics.balance = 150;
      await page.goto(`${origin}/shop`);
      await page.getByRole("heading", { name: "코인 상점", exact: true }).waitFor();
      await page.getByRole("button", { name: "일반", exact: true }).click();
      assert.equal(await page.locator("#shop-items > li").count(), 5);
      assert.equal(
        await page.locator("#shop-items").getByText("기본 지급", { exact: true }).count(),
        5,
      );
      assert.equal(await page.locator("#shop-items").getByText(/코인/).count(), 0);
      const skinsTab = page.getByRole("tab", { name: "보드 스킨", exact: true });
      await skinsTab.focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await page.getByRole("tab", { name: "아이콘", exact: true }).getAttribute("aria-selected"),
        "true",
      );
      assert.equal(
        await page
          .getByRole("tab", { name: "아이콘", exact: true })
          .evaluate((tab) => tab === document.activeElement),
        true,
      );
      assert.equal(await page.locator("#shop-items > li").count(), 6);
      for (const [width, height] of [
        [320, 740],
        [375, 812],
        [768, 1024],
        [1440, 900],
      ]) {
        await page.setViewportSize({ width, height });
        await waitForPaint(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        await screenshot(page, `${authenticated ? "account" : "guest"}-icons-${width}`);
      }
      await page.getByRole("button", { name: "달빛 부엉이 · 상품 미리보기", exact: true }).click();
      if (!authenticated) {
        await page.getByRole("dialog").getByRole("link", { name: "로그인" }).waitFor();
        assert.equal(
          await page.getByRole("dialog").getByRole("button", { name: /구매/ }).count(),
          0,
        );
      }
      await page.setViewportSize({ width: 320, height: 740 });
      await waitForPaint(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
      await screenshot(page, `${authenticated ? "account" : "guest"}-mobile-dialog`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("switching accounts discards delayed purchase ownership and balance", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ locale: "ko-KR" });
    await mockCatalog(page);
    page.setDefaultTimeout(8000);
    const account = await mockAccount(page);
    account.cosmetics.balance = 1000;
    let release, notify;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      notify = resolve;
    });
    await page.route("**/rest/v1/rpc/purchase_cosmetic", async (route) => {
      notify();
      await held;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          balance: 700,
          purchases: [{ kind: "skin", item_id: "confetti" }],
          purchased: true,
        }),
      });
    });
    await page.goto(`${origin}/shop`);
    await page.getByRole("button", { name: "색종이 파티 · 상품 미리보기", exact: true }).click();
    await page.getByRole("button", { name: "코인 300개로 구매", exact: true }).click();
    await started;
    account.cosmetics.balance = 0;
    await page.evaluate((name) => {
      const value = document.cookie
        .split("; ")
        .find((item) => item.startsWith(`${name}=`))
        .split("=")[1];
      const session = JSON.parse(atob(value.slice(7).replace(/-/g, "+").replace(/_/g, "/")));
      const payload = JSON.parse(
        atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      session.user.id = payload.sub = "20000000-0000-4000-8000-000000000099";
      const encode = (object) =>
        btoa(JSON.stringify(object)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
      session.access_token = `${session.access_token.split(".")[0]}.${encode(payload)}.fixture`;
      document.cookie = `${name}=base64-${encode(session)}; Path=/; SameSite=Lax`;
      const channel = new BroadcastChannel(name);
      channel.postMessage({ event: "SIGNED_IN", session });
      channel.close();
    }, authCookieName);
    await page.getByRole("dialog").getByText("코인이 부족해요.", { exact: true }).waitFor();
    const received = page.waitForResponse((response) =>
      response.url().includes("/rpc/purchase_cosmetic"),
    );
    release();
    await received;
    await waitForPaint(page);
    assert.equal(await page.getByRole("dialog").getByText("구매 완료", { exact: true }).count(), 0);
    assert.equal(
      await page.getByRole("button", { name: "코인 300개로 구매", exact: true }).isDisabled(),
      true,
    );
    assert.equal(
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "꾸미기에서 보기", exact: true })
        .count(),
      0,
    );
  } finally {
    await browser.close();
  }
});

test("loading and invalid cosmetic responses keep purchases disabled while default items remain usable", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ locale: "ko-KR", reducedMotion: "reduce" });
    await mockCatalog(page);
    page.setDefaultTimeout(8000);
    await mockAccount(page);
    let release,
      first = true,
      response = null;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    await page.route("**/rest/v1/rpc/cosmetic_state*", async (route) => {
      if (first) {
        first = false;
        await held;
      }
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(response) });
    });
    await page.goto(`${origin}/shop`);
    await page.getByText("잔액 불러오는 중…", { exact: true }).waitFor();
    await screenshot(page, "loading");
    await page.getByRole("button", { name: "색종이 파티 · 상품 미리보기", exact: true }).click();
    assert.equal(
      await page.getByRole("button", { name: "코인 300개로 구매", exact: true }).isDisabled(),
      true,
    );
    release();
    await page.keyboard.press("Escape");
    await page.getByRole("alert").filter({ hasText: "꾸미기 정보를 불러오지 못했어요" }).waitFor();
    for (const invalid of [
      { balance: -1, purchases: [] },
      { balance: Number.MAX_SAFE_INTEGER + 1, purchases: [] },
      { balance: 300, purchases: [{ kind: "ability", item_id: "confetti" }] },
      { balance: 300, purchases: [null] },
    ]) {
      response = invalid;
      await page.getByRole("button", { name: "다시 시도" }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "꾸미기 정보를 불러오지 못했어요" })
        .waitFor();
    }
    await page.goto(`${origin}/loadout`);
    await page.getByRole("alert").filter({ hasText: "꾸미기 정보를 불러오지 못했어요" }).waitFor();
    await page.getByRole("checkbox", { name: "보유 중인 것만" }).check();
    assert.equal(await page.locator("#skin-results button").count(), 5);
    await screenshot(page, "partial-loadout");
    await page.getByRole("checkbox", { name: "보유 중인 것만" }).uncheck();
    await page
      .getByRole("button", { name: "색종이 파티 · 잠김 · 해금 조건 보기", exact: true })
      .click();
    assert.equal(
      await page.getByRole("dialog").getByRole("button", { name: "장착하기", exact: true }).count(),
      0,
    );
    await page.keyboard.press("Escape");
    response = { balance: 0, purchases: [{ kind: "skin", item_id: "confetti" }] };
    await page.getByRole("button", { name: "다시 시도" }).click();
    await page.getByRole("button", { name: "색종이 파티 · 자세히 보기", exact: true }).waitFor();
  } finally {
    await browser.close();
  }
});
