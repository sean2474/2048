import { test } from "node:test";
import assert from "node:assert/strict";
import { bindingCodeFromEvent, DEFAULT_KEYBINDINGS, isKeybindings, keyLabel, parseKeybindings, resolveKeyAction } from "../../web/src/lib/keybindings";

const key = (code: string, options = {}) => ({ code, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, isComposing: false, repeat: false, defaultPrevented: false, ...options });

test("stored bindings require six unique letter or number codes and recover from corruption", () => {
  const custom = { ...DEFAULT_KEYBINDINGS, up: "KeyI", xblock: "Digit8" };
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
  const custom = { ...DEFAULT_KEYBINDINGS, up: "KeyI", xblock: "Digit8" };
  for (const [code, action] of [["ArrowUp", "up"], ["ArrowDown", "down"], ["ArrowLeft", "left"], ["ArrowRight", "right"]]) {
    assert.equal(resolveKeyAction(key(code), custom, false), action);
  }
  assert.equal(resolveKeyAction(key("KeyI"), custom, true), "up");
  assert.equal(resolveKeyAction(key("Digit8"), custom, true), "xblock");
  for (const code of ["KeyW", "Digit1", "toString", "Enter"]) assert.equal(resolveKeyAction(key(code), custom, true), null);
  for (const code of ["KeyI", "Digit8"]) assert.equal(resolveKeyAction(key(code), custom, false), null);
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
  for (const code of ["Digit1", "Digit2"]) {
    assert.equal(resolveKeyAction(key(code, { repeat: true }), DEFAULT_KEYBINDINGS, true), null);
    assert.notEqual(resolveKeyAction(key(code), DEFAULT_KEYBINDINGS, true), null);
  }
});
