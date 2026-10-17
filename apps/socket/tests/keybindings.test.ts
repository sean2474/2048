import { test } from "node:test";
import assert from "node:assert/strict";
import { bindingCodeFromEvent, createMovementRepeater, DEFAULT_KEYBINDINGS, isKeybindings, keyLabel, parseKeybindings, resolveKeyAction } from "../../web/src/lib/keybindings";

const key = (code: string, options = {}) => ({ code, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, isComposing: false, repeat: false, defaultPrevented: false, ...options });

test("stored bindings require seven unique letter or number codes and recover from corruption", () => {
  const custom = { ...DEFAULT_KEYBINDINGS, up: "KeyI", xblock: "Digit8", ability: "KeyF" };
  assert.equal(isKeybindings(custom), true);
  assert.deepEqual(parseKeybindings(JSON.stringify(custom)), custom);
  for (const value of [null, [], {}, { ...custom, up: "ArrowUp" }, { ...custom, up: custom.down }, { ...custom, down: "Enter" }, { ...custom, extra: "KeyZ" }]) {
    assert.equal(isKeybindings(value), false);
    assert.deepEqual(parseKeybindings(JSON.stringify(value)), DEFAULT_KEYBINDINGS);
  }
  assert.deepEqual(parseKeybindings("{damaged"), DEFAULT_KEYBINDINGS);
  assert.deepEqual(parseKeybindings(null), DEFAULT_KEYBINDINGS);
});

test("all arrows remain available when character shortcuts are off; remaps replace defaults", () => {
  const custom = { ...DEFAULT_KEYBINDINGS, up: "KeyI", xblock: "Digit8", ability: "KeyF" };
  for (const [code, action] of [["ArrowUp", "up"], ["ArrowDown", "down"], ["ArrowLeft", "left"], ["ArrowRight", "right"]]) {
    assert.equal(resolveKeyAction(key(code), custom, false), action);
  }
  assert.equal(resolveKeyAction(key("KeyI"), custom, true), "up");
  assert.equal(resolveKeyAction(key("Digit8"), custom, true), "xblock");
  assert.equal(resolveKeyAction(key("Digit3"), DEFAULT_KEYBINDINGS, true), "ability");
  assert.equal(resolveKeyAction(key("KeyF"), custom, true), "ability");
  for (const code of ["KeyW", "Digit1", "Digit3", "toString", "Enter"]) assert.equal(resolveKeyAction(key(code), custom, true), null);
  for (const code of ["KeyI", "Digit8", "KeyF"]) assert.equal(resolveKeyAction(key(code), custom, false), null);
});

test("modifiers, composing and prevented events never trigger controls or key capture", () => {
  for (const flag of ["altKey", "ctrlKey", "metaKey", "shiftKey", "isComposing", "defaultPrevented"]) {
    assert.equal(resolveKeyAction(key("KeyW", { [flag]: true }), DEFAULT_KEYBINDINGS, true), null);
    assert.equal(resolveKeyAction(key("ArrowUp", { [flag]: true }), DEFAULT_KEYBINDINGS, true), null);
    assert.equal(bindingCodeFromEvent(key("KeyW", { [flag]: true })), null);
  }
  assert.equal(bindingCodeFromEvent(key("ArrowUp")), null);
  assert.equal(bindingCodeFromEvent(key("KeyW")), "KeyW");
  assert.equal(bindingCodeFromEvent(key("Digit9")), "Digit9");
  assert.equal(keyLabel("KeyW"), "W");
  assert.equal(keyLabel("Digit9"), "9");
});

test("held movement repeats but attacks fire only once per press", () => {
  assert.equal(resolveKeyAction(key("KeyW", { repeat: true }), DEFAULT_KEYBINDINGS, true), "up");
  assert.equal(resolveKeyAction(key("ArrowUp", { repeat: true }), DEFAULT_KEYBINDINGS, false), "up");
  for (const code of ["Digit1", "Digit2", "Digit3"]) {
    assert.equal(resolveKeyAction(key(code, { repeat: true }), DEFAULT_KEYBINDINGS, true), null);
    assert.notEqual(resolveKeyAction(key(code), DEFAULT_KEYBINDINGS, true), null);
  }
});

test("legacy bindings keep every custom key and gain the first unused ability digit", () => {
  const old = { up: "KeyI", down: "KeyK", left: "KeyJ", right: "KeyL", xblock: "Digit1", hardblock: "Digit2" };
  assert.equal(isKeybindings(old), false);
  assert.deepEqual(parseKeybindings(JSON.stringify(old)), { ...old, ability: "Digit3" });
  const occupied = { up: "Digit3", down: "Digit4", left: "Digit5", right: "Digit6", xblock: "Digit7", hardblock: "Digit8" };
  assert.deepEqual(parseKeybindings(JSON.stringify(occupied)), { ...occupied, ability: "Digit9" });
  for (const bad of [{ ...old, up: "KeyK" }, { ...old, up: "ArrowUp" }, { ...old, ability: null }, { ...old, extra: "KeyZ" }, { down: "KeyK", left: "KeyJ", right: "KeyL", xblock: "Digit1", hardblock: "Digit2" }]) {
    assert.deepEqual(parseKeybindings(JSON.stringify(bad)), DEFAULT_KEYBINDINGS);
  }
});

test("movement repeats on a shared timer, replaces directions immediately and releases safely", t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const moves: string[] = [];
  const movement = createMovementRepeater(dir => moves.push(dir));
  movement.press("KeyW", "up");
  assert.deepEqual(moves, ["up"]);
  t.mock.timers.tick(100);
  movement.release("KeyW");
  t.mock.timers.tick(300);
  assert.deepEqual(moves, ["up"], "a normal tap must not repeat");
  moves.length = 0;
  movement.press("KeyW", "up");
  t.mock.timers.tick(199);
  assert.deepEqual(moves, ["up"]);
  movement.press("KeyW", "up");
  t.mock.timers.tick(1);
  assert.deepEqual(moves, ["up", "up"], "browser repeats must not add or postpone movement");
  movement.press("KeyD", "right");
  assert.deepEqual(moves, ["up", "up", "right"], "a new direction acts immediately");
  movement.release("KeyW");
  t.mock.timers.tick(200);
  assert.deepEqual(moves, ["up", "up", "right", "right"], "releasing a previous direction must not stop the current one");
  movement.release("KeyD");
  t.mock.timers.tick(700);
  assert.equal(moves.length, 4);
  movement.press("ArrowUp", "up");
  t.mock.timers.tick(200);
  t.mock.timers.tick(70);
  assert.deepEqual(moves.slice(4), ["up", "up", "up"], "arrow and character keys use the same timer");
  movement.stop();
  t.mock.timers.tick(700);
  assert.equal(moves.length, 7);
});
