import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLocale, translate } from "./locale";

test("locale cookies accept only supported languages", () => {
  assert.equal(normalizeLocale("en"), "en");
  for (const value of [undefined, "ko", "fr", "../../en"]) assert.equal(normalizeLocale(value), "ko");
});

test("translations interpolate named values and preserve English fallbacks", () => {
  const messages = { "{name} has {count} tickets": "{name}님의 공격권 {count}개" };
  assert.equal(translate("ko", messages, "{name} has {count} tickets", { name: "$&", count: 0 }), "$&님의 공격권 0개");
  assert.equal(translate("en", messages, "{name} has {count} tickets", { name: "Player", count: 2 }), "Player has 2 tickets");
  assert.equal(translate("ko", messages, "Missing key"), "Missing key");
  assert.equal(translate("ko", messages, "toString"), "toString");
  assert.equal(translate("ko", messages, "{constructor}"), "{constructor}");
  assert.equal(translate("ko", messages, "{name} has {count} tickets", { count: 3 }), "{name}님의 공격권 3개");
});
