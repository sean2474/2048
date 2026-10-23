import { test } from "node:test";
import assert from "node:assert/strict";
import {
  startServerFixture,
  fixturePlayer,
  fixtureSeason,
} from "../../web/tests/server-fixture.mjs";

// Exercise actual RSC HTML and access checks against a loopback API, without browser hydration.
test(
  "admin records render on the server, share verified access, validate URL filters and stream skeletons",
  { timeout: 120000 },
  async (t) => {
    let allowed = true,
      unavailable = false,
      release;
    const calls = [];
    const player = {
      id: fixturePlayer,
      name: "<script>Private player</script>",
      username: null,
      email: "private@example.invalid",
      rating: 1200,
      tier: null,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: "2026-01-01T00:00:00Z",
      isAdmin: false,
      suspendedAt: null,
      suspensionReason: null,
    };
    const app = await startServerFixture({
      app: "admin",
      handle: async (url, request) => {
        const name = url.pathname.split("/").at(-1);
        if (!url.pathname.includes("/rpc/")) return undefined;
        let body = "";
        for await (const part of request) body += part;
        calls.push({ name, args: body ? JSON.parse(body) : {} });
        if (name === "is_game_admin") return { data: allowed };
        if (name === "admin_players_filtered") {
          if (release === "hold")
            await new Promise((resolve) => {
              release = resolve;
            });
          return unavailable
            ? { status: 503, data: { message: "fixture unavailable" } }
            : { data: { total: 1, players: [player] } };
        }
        if (name === "admin_player") return { data: { player, matches: [], audit: [] } };
        if (name === "admin_coin_history")
          return {
            data: {
              balance: 1234,
              transactions: [
                {
                  id: 1,
                  delta: 1234,
                  balanceAfter: 1234,
                  reason: "admin_grant",
                  reference: {},
                  actorId: fixturePlayer,
                  note: "<b>Fixture grant</b>",
                  createdAt: "2026-10-17T00:00:00Z",
                },
              ],
            },
          };
        if (name === "admin_rank_seasons")
          return {
            data: [
              {
                ...fixtureSeason,
                created_by: fixturePlayer,
                transition_reason: "SSR season history",
              },
            ],
          };
        if (name === "admin_matches")
          return { data: { matches: [], hasMore: false, nextCursor: null } };
        if (name === "admin_audit_entries")
          return { data: { entries: [], hasMore: false, nextCursor: null } };
        if (name === "admin_content_catalog")
          return { data: { skins: [], profileIcons: [], achievements: [] } };
        if (name === "admin_overview")
          return {
            data: {
              periodDays: 7,
              periodStart: "2026-10-10T15:00:00Z",
              periodEnd: "2026-10-17T15:00:00Z",
              totals: {
                matches: 12,
                rankedMatches: 5,
                players: 6,
                avgDurationSeconds: 90,
                avgScore: 1500,
                telemetryParticipants: 24,
                unmeasuredParticipants: 0,
                avgMoves: 40,
              },
              modes: [
                { mode: "casual", matches: 7 },
                { mode: "ranked", matches: 5 },
              ],
              reasons: [{ reason: "reached_1024", matches: 12 }],
              daily: [
                { date: "2026-10-16", matches: 5 },
                { date: "2026-10-17", matches: 7 },
              ],
              tiers: [{ tier: "Gold", players: 6 }],
              attacks: [
                {
                  type: "xblock",
                  charged: 9,
                  sent: 8,
                  received: 7,
                  participantsWhoSent: 8,
                  winsWhenSent: 6,
                },
                {
                  type: "hardblock",
                  charged: 2,
                  sent: 2,
                  received: 1,
                  participantsWhoSent: 2,
                  winsWhenSent: 1,
                },
              ],
              abilities: [
                { ability: "frost-wave", participants: 8, wins: 6, uses: 11 },
                { ability: "clear-x", participants: 3, wins: 1, uses: 2 },
              ],
            },
          };
        return { data: null };
      },
    });
    t.after(() => app.close());
    const robotResponse = await fetch(app.origin + "/robots.txt");
    assert.equal(robotResponse.status, 200);
    assert.equal(robotResponse.headers.get("x-powered-by"), null);
    assert.equal(robotResponse.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(robotResponse.headers.get("x-frame-options"), "DENY");
    assert.equal(robotResponse.headers.get("x-content-type-options"), "nosniff");
    assert.match(robotResponse.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.match(await robotResponse.text(), /Disallow: \//);
    const cookie = app.cookie();
    app.requests.length = 0;
    const rememberedRobots = await fetch(app.origin + "/robots.txt", {
      headers: { cookie: `${cookie.name}=${cookie.value}` },
    });
    assert.equal(rememberedRobots.status, 200);
    await rememberedRobots.text();
    assert.equal(app.requests.length, 0, "admin robots bypasses session lookup even with a cookie");
    const headers = {
      cookie: `${cookie.name}=${cookie.value}; 2048-locale=en`,
      "accept-language": "en-US",
    };
    const returning = await fetch(app.origin + "/login", { headers, redirect: "manual" });
    assert.equal(returning.status, 307, "a remembered administrator skips the login form");
    assert.equal(new URL(returning.headers.get("location"), app.origin).pathname, "/");
    const html = async (path) => (await fetch(app.origin + path, { headers })).text();
    const start = calls.length;
    const players = await html("/players?q=hello&status=invalid&offset=-1");
    assert.match(players, /&lt;script&gt;Private player&lt;\/script&gt;/);
    assert.doesNotMatch(players, /<script>Private player/);
    assert.match(players, /private@example.invalid/);
    assert.deepEqual(calls.find((call) => call.name === "admin_players_filtered").args, {
      p_query: "hello",
      p_status: "all",
      p_offset: 0,
    });
    assert.equal(calls.slice(start).filter((call) => call.name === "is_game_admin").length, 1);
    const detail = await html(`/players/${fixturePlayer}?returnTo=https://example.invalid`);
    assert.match(detail, /href="\/players"/);
    assert.match(detail, /Latest 20 matches/);
    assert.match(detail, /Operator grant/);
    assert.match(detail, /1,234/);
    assert.match(detail, /&lt;b&gt;Fixture grant&lt;\/b&gt;/);
    assert.doesNotMatch(detail, /<b>Fixture grant/);
    assert.match(detail, /Grant coins…/);
    assert.match(await html("/seasons"), /SSR season history/);
    const overview = await html("/?days=7");
    // The fixture renders Korean, so match rendered copy rather than the embedded English dictionary.
    assert.match(overview, /id="ability-heading"[^>]*>특수 능력별 승률</);
    assert.match(overview, /감속<\/span><span[^>]*>사용 11회/, "frost-wave shows its use count");
    assert.match(
      overview,
      /<strong>75(<!-- -->)?%<\/strong>/,
      "frost-wave: 6 wins of 8 measured results",
    );
    assert.match(
      overview,
      /<strong>33(<!-- -->)?%<\/strong>[\s\S]{0,400}?표본 부족/,
      "clear-x has fewer than 5 samples",
    );
    assert.match(overview, /알박기/, "abilities without results stay listed");
    assert.ok(
      (overview.match(/기록 없음/g) ?? []).length >= 3,
      "three abilities have no measured results (streamed chunks may split rows)",
    );
    assert.match(overview, /<svg[^>]*role="img"[^>]*aria-label="일별 종료 대전/);
    assert.match(overview, /<table class="sr-only">/);
    assert.match(await html("/matches"), /No saved matches found/);
    assert.match(await html("/audit"), /No access changes recorded/);
    unavailable = true;
    assert.match(await html("/players"), /Players could not be loaded/);
    unavailable = false;
    assert.match(await html("/players"), /private@example.invalid/);
    allowed = false;
    const beforeDenied = calls.length;
    const denied = await html("/players");
    assert.match(denied, /Administrator access required/);
    assert.doesNotMatch(denied, /private@example.invalid/);
    assert.equal(
      calls.slice(beforeDenied).filter((call) => call.name === "admin_players_filtered").length,
      0,
    );
    allowed = true;
    release = "hold";
    const response = await fetch(app.origin + "/players", { headers });
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let prefix = "";
    while (!prefix.includes("animate-pulse")) {
      const part = await reader.read();
      assert.equal(part.done, false, "stream should yield loading markup before the RPC completes");
      prefix += decoder.decode(part.value);
    }
    assert.match(prefix, /motion-reduce:animate-none/);
    while (typeof release !== "function") await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    let rest = "";
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      rest += decoder.decode(part.value);
    }
    assert.match(prefix + rest, /private@example.invalid/);

    // Second factor: an aal1 session never reaches console data or the operations proxy.
    const weak = app.cookie(fixturePlayer, "aal1");
    const weakHeaders = { ...headers, cookie: `${weak.name}=${weak.value}; 2048-locale=en` };
    const resumeMfa = await fetch(app.origin + "/login", {
      headers: weakHeaders,
      redirect: "manual",
    });
    assert.equal(resumeMfa.status, 307, "password verification does not need to be repeated");
    assert.equal(new URL(resumeMfa.headers.get("location"), app.origin).pathname, "/mfa");
    const beforeWeak = calls.length;
    const gated = await fetch(app.origin + "/players", {
      headers: weakHeaders,
      redirect: "manual",
    });
    assert.equal(gated.status, 307);
    assert.equal(new URL(gated.headers.get("location"), app.origin).pathname, "/mfa");
    assert.equal(calls.slice(beforeWeak).length, 0, "no admin RPC runs before the second factor");
    const enroll = await fetch(app.origin + "/mfa", { headers: weakHeaders });
    assert.equal(enroll.status, 200);
    assert.match(await enroll.text(), /Set up two-factor authentication/);
    const operations = await fetch(app.origin + "/api/operations", { headers: weakHeaders });
    assert.equal(operations.status, 403);
    assert.equal((await operations.json()).error, "mfa_required");
    const verified = await fetch(app.origin + "/mfa", { headers, redirect: "manual" });
    assert.equal(verified.status, 307);
    assert.equal(new URL(verified.headers.get("location"), app.origin).pathname, "/");
  },
);

test(
  "admin sessions survive token expiry and remain isolated from game cookies",
  { timeout: 120000 },
  async (t) => {
    let revoked = false;
    let refreshes = 0;
    const app = await startServerFixture({
      app: "admin",
      handle: async (url) => {
        if (url.pathname === "/auth/v1/token") {
          refreshes++;
          if (revoked)
            return {
              status: 400,
              data: { code: "refresh_token_not_found", message: "Invalid Refresh Token" },
            };
        }
        if (url.pathname.endsWith("/rpc/is_game_admin")) return { data: true };
        return undefined;
      },
    });
    t.after(() => app.close());
    const original = app.cookie();
    const expired = JSON.parse(Buffer.from(original.value.slice(7), "base64url").toString());
    expired.expires_at = Math.floor(Date.now() / 1000) - 3600;
    const jwt = expired.access_token.split(".");
    const claims = JSON.parse(Buffer.from(jwt[1], "base64url").toString());
    jwt[1] = Buffer.from(JSON.stringify({ ...claims, exp: expired.expires_at })).toString(
      "base64url",
    );
    expired.access_token = jwt.join(".");
    const expiredCookie = `${original.name}=base64-${Buffer.from(JSON.stringify(expired)).toString("base64url")}`;
    const response = await fetch(app.origin + "/login", {
      headers: { cookie: expiredCookie },
      redirect: "manual",
    });
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location"), app.origin).pathname, "/");
    assert.equal(
      refreshes,
      1,
      "middleware refreshes once and forwards the new session to the page",
    );
    const saved = response.headers
      .getSetCookie()
      .filter((cookie) => cookie.startsWith(original.name));
    assert.ok(saved.length > 0);
    for (const cookie of saved) {
      assert.match(
        cookie,
        /Max-Age=34560000/i,
        "login survives closing the browser (400 days, renewed on refresh)",
      );
      assert.match(cookie, /Path=\//i);
      assert.match(cookie, /SameSite=lax/i);
      assert.doesNotMatch(cookie, /Domain=/i, "the administrator cookie stays on its own host");
    }
    const resumed = await fetch(app.origin + "/login", {
      headers: { cookie: saved.map((cookie) => cookie.split(";")[0]).join("; ") },
      redirect: "manual",
    });
    assert.equal(resumed.status, 307);
    assert.equal(new URL(resumed.headers.get("location"), app.origin).pathname, "/");
    assert.equal(refreshes, 1, "a new request reuses the saved MFA-verified session");

    for (const cookie of ["", `sb-127-auth-token=${original.value}`]) {
      const guest = await fetch(app.origin + "/login", { headers: { cookie }, redirect: "manual" });
      assert.equal(
        guest.status,
        200,
        "missing or game-only cookies cannot authenticate an administrator",
      );
      assert.match(await guest.text(), /name="password"/);
    }

    revoked = true;
    const invalid = await fetch(app.origin + "/login", {
      headers: { cookie: expiredCookie },
      redirect: "manual",
    });
    assert.equal(invalid.status, 200);
    assert.match(await invalid.text(), /name="password"/);
    assert.ok(
      invalid.headers
        .getSetCookie()
        .some((cookie) => cookie.startsWith(original.name) && /Max-Age=0/i.test(cookie)),
    );
  },
);
