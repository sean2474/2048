import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const socketRequire = createRequire(new URL("../../socket/package.json", import.meta.url));
const { build } = createRequire(socketRequire.resolve("tsx/package.json"))("esbuild");
const artifacts = fileURLToPath(new URL("../../../docs/audio/", import.meta.url));

test("rendered cues have distinct waveforms, repeat variation, silence tails and full-volume headroom", async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../src/lib/game-audio.ts", import.meta.url))],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "AudioHarness",
    platform: "browser",
  });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const clips = await page.evaluate(async () => {
      const cues = [
        "move",
        "merge",
        "xblock",
        "hardblock",
        "incoming",
        "impact",
        "start",
        "win",
        "lose",
        "draw",
        "clear-x",
        "spawn-pause",
        "frost-wave",
        "anchor-tile",
        "swap-32",
      ];
      const cases = cues.map((sound) => ({ name: sound, sound }));
      for (const skin of [
        "kitty",
        "bunny",
        "sentinel",
        "runeknight",
        "arcanist",
        "rank-diamond",
        "rank-master",
      ])
        cases.push({ name: skin, sound: "merge", skin });
      cases.push(
        { name: "merge-variation", sound: "merge", variation: true },
        { name: "rapid-merges", sound: "merge", burst: true },
      );
      const rendered = [];
      for (const cue of cases) {
        const contexts = [];
        window.AudioContext = class extends OfflineAudioContext {
          constructor() {
            super(1, 57600, 48000);
            contexts.push(this);
          }
          get state() {
            return "running";
          }
          async close() {}
        };
        const engine = new AudioHarness.GameAudio();
        if (!(await engine.unlock())) throw Error("Offline audio unavailable");
        const context = contexts[0];
        engine.setSettings({ muted: false, volume: 1 });
        if (cue.variation) {
          engine.play("merge");
          engine.stop();
        }
        for (let i = 0; i < (cue.burst ? 20 : 1); i++) {
          Object.defineProperty(context, "currentTime", { configurable: true, value: i * 0.05 });
          engine.play(cue.sound, cue.skin);
        }
        const samples = (await context.startRendering()).getChannelData(0);
        let peak = 0,
          energy = 0,
          last = 0;
        const pcm = new Uint8Array(samples.length * 2);
        const view = new DataView(pcm.buffer);
        samples.forEach((sample, i) => {
          if (!Number.isFinite(sample)) throw Error(`Non-finite output: ${cue.name}`);
          peak = Math.max(peak, Math.abs(sample));
          energy += sample * sample;
          if (Math.abs(sample) > 0.00001) last = i;
          view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true);
        });
        let binary = "";
        for (let i = 0; i < pcm.length; i += 8192)
          binary += String.fromCharCode(...pcm.subarray(i, i + 8192));
        rendered.push({
          name: cue.name,
          peak,
          rms: Math.sqrt(energy / samples.length),
          duration: last / 48000,
          pcm: btoa(binary),
        });
        engine.dispose();
      }
      return rendered;
    });
    const samples = clips.map((clip) => {
      assert.ok(
        clip.peak > 0.005 && clip.peak < 0.95,
        `${clip.name}: audible and unclipped (${clip.peak})`,
      );
      assert.ok(clip.rms > 0.0005, `${clip.name}: non-silent output`);
      assert.ok(clip.duration > 0.015 && clip.duration < 1.1, `${clip.name}: bounded decay`);
      const pcm = Buffer.from(clip.pcm, "base64");
      return Array.from({ length: pcm.length / 2 }, (_, i) => pcm.readInt16LE(i * 2) / 32767);
    });
    for (let a = 0; a < samples.length; a++)
      for (let b = a + 1; b < samples.length; b++) {
        let product = 0,
          ea = 0,
          eb = 0;
        for (let i = 0; i < samples[a].length; i++) {
          product += samples[a][i] * samples[b][i];
          ea += samples[a][i] ** 2;
          eb += samples[b][i] ** 2;
        }
        assert.ok(
          Math.abs(product / Math.sqrt(ea * eb)) < 0.95,
          `${clips[a].name} and ${clips[b].name} should not sound like duplicate waveforms`,
        );
      }
    await mkdir(artifacts, { recursive: true });
    const medley = Buffer.concat(
      clips
        .slice(0, -1)
        .flatMap((clip) => [
          Buffer.from(clip.pcm, "base64").subarray(
            0,
            Math.ceil((clip.duration + 0.05) * 48000) * 2,
          ),
          Buffer.alloc(14400),
        ]),
    );
    const header = Buffer.alloc(44);
    header.write("RIFF");
    header.writeUInt32LE(36 + medley.length, 4);
    header.write("WAVEfmt ", 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(48000, 24);
    header.writeUInt32LE(96000, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(medley.length, 40);
    await writeFile(`${artifacts}sound-preview.wav`, Buffer.concat([header, medley]));
    await writeFile(
      `${artifacts}render-checks.json`,
      JSON.stringify(
        clips.map(({ name, peak, rms, duration }) => ({ name, peak, rms, duration })),
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
});
