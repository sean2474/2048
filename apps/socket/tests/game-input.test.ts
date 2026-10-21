import test from "node:test";
import assert from "node:assert/strict";
import { createSwipeGesture, directionButtonHandlers } from "../../web/src/lib/game-input";

test("direction buttons act before release without a second pointer click move", () => {
  let moves = 0;
  const handlers = directionButtonHandlers(() => moves++, false);
  handlers.onPointerDown({ button: 0, isPrimary: true });
  assert.equal(moves, 1, "contact sends the move before any click/release");
  handlers.onClick({ detail: 1 });
  assert.equal(moves, 1);
  handlers.onPointerDown({ button: 0, isPrimary: true });
  handlers.onClick({ detail: 2 });
  assert.equal(moves, 2, "rapid taps each send exactly one move");
  handlers.onClick({ detail: 0 });
  assert.equal(moves, 3, "keyboard and assistive activation remain available");
});

test("disabled controls and secondary pointers cannot move", () => {
  let moves = 0;
  const disabled = directionButtonHandlers(() => moves++, true);
  disabled.onPointerDown({ button: 0, isPrimary: true });
  disabled.onClick({ detail: 0 });
  const enabled = directionButtonHandlers(() => moves++, false);
  enabled.onPointerDown({ button: 2, isPrimary: true });
  enabled.onPointerDown({ button: 0, isPrimary: false });
  enabled.onClick({ detail: 1 });
  assert.equal(moves, 0);
});

const touch = (clientX: number, clientY: number, identifier = 1) => ({
  clientX,
  clientY,
  identifier,
});
test("swipes move at the threshold, once per finger gesture, in all four directions", () => {
  for (const [x, y, direction] of [
    [24, 3, "right"],
    [-24, 3, "left"],
    [3, 24, "down"],
    [3, -24, "up"],
  ] as const) {
    const gesture = createSwipeGesture();
    gesture.start([touch(0, 0)]);
    assert.equal(gesture.move([touch(12, 12)]), null);
    assert.equal(gesture.move([touch(x, y)]), direction, "do not wait for touchend");
    assert.equal(gesture.move([touch(x * 3, y * 3)]), null);
    assert.equal(gesture.end([touch(x * 3, y * 3)]), null, "lifting must not add a move");
    gesture.start([touch(0, 0)]);
    assert.equal(
      gesture.end([touch(x, y)]),
      direction,
      "fast swipes still work if touchmove was coalesced",
    );
  }
});

test("taps, cancellation, other fingers and multitouch never leak into a later swipe", () => {
  const gesture = createSwipeGesture();
  gesture.start([touch(0, 0)]);
  assert.equal(gesture.end([touch(23, 0)]), null);
  assert.equal(gesture.move([touch(100, 0)]), null);
  gesture.start([touch(0, 0)]);
  assert.equal(gesture.move([touch(100, 0, 2)]), null);
  gesture.cancel();
  assert.equal(gesture.end([touch(100, 0)]), null);
  gesture.start([touch(0, 0)]);
  assert.equal(gesture.move([touch(50, 0), touch(50, 0, 2)]), null);
  assert.equal(gesture.end([touch(100, 0)]), null);
  gesture.start([touch(0, 0), touch(0, 0, 2)]);
  assert.equal(gesture.move([touch(100, 0)]), null);
  gesture.start([touch(0, 0)]);
  assert.equal(gesture.move([touch(0, -25)]), "up");
});
