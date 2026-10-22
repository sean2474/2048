import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { startServerFixture } from "./server-fixture.mjs";

const { chromium, webkit, devices } = createRequire(import.meta.url)("playwright");
const labels = {
  en: {
    title: "Settings",
    preferences: "Game preferences",
    account: "Your account",
    help: "Help and customization",
    language: "Language",
    sound: "Game sound",
  },
  ko: {
    title: "설정",
    preferences: "게임 환경",
    account: "내 계정",
    help: "도움말 및 꾸미기",
    language: "언어",
    sound: "게임 사운드",
  },
};

async function chooseLanguage(page, locale) {
  await page
    .locator("label")
    .filter({ has: page.locator(`input[name="language"][value="${locale}"]`) })
    .tap();
}

async function assertLanguage(page, context, locale) {
  const text = labels[locale];
  // These headings are server-rendered, whereas the sound/language controls
  // consume the client I18nProvider. A checked radio alone cannot prove sync.
  for (const name of [text.title, text.preferences, text.account, text.help, text.sound])
    await page.getByRole("heading", { name, exact: true }).waitFor();
  await page.getByRole("heading", { name: text.language, exact: true }).waitFor();
  await page.waitForFunction(() =>
    document.querySelector('input[name="language"]')?.matches(":enabled"),
  );
  assert.equal(await page.locator("html").getAttribute("lang"), locale);
  assert.equal(await page.locator('input[name="language"]:checked').inputValue(), locale);
  const cookies = await context.cookies();
  assert.equal(cookies.find((cookie) => cookie.name === "duo.locale")?.value, locale);
  assert.equal(
    JSON.parse(
      decodeURIComponent(cookies.find((cookie) => cookie.name === "duo.guest-settings")?.value),
    ).settings.locale,
    locale,
  );
}

test(
  "mobile guest locale stays aligned across reload and pending server refreshes",
  {
    timeout: 120000,
  },
  async (t) => {
    const app = await startServerFixture();
    t.after(() => app.close());
    for (const [name, engine, device, launch] of [
      ["Chrome Android", chromium, "Pixel 7", { channel: "chrome" }],
      ["WebKit iPhone", webkit, "iPhone 13", {}],
    ]) {
      await t.test(name, async (t) => {
        const browser = await engine.launch({ ...launch, headless: true });
        t.after(() => browser.close());
        const context = await browser.newContext({ ...devices[device], locale: "en-US" });
        await context.addCookies([{ name: "duo.locale", value: "en", url: app.origin }]);
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));

        await page.goto(`${app.origin}/settings`);
        await assertLanguage(page, context, "en");
        await chooseLanguage(page, "ko");
        await assertLanguage(page, context, "ko");
        await page.reload();
        await assertLanguage(page, context, "ko");
        await chooseLanguage(page, "en");
        await assertLanguage(page, context, "en");

        let documentRequests = 0;
        page.on("request", (request) => {
          if (request.isNavigationRequest() && request.frame() === page.mainFrame())
            documentRequests++;
        });
        const captured = Promise.withResolvers();
        // Keep a real Korean RSC response in flight while the user chooses English.
        // Only response delivery is delayed; the fixture still renders both locales.
        await page.route(
          "**/settings?*",
          async (route) => {
            if (route.request().headers().rsc !== "1") return route.continue();
            try {
              captured.resolve({ route, response: await route.fetch({ timeout: 10000 }) });
            } catch (error) {
              captured.reject(error);
              await route.abort();
            }
          },
          { times: 1 },
        );
        await Promise.all([
          page.waitForRequest(
            (request) =>
              new URL(request.url()).pathname === "/settings" && request.headers().rsc === "1",
          ),
          chooseLanguage(page, "ko"),
        ]);
        const held = await captured.promise;
        assert.equal(held.response.status(), 200);
        assert.match(await held.response.text(), /\["\$","h1",null,\{[^\n}]*"children":"설정"/);
        await page.getByRole("heading", { name: labels.ko.language, exact: true }).waitFor();
        assert.equal(await page.locator('input[name="language"]:checked').inputValue(), "ko");

        const englishResponse = page.waitForResponse(
          async (response) =>
            new URL(response.url()).pathname === "/settings" &&
            response.request().headers().rsc === "1" &&
            /(?:^|;\s*)duo\.locale=en(?:;|$)/.test(
              (await response.request().allHeaders()).cookie ?? "",
            ),
        );
        await chooseLanguage(page, "en");
        await held.route.fulfill({ response: held.response });
        const response = await englishResponse;
        assert.equal(response.status(), 200);
        assert.equal(await response.finished(), null);
        await assertLanguage(page, context, "en");
        assert.equal(documentRequests, 0, "language changes must preserve client navigation");
        assert.deepEqual(errors, []);
      });
    }
  },
);
