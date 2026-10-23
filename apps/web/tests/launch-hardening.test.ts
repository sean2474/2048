import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import webConfig from "../next.config";
import adminConfig from "../../admin/next.config";
import robots from "../src/app/robots";
import adminRobots from "../../admin/src/app/robots";
import sitemap from "../src/app/sitemap";
import { siteMetadata } from "../src/lib/site-metadata";

function environment(t: TestContext, values: Record<string, string | undefined>) {
  const previous = Object.keys(values).map((key) => process.env[key]);
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else Object.assign(process.env, { [key]: value });
  });
  t.after(() => {
    Object.keys(values).forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else Object.assign(process.env, { [key]: previous[index] });
    });
  });
}

test("production headers restrict framing, content types and external origins for both apps", async (t) => {
  environment(t, {
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co/storage/?ignored=1",
    NEXT_PUBLIC_SOCKET_URL: "https://socket.example.invalid/path",
  });
  for (const config of [webConfig, adminConfig]) {
    assert.equal(config.poweredByHeader, false);
    const rules = await config.headers!();
    const headers = Object.fromEntries(rules[0].headers.map(({ key, value }) => [key, value]));
    assert.equal(rules[0].source, "/:path*");
    assert.equal(headers["X-Frame-Options"], "DENY");
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(headers["Referrer-Policy"], "no-referrer");
    assert.match(headers["Strict-Transport-Security"], /max-age=31536000/);
    const policy = headers["Content-Security-Policy"];
    assert.match(policy, /default-src 'self'/);
    assert.match(policy, /frame-ancestors 'none'/);
    assert.match(policy, /object-src 'none'/);
    assert.match(policy, /base-uri 'self'/);
    assert.match(policy, /form-action 'self'/);
    assert.match(policy, /https:\/\/project\.supabase\.co/);
    assert.match(policy, /wss:\/\/project\.supabase\.co/);
    assert.doesNotMatch(policy, /unsafe-eval|localhost|127\.0\.0\.1|ignored|\/storage|\*/);
    assert.doesNotMatch(policy, /(?:^|\s)(?:https?:|wss?:)(?:\s|;)/);
    if (config === webConfig) {
      assert.match(policy, /https:\/\/socket\.example\.invalid/);
      assert.match(policy, /wss:\/\/socket\.example\.invalid/);
    } else assert.doesNotMatch(policy, /socket\.example/);
  }
});

test("development keeps HMR and loopback APIs usable without HTTPS enforcement", async (t) => {
  environment(t, {
    NODE_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SOCKET_URL: "http://localhost:4000",
  });
  for (const config of [webConfig, adminConfig]) {
    const [rule] = await config.headers!();
    const headers = Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]));
    assert.equal(headers["Strict-Transport-Security"], undefined);
    assert.match(headers["Content-Security-Policy"], /'unsafe-eval'/);
    assert.match(headers["Content-Security-Policy"], /http:\/\/127\.0\.0\.1:54321/);
    assert.match(headers["Content-Security-Policy"], /ws:/);
    assert.doesNotMatch(headers["Content-Security-Policy"], /upgrade-insecure-requests/);
  }
});

test("configured CSP origins reject unsupported schemes and credentials", async (t) => {
  environment(t, { NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: undefined });
  for (const value of [
    "not a URL",
    "javascript:alert(1)",
    "http://example.invalid",
    "https://user:secret@example.invalid",
  ]) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = value;
    for (const config of [webConfig, adminConfig]) await assert.rejects(config.headers!());
  }
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  await assert.doesNotReject(adminConfig.headers!());
});

test("only explicit production exposes public canonical routes to crawlers", (t) => {
  environment(t, {
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_ENV: "production",
    NEXT_PUBLIC_VERCEL_ENV: "production",
  });
  const publicPaths = [
    "/",
    "/solo",
    "/how-to-play",
    "/tutorial",
    "/leaderboard",
    "/privacy",
    "/terms",
  ];
  assert.deepEqual(
    sitemap().map(({ url }) => url),
    publicPaths.map((path) => `https://www.2048duo.io${path}`),
  );
  assert.equal(robots().sitemap, "https://www.2048duo.io/sitemap.xml");
  assert.deepEqual(adminRobots(), { rules: { userAgent: "*", disallow: "/" } });
  const metadata = siteMetadata();
  assert.equal(metadata.metadataBase?.href, "https://www.2048duo.io/");
  assert.equal(metadata.openGraph?.title, "2048 Duo");
  assert.ok(metadata.twitter && "card" in metadata.twitter);
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.deepEqual(metadata.robots, { index: true, follow: true });
  for (const key of ["NODE_ENV", "NEXT_PUBLIC_APP_ENV", "NEXT_PUBLIC_VERCEL_ENV"]) {
    for (const value of ["development", "preview", "staging", ""]) {
      Object.assign(process.env, { [key]: value });
      assert.deepEqual(sitemap(), []);
      assert.deepEqual(robots(), { rules: { userAgent: "*", disallow: "/" } });
      assert.deepEqual(siteMetadata().robots, { index: false, follow: false });
    }
    delete process.env[key];
    assert.deepEqual(sitemap(), []);
    Object.assign(process.env, { [key]: "production" });
  }
});
