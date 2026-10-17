import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { authCookieName, mockAccount } from "./browser-fixtures.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const origin = "http://[::1]:3001";
const artifacts = fileURLToPath(new URL("../../../docs/password-reset", import.meta.url));
const genericNotice = "If an account exists for this email, a reset link has been sent. Open it in this browser.";
const invalidNotice = "This reset link is missing, expired or already used. Request a new link and open it in the same browser.";
const recoveryUserId = "10000000-0000-4000-8000-000000000099";
const otherUserId = "10000000-0000-4000-8000-000000000088";

function mainUser(page) {
  return page.evaluate(name => {
    const value = document.cookie.split("; ").find(cookie => cookie.startsWith(`${name}=`))?.split("=")[1];
    return value ? JSON.parse(atob(value.slice(7).replace(/-/g, "+").replace(/_/g, "/"))).user.id : null;
  }, authCookieName);
}

async function fixture(browser, options = {}) {
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(30000);
  const account = await mockAccount(page, options.mainAccountId ?? recoveryUserId); account.row.locale = "en";
  const requests = { recover: [], exchange: [], update: [], updateUsers: [], logout: [], logoutUsers: [] };
  const usedCodes = new Set();
  const user = { id: recoveryUserId, aud: "authenticated", role: "authenticated", email: "fixture@example.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(type => {
    if (location.search.includes("recovery_code")) {
      const value = JSON.stringify(`fixture-verifier/${type}`);
      localStorage.setItem("duo-password-recovery-code-verifier", value);
    }
  }, options.redirectType ?? "PASSWORD_RECOVERY");
  const handleAuth = async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.endsWith("/recover")) {
      requests.recover.push({ body: request.postDataJSON(), url: url.href });
      if (options.recoverWait) await options.recoverWait;
      return route.fulfill({ status: options.recoverStatus ?? 200, headers: { "x-supabase-api-version": "2024-01-01", "access-control-expose-headers": "X-Supabase-Api-Version" }, json: options.recoverStatus ? { code: options.recoverCode ?? "over_email_send_rate_limit", msg: "Do not leak this server detail" } : {} });
    }
    if (url.pathname.endsWith("/token")) {
      const body = request.postDataJSON();
      requests.exchange.push(body);
      const expectedChallenge = requests.recover.at(-1)?.body.code_challenge;
      const badVerifier = !body.code_verifier || (expectedChallenge && createHash("sha256").update(body.code_verifier).digest("base64url") !== expectedChallenge);
      if (options.exchangeStatus || badVerifier || usedCodes.has(body.auth_code)) return route.fulfill({ status: options.exchangeStatus ?? 400, json: { code: "flow_state_not_found", msg: "Expired" } });
      usedCodes.add(body.auth_code);
      const expires = Math.floor(Date.now() / 1000) + 3600;
      const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires, role: "authenticated" })).toString("base64url")}.fixture`;
      return route.fulfill({ json: { access_token: token, refresh_token: "fixture-recovery", expires_in: 3600, token_type: "bearer", user } });
    }
    if (url.pathname.endsWith("/user") && request.method() === "PUT") {
      requests.update.push(request.postDataJSON());
      requests.updateUsers.push(JSON.parse(Buffer.from(request.headers().authorization.split(".")[1], "base64url").toString()).sub);
      if (options.updateStatus) return route.fulfill({ status: options.updateStatus, headers: { "x-supabase-api-version": "2024-01-01", "access-control-expose-headers": "X-Supabase-Api-Version" }, json: { code: "same_password", msg: "New password should be different" } });
      return route.fulfill({ json: user });
    }
    if (url.pathname.endsWith("/user") && options.switchAfterVerification) {
      options.switchAfterVerification = false;
      const otherId = "10000000-0000-4000-8000-000000000088", expires = Math.floor(Date.now() / 1000) + 3600;
      const otherToken = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: otherId, exp: expires, role: "authenticated" })).toString("base64url")}.fixture`;
      const other = { access_token: otherToken, refresh_token: "fixture-other-account", expires_at: expires, expires_in: 3600, token_type: "bearer", user: { ...user, id: otherId } };
      await page.evaluate(({ name, value }) => { document.cookie = `${name}=base64-${value}; Path=/; SameSite=Lax`; }, { name: authCookieName, value: Buffer.from(JSON.stringify(other)).toString("base64url") });
      return route.fulfill({ json: user });
    }
    if (url.pathname.endsWith("/user") && options.userId) return route.fulfill({ json: { ...user, id: options.userId } });
    if (url.pathname.endsWith("/user")) {
      const id = JSON.parse(Buffer.from(request.headers().authorization.split(".")[1], "base64url").toString()).sub;
      return route.fulfill({ json: { ...user, id } });
    }
    if (url.pathname.endsWith("/logout")) {
      requests.logout.push(url.searchParams.get("scope"));
      requests.logoutUsers.push(JSON.parse(Buffer.from(request.headers().authorization.split(".")[1], "base64url").toString()).sub);
      await options.onLogout?.();
      return route.fulfill({ status: options.logoutStatus ?? 200, json: {} });
    }
    return route.fallback();
  };
  await page.route("https://*.supabase.co/auth/v1/**", handleAuth);
  const newTab = async () => {
    const tab = await context.newPage();
    tab.setDefaultTimeout(10000); tab.setDefaultNavigationTimeout(30000);
    const nextAccount = await mockAccount(tab, options.mainAccountId ?? recoveryUserId); nextAccount.row.locale = "en";
    await tab.route("https://*.supabase.co/auth/v1/**", handleAuth);
    return tab;
  };
  return { context, page, requests, newTab };
}

test("forgot password is discoverable, prevents duplicate sends and keeps account existence private", { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let release;
  try {
    const { page, requests } = await fixture(browser, { recoverWait: new Promise(resolve => { release = resolve; }) });
    await page.goto(`${origin}/login`);
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.getByRole("heading", { name: "Reset password", exact: true }).waitFor();
    await page.getByLabel("Email", { exact: true }).fill("unknown@example.invalid");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await page.waitForFunction(() => document.querySelector('form[aria-busy="true"]'));
    assert.equal(await page.getByRole("button", { name: "Please wait..." }).isDisabled(), true);
    release();
    await page.getByRole("status").filter({ hasText: genericNotice }).waitFor();
    assert.equal(requests.recover.length, 1);
    assert.equal(requests.recover[0].body.email, "unknown@example.invalid");
    assert.equal(requests.recover[0].body.code_challenge_method, "s256");
    assert.equal(new URL(requests.recover[0].url).searchParams.get("redirect_to"), `${origin}/auth/callback?type=recovery`);
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    fs.mkdirSync(artifacts, { recursive: true });
    for (const [width, height] of [[375, 812], [768, 1024], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(artifacts, `request-${width}x${height}.png`) });
    }
  } finally { release?.(); await browser.close(); }
});

test("recovery never replaces or cleans up an unrelated main login session", { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const { page, requests } = await fixture(browser, { mainAccountId: otherUserId });
    await page.goto(`${origin}/reset-password?recovery_code=fixture-code`);
    await page.getByLabel("New password", { exact: true }).fill("replacement-password");
    assert.equal(await mainUser(page), otherUserId, "exchanging the recovery code must preserve the main session");
    await page.getByLabel("Confirm password", { exact: true }).fill("replacement-password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await page.getByRole("status").filter({ hasText: "Your password has been updated. Log in with your new password." }).waitFor();
    assert.equal(await mainUser(page), otherUserId, "recovery cleanup must preserve the main session");
    assert.deepEqual(requests.updateUsers, [recoveryUserId]);
    assert.deepEqual(requests.logoutUsers, [recoveryUserId]);
    assert.deepEqual(requests.logout, ["global"]);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("duo-password-recovery"))), false, "neither recovery tokens nor the consumed verifier may persist");
  } finally { await browser.close(); }
});

test("reset request failures are actionable without exposing provider details", { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const { page, requests } = await fixture(browser, { recoverStatus: 429 });
    await page.goto(`${origin}/forgot-password`);
    await page.getByLabel("Email", { exact: true }).fill("fixture@example.invalid");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await page.getByRole("alert").filter({ hasText: "Could not send a reset link. Wait a moment and try again." }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Send reset link" }).isDisabled(), false);
    assert.equal(requests.recover.length, 1);
    assert.equal((await page.locator("body").innerText()).includes("Do not leak"), false);
  } finally { await browser.close(); }
});

test("missing, expired and non-recovery sessions cannot change a password", { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const options of [{}, { exchangeStatus: 400 }, { redirectType: "SIGN_IN" }]) {
      const { context, page, requests } = await fixture(browser, options);
      await page.goto(`${origin}/reset-password${Object.keys(options).length ? "?recovery_code=invalid-code" : ""}`);
      await page.getByRole("alert").filter({ hasText: invalidNotice }).waitFor();
      assert.equal(await page.locator('input[type="password"]').count(), 0);
      assert.equal(requests.update.length, 0);
      assert.equal(new URL(page.url()).search, "");
      await page.getByRole("link", { name: "Request a new reset link" }).waitFor();
      await context.close();
    }
  } finally { await browser.close(); }
});

test("recovery checks confirmation and length, changes once, signs out and rejects refresh replay", { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const { page, requests } = await fixture(browser);
    await page.goto(`${origin}/auth/callback?type=recovery&code=fixture-code&next=https://example.invalid/steal`);
    const password = page.getByLabel("New password", { exact: true });
    await password.fill("too-short");
    await page.getByLabel("Confirm password", { exact: true }).fill("too-short");
    await page.getByRole("button", { name: "Save new password" }).click();
    assert.equal(requests.update.length, 0);
    await password.fill("새비밀번호-123456");
    await page.getByLabel("Confirm password", { exact: true }).fill("different-password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await page.getByRole("alert").filter({ hasText: "Passwords do not match." }).waitFor();
    assert.equal(requests.update.length, 0);
    await page.getByLabel("Confirm password", { exact: true }).fill("새비밀번호-123456");
    await page.getByRole("button", { name: "Save new password" }).click();
    await page.getByRole("status").filter({ hasText: "Your password has been updated. Log in with your new password." }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/reset-password");
    assert.equal(new URL(page.url()).search, "");
    assert.deepEqual(requests.exchange, [{ auth_code: "fixture-code", code_verifier: "fixture-verifier" }]);
    assert.equal(requests.update.length, 1);
    assert.equal(requests.update[0].password, "새비밀번호-123456");
    assert.deepEqual(requests.logout, ["global"]);
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    await page.reload();
    await page.getByRole("alert").filter({ hasText: invalidNotice }).waitFor();
    assert.equal(requests.update.length, 1);
  } finally { await browser.close(); }
});

test("a rejected password update retains the verified form for a corrected retry", { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const { page, requests } = await fixture(browser, { updateStatus: 422 });
    await page.goto(`${origin}/reset-password?recovery_code=fixture-code`);
    await page.getByLabel("New password", { exact: true }).fill("existing-password");
    await page.getByLabel("Confirm password", { exact: true }).fill("existing-password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await page.getByRole("alert").filter({ hasText: "Use a different password from your current password." }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save new password" }).isDisabled(), false);
    assert.equal(requests.update.length, 1);
    assert.equal(requests.logout.length, 0);
  } finally { await browser.close(); }
});

test("a provider's unknown-account response uses the same reset notice", { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const { page } = await fixture(browser, { recoverStatus: 404, recoverCode: "user_not_found" });
    await page.goto(`${origin}/forgot-password`);
    await page.getByLabel("Email", { exact: true }).fill("unknown@example.invalid");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await page.getByRole("status").filter({ hasText: genericNotice }).waitFor();
    assert.equal(await page.locator("form").getByRole("alert").count(), 0);
  } finally { await browser.close(); }
});

test("a mismatched or expired recovery session cannot save a password", { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const options of [{}, { updateStatus: 401 }]) {
      const { context, page, requests } = await fixture(browser, options);
      await page.goto(`${origin}/reset-password?recovery_code=fixture-code`);
      await page.getByLabel("New password", { exact: true }).fill("replacement-password");
      await page.getByLabel("Confirm password", { exact: true }).fill("replacement-password");
      if (!options.updateStatus) options.userId = "10000000-0000-4000-8000-000000000088";
      await page.getByRole("button", { name: "Save new password" }).click();
      await page.getByRole("alert").filter({ hasText: invalidNotice }).waitFor();
      assert.equal(requests.update.length, options.updateStatus ? 1 : 0);
      assert.equal(await page.locator('input[type="password"]').count(), 0);
      assert.equal(requests.logout.length, 0);
      await context.close();
    }
  } finally { await browser.close(); }
});

test("logout failure never reports an already changed password as failed", { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const { page, requests } = await fixture(browser, { logoutStatus: 500 });
    await page.goto(`${origin}/reset-password?recovery_code=fixture-code`);
    await page.getByLabel("New password", { exact: true }).fill("replacement-password");
    await page.getByLabel("Confirm password", { exact: true }).fill("replacement-password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await page.getByRole("status").filter({ hasText: "Your password has been updated. Log in with your new password." }).waitFor();
    await page.getByRole("alert").filter({ hasText: "Your password was updated, but other sessions could not be signed out. Sign out from your other devices." }).waitFor();
    assert.equal(requests.update.length, 1);
    assert.equal(await page.getByRole("link", { name: "Return to login" }).count(), 1);
  } finally { await browser.close(); }
});

test("a concurrent account switch cannot redirect the password update to another account", { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const options = {};
    const { page, requests } = await fixture(browser, options);
    await page.goto(`${origin}/reset-password?recovery_code=fixture-code`);
    await page.getByLabel("New password", { exact: true }).fill("replacement-password");
    await page.getByLabel("Confirm password", { exact: true }).fill("replacement-password");
    options.switchAfterVerification = true;
    await page.getByRole("button", { name: "Save new password" }).click();
    await page.getByRole("status").filter({ hasText: "Your password has been updated. Log in with your new password." }).waitFor();
    assert.deepEqual(requests.updateUsers, ["10000000-0000-4000-8000-000000000099"]);
    assert.deepEqual(requests.logout, ["global"], "the other account's local session is preserved");
    assert.equal(await mainUser(page), otherUserId);
  } finally { await browser.close(); }
});

test("an emailed recovery link opens in a new tab without replacing the main account, and cannot be replayed", { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const { page, requests, newTab } = await fixture(browser, { mainAccountId: otherUserId });
    await page.goto(`${origin}/forgot-password`);
    await page.getByLabel("Email", { exact: true }).fill("fixture@example.invalid");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await page.getByRole("status").filter({ hasText: genericNotice }).waitFor();
    const verifier = await page.evaluate(() => JSON.parse(localStorage.getItem("duo-password-recovery-code-verifier")));
    assert.ok(verifier.endsWith("/PASSWORD_RECOVERY"));
    assert.equal(await mainUser(page), otherUserId);
    const emailTab = await newTab();
    const link = `${origin}/auth/callback?type=recovery&code=fixture-email-code`;
    await emailTab.goto(link);
    await emailTab.getByLabel("New password", { exact: true }).fill("replacement-password");
    assert.equal(new URL(emailTab.url()).origin, origin, "the callback preserves the request's browser origin");
    assert.equal(requests.exchange[0].code_verifier, verifier.split("/")[0]);
    assert.equal(await mainUser(emailTab), otherUserId);
    assert.equal(await emailTab.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("duo-password-recovery"))), false);
    await emailTab.getByLabel("Confirm password", { exact: true }).fill("replacement-password");
    await emailTab.getByRole("button", { name: "Save new password" }).click();
    await emailTab.getByRole("status").filter({ hasText: "Your password has been updated. Log in with your new password." }).waitFor();
    assert.equal(await mainUser(page), otherUserId);
    assert.deepEqual(requests.updateUsers, [recoveryUserId]);
    assert.deepEqual(requests.logoutUsers, [recoveryUserId]);
    const replay = await newTab();
    await replay.goto(link);
    await replay.getByRole("alert").filter({ hasText: invalidNotice }).waitFor();
    assert.equal(requests.update.length, 1);
    assert.equal(await mainUser(replay), otherUserId);
  } finally { await browser.close(); }
});

test("a main account change during recovery logout is preserved without any local logout", { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const options = {};
    const { page, requests } = await fixture(browser, options);
    await page.goto(`${origin}/reset-password?recovery_code=fixture-code`);
    await page.getByLabel("New password", { exact: true }).fill("replacement-password");
    await page.getByLabel("Confirm password", { exact: true }).fill("replacement-password");
    options.onLogout = () => page.evaluate(({ name, otherId }) => {
      const cookie = document.cookie.split("; ").find(value => value.startsWith(`${name}=`));
      const session = JSON.parse(atob(cookie.split("=")[1].slice(7).replace(/-/g, "+").replace(/_/g, "/")));
      const payload = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      payload.sub = otherId; session.user.id = otherId;
      const encode = value => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
      session.access_token = `${session.access_token.split(".")[0]}.${encode(payload)}.fixture`;
      document.cookie = `${name}=base64-${encode(session)}; Path=/; SameSite=Lax`;
    }, { name: authCookieName, otherId: otherUserId });
    await page.getByRole("button", { name: "Save new password" }).click();
    await page.getByRole("status").filter({ hasText: "Your password has been updated. Log in with your new password." }).waitFor();
    assert.equal(await mainUser(page), otherUserId);
    assert.deepEqual(requests.logout, ["global"]);
    assert.deepEqual(requests.logoutUsers, [recoveryUserId]);
  } finally { await browser.close(); }
});
