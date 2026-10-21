import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const origin = "http://[::1]:3001";
const password = "new-password-123";
const confirmationNotice =
  "Sign-up request received. Check your email to confirm your account, then log in.";
const readyNotice = "Your account is ready. You can start playing.";

async function fixture(browser, options = {}) {
  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 375, height: 812 },
  });
  await context.addCookies([{ name: "duo.locale", value: options.locale ?? "en", url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const requests = { signup: [], login: [] };
  const user = {
    id: "10000000-0000-4000-8000-000000000099",
    aud: "authenticated",
    role: "authenticated",
    email: "fixture@example.invalid",
    is_anonymous: false,
    app_metadata: {},
    user_metadata: { name: "Fixture player" },
    created_at: "2026-01-01T00:00:00Z",
  };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires, role: "authenticated" })).toString("base64url")}.fixture`;
  const session = {
    access_token: token,
    refresh_token: "fixture-only",
    expires_at: expires,
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
  // Fictional browser sessions must never reach server-side Supabase requests.
  await page.route(`${origin}/**`, (route) => {
    const headers = { ...route.request().headers() };
    headers.cookie = (headers.cookie ?? "")
      .split("; ")
      .filter((part) => !part.startsWith("sb-"))
      .join("; ");
    return route.continue({ headers });
  });
  await page.route("https://*.supabase.co/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname.endsWith("/signup")) {
      requests.signup.push(request.postDataJSON());
      if (options.wait) await options.wait;
      if (options.fail)
        return route.fulfill({ status: 429, json: { msg: "Please try again later." } });
      return route.fulfill({ json: options.session ? session : user });
    }
    if (url.pathname.endsWith("/token")) {
      requests.login.push(request.postDataJSON());
      return route.fulfill({ json: session });
    }
    if (url.pathname.endsWith("/user")) return route.fulfill({ json: user });
    return route.fulfill({
      json: request.headers().accept?.includes("vnd.pgrst.object") ? null : [],
    });
  });
  await page.goto(`${origin}/signup`);
  return { context, page, requests };
}

async function fillSignup(page) {
  await page.locator('input[name="name"]').fill("새 사용자 🎮");
  await page.locator('input[name="email"]').fill("fixture@example.invalid");
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirmPassword"]').fill(password);
}

test(
  "email-confirmation signup clears the form, announces success and prevents duplicate submission",
  { timeout: 60000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    let release;
    try {
      const { page, requests } = await fixture(browser, {
        wait: new Promise((resolve) => {
          release = resolve;
        }),
      });
      await fillSignup(page);
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('form[aria-busy="true"]'));
      await page.locator("form").dispatchEvent("submit");
      assert.equal(await page.getByRole("button", { name: "Please wait..." }).isDisabled(), true);
      release();
      const success = page.getByRole("status").filter({ hasText: confirmationNotice });
      await success.waitFor();
      assert.equal(await page.locator("form input").count(), 0);
      assert.equal(
        await page.getByRole("button", { name: "Create account", exact: true }).count(),
        0,
      );
      assert.equal(await success.evaluate((element) => element === document.activeElement), true);
      assert.equal(new URL(page.url()).pathname, "/signup");
      assert.equal(requests.signup.length, 1);
      assert.equal(requests.signup[0].data.name, "새 사용자 🎮");
      await page.getByRole("link", { name: "Return to login", exact: true }).click();
      await page.waitForURL(`${origin}/login`);
      assert.equal(await page.getByLabel("Password", { exact: true }).inputValue(), "");
    } finally {
      release?.();
      await browser.close();
    }
  },
);

test(
  "signup with an active session keeps success visible until the player continues",
  { timeout: 60000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const { page, requests } = await fixture(browser, { session: true });
      await fillSignup(page);
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      await page.getByRole("status").filter({ hasText: readyNotice }).waitFor();
      assert.equal(new URL(page.url()).pathname, "/signup");
      assert.equal(await page.locator("form input").count(), 0);
      assert.equal(requests.signup.length, 1);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      await page.getByRole("link", { name: "Continue to game", exact: true }).click();
      await page.waitForURL(`${origin}/`);
    } finally {
      await browser.close();
    }
  },
);

test(
  "signup errors retain inputs for retry and successful retry shows Korean confirmation",
  { timeout: 60000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const options = { fail: true, locale: "ko" };
      const { page, requests } = await fixture(browser, options);
      await fillSignup(page);
      await page.locator('input[name="confirmPassword"]').fill("different-password");
      await page.locator('button[type="submit"]').click();
      await page.getByRole("alert").filter({ hasText: "비밀번호가 일치하지 않습니다." }).waitFor();
      assert.equal(requests.signup.length, 0);
      await page.locator('input[name="confirmPassword"]').fill(password);
      await page.locator('button[type="submit"]').click();
      await page.getByRole("alert").filter({ hasText: "Please try again later." }).waitFor();
      assert.deepEqual(
        await page
          .locator("form input")
          .evaluateAll((inputs) => inputs.map((input) => input.value)),
        ["새 사용자 🎮", "fixture@example.invalid", password, password],
      );
      assert.equal(await page.locator('button[type="submit"]').isDisabled(), false);
      options.fail = false;
      await page.locator('button[type="submit"]').click();
      await page
        .getByRole("status")
        .filter({
          hasText: "가입 요청을 완료했어요. 이메일에서 계정을 인증한 다음 로그인해 주세요.",
        })
        .waitFor();
      assert.equal(
        await page.getByRole("alert").filter({ hasText: "Please try again later." }).count(),
        0,
      );
      assert.equal(await page.locator("form input").count(), 0);
      assert.equal(requests.signup.length, 2);
    } finally {
      await browser.close();
    }
  },
);

test(
  "login still signs in and redirects without showing signup feedback",
  { timeout: 60000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const { page, requests } = await fixture(browser);
      await page.goto(`${origin}/login`);
      await page.getByLabel("Email", { exact: true }).fill("fixture@example.invalid");
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Log in", exact: true }).click();
      await page.waitForURL(`${origin}/`);
      assert.equal(requests.login.length, 1);
      assert.equal(requests.signup.length, 0);
    } finally {
      await browser.close();
    }
  },
);
