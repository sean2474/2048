import test from "node:test";
import assert from "node:assert/strict";
import { GameAudio } from "../../web/src/lib/game-audio";
import { SKINS } from "schema/loadout";

test("legendary merges have distinct voices; other cues and mute stay unchanged", async () => {
  const savedContext = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const notes: { frequency: number; wave: string }[] = [];
  class FakeAudioContext {
    state = "running";
    currentTime = 1;
    destination = {};
    async close() {}
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
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
      } else assert.deepEqual(notes.map(note => note.frequency), [440, 880]);
    }
    assert.equal(signatures.size, 5);
    notes.length = 0; audio.stop(); audio.play("charge", "arcanist");
    assert.deepEqual(notes.map(note => note.frequency), [523, 659, 1047]);
    notes.length = 0; audio.stop(); audio.setSettings({ muted: true, volume: .45 }); audio.play("merge", "sentinel");
    assert.equal(notes.length, 0);
  } finally {
    audio.dispose();
    if (savedContext) Object.defineProperty(globalThis, "AudioContext", savedContext); else Reflect.deleteProperty(globalThis, "AudioContext");
    if (savedDocument) Object.defineProperty(globalThis, "document", savedDocument); else Reflect.deleteProperty(globalThis, "document");
  }
});
