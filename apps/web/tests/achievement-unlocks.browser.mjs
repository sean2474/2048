import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { authCookieName, mockAccount, mockCatalog } from "./browser-fixtures.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const origin = process.env.WEB_TEST_ORIGIN ?? "http://[::1]:3001";
const artifacts = fileURLToPath(new URL("../../../docs/achievement-rewards/", import.meta.url));

test("30th attendance unlocks a permanent profile, duplicate click is blocked, and equip persists", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({ locale: "ko-KR", reducedMotion: "reduce" });
    const page = await context.newPage(), errors = [];
    await mockCatalog(page);
    page.setDefaultTimeout(8000);
    page.on("pageerror", error => errors.push(error.message));
    const account = await mockAccount(page);
    account.achievements.attendance = { ...account.achievements.attendance, streak: 29, bestStreak: 29, lastDay: "2026-10-16" };
    account.achievements.unlocks.push({ achievementId: "checkin-7", unlockedAt: "2026-09-24T01:00:00Z" });
    let checkIns = 0;
    await page.route("**/rest/v1/rpc/check_in", async route => {
      checkIns++;
      await new Promise(resolve => setTimeout(resolve, 200));
      account.achievements.attendance = { ...account.achievements.attendance, streak: 30, bestStreak: 30, lastDay: "2026-10-17", checkedInToday: true };
      account.achievements.unlocks.push({ achievementId: "checkin-30", unlockedAt: "2026-10-17T01:00:00Z" });
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(account.achievements) });
    });
    await page.goto(`${origin}/achievements`);
    const button = page.getByRole("button", { name: "오늘 출석하기", exact: true });
    await page.locator("button:enabled").filter({ hasText: /^오늘 출석하기$/ }).waitFor();
    await button.evaluate(el => { el.click(); el.click(); });
    await page.getByRole("button", { name: "오늘 출석 완료", exact: true }).waitFor();
    assert.equal(checkIns, 1);
    assert.equal(await page.getByRole("button", { name: "오늘 출석 완료", exact: true }).isDisabled(), true);
    await page.getByRole("status").filter({ hasText: "새 보상이 해금됐어요" }).waitFor();
    await page.screenshot({ path: `${artifacts}unlocked.png`, fullPage: true });
    await page.locator("#checkin-30").getByRole("link", { name: "내 꾸미기" }).click();
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    const card = page.getByRole("button", { name: "출근왕 · 자세히 보기", exact: true });
    await card.focus(); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "장착하기", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(account.row.icon_id, "attendance-king");
    assert.equal(await card.evaluate(el => el === document.activeElement), true);
    account.achievements.attendance.streak = 0;
    await page.reload();
    await page.getByRole("region", { name: "현재 선택" }).getByText("출근왕", { exact: true }).waitFor();
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    await page.getByRole("checkbox", { name: "보유 중인 것만" }).check();
    assert.equal(await page.locator("#icons-panel button").count(), 2);
    await page.getByRole("tab", { name: "보드 스킨", exact: true }).click();
    await page.getByRole("button", { name: "희귀", exact: true }).click();
    await page.getByRole("button", { name: "새벽의 서약 · 자세히 보기", exact: true }).click();
    await dialog.getByRole("button", { name: "장착하기", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(account.row.skin_id, "dawn-oath");
    await page.reload();
    await page.getByRole("region", { name: "현재 선택" }).getByText("새벽의 서약", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("locked rewards stay previewable, ownership errors fail closed, and attendance retries safely", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ locale: "ko-KR" });
    await mockCatalog(page);
    page.setDefaultTimeout(8000);
    const account = await mockAccount(page);
    let failRead = true, failCheckIn = true;
    await page.route("**/rest/v1/rpc/sync_achievements*", route => route.fulfill({ status: failRead ? 500 : 200, contentType: "application/json", body: JSON.stringify(failRead ? { message: "Fixture failure" } : account.achievements) }));
    await page.route("**/rest/v1/rpc/check_in", route => {
      if (failCheckIn) return route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"Fixture failure"}' });
      account.achievements.attendance = { ...account.achievements.attendance, streak: 1, bestStreak: 1, checkedInToday: true };
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(account.achievements) });
    });
    await page.goto(`${origin}/loadout`);
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    await page.getByRole("button", { name: "출근왕 · 잠김 · 해금 조건 보기", exact: true }).click();
    const dialog = page.getByRole("dialog");
    assert.equal(await dialog.getByRole("button", { name: "장착하기", exact: true }).count(), 0);
    await dialog.getByText("한국 시간 기준 30일 연속 출석", { exact: true }).waitFor();
    await page.screenshot({ path: `${artifacts}locked-dialog.png`, fullPage: true });
    await page.keyboard.press("Escape");
    await page.screenshot({ path: `${artifacts}partial-loadout.png`, fullPage: true });
    await page.goto(`${origin}/achievements`);
    await page.getByRole("alert").filter({ hasText: "업적 진행도를 불러오지 못했어요" }).waitFor();
    await page.screenshot({ path: `${artifacts}error.png`, fullPage: true });
    await page.goto(`${origin}/loadout`);
    await page.getByRole("tab", { name: "아이콘", exact: true }).click();
    await page.getByRole("button", { name: "해금 정보 다시 불러오기" }).waitFor();
    failRead = false;
    await page.getByRole("button", { name: "해금 정보 다시 불러오기" }).click();
    await page.getByRole("checkbox", { name: "보유 중인 것만" }).check();
    assert.equal(await page.locator("#icons-panel button").count(), 1);
    assert.equal(account.row.icon_id, "fox");
    await page.goto(`${origin}/achievements`);
    await page.getByRole("button", { name: "오늘 출석하기", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "출석을 저장하지 못했어요" }).waitFor();
    await page.screenshot({ path: `${artifacts}checkin-error.png`, fullPage: true });
    failCheckIn = false;
    await page.getByRole("button", { name: "오늘 출석하기", exact: true }).click();
    await page.getByRole("button", { name: "오늘 출석 완료", exact: true }).waitFor();
    assert.equal(account.achievements.attendance.streak, 1);
  } finally { await browser.close(); }
});

test("achievement collection has guest, active and unlocked responsive views with readable progress", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  await mkdir(artifacts, { recursive: true });
  try {
    for (const authenticated of [false, true]) {
      const page = await browser.newPage({ locale: "ko-KR", reducedMotion: "reduce" });
    await mockCatalog(page);
      if (authenticated) {
        const account = await mockAccount(page);
        account.achievements.attendance.streak = 12;
        account.achievements.attendance.bestStreak = 12;
        account.achievements.wins = 6;
        account.achievements.highestTile = 1024;
        account.achievements.unlocks.push({ achievementId: "checkin-7", unlockedAt: "2026-10-12T01:00:00Z" });
      }
      await page.goto(`${origin}/achievements`);
      await page.getByRole("heading", { name: "업적", exact: true }).waitFor();
      if (authenticated) await page.getByRole("button", { name: "오늘 출석하기", exact: true }).waitFor();
      else { await page.getByText("로그인하고 출석과 업적을 기록하세요.").waitFor(); assert.equal(await page.getByRole("progressbar").count(), 0); }
      await page.locator("#achievement-rewards > li").first().waitFor();
      assert.equal(await page.locator("#achievement-rewards > li").count(), 10);
      for (const [width, height] of [[375, 812], [768, 1024], [1440, 900]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        await page.screenshot({ path: `${artifacts}${authenticated ? "active" : "guest"}-${width}x${height}.png`, fullPage: true, animations: "disabled" });
      }
      if (authenticated) {
        await page.goto(`${origin}/settings`);
        await page.getByText("English", { exact: true }).click();
        await page.getByRole("heading", { name: "Game preferences", exact: true }).waitFor();
        await page.goto(`${origin}/achievements`);
        await page.getByRole("heading", { name: "Attendance King", exact: true }).waitFor();
        await page.setViewportSize({ width: 375, height: 812 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
        await page.screenshot({ path: `${artifacts}english-mobile.png`, fullPage: true });
      }
      await page.close();
    }
  } finally { await browser.close(); }
});

test("switching accounts discards delayed progress and check-in responses", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const pendingCall of ["sync_achievements", "check_in"]) {
      const context = await browser.newContext({ locale: "ko-KR" });
      const page = await context.newPage();
    await mockCatalog(page);
      page.setDefaultTimeout(8000);
      const account = await mockAccount(page);
      account.achievements.attendance = { ...account.achievements.attendance, streak: 29, bestStreak: 29 };
      const oldState = { ...account.achievements, attendance: { ...account.achievements.attendance, streak: 30, checkedInToday: true }, unlocks: [{ achievementId: "checkin-30", unlockedAt: "2026-10-17T01:00:00Z" }] };
      let release;
      const held = new Promise(resolve => { release = resolve; });
      let pendingStarted;
      const started = new Promise(resolve => { pendingStarted = resolve; });
      let delayNext = true;
      await page.route(`**/rest/v1/rpc/${pendingCall}*`, async route => {
        if (delayNext) {
          delayNext = false;
          pendingStarted();
          await held;
          return route.fulfill({ contentType: "application/json", body: JSON.stringify(oldState) });
        }
        return route.fulfill({ contentType: "application/json", body: JSON.stringify(account.achievements) });
      });
      await page.goto(`${origin}/achievements`);
      if (pendingCall === "check_in") await page.getByRole("button", { name: "오늘 출석하기", exact: true }).click();
      await started;
      if (pendingCall === "sync_achievements") {
        await page.getByText("업적을 불러오는 중…").waitFor();
        await page.screenshot({ path: `${artifacts}loading.png`, fullPage: true });
      }
      account.achievements.attendance = { ...account.achievements.attendance, streak: 0, bestStreak: 0 };
      await page.evaluate(name => {
        const value = document.cookie.split("; ").find(item => item.startsWith(`${name}=`)).split("=")[1];
        const session = JSON.parse(atob(value.slice(7).replace(/-/g, "+").replace(/_/g, "/")));
        const payload = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        session.user.id = payload.sub = "20000000-0000-4000-8000-000000000099";
        const encode = object => btoa(JSON.stringify(object)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
        session.access_token = `${session.access_token.split(".")[0]}.${encode(payload)}.fixture`;
        document.cookie = `${name}=base64-${encode(session)}; Path=/; SameSite=Lax`;
        const channel = new BroadcastChannel(name);
        channel.postMessage({ event: "SIGNED_IN", session });
        channel.close();
      }, authCookieName);
      await page.locator('#checkin-30 progress[value="0"]').waitFor();
      const received = page.waitForResponse(response => response.url().includes(`/rpc/${pendingCall}`));
      release();
      await received;
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator("#checkin-30 progress").getAttribute("value"), "0");
      assert.equal(await page.getByText(/새 보상이 해금됐어요/).count(), 0);
      assert.equal(await page.getByRole("button", { name: "오늘 출석하기", exact: true }).isEnabled(), true);
      await context.close();
    }
  } finally { await browser.close(); }
});
