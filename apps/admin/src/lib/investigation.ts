export function kstDate(now = Date.now()) {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function adminTime(value: string, locale: string) {
  return new Date(value).toLocaleString(locale, { timeZone: "Asia/Seoul" }) + " KST";
}
export function listReturn(value: string | null, path: "/players" | "/matches") {
  return value?.startsWith(`${path}?`) ? value : path;
}
