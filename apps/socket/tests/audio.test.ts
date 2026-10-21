import { createAbilityState } from "game-core";
import test from "node:test";
import assert from "node:assert/strict";
import { ABILITIES } from "schema/loadout";
import {
  DEFAULT_AUDIO,
  GameAudio,
  matchSound,
  parseAudioSettings,
  playerSound,
} from "../../web/src/lib/game-audio";
import { createLesson, tutorialReducer } from "../../web/src/lib/tutorial";
import type { End, ServerState } from "schema/in-game";

test("audio preferences reject corrupt, incomplete and out-of-range storage", () => {
  for (const value of [
    null,
    "{",
    "null",
    "[]",
    "{}",
    '{"muted":"false","volume":0.5}',
    '{"muted":true,"volume":-1}',
    '{"muted":true,"volume":2}',
  ]) {
    assert.deepEqual(parseAudioSettings(value), DEFAULT_AUDIO);
  }
  assert.deepEqual(parseAudioSettings('{"muted":true,"volume":0}'), { muted: true, volume: 0 });
  assert.deepEqual(parseAudioSettings('{"muted":false,"volume":1}'), { muted: false, volume: 1 });
});

test("tutorial actions distinguish movement, merges, automatic attacks and impacts", () => {
  for (const step of [0, 1, 2, 3] as const) {
    const initial = createLesson(step);
    const moved = tutorialReducer(initial, { type: "move", dir: "up" });
    assert.equal(playerSound(initial, moved), step === 3 ? "impact" : "move");
    assert.equal(playerSound(moved, tutorialReducer(moved, { type: "move", dir: "up" })), null);
    const merged = tutorialReducer(initial, { type: "move", dir: "left" });
    assert.equal(
      playerSound(initial, merged),
      step === 0 ? "merge" : step === 3 ? "impact" : step === 1 ? "xblock" : "hardblock",
    );
    if (step === 1 || step === 2) {
      const landed = tutorialReducer(merged, { type: "opponentMove" });
      assert.equal(
        playerSound(merged, landed),
        null,
        "opponent movement must not replay your attack",
      );
    }
  }
});

function state(): ServerState {
  const lesson = createLesson();
  return {
    t: "state",
    serverTime: 0,
    mode: "casual",
    you: {
      ...lesson,
      iconId: "guest",
      skinId: "classic",
      maxTile: 2,
      ability: createAbilityState(),
    },
    paused: false,
    pendingAttacks: 0,
    incomingAttacks: { xblock: 0, hardblock: 0 },
    names: { you: "Guest", opp: "Opponent" },
  };
}

test("match cues ignore opponent moves, repeated snapshots, ghosts and reconnect catch-up", () => {
  const initial = state();
  assert.equal(matchSound(null, initial), "start");
  assert.equal(matchSound(null, { ...initial, paused: true }), null);
  assert.equal(matchSound({ ...initial, paused: true }, initial), "start");
  assert.equal(matchSound(initial, structuredClone(initial)), null);
  assert.equal(matchSound(initial, { ...initial, opp: { ...initial.you, score: 128 } }), null);
  assert.equal(
    matchSound(initial, {
      ...initial,
      you: {
        ...initial.you,
        board: [...initial.you.board, { id: 99, value: 2, row: 1, col: 1, ghost: true }],
      },
    }),
    null,
  );
  assert.equal(matchSound(initial, { ...initial, pendingAttacks: 1 }), "incoming");
  assert.equal(matchSound(initial, { ...initial, paused: true, pendingAttacks: 1 }), null);
  assert.equal(
    matchSound(
      { ...initial, paused: true, reconnectDeadline: Date.now() + 1000 },
      { ...initial, you: { ...initial.you, score: 256 } },
    ),
    null,
  );
});

test("results take priority and saved-result updates never replay the cue", () => {
  const initial = state();
  for (const [winner, sound] of [
    ["you", "win"],
    ["opp", "lose"],
    ["draw", "draw"],
  ] as const) {
    const end: End = {
      ...initial,
      t: "end",
      matchId: "audio-test",
      winner,
      reason: "surrender",
      recording: "saving",
    };
    assert.equal(matchSound(initial, end), sound);
    assert.equal(matchSound(end, { ...end, recording: "saved" }), null);
  }
});

test("audio waits for activation, bounds bursts and stops immediately on mute and hide", async () => {
  const originalContext = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const document = { hidden: false };
  const voices: { stopped: boolean; disconnected: boolean }[] = [];
  let clock = 1;
  let contexts = 0;
  let closed = false;
  class FakeAudioContext {
    state = "suspended";
    destination = {};
    sampleRate = 48000;
    createBuffer(_channels: number, length: number) {
      return { getChannelData: () => new Float32Array(length) };
    }
    createBiquadFilter() {
      return {
        type: "lowpass",
        Q: { value: 0 },
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        disconnect() {},
      };
    }
    get currentTime() {
      return clock;
    }
    constructor() {
      contexts++;
    }
    async resume() {
      this.state = "running";
    }
    async close() {
      closed = true;
    }
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
        disconnect() {},
      };
    }
    createBufferSource() {
      const source = {
        buffer: null,
        stopped: false,
        disconnected: false,
        connect() {},
        disconnect() {
          this.disconnected = true;
        },
        start() {},
        stop(at?: number) {
          if (at === undefined) this.stopped = true;
        },
      };
      voices.push(source);
      return source;
    }
    createOscillator() {
      const voice = {
        type: "sine",
        stopped: false,
        disconnected: false,
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        disconnect() {
          this.disconnected = true;
        },
        start() {},
        stop(at?: number) {
          if (at === undefined) this.stopped = true;
        },
      };
      voices.push(voice);
      return voice;
    }
  }
  Object.defineProperty(globalThis, "AudioContext", {
    configurable: true,
    value: FakeAudioContext,
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  const audio = new GameAudio();
  try {
    audio.play("move");
    assert.equal(contexts, 0);
    assert.equal(await audio.unlock(), true);
    await audio.unlock();
    assert.equal(contexts, 1);
    audio.play("merge");
    assert.equal(voices.length, 2);
    audio.play("merge");
    assert.equal(voices.length, 2);
    audio.setSettings({ muted: true, volume: 0.5 });
    assert.ok(voices.every((voice) => voice.stopped && voice.disconnected));
    clock++;
    audio.play("win");
    assert.equal(voices.length, 2);
    audio.setSettings({ muted: false, volume: 0 });
    audio.play("win");
    assert.equal(voices.length, 2);
    audio.setSettings(DEFAULT_AUDIO);
    document.hidden = true;
    audio.play("win");
    assert.equal(voices.length, 2);
    document.hidden = false;
    audio.play("win");
    assert.equal(voices.length, 8);
    clock++;
    audio.play("hardblock");
    assert.equal(voices.filter((voice) => !voice.stopped).length, 9);
    clock++;
    audio.play("merge");
    clock++;
    audio.play("merge");
    assert.ok(voices.filter((voice) => !voice.stopped).length <= 12);
    audio.dispose();
    assert.ok(closed);
    assert.ok(voices.every((voice) => voice.stopped));
    Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: undefined });
    assert.equal(await new GameAudio().unlock(), false);
  } finally {
    if (originalContext) Object.defineProperty(globalThis, "AudioContext", originalContext);
    else Reflect.deleteProperty(globalThis, "AudioContext");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("abilities only sound on confirmed charge consumption, including effects without board movement", () => {
  for (const { id } of ABILITIES) {
    const previous = state();
    previous.you.ability = { ...previous.you.ability, id, charge: 1024 };
    const next = structuredClone(previous);
    next.you.ability.charge = 0;
    assert.equal(matchSound(previous, next), id);
    assert.equal(matchSound(next, structuredClone(next)), null);
    const opponentOnly = structuredClone(previous);
    opponentOnly.opp = { ...next.you };
    assert.equal(matchSound(previous, opponentOnly), null);
  }
});
