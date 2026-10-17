import { test } from "node:test";
import assert from "node:assert/strict";
import { ABILITIES } from "schema/loadout";
import { consumedAbility } from "../../web/src/lib/ability-effects";

test("ability effects require confirmed charge consumption of the same equipped ability", () => {
  for (const { id } of ABILITIES) {
    const ready = { id, charge: 1024 }, used = { id, charge: 0 };
    assert.equal(consumedAbility(ready, used), id);
    assert.equal(consumedAbility(undefined, used), null, "initial and reconnect snapshots cannot replay a cast");
    assert.equal(consumedAbility(ready, undefined), null);
    assert.equal(consumedAbility(ready, ready), null, "rejected requests keep their charge");
    assert.equal(consumedAbility(used, used), null, "later state packets cannot repeat the effect");
    assert.equal(consumedAbility(used, ready), null, "charging is not a cast");
    assert.equal(consumedAbility({ id, charge: 1023 }, used), null);
    assert.equal(consumedAbility(ready, { ...used, charge: 1 }), null);
    assert.equal(consumedAbility(ready, { id: id === "clear-x" ? "frost-wave" : "clear-x", charge: 0 }), null);
  }
});
