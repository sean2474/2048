import assert from "node:assert/strict";
import { test } from "node:test";
import { allowMove } from "../src/move-limit";

test("normal held-key input passes while bursts stay below 20 moves in any second", () => {
  const normal: number[] = [];
  for (let now = 0; now < 60_000; now += 70) assert.equal(allowMove(normal, now), true);
  const burst: number[] = [];
  for (let i = 0; i < 20; i++) assert.equal(allowMove(burst, 100 + i), true);
  assert.equal(allowMove(burst, 1000), false);
  assert.equal(allowMove(burst, 1099), false);
  assert.equal(allowMove(burst, 1100), true);
  assert.equal(allowMove(burst, 1100), false);
  assert.equal(burst.length, 20);
});
