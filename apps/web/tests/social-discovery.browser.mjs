import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mockAccount } from "./browser-fixtures.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const { Server } = createRequire(new URL("../../socket/package.json", import.meta.url))("socket.io");
const origin = process.env.SOCIAL_TEST_ORIGIN || "http://[::1]:3001";
const artifacts = new URL("../../../docs/social/", import.meta.url).pathname;
const friend = { id: "10000000-0000-4000-8000-000000000002", name: "타일친구", icon_id: "owl", relationship: "friend", unread: 3 };
const pending = { id: "10000000-0000-4000-8000-000000000003", name: "타일대장", icon_id: "fox", relationship: "incoming", unread: 0 };
const newcomer = { id: "10000000-0000-4000-8000-000000000004", name: "타일새싹", icon_id: "guest", relationship: null, unread: 0 };

async function mockPresence(page) {
  const server = createServer();
  const io = new Server(server, { allowUpgrades: false, cors: { origin: "*" } });
  let value = { friends: { [friend.id]: "online" } };
  io.on("connection", socket => socket.on("friends", () => socket.emit("friendPresence", value)));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  await page.route("**/socket.io/**", async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `http://127.0.0.1:${server.address().port}${url.pathname}${url.search}` });
    await route.fulfill({ response, headers: { ...response.headers(), "access-control-allow-origin": "*" } });
  });
  return { update(next) { value = next; io.emit("friendPresence", value); }, close: async () => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    const closed = new Promise(resolve => io.close(resolve)); server.closeAllConnections(); await closed;
  } };
}

test("DB autocomplete handles debounce, stale replies, Korean composition, selection and mobile layout", { timeout: 90000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let releaseSlow;
  let presence;
  try {
    await mkdir(artifacts, { recursive: true });
    const page = await browser.newPage({ locale: "ko-KR", viewport: { width: 1440, height: 900 } });
    const errors = [], queries = [];
    page.on("pageerror", error => errors.push(error.message));
    await mockAccount(page);
    presence = await mockPresence(page);
    await page.route("**/rest/v1/rpc/social_players", async route => {
      const body = route.request().postDataJSON() ?? {};
      if (body.p_query) queries.push(body.p_query);
      if (body.p_query === "slow") await new Promise(resolve => { releaseSlow = resolve; });
      if (body.p_query === "error") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Fixture search failure" }) });
      const data = body.p_target ? [friend, pending, newcomer].filter(person => person.id === body.p_target)
        : body.p_query === "slow" ? [{ ...newcomer, name: "Stale player" }]
        : body.p_query ? [friend, pending, newcomer].filter(person => person.name.includes(body.p_query)) : [friend, pending];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    });
    await page.goto(`${origin}/friends`);
    const input = page.getByRole("combobox", { name: "닉네임 검색 (1~32자)" });
    await input.pressSequentially("타일", { delay: 60 });
    await page.getByRole("option", { name: "타일친구 친구", exact: true }).waitFor();
    assert.deepEqual(queries, ["타일"]);
    await input.press("ArrowDown");
    assert.equal(await page.getByRole("option", { name: "타일친구 친구", exact: true }).getAttribute("aria-selected"), "true");
    await input.press("ArrowDown"); await input.press("Enter");
    assert.equal(await page.getByRole("listbox").count(), 0);
    const results = page.locator("section").filter({ has: page.getByRole("heading", { name: "검색 결과", exact: true }) });
    await results.getByText("타일대장", { exact: true }).waitFor();
    assert.equal(await results.getByText("타일친구", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "닫기", exact: true }).click();

    // A superseded database response must never replace the current query.
    const slowStarted = page.waitForRequest(request => request.url().endsWith("/rpc/social_players") && request.postDataJSON()?.p_query === "slow");
    await input.fill("slow"); await slowStarted;
    await input.fill("타일새");
    await page.getByRole("option", { name: "타일새싹", exact: true }).waitFor();
    releaseSlow(); releaseSlow = undefined;
    await page.waitForTimeout(100);
    assert.equal(await page.getByRole("option", { name: "Stale player" }).count(), 0);

    await input.fill("타일새 ");
    await page.getByRole("option", { name: "타일새싹", exact: true }).waitFor();
    await input.press("Escape");
    assert.equal(await input.getAttribute("aria-expanded"), "false");
    assert.equal(await input.inputValue(), "타일새 ");
    await input.fill("");
    const beforeComposition = queries.length;
    await input.dispatchEvent("compositionstart");
    await input.fill("타");
    await page.waitForTimeout(400);
    assert.equal(queries.length, beforeComposition);
    await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
    assert.equal(await results.count(), 0);
    await input.dispatchEvent("compositionend");
    await page.getByRole("option", { name: "타일새싹", exact: true }).waitFor();
    await input.press("Tab");
    assert.equal(await input.getAttribute("aria-expanded"), "false");

    await input.fill("nobody"); await page.getByText("검색된 플레이어가 없어요.", { exact: true }).waitFor();
    await input.fill("error"); await page.getByText("자동완성을 불러오지 못했어요.", { exact: false }).waitFor();
    await input.fill("타일"); await page.getByRole("option", { name: "타일새싹", exact: true }).waitFor();
    await page.screenshot({ path: `${artifacts}/autocomplete-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
    await page.screenshot({ path: `${artifacts}/autocomplete-mobile.png`, fullPage: true });
    await page.getByRole("option", { name: "타일새싹", exact: true }).click();
    await results.getByRole("button", { name: "친구 추가", exact: true }).waitFor();
    await input.fill("");
    assert.equal(await page.getByRole("listbox").count(), 0);
    assert.equal(await page.getByRole("button", { name: "검색", exact: true }).isDisabled(), true);
    assert.deepEqual(errors, []);
  } finally { releaseSlow?.(); await presence?.close(); await browser.close(); }
});

test("dashboard friends show requests and unread counts, open a chat, and recover empty/error states", { timeout: 90000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let presence;
  try {
    await mkdir(artifacts, { recursive: true });
    const page = await browser.newPage({ locale: "ko-KR", viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const fixture = await mockAccount(page);
    presence = await mockPresence(page);
    let contacts = [friend, pending], fail = false, delay = 0;
    await page.route("**/rest/v1/rpc/social_players", async route => {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      await route.fulfill({ status: fail ? 503 : 200, contentType: "application/json", body: JSON.stringify(fail ? { message: "Fixture contacts failure" } : contacts) });
    });
    await page.route("**/rest/v1/rpc/social_messages", route => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto(origin);
    const panel = page.getByRole("region", { name: "내 친구", exact: true });
    await panel.getByText("타일친구", { exact: true }).waitFor();
    assert.equal(await panel.getByText("타일대장", { exact: true }).count(), 0);
    await panel.getByRole("link", { name: "받은 친구 요청 1개" }).waitFor();
    await panel.getByLabel("읽지 않은 메시지 3개").waitFor();
    await panel.getByText("온라인", { exact: true }).waitFor();
    assert.equal(await panel.getByRole("button", { name: "타일친구님에게 대전 신청" }).isDisabled(), false);
    assert.equal(await panel.getByRole("button", { name: "타일친구님 관전" }).isDisabled(), true);
    presence.update({ friends: { [friend.id]: "playing" } });
    await panel.getByText("게임 중", { exact: true }).waitFor();
    assert.equal(await panel.getByRole("button", { name: "타일친구님에게 대전 신청" }).isDisabled(), true);
    assert.equal(await panel.getByRole("link", { name: "타일친구님 관전" }).getAttribute("href"), `/watch/${friend.id}`);
    assert.equal(await page.locator("header nav a[href='/friends']").count(), 0);
    assert.equal(await page.getByRole("region", { name: "게임 미리보기" }).count(), 0);
    await page.screenshot({ path: `${artifacts}/dashboard-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
    await page.screenshot({ path: `${artifacts}/dashboard-mobile.png`, fullPage: true });
    await panel.getByRole("link", { name: "타일친구님에게 메시지" }).click();
    await page.getByRole("heading", { name: "타일친구님과의 대화" }).waitFor();
    await page.getByText("친구에게 첫 인사를 건네 보세요.").waitFor();
    await page.getByText("게임 중", { exact: true }).waitFor();
    for (const [state, label] of [["online", "온라인"], ["offline", "오프라인"], ["solo", "싱글플레이 중"]]) {
      presence.update({ friends: { [friend.id]: state } });
      await page.getByText(label, { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "타일친구님에게 대전 신청" }).isDisabled(), state !== "online");
      assert.equal(await page.getByRole("button", { name: "타일친구님 관전" }).isDisabled(), true);
      assert.equal(await page.getByRole("link", { name: "타일친구님 관전" }).count(), 0);
    }
    presence.update({ error: "presence_unavailable" });
    await page.getByText("상태 확인 불가", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "타일친구님에게 대전 신청" }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "타일친구님 관전" }).isDisabled(), true);

    contacts = []; delay = 800;
    await page.goto(origin);
    await panel.getByText("친구 목록 불러오는 중…").waitFor();
    await panel.getByText("아직 친구가 없어요.").waitFor();
    delay = 0; fail = true;
    await page.reload(); await panel.getByRole("alert").waitFor();
    fail = false; contacts = [friend];
    await panel.getByRole("button", { name: "친구 목록 다시 불러오기", exact: true }).click();
    await panel.getByText("타일친구", { exact: true }).waitFor();

    fixture.row.locale = "en";
    await page.reload();
    await page.getByRole("region", { name: "My friends", exact: true }).getByRole("link", { name: "View all friends" }).waitFor();
    await page.goto(`${origin}/friends?chat=${pending.id}`);
    assert.equal(await page.getByRole("heading", { name: /Messages with/ }).count(), 0);
    await page.getByText("Select a friend to open your conversation.", { exact: true }).waitFor();
    assert.deepEqual(errors, []);

    const guest = await browser.newPage({ locale: "ko-KR", viewport: { width: 375, height: 812 } });
    await guest.goto(origin);
    await guest.getByRole("region", { name: "내 친구", exact: true }).getByRole("link", { name: "로그인", exact: true }).waitFor();
  } finally { await presence?.close(); await browser.close(); }
});
