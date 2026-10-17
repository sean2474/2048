import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const webRoot = fileURLToPath(new URL("../", import.meta.url));
export const fixturePlayer = "10000000-0000-4000-8000-000000000099";
export const fixtureSeason = { id: "11111111-1111-4111-8111-111111111111", name: "Season Two", starts_at: "2026-10-16T00:00:00Z", ends_at: null };
export const fixtureOldSeason = { id: "22222222-2222-4222-8222-222222222222", name: "Season One", starts_at: "2026-10-01T00:00:00Z", ends_at: fixtureSeason.starts_at };
export const fixtureRating = { player_id: fixturePlayer, display_name: "Fixture Challenger", rating: 1400, wins: 9, losses: 1, draws: 0, games_played: 10, highest_score: 2048, highest_tile: 512, season_id: fixtureSeason.id, tier: "Platinum", placement_games: 10, peak_rating: 1605, rank_seasons: { name: fixtureSeason.name } };

function user(id) {
  return { id, aud: "authenticated", role: "authenticated", email: "fixture@example.invalid", is_anonymous: false, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
}
function session(id) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access_token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"), Buffer.from(JSON.stringify({ sub: id, exp, role: "authenticated" })).toString("base64url"), "fixture"].join(".");
  return { access_token, refresh_token: "fixture-only", expires_at: exp, expires_in: 3600, token_type: "bearer", user: user(id) };
}

// Both SSR and browser requests use this loopback-only fixture. No real account or DB is touched.
export async function startServerFixture({ handle, port = 0, app = "web" } = {}) {
  if (!["web", "admin"].includes(app)) throw new Error("Unknown fixture app");
  const appRoot = app === "admin" ? fileURLToPath(new URL("../../admin/", import.meta.url)) : webRoot;
  const requests = [];
  const api = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-headers", "*");
    response.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
    if (request.method === "OPTIONS") { response.end(); return; }
    let id = null;
    try { id = JSON.parse(Buffer.from(request.headers.authorization?.split(".")[1] ?? "", "base64url").toString()).sub; } catch {}
    requests.push({ path: url.pathname, search: url.search, id, method: request.method });
    try {
      const custom = await handle?.(url, request, id);
      let data = custom?.data, status = custom?.status ?? 200;
      if (custom === undefined) {
        if (url.pathname === "/auth/v1/token") data = session(fixturePlayer);
        else if (url.pathname === "/auth/v1/user") { data = id ? user(id) : { message: "Invalid fixture session" }; status = id ? 200 : 401; }
        else if (url.pathname === "/auth/v1/logout") data = {};
        else if (url.pathname.endsWith("/players")) data = id ? [{ ...user(id), name: id === fixturePlayer ? "Fixture Challenger" : "Second Player", username: null, image_path: null, updated_at: user(id).created_at }] : [];
        else if (url.pathname.endsWith("/player_preferences")) data = [{ player_id: id, locale: "en", skin_id: "classic", icon_id: "orb", ability_id: null, custom_shortcuts: false, keybindings: { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD", ability: "Digit1" } }];
        else if (url.pathname.endsWith("/player_wallets")) data = [{ player_id: id, balance: 12 }];
        else if (url.pathname.endsWith("/rpc/content_catalog")) data = { skins: [], profileIcons: [], achievements: [] };
        else if (url.pathname.endsWith("/rank_seasons")) data = [fixtureSeason, fixtureOldSeason];
        else if (url.pathname.endsWith("/player_ratings") || url.pathname.endsWith("/season_ratings")) data = [{ ...fixtureRating, ...(id ? { player_id: id } : {}) }];
        else if (url.pathname.endsWith("/matches")) data = id ? [{ id: "33333333-3333-4333-8333-333333333333", started_at: fixtureSeason.starts_at, ended_at: "2026-10-17T01:00:00Z", reason: "surrender", ranked: true, mode: "ranked", rank_seasons: { name: fixtureSeason.name }, match_participants: [{ slot: 1, player_id: id, display_name: "Fixture Challenger", score: 100, max_tile: 64, result: "win", rating_before: 1390, rating_after: 1400, rating_delta: 10, tier_after: "Platinum", placement_games: 10 }, { slot: 2, player_id: "opponent", display_name: "Opponent", score: 20, max_tile: 16, result: "loss" }] }] : [];
        else data = [];
      }
      if (Array.isArray(data) && request.headers.accept?.includes("vnd.pgrst.object")) data = data[0] ?? null;
      response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(data));
    } catch (error) { response.writeHead(500); response.end(JSON.stringify({ message: String(error) })); }
  });
  api.listen(0, "127.0.0.1"); await once(api, "listening");
  if (!port) {
    const reservation = createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
    port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  }
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--turbopack", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: appRoot, env: { ...process.env, NEXT_DIST_DIR: `.next/ssr-tests-${port}`, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${api.address().port}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public-key", NEXT_PUBLIC_SOCKET_URL: "http://127.0.0.1:1", NEXT_PUBLIC_APP_ENV: "development", NEXT_PUBLIC_VERCEL_ENV: "development", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = ""; child.stdout.on("data", chunk => { logs += chunk; }); child.stderr.on("data", chunk => { logs += chunk; });
  const close = async () => {
    const exited = once(child, "exit");
    if (child.exitCode === null) { child.kill("SIGTERM"); const kill = setTimeout(() => child.kill("SIGKILL"), 5000); await exited; clearTimeout(kill); }
    api.closeAllConnections(); await new Promise(resolve => api.close(resolve));
  };
  try {
    const deadline = Date.now() + 60_000;
    while (!logs.includes("Ready in")) {
      if (child.exitCode !== null || Date.now() > deadline) throw new Error(logs || "Fixture server did not start");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (error) { await close(); throw error; }
  const cookie = (id = fixturePlayer) => ({ name: app === "admin" ? "sb-2048-admin-auth" : "sb-127-auth-token", value: `base64-${Buffer.from(JSON.stringify(session(id))).toString("base64url")}`, url: origin });
  return { origin, requests, cookie, close };
}
