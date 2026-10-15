import type { Locale } from "ui/locale";

export function detectRequestLocale(country: string | null, acceptLanguage: string | null): Locale {
  const code = country?.trim().toUpperCase();
  if (code && /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "ZZ") return code === "KR" ? "ko" : "en";

  let locale: Locale = "en";
  let bestQuality = 0;
  for (const entry of (acceptLanguage ?? "").split(",")) {
    const [tag, ...parameters] = entry.trim().toLowerCase().split(";");
    const language = tag.split("-")[0];
    if (language !== "ko" && language !== "en") continue;
    const weight = parameters.map(parameter => parameter.trim()).find(parameter => parameter.startsWith("q="));
    const quality = weight === undefined ? 1 : Number(weight.slice(2));
    if (quality > bestQuality && quality <= 1) { locale = language; bestQuality = quality; }
  }
  return locale;
}
