import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fixturePlayer, startServerFixture } from "./server-fixture.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");

test(
  "server route content and client controls stay functional after hydration",
  { timeout: 120000 },
  async (t) => {
    const friendId = "20000000-0000-4000-8000-000000000099";
    const messages = [];
    const app = await startServerFixture({
      handle: async (url, request) => {
        if (url.pathname.endsWith("/rpc/social_players"))
          return {
            data: [
              {
                id: friendId,
                name: "Fixture Friend",
                icon_id: "orb",
                relationship: "friend",
                unread: 0,
              },
            ],
          };
        if (url.pathname.endsWith("/rpc/social_messages")) return { data: [...messages].reverse() };
        if (url.pathname.endsWith("/rpc/send_direct_message")) {
          let body = "";
          for await (const chunk of request) body += chunk;
          messages.push({
            id: messages.length + 1,
            sender_id: fixturePlayer,
            body: JSON.parse(body).p_body,
            created_at: new Date().toISOString(),
          });
          return { data: null };
        }
      },
    });
    t.after(() => app.close());
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    t.after(() => browser.close());
    const guest = await browser.newContext({
      locale: "en-US",
      viewport: { width: 375, height: 812 },
    });
    await guest.addCookies([{ name: "duo.locale", value: "en", url: app.origin }]);
    const page = await guest.newPage(),
      errors = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => errors.push(error.message));
    let response = await page.goto(app.origin + "/settings");
    assert.match(await response.text(), /Help and customization/);
    await page.locator('main span[lang="ko"]:visible').click();
    await page.getByRole("heading", { name: "설정", exact: true }).waitFor();
    await page.locator('main span[lang="en"]:visible').click();
    await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
    response = await page.goto(app.origin + "/feedback");
    assert.match(await response.text(), /Bugs &amp; feedback/);
    await page.getByRole("radio", { name: "Suggestion", exact: true }).locator("..").click();
    await page
      .getByRole("textbox", { name: "Details", exact: true })
      .fill("A local feedback draft");
    assert.equal(
      await page.getByRole("textbox", { name: "Details", exact: true }).inputValue(),
      "A local feedback draft",
    );
    await page.goto(app.origin + "/play/join");
    const code = page.getByRole("textbox", { name: "Room code", exact: true });
    await code.fill("ab@123!");
    assert.equal(await code.inputValue(), "AB123");
    await code.fill("abc123");
    assert.equal(
      await page.getByRole("button", { name: "Join room", exact: true }).isEnabled(),
      true,
    );
    await page.goto(app.origin + "/friends");
    await page.getByRole("main").getByRole("link", { name: "Login", exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox").count(), 0);
    await page.goto(app.origin + "/watch/10000000-0000-4000-8000-000000000099");
    await page.getByRole("heading", { name: "Spectating", exact: true }).waitFor();
    await page.getByRole("main").getByRole("link", { name: "Login", exact: true }).waitFor();
    await page.goto(app.origin + "/tutorial");
    await page.getByRole("heading", { name: "Interactive tutorial", exact: true }).waitFor();
    const move = (direction) =>
      page.getByRole("button", { name: `Move ${direction}`, exact: true }).click();
    await move("left");
    await page.getByRole("button", { name: "Skip ahead to 128 + 128", exact: true }).click();
    await move("left");
    await page.getByRole("button", { name: "Try a hard block", exact: true }).click();
    await move("left");
    await page.getByRole("button", { name: "Try receiving an attack", exact: true }).click();
    await move("left");
    await move("down");
    await page.getByRole("button", { name: "Try the default ability", exact: true }).click();
    await page.locator('.game-you [data-ability-control="clear-x"]').click();
    await page
      .getByRole("heading", { name: "One X cleared. One space recovered.", exact: true })
      .waitFor();
    const complete = page.getByRole("link", { name: "Find a match", exact: true });
    assert.equal(await complete.evaluate((element) => element === document.activeElement), true);
    const evidence = new URL("../.next/page-islands/", import.meta.url);
    await mkdir(evidence, { recursive: true });
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      const board = await page.locator(".game-you [data-skin]").boundingBox();
      assert.ok(board.width >= 200 && board.height >= 200);
      await page.screenshot({
        path: new URL(`tutorial-${width}.png`, evidence).pathname,
        fullPage: true,
      });
    }
    const account = await browser.newContext({ locale: "en-US" });
    await account.addCookies([app.cookie(), { name: "duo.locale", value: "en", url: app.origin }]);
    const authenticated = await account.newPage();
    authenticated.setDefaultTimeout(10000);
    authenticated.on("pageerror", (error) => errors.push(error.message));
    await authenticated.goto(app.origin + "/friends");
    await authenticated
      .getByRole("button", { name: "Message Fixture Friend", exact: true })
      .click();
    await authenticated
      .getByRole("heading", { name: "Messages with Fixture Friend", exact: true })
      .waitFor();
    await authenticated
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("A persisted fixture message");
    await authenticated.getByRole("button", { name: "Send message", exact: true }).click();
    await authenticated.getByText("A persisted fixture message", { exact: true }).waitFor();
    assert.equal(messages.length, 1);
    await authenticated.goto(app.origin + `/watch/${friendId}`);
    await authenticated
      .getByRole("alert")
      .filter({ hasText: "Could not connect to spectating. Please try again." })
      .waitFor();
    assert.equal(
      await authenticated
        .getByRole("main")
        .getByRole("link", { name: "Login", exact: true })
        .count(),
      0,
      "a verified account mounts the spectator instead of the guest gate",
    );
    await authenticated.getByRole("button", { name: "Try again", exact: true }).click();
    await authenticated
      .getByRole("alert")
      .filter({ hasText: "Could not connect to spectating. Please try again." })
      .waitFor();
    const before = app.requests.length;
    response = await authenticated.goto(app.origin + "/settings");
    assert.match(await response.text(), /Fixture Challenger/);
    await authenticated.getByRole("textbox", { name: "Nickname", exact: true }).waitFor();
    assert.equal(
      await authenticated.getByRole("textbox", { name: "Nickname", exact: true }).inputValue(),
      "Fixture Challenger",
    );
    await authenticated
      .getByRole("textbox", { name: "Nickname", exact: true })
      .fill("Changed name");
    assert.equal(
      await authenticated.getByRole("button", { name: "Save nickname", exact: true }).isEnabled(),
      true,
    );
    assert.equal(
      app.requests.slice(before).filter((request) => request.path.endsWith("/players")).length,
      1,
      "settings reuse the server account profile",
    );
    await authenticated.getByRole("button", { name: "Delete my account", exact: true }).click();
    await authenticated.getByRole("alertdialog").waitFor();
    let releaseRefresh;
    const heldRefresh = new Promise((resolve) => {
      releaseRefresh = resolve;
    });
    t.after(() => releaseRefresh());
    await authenticated.route("**/settings?**", async (route) => {
      if (route.request().headers()["rsc"] === "1") await heldRefresh;
      await route.continue();
    });
    await authenticated.evaluate((name) => {
      document.cookie = `${name}=; Max-Age=0; Path=/`;
      const channel = new BroadcastChannel(name);
      channel.postMessage({ event: "SIGNED_OUT", session: null });
      channel.close();
    }, app.cookie().name);
    await authenticated
      .getByRole("textbox", { name: "Nickname", exact: true })
      .waitFor({ state: "detached" });
    await authenticated.getByRole("alertdialog").waitFor({ state: "detached" });
    await authenticated.getByRole("status", { name: "Loading profile…", exact: true }).waitFor();
    assert.equal(
      await authenticated.getByRole("button", { name: "Save nickname", exact: true }).count(),
      0,
      "a changed account cannot interact with the old account form while RSC refresh is held",
    );
    releaseRefresh();
    assert.deepEqual(errors, []);
  },
);
