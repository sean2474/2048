import assert from "node:assert/strict";
import test from "node:test";
import { detectRequestLocale } from "../../web/src/lib/i18n/request-locale";
import { DEFAULT_SETTINGS, parseGuestSettings } from "../../web/src/lib/preferences";

test("country chooses the first language ahead of browser preferences", () => {
  assert.equal(detectRequestLocale("KR", "en-US"), "ko");
  assert.equal(detectRequestLocale(" kr ", "en-US"), "ko");
  for (const country of ["US", "JP", "DE"]) assert.equal(detectRequestLocale(country, "ko-KR"), "en");
});

test("missing or unknown country uses the best supported browser language", () => {
  for (const country of [null, "", "XX", "ZZ", "unknown"]) {
    assert.equal(detectRequestLocale(country, "ko-KR,ko;q=0.9,en;q=0.8"), "ko");
    assert.equal(detectRequestLocale(country, "ko;q=0.2,en-US;q=0.9"), "en");
    assert.equal(detectRequestLocale(country, "fr-FR,ko;q=0.8,en;q=0.5"), "ko");
    assert.equal(detectRequestLocale(country, "ko;q=0,en;q=0.5"), "en");
    assert.equal(detectRequestLocale(country, "ko;q=invalid,en;q=0.5"), "en");
    assert.equal(detectRequestLocale(country, "ko;q=2"), "en");
    assert.equal(detectRequestLocale(country, "ko;q=0.5,en;q=0.5"), "ko");
    assert.equal(detectRequestLocale(country, "fr-FR"), "en");
    assert.equal(detectRequestLocale(country, null), "en");
  }
});

test("saved guest language wins; missing or damaged settings use the detected language", () => {
  for (const fallback of ["en", "ko"] as const) {
    assert.equal(parseGuestSettings(undefined, fallback).locale, fallback);
    assert.equal(parseGuestSettings("%broken", fallback).locale, fallback);
    for (const locale of ["ko", "en"] as const) {
      const cookie = encodeURIComponent(JSON.stringify({ ...DEFAULT_SETTINGS, locale }));
      assert.equal(parseGuestSettings(cookie, fallback).locale, locale);
    }
  }
});
