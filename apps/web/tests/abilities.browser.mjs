import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { mockAccount } from "./browser-fixtures.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { createGameServer } = require("../../socket/src/server.ts");
const { rooms } = require("../../socket/src/state.ts");
const { broadcast } = require("../../socket/src/game.ts");
const origin = "http://[::1]:3001";
const artifacts = new URL("../../../docs/abilities/", import.meta.url).pathname;

test(
  "five tutorial steps teach automatic attacks and manual ability in Korean and English",
  { timeout: 90000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    await mkdir(artifacts, { recursive: true });
    try {
      for (const english of [false, true]) {
        const context = await browser.newContext({
          locale: english ? "en-US" : "ko-KR",
          viewport: { width: english ? 1440 : 375, height: 900 },
          extraHTTPHeaders: { "x-vercel-ip-country": english ? "US" : "KR" },
        });
        if (english)
          await context.addCookies([
            {
              name: "duo.guest-settings",
              value: encodeURIComponent(
                JSON.stringify({
                  locale: "en",
                  skinId: "classic",
                  iconId: "fox",
                  abilityId: null,
                  customShortcuts: true,
                  keybindings: {
                    up: "KeyW",
                    down: "KeyS",
                    left: "KeyA",
                    right: "KeyD",
                    ability: "KeyF",
                  },
                }),
              ),
              url: origin,
            },
          ]);
        const page = await context.newPage(),
          errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${origin}/tutorial`);
        const direction = (dir) =>
          page.getByRole("button", {
            name: english ? `Move ${dir}` : { left: "왼쪽으로 이동", down: "아래로 이동" }[dir],
            exact: true,
          });
        const advance = async (ko, en) =>
          page.getByRole("button", { name: english ? en : ko, exact: true }).click();
        assert.equal(await page.locator("[data-attack-control]").count(), 0);
        await page.keyboard.press(english ? "KeyF" : "Digit1");
        assert.equal(await page.getByTestId("your-score").innerText(), "0");
        await direction("left").click();
        await advance("128 두 개로 건너뛰기", "Skip ahead to 128 + 128");
        await direction("left").click();
        await page.locator(".game-opponent").getByRole("img", { name: /X/ }).waitFor();
        await advance("하드블록도 배워보기", "Try a hard block");
        await direction("left").click();
        await page
          .getByRole("heading", {
            name: english ? "A fixed obstacle on their board" : "상대의 길을 막았어요",
            exact: true,
          })
          .waitFor();
        await advance("상대 공격도 받아보기", "Try receiving an attack");
        await direction("left").click();
        await direction("down").click();
        await advance("기본 능력 써보기", "Try the default ability");
        assert.equal(
          await page.locator("[data-attack-effect]").count(),
          0,
          "new lessons do not replay earlier attacks",
        );
        const xs = page.locator(".game-you").getByRole("img", { name: /X/ });
        assert.equal(await xs.count(), 2);
        const clear = page.locator('.game-you [data-ability-control="clear-x"]');
        assert.equal(await page.locator("[data-ability-effect]").count(), 0);
        await clear.focus();
        assert.equal(await clear.getAttribute("aria-keyshortcuts"), english ? "F" : "1");
        if (english) {
          await page.keyboard.press("Digit1");
          assert.equal(await xs.count(), 2);
        }
        await page.keyboard.press(english ? "KeyF" : "Digit1");
        await page.locator('.game-you [data-ability-effect="clear-x"]').waitFor();
        await page
          .getByRole("heading", {
            name: english
              ? "One X cleared. One space recovered."
              : "X 하나를 없애고 빈칸을 만들었어요!",
            exact: true,
          })
          .waitFor();
        assert.equal(await xs.count(), 1);
        assert.equal(await clear.isDisabled(), true);
        const finish = page.getByRole("link", {
          name: english ? "Find a match" : "대전 찾기",
          exact: true,
        });
        assert.equal(await finish.evaluate((el) => el === document.activeElement), true);
        assert.equal(await finish.getAttribute("href"), "/find-match");
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth),
          page.viewportSize().width,
        );
        await page.screenshot({
          path: `${artifacts}/tutorial-${english ? "en" : "ko"}.png`,
          fullPage: true,
        });
        await page
          .getByRole("button", {
            name: english ? "Restart this step" : "이 단계 다시 시작",
            exact: true,
          })
          .click();
        assert.equal(await xs.count(), 2);
        assert.equal(await clear.isEnabled(), true);
        await clear.focus();
        await page.keyboard.press("Enter");
        await page
          .getByRole("heading", {
            name: english
              ? "One X cleared. One space recovered."
              : "X 하나를 없애고 빈칸을 만들었어요!",
            exact: true,
          })
          .waitFor();
        assert.equal(await xs.count(), 1);
        assert.deepEqual(errors, []);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  },
);

test(
  "all five equipped abilities activate over real sockets and fit desktop and mobile",
  { timeout: 120000 },
  async () => {
    const server = createGameServer({
      resolveAccount: async (token) => ({
        id: JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub,
        name: "능력 연습",
      }),
      readSuspensions: async () => [],
    });
    server.io.engine.opts.allowUpgrades = false;
    await new Promise((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
    const socketOrigin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    await mkdir(artifacts, { recursive: true });
    try {
      for (const ability of ["clear-x", "spawn-pause", "frost-wave", "anchor-tile", "swap-32"]) {
        const contexts = [],
          pages = [],
          errors = [];
        for (let i = 0; i < 2; i++) {
          const context = await browser.newContext({
            locale: "ko-KR",
            viewport: { width: i ? 375 : 1440, height: i ? 812 : 900 },
          });
          contexts.push(context);
          await context.route("**/socket.io/**", async (route) => {
            const url = new URL(route.request().url());
            const response = await route.fetch({
              url: `${socketOrigin}${url.pathname}${url.search}`,
            });
            await route.fulfill({
              response,
              headers: { ...response.headers(), "access-control-allow-origin": "*" },
            });
          });
          const page = await context.newPage();
          page.on("pageerror", (error) => errors.push(error.message));
          pages.push(page);
          const account = await mockAccount(page, `10000000-0000-4000-8000-00000000009${i}`);
          account.row.ability_id = i ? null : ability;
          await page.goto(`${origin}/play/online`);
        }
        const [a, b] = pages;
        for (const page of pages) {
          await page.waitForURL(/\/play\/[a-f\d-]{36}$/);
          await page.locator("[data-ability-control]").waitFor();
        }
        const room = [...rooms.values()][0];
        const pid = room.players.find((id) => room.accounts[id]?.id.endsWith("90"));
        const other = room.players.find((id) => id !== pid);
        const me = room.state[pid],
          opp = room.state[other];
        assert.equal(me.ability.id, ability);
        assert.equal(await a.locator(".game-player-heading [data-profile-icon=fox]").count(), 2);
        me.board = [
          { id: 1_000_000, row: 0, col: 0, value: 256 },
          { id: 1_000_001, row: 0, col: 1, value: 256 },
          { id: 1_000_006, row: 0, col: 2, value: 256 },
          { id: 1_000_007, row: 0, col: 3, value: 256 },
          { id: 1_000_002, row: 4, col: 3, value: 8 },
          { id: 1_000_003, row: 2, col: 2, value: -1, blockType: "xblock" },
          { id: 1_000_004, row: 2, col: 3, value: -1, blockType: "xblock" },
          { id: 1_000_005, row: 3, col: 3, value: -2, blockType: "hardblock" },
        ];
        opp.board = [
          { id: 1_000_010, row: 0, col: 0, value: 32 },
          { id: 1_000_011, row: 0, col: 1, value: 8 },
          { id: 1_000_012, row: 2, col: 2, value: 128 },
        ];
        broadcast(room, server.io);
        await a.keyboard.press("ArrowLeft");
        const activate = a.locator(`[data-ability-control="${ability}"]`);
        await activate.filter({ hasText: "사용 가능" }).waitFor();
        assert.equal(
          await a.locator("[data-ability-effect]").count(),
          0,
          "Charging must not replay an ability",
        );
        if (ability === "clear-x") {
          room.ready.delete(other);
          broadcast(room, server.io);
          await a.getByRole("heading", { name: "상대를 기다리는 중…", exact: true }).waitFor();
          me.ability.charge = 0;
          broadcast(room, server.io);
          await activate.filter({ hasText: "0%" }).waitFor();
          room.ready.add(other);
          broadcast(room, server.io);
          await a.getByRole("heading", { name: "대전 중", exact: true }).waitFor();
          assert.equal(
            await a.locator("[data-ability-effect]").count(),
            0,
            "Resuming must not replay an old charge change",
          );
          const board = me.board;
          me.board = board.filter((tile) => tile.blockType !== "xblock");
          me.ability.charge = 1024;
          broadcast(room, server.io);
          await activate.filter({ hasText: "사용 가능" }).waitFor();
          await a.keyboard.press("Digit1");
          await a
            .getByText("능력을 쓸 대상이 없어요. 충전은 그대로 유지돼요.", { exact: true })
            .waitFor();
          assert.equal(
            await a.locator("[data-ability-effect]").count(),
            0,
            "Rejected casts cannot show a success effect",
          );
          me.board = board;
          broadcast(room, server.io);
        }
        await a.keyboard.press("Digit1");
        const offensive = ability === "frost-wave" || ability === "swap-32";
        await a
          .locator(
            `${offensive ? ".game-opponent" : ".game-you"} [data-ability-effect="${ability}"]`,
          )
          .waitFor();
        await b
          .locator(
            `${offensive ? ".game-you" : ".game-opponent"} [data-ability-effect="${ability}"]`,
          )
          .waitFor();
        assert.match(
          await a
            .locator(`${offensive ? ".game-opponent" : ".game-you"} [role="status"]`)
            .innerText(),
          /내 능력/,
        );
        assert.match(
          await b
            .locator(`${offensive ? ".game-you" : ".game-opponent"} [role="status"]`)
            .innerText(),
          offensive ? /상대 능력 도착/ : /상대 능력/,
        );
        if (ability === "clear-x") {
          for (const width of [1440, 375]) {
            await a.setViewportSize({ width, height: 900 });
            await a.screenshot({
              path: `${tmpdir()}/2048-ability-effect-normal-${width}.png`,
              fullPage: true,
            });
          }
        }
        await activate
          .filter({
            hasText: ability === "spawn-pause" || ability === "anchor-tile" ? "사용 중" : "0%",
          })
          .waitFor();
        assert.equal(me.ability.charge, 0);
        if (ability === "clear-x") {
          assert.equal(me.board.filter((tile) => tile.blockType === "xblock").length, 1);
          assert.equal(await a.locator(".game-you").getByRole("img", { name: /X/ }).count(), 1);
        } else if (ability === "spawn-pause") {
          assert.equal(me.ability.spawnPauseMoves, 3);
          const count = me.board.filter((tile) => !tile.ghost).length;
          await a.keyboard.press("ArrowDown");
          await a.getByText("숫자 생성 중지 · 2회 남음", { exact: true }).waitFor();
          assert.equal(me.board.filter((tile) => !tile.ghost).length, count);
        } else if (ability === "anchor-tile") {
          await a.locator("[data-anchored=true]").waitFor();
          const anchor = me.board.find((tile) => !tile.ghost && tile.anchored);
          const position = [anchor.row, anchor.col];
          await a.keyboard.press("ArrowDown");
          await a.getByText("알박기 · 2회 남음", { exact: true }).waitFor();
          assert.deepEqual(
            [
              me.board.find((tile) => !tile.ghost && tile.anchored).row,
              me.board.find((tile) => !tile.ghost && tile.anchored).col,
            ],
            position,
          );
        } else if (ability === "swap-32") {
          assert.deepEqual(
            opp.board.slice(0, 2).map((tile) => [tile.value, tile.col]),
            [
              [32, 1],
              [8, 0],
            ],
          );
        } else {
          await b.getByText("곧 감속이 적용돼요!", { exact: true }).waitFor();
          await b.getByText(/감속 3초/).waitFor();
          await b.getByRole("button", { name: "아래로 이동", exact: true }).click();
          await b.waitForFunction(
            () => document.querySelector('.direction-pad button[aria-label="위로 이동"]').disabled,
          );
          await b.getByRole("button", { name: "위로 이동", exact: true }).click();
        }
        if (ability === "clear-x") {
          await a.emulateMedia({ reducedMotion: "reduce" });
          for (const [index, width] of [1440, 375].entries()) {
            await a.setViewportSize({ width, height: 900 });
            me.ability.charge = 1024;
            me.board.push({
              id: 1_100_000 + index,
              row: 4,
              col: 2 + index,
              value: -1,
              blockType: "xblock",
            });
            broadcast(room, server.io);
            await activate.filter({ hasText: "사용 가능" }).waitFor();
            await a.keyboard.press("Digit1");
            const effect = a.locator('[data-ability-effect="clear-x"]');
            await activate.filter({ hasText: "0%" }).waitFor();
            await effect.waitFor();
            assert.equal(await effect.evaluate((el) => getComputedStyle(el).animationName), "none");
            assert.equal(await effect.evaluate((el) => getComputedStyle(el).pointerEvents), "none");
            await a.screenshot({
              path: `${tmpdir()}/2048-ability-effect-reduced-${width}.png`,
              fullPage: true,
            });
          }
          await a.locator("[data-ability-effect]").waitFor({ state: "hidden" });
          assert.equal(await a.locator('.game-you [role="status"]').innerText(), "");
        }
        for (const [width, height] of [
          [1440, 900],
          [375, 812],
          [320, 740],
        ]) {
          await a.setViewportSize({ width, height });
          // Resizing starts tile position transitions; measure the settled board.
          await a.locator(".game-stage").evaluate(async (stage) => {
            await Promise.allSettled(
              stage.getAnimations({ subtree: true }).map((animation) => animation.finished),
            );
          });
          assert.equal(
            await a.evaluate(() => document.documentElement.scrollWidth),
            width,
            `${ability}: ${width}px viewport`,
          );
          const button = await activate.boundingBox();
          assert.ok(button.height >= 44 && button.x >= 0 && button.x + button.width <= width);
        }
        await a.setViewportSize({ width: 375, height: 812 });
        await a.screenshot({ path: `${artifacts}/live-${ability}.png`, fullPage: true });
        await a.getByRole("button", { name: "기권", exact: true }).click();
        await a.getByRole("alertdialog").getByRole("button", { name: "기권", exact: true }).click();
        await a.getByRole("dialog", { name: "패배", exact: true }).waitFor();
        assert.deepEqual(errors, []);
        for (const context of contexts) {
          for (const page of context.pages()) await page.unrouteAll({ behavior: "ignoreErrors" });
          await context.unrouteAll({ behavior: "ignoreErrors" });
          await context.close();
        }
      }
    } finally {
      for (const context of browser.contexts()) {
        for (const page of context.pages()) await page.unrouteAll({ behavior: "ignoreErrors" });
        await context.unrouteAll({ behavior: "ignoreErrors" });
      }
      await browser.close();
      await server.close();
    }
  },
);
