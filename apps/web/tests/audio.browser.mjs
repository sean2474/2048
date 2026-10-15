import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const origin = "http://[::1]:3001";

import { trackAudio } from "./browser-fixtures.mjs";

test("real audio graph, tutorial cues, mute, volume, persistence and mobile controls", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({ locale: "en-US", viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await trackAudio(context);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}/tutorial`);
    const sound = page.getByRole("button", { name: "Game sound", exact: true });
    await sound.waitFor();
    assert.equal(await page.evaluate(() => window.audioProbe.contexts.length), 0);
    await page.getByRole("button", { name: "Move left", exact: true }).tap();
    await page.getByRole("heading", { name: "You’ve got the basics", exact: true }).waitFor();
    await page.waitForFunction(() => window.audioProbe.notes.length === 2);
    assert.equal(await page.evaluate(() => window.audioProbe.contexts[0].state), "running");
    assert.deepEqual(await page.evaluate(() => window.audioProbe.notes), [440, 880]);
    await sound.tap();
    assert.equal(await sound.getAttribute("aria-pressed"), "false");
    await page.waitForFunction(() => window.audioProbe.contexts[0].master.gain.value === 0);
    await page.getByRole("button", { name: "Skip ahead to 128 + 128", exact: true }).tap();
    await page.getByRole("button", { name: "Move left", exact: true }).tap();
    await page.getByRole("heading", { name: "X attack charged. Your turn to send it.", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.audioProbe.notes.length), 2);
    await sound.tap();
    await page.getByRole("group", { name: "Attack controls", exact: true }).getByRole("button", { name: /Send X block/ }).tap();
    await page.waitForFunction(() => window.audioProbe.notes.at(-1) === 720);
    assert.equal(await page.evaluate(() => window.audioProbe.contexts.length), 1);

    await page.goto(`${origin}/settings`);
    const volume = page.getByRole("slider", { name: "Effects volume", exact: true });
    await volume.fill("20");
    await page.getByRole("button", { name: "Test sound", exact: true }).tap();
    await page.waitForFunction(() => window.audioProbe.notes.length === 2);
    await page.waitForFunction(() => {
      const context = window.audioProbe.contexts[0];
      const samples = new Float32Array(context.analyser.fftSize);
      context.analyser.getFloatTimeDomainData(samples);
      return samples.some(value => Math.abs(value) > 0.00001);
    }, null, { timeout: 3000, polling: "raf" });
    assert.ok(Math.abs(await page.evaluate(() => window.audioProbe.contexts[0].master.gain.value) - 0.2) < 0.001);
    await page.getByRole("button", { name: "Game sound", exact: true }).tap();
    await page.reload();
    await page.waitForFunction(() => document.getElementById("audio-volume")?.value === "20");
    assert.equal(await page.getByRole("button", { name: "Game sound", exact: true }).getAttribute("aria-pressed"), "false");
    assert.equal(await page.getByRole("button", { name: "Test sound", exact: true }).isDisabled(), true);
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      assert.ok((await volume.boundingBox()).height >= 44);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: "/tmp/2048-audio-settings.png", fullPage: true });
    await page.goto(`${origin}/tutorial`);
    await page.waitForFunction(() => document.querySelector('button[aria-label="Game sound"]')?.matches(":enabled"));
    assert.equal(await sound.getAttribute("aria-pressed"), "false");
    await page.getByRole("button", { name: "Move left", exact: true }).tap();
    await page.getByRole("heading", { name: "You’ve got the basics", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.audioProbe.notes.length), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
    await page.screenshot({ path: "/tmp/2048-audio-tutorial.png", fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
});

test("blocked storage and unsupported audio keep tutorial usable and report limitations", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({ locale: "ko-KR" });
    await context.addInitScript(() => {
      window.AudioContext = undefined;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "duo.audio") throw new Error("Storage blocked for test");
        return original.call(this, key, value);
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}/settings`);
    await page.getByRole("button", { name: "게임 사운드", exact: true }).click();
    await page.getByText("오디오 설정을 저장하지 못했습니다. 현재 접속 중에만 유지됩니다.", { exact: true }).waitFor();
    await page.getByText("오디오를 사용할 수 없습니다. 소리 없이 계속 플레이할 수 있어요.", { exact: true }).waitFor();
    await page.getByRole("link", { name: "직접 해보는 튜토리얼", exact: true }).click();
    await page.getByRole("button", { name: "왼쪽으로 이동", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="your-score"]')?.textContent === "4");
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
});

test("friend match plays confirmed moves and one result cue per player", async () => {
  // Another local app binds IPv4 :3001; this workspace's dev server listens on IPv6.
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--host-resolver-rules=MAP localhost [::1]"] });
  const matchOrigin = "http://localhost:3001";
  try {
    const hostContext = await browser.newContext({ locale: "en-US" });
    const guestContext = await browser.newContext({ locale: "en-US" });
    await trackAudio(hostContext);
    await trackAudio(guestContext);
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    const errors = [];
    for (const page of [host, guest]) page.on("pageerror", error => errors.push(error.message));
    await host.goto(`${matchOrigin}/play/create`);
    await host.getByTestId("join-code").waitFor();
    const code = await host.getByTestId("join-code").innerText();
    await host.getByRole("heading", { name: "Play with a friend", exact: true }).click();
    await guest.goto(`${matchOrigin}/play/join`);
    await guest.getByRole("textbox", { name: "Room code", exact: true }).fill(code);
    await guest.getByRole("button", { name: "Join room", exact: true }).click();
    for (const page of [host, guest]) {
      await page.getByRole("heading", { name: "Match in progress", exact: true }).waitFor();
      await page.waitForFunction(() => window.audioProbe.notes.includes(523));
    }
    const initialNotes = await host.evaluate(() => window.audioProbe.notes.length);
    // At least one direction is valid on a newly spawned board.
    for (const direction of ["left", "down", "right", "up"]) {
      await host.getByRole("button", { name: `Move ${direction}`, exact: true }).click();
    }
    await host.waitForFunction(count => window.audioProbe.notes.length > count, initialNotes);
    await guest.getByRole("button", { name: "Surrender", exact: true }).click();
    await guest.getByRole("alertdialog").getByRole("button", { name: "Surrender", exact: true }).click();
    await host.getByRole("heading", { name: "You win!", exact: true }).waitFor();
    await guest.getByRole("heading", { name: "You lose.", exact: true }).waitFor();
    assert.deepEqual(await host.evaluate(() => window.audioProbe.notes.slice(-3)), [523, 659, 784]);
    assert.deepEqual(await guest.evaluate(() => window.audioProbe.notes.slice(-3)), [330, 262, 196]);
    assert.deepEqual(errors, []);
    await hostContext.close();
    await guestContext.close();
  } finally { await browser.close(); }
});
