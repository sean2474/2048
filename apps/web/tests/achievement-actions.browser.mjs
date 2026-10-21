import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { startServerFixture, fixturePlayer } from "./server-fixture.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const metadata = { status: "published", revision: 1, publishedOnce: true, updatedAt: "2026-10-22T00:00:00Z", sortOrder: 0 };
const icon = { ...metadata, id: "attendance-king", name: "Attendance king", description: "An attendance reward", acquisition: "achievement", price: 0, color: "#f0af12", imagePath: "profile-icons/attendance-king.svg" };
const catalog = { skins: [], profileIcons: [icon], achievements: [{ ...metadata, id: "checkin-30", name: "Attendance king", description: "Visit 30 days", metric: "attendance_streak", target: 30, reward: { kind: "icon", iconId: icon.id } }] };
const initial = () => ({ attendance: { streak: 29, bestStreak: 29, lastDay: "2026-10-21", today: "2026-10-22", checkedInToday: false, nextCheckInAt: "2026-10-22T15:00:00Z" }, wins: 0, highestTile: 2, unlocks: [] });

test("automatic attendance uses one server action, updates RSC cards and preserves URL filtering", { timeout: 120000 }, async t => {
  let data = initial();
  const fixture = await startServerFixture({ handle: async url => {
    if (url.pathname.endsWith("/rpc/content_catalog")) return { data: catalog };
    if (/\/(achievement_state|sync_achievements)$/.test(url.pathname)) return { data };
    if (url.pathname.endsWith("/rpc/check_in")) {
      data = { ...data, attendance: { ...data.attendance, streak: 30, bestStreak: 30, checkedInToday: true }, unlocks: [{ achievementId: "checkin-30", unlockedAt: "2026-10-22T00:00:00Z" }] };
      return { data };
    }
  } });
  t.after(fixture.close);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ locale: "en", reducedMotion: "reduce" });
  await context.addCookies([fixture.cookie(fixturePlayer)]);
  const page = await context.newPage(), browserMutations = [], actionRequests = [], errors = [];
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (/\/(sync_achievements|check_in)$/.test(new URL(request.url()).pathname)) browserMutations.push(request.url());
    if (request.headers()["next-action"]) actionRequests.push(request);
  });
  await page.goto(fixture.origin + "/achievements");
  await page.getByRole("status").filter({ hasText: /^Checked in today$/ }).waitFor();
  await page.locator("#checkin-30").getByText("Permanently unlocked").waitFor();
  await page.getByRole("status").filter({ hasText: "New rewards unlocked: Attendance king" }).waitFor();
  assert.equal(fixture.requests.filter(request => request.path.endsWith("/rpc/check_in")).length, 1);
  assert.equal(browserMutations.length, 0);
  assert.equal(actionRequests.length, 1);
  await page.getByRole("link", { name: /Completed achievements/ }).click();
  await page.waitForURL(/filter=completed/);
  await page.locator("#checkin-30").getByText("Permanently unlocked").waitFor();
  assert.equal(await page.locator("#achievement-rewards > li").count(), 1);
  await page.getByRole("link", { name: /In-progress achievements/ }).click();
  await page.getByText("No achievements in this view.").waitFor();
  assert.equal(fixture.requests.filter(request => request.path.endsWith("/rpc/check_in")).length, 1);
  assert.deepEqual(errors, []);
});

test("attendance failure retries through the action and a guest never mutates", { timeout: 120000 }, async t => {
  let data = initial(), fail = true, failSync = true;
  const fixture = await startServerFixture({ handle: async url => {
    if (url.pathname.endsWith("/rpc/content_catalog")) return { data: catalog };
    if (url.pathname.endsWith("/rpc/sync_achievements") && failSync) return { status: 503, data: {} };
    if (/\/(achievement_state|sync_achievements)$/.test(url.pathname)) return { data };
    if (url.pathname.endsWith("/rpc/check_in")) {
      if (fail) return { status: 503, data: { message: "Attendance unavailable" } };
      data = { ...data, attendance: { ...data.attendance, checkedInToday: true } };
      return { data };
    }
  } });
  t.after(fixture.close);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ locale: "en" });
  await context.addCookies([fixture.cookie()]);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(fixture.origin + "/achievements");
  await page.getByRole("alert").filter({ hasText: "Could not load achievement progress." }).waitFor();
  assert.equal(fixture.requests.filter(request => request.path.endsWith("/rpc/check_in")).length, 0);
  failSync = false;
  await page.getByRole("button", { name: "Reload unlock information", exact: true }).click();
  await page.getByText("Could not save attendance. Please try again.").waitFor();
  assert.equal(fixture.requests.filter(request => request.path.endsWith("/rpc/check_in")).length, 1);
  fail = false;
  await page.getByRole("button", { name: "Retry attendance", exact: true }).click();
  await page.getByRole("status").filter({ hasText: /^Checked in today$/ }).waitFor();
  assert.equal(fixture.requests.filter(request => request.path.endsWith("/rpc/check_in")).length, 2);
  const guest = await browser.newPage({ locale: "en" });
  const before = fixture.requests.filter(request => /\/(sync_achievements|check_in)$/.test(request.path)).length;
  await guest.goto(fixture.origin + "/achievements");
  await guest.getByRole("main").getByText("Sign in to record attendance and achievements.").waitFor();
  assert.equal(fixture.requests.filter(request => /\/(sync_achievements|check_in)$/.test(request.path)).length, before);
});

test("a successful unchanged action repairs a failed server read without a refresh loop", { timeout: 120000 }, async t => {
  let reads = 0, persistentFailure = false;
  const data = { ...initial(), attendance: { ...initial().attendance, checkedInToday: true }, unlocks: [{ achievementId: "checkin-30", unlockedAt: "2026-10-22T00:00:00Z" }] };
  const fixture = await startServerFixture({ handle: async (url, request) => {
    if (url.pathname.endsWith("/rpc/content_catalog")) return { data: catalog };
    if (url.pathname.endsWith("/rpc/achievement_state") && request.method === "GET") {
      reads++;
      if (persistentFailure || reads === 1) return { status: 503, data: {} };
    }
    if (/\/(achievement_state|sync_achievements)$/.test(url.pathname)) return { data };
  } });
  t.after(fixture.close);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ locale: "en" });
  await context.addCookies([fixture.cookie()]);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(fixture.origin + "/achievements");
  await page.getByRole("main").locator("#checkin-30").getByText("Permanently unlocked").waitFor();
  assert.equal(reads, 2, "one successful action retries the failed read even when no progress changed");
  assert.equal(await page.getByRole("alert").filter({ hasText: "Could not load achievement progress." }).count(), 0);
  assert.equal(fixture.requests.filter(request => request.path.endsWith("/rpc/check_in")).length, 0);
  await context.close();

  persistentFailure = true; reads = 0;
  const retryContext = await browser.newContext({ locale: "en" });
  await retryContext.addCookies([fixture.cookie()]);
  const retryPage = await retryContext.newPage();
  await retryPage.goto(fixture.origin + "/achievements");
  await retryPage.getByRole("alert").filter({ hasText: "Could not load achievement progress." }).waitFor();
  const deadline = Date.now() + 10000;
  while (reads < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(reads, 2, "the automatic recovery attempts one additional server read");
  // Allow the RSC refresh response to render before checking that it did not recurse.
  await retryPage.waitForLoadState("networkidle");
  assert.equal(reads, 2, "a persistent read failure must not trigger a refresh loop");
  assert.equal(await retryPage.getByRole("button", { name: "Reload unlock information", exact: true }).count(), 1);
});
