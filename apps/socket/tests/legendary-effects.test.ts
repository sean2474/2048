import test from "node:test";
import assert from "node:assert/strict";
import { GameAudio } from "../../web/src/lib/game-audio";
import { SKINS } from "schema/loadout";
import { PROFILE_ICONS } from "schema/profile-icons";
import { readFileSync } from "node:fs";

test("legendary merges have distinct voices; other cues and mute stay unchanged", async () => {
  const savedContext = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const notes: { frequency: number; wave: string }[] = [];
  class FakeAudioContext {
    state = "running";
    currentTime = 1;
    destination = {};
    sampleRate = 48000;
    createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
    createBiquadFilter() { return { type: "lowpass", Q: { value: 0 }, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    async close() {}
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createBufferSource() { return { buffer: null, connect() {}, disconnect() {}, start() {}, stop() {} }; }
    createOscillator() {
      let frequency = 0;
      return { type: "sine", frequency: { setValueAtTime(value: number) { frequency = value; }, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, stop() {}, start() { notes.push({ frequency, wave: this.type }); } };
    }
  }
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: FakeAudioContext });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { hidden: false } });
  const audio = new GameAudio();
  try {
    await audio.unlock();
    const signatures = new Set<string>();
    for (const skin of SKINS) {
      notes.length = 0; audio.stop(); audio.play("merge", skin.id);
      if (skin.rarity === "legendary") {
        assert.ok(notes.length >= 2 && notes.length <= 3);
        assert.notDeepEqual(notes.map(note => note.frequency), [440, 880]);
        signatures.add(JSON.stringify(notes));
      } else { assert.ok(notes[0].frequency >= 440 && notes[0].frequency <= 660); assert.equal(notes[1].frequency / notes[0].frequency, 2); }
    }
    assert.equal(signatures.size, SKINS.filter(skin => skin.rarity === "legendary").length);
    notes.length = 0; audio.stop(); audio.play("xblock", "arcanist");
    assert.deepEqual(notes.map(note => note.frequency), [720]);
    notes.length = 0; audio.stop(); audio.setSettings({ muted: true, volume: .45 }); audio.play("merge", "sentinel");
    assert.equal(notes.length, 0);
  } finally {
    audio.dispose();
    if (savedContext) Object.defineProperty(globalThis, "AudioContext", savedContext); else Reflect.deleteProperty(globalThis, "AudioContext");
    if (savedDocument) Object.defineProperty(globalThis, "document", savedDocument); else Reflect.deleteProperty(globalThis, "document");
  }
});


test("rank cosmetic sets pair six distinct skins and safe profile artwork", () => {
  const ranks = ["bronze", "silver", "gold", "platinum", "diamond", "master"];
  const rarities = ["rare", "rare", "epic", "epic", "legendary", "legendary"];
  const sets = SKINS.filter(skin => skin.id.startsWith("rank-"));
  assert.equal(sets.length, ranks.length);
  for (const [index, rank] of ranks.entries()) {
    const id = `rank-${rank}`;
    const skin = SKINS.find(item => item.id === id);
    const icon = PROFILE_ICONS.find(item => item.id === id);
    assert.ok(skin, `${rank} board skin exists`);
    assert.ok(icon, `${rank} profile icon exists`);
    assert.equal(skin.name, icon.name);
    assert.equal(skin.rarity, rarities[index]);
    const svg = readFileSync(new URL(`../../web/public/profile-icons/${id}.svg`, import.meta.url), "utf8");
    assert.match(svg, /viewBox="0 0 160 160"/);
    assert.doesNotMatch(svg, /<(script|foreignObject|text|image|animate)\b|\son[a-z]+=|\bhref=/i);
    assert.match(svg, /<path /);
  }
  assert.equal(new Set(sets.map(skin => JSON.stringify(skin.tokens))).size, 6);
});
