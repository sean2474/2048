import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { cpus, platform, arch } from "node:os";
import { gzipSync } from "node:zlib";
import { fixtureCookies, startPerformanceFixture } from "./performance-fixture.mjs";
import { discoverPages, routeCase } from "./performance-routes.mjs";
import { installProbe, readMetrics, summarize } from "./performance-metrics.mjs";
import { measureMatch, measureSolo } from "./performance-games.mjs";

const require = createRequire(import.meta.url),
  { chromium } = require("playwright");
const root = resolve(process.env.BENCH_ROOT ?? join(import.meta.dirname, "../../.."));
const label = process.env.BENCH_LABEL ?? "local";
assert.match(label, /^[a-z0-9-]+$/);
const runs = Number(process.env.BENCH_RUNS ?? 5);
assert.ok(Number.isInteger(runs) && runs >= 1 && runs <= 20);
const observationWindowMs = Number(process.env.BENCH_OBSERVE_MS ?? 0);
assert.ok(
  Number.isInteger(observationWindowMs) && observationWindowMs >= 0 && observationWindowMs <= 10000,
);
const basePort = Number(process.env.BENCH_PORT ?? 3410);
assert.ok(Number.isInteger(basePort) && basePort > 1024 && basePort < 65530);
const ports = { web: basePort, admin: basePort + 1, api: basePort + 2, socket: basePort + 3 };
const output = resolve(process.env.BENCH_OUTPUT ?? join(root, "docs/full-performance", label));
const devices = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, mobile: false },
  { name: "mobile-emulation", viewport: { width: 375, height: 812 }, mobile: true },
];
const requestedApp = process.env.BENCH_APP;
assert.ok(!requestedApp || ["web", "admin"].includes(requestedApp));
const apps = requestedApp ? [requestedApp] : ["web", "admin"];
const children = [];
let browser, fixture;
const report = {
  label,
  measuredAt: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  environment: {
    mode: "local-production-build",
    node: process.version,
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    browser: null,
    runs,
    throttling: "none",
    backend:
      "loopback fixture data + real local Socket.IO; no external database or network latency simulation",
    cold: "fresh context with empty HTTP cache; warm server process",
    warm: "same-context reload",
    mobile: "viewport/touch emulation on desktop CPU, not real phone",
  },
  coverage: [],
  bundles: [],
  pages: [],
  navigation: [],
  games: [],
  solo: [],
  failures: [],
};
report.environment.observationWindowMs = observationWindowMs;
await mkdir(output, { recursive: true });

async function launchApp(app) {
  const appRoot = join(root, "apps", app);
  const next = createRequire(join(appRoot, "package.json")).resolve("next/dist/bin/next");
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${ports.api}`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public-key",
    NEXT_PUBLIC_SOCKET_URL: `http://127.0.0.1:${ports.socket}`,
    ADMIN_SOCKET_URL: `http://127.0.0.1:${ports.api}`,
    NEXT_PUBLIC_APP_ENV: "development",
    NEXT_PUBLIC_VERCEL_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  // Each benchmark owns its whole worktree; web and admin have independent output directories.
  if (app === "web") env.NEXT_DIST_DIR = ".next/performance-benchmark";
  const build = spawn(process.execPath, [next, "build", "--turbopack"], {
    cwd: appRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let buildLog = "";
  build.stdout.on("data", (chunk) => {
    buildLog += chunk;
  });
  build.stderr.on("data", (chunk) => {
    buildLog += chunk;
  });
  const [buildCode] = await once(build, "exit");
  await writeFile(join(output, `${app}-build.log`), buildLog);
  assert.equal(buildCode, 0, `${app} production build failed; see ${app}-build.log`);
  const dist = join(appRoot, app === "web" ? ".next/performance-benchmark" : ".next");
  const manifest = JSON.parse(await readFile(join(dist, "app-build-manifest.json"), "utf8"));
  for (const [entry, chunks] of Object.entries(manifest.pages)) {
    if (!entry.endsWith("/page")) continue;
    const files = [...new Set(chunks.filter((file) => file.endsWith(".js")))];
    const bytes = await Promise.all(files.map((file) => readFile(join(dist, file))));
    const route =
      "/" +
      entry
        .split("/")
        .filter((part) => part && !part.startsWith("(") && part !== "page")
        .join("/");
    report.bundles.push({
      app,
      route,
      files,
      jsBytes: bytes.reduce((sum, buffer) => sum + buffer.length, 0),
      gzipBytes: bytes.reduce((sum, buffer) => sum + gzipSync(buffer).length, 0),
      definition:
        "Unique initial app-build-manifest JS chunks; raw bytes and sum of individually gzipped chunks. Runtime lazy imports excluded.",
    });
  }
  const child = spawn(
    process.execPath,
    [next, "start", "--hostname", "127.0.0.1", "--port", String(ports[app])],
    { cwd: appRoot, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  children.push(child);
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  const deadline = performance.now() + 30000;
  while (!logs.includes("Ready in")) {
    assert.equal(child.exitCode, null, logs);
    assert.ok(performance.now() < deadline, logs);
    await delay(100);
  }
  return `http://127.0.0.1:${ports[app]}`;
}

async function ready(page, entry) {
  await page.locator("h1").first().waitFor();
  if (entry.ready.selector) await page.locator(entry.ready.selector).first().waitFor();
  if (entry.ready.text)
    await page
      .getByText(entry.ready.text, { exact: false })
      .and(page.locator("main :visible"))
      .first()
      .waitFor();
  // A heading is not data readiness: require the route's data sentinel and no active loading status.
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('main [role="status"], main [aria-busy="true"]')].some(
        (el) =>
          el.getClientRects().length &&
          (el.getAttribute("aria-busy") === "true" ||
            /loading|getting .*ready|불러오는|로딩/i.test(el.textContent)),
      ),
  );
  await page.evaluate(
    () =>
      new Promise((resolvePaint) =>
        requestAnimationFrame(() => requestAnimationFrame(resolvePaint)),
      ),
  );
}

async function measurePages(origin, entries, device) {
  for (const entry of entries) {
    if (entry.journey) continue;
    for (let run = 0; run < runs; run++) {
      const context = await browser.newContext({
        locale: "en-US",
        viewport: device.viewport,
        isMobile: device.mobile,
        hasTouch: device.mobile,
      });
      await context.addCookies(
        entry.auth
          ? fixtureCookies(origin, entry.app)
          : [{ name: "duo.locale", value: "en", url: origin }],
      );
      const page = await context.newPage(),
        errors = [];
      page.setDefaultTimeout(15000);
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(installProbe);
      try {
        for (const cache of ["cold", "warm"]) {
          const requestStart = fixture.requests.length;
          const response =
            cache === "cold"
              ? await page.goto(origin + entry.path, { waitUntil: "load" })
              : await page.reload({ waitUntil: "load" });
          assert.equal(response.status(), 200);
          await ready(page, entry);
          if (observationWindowMs)
            await page.waitForFunction(
              (horizon) => performance.now() >= horizon,
              observationWindowMs,
            );
          const metrics = await page.evaluate(readMetrics);
          assert.ok(
            metrics.ttfbMs >= 0 &&
              metrics.loadMs > 0 &&
              metrics.observedDataReadyMs >= metrics.headingMs,
          );
          assert.deepEqual(errors, [], `Browser errors on ${entry.app}${entry.path}`);
          const alerts = await page.locator('[role="alert"]:visible').allTextContents();
          assert.ok(
            !alerts.some((text) => /could not|failed|unavailable|unable to|error/i.test(text)),
            `Unexpected data error: ${alerts.join(" ")}`,
          );
          report.pages.push({
            capturedAt: new Date().toISOString(),
            app: entry.app,
            route: entry.route,
            path: entry.path,
            state: entry.state ?? "ready",
            auth: entry.auth,
            device: device.name,
            run: run + 1,
            cache,
            ...metrics,
            preferencesQueries: fixture.requests
              .slice(requestStart)
              .filter((request) => request.path.endsWith("/player_preferences")).length,
            backendRequests: fixture.requests.slice(requestStart).map((request) => request.path),
          });
          if (run === 0 && cache === "cold")
            await page.screenshot({
              path: join(
                output,
                `${entry.app}-${entry.path.replace(/[^a-z0-9]/gi, "_")}-${device.name}.png`,
              ),
              fullPage: true,
            });
        }
      } catch (error) {
        const failure = {
          app: entry.app,
          route: entry.route,
          device: device.name,
          run: run + 1,
          error: String(error),
        };
        report.failures.push(failure);
        console.error(JSON.stringify(failure));
        await page
          .screenshot({
            path: join(output, `failure-${report.failures.length}.png`),
            fullPage: true,
          })
          .catch(() => {});
        break;
      } finally {
        await context.close();
      }
    }
    console.log(`Measured ${entry.app} ${entry.path} ${device.name}`);
    await writeFile(join(output, "raw.json"), JSON.stringify(report, null, 2));
  }
}

async function measureNavigation(origin, entries, device) {
  const context = await browser.newContext({
    locale: "en-US",
    viewport: device.viewport,
    isMobile: device.mobile,
    hasTouch: device.mobile,
  });
  await context.addCookies(fixtureCookies(origin, entries[0].app));
  const page = await context.newPage();
  try {
    for (const entry of entries.filter(
      (entry) => entry.auth && !entry.journey && entry.path !== "/",
    )) {
      for (let run = 0; run < runs; run++) {
        await page.goto(origin);
        await ready(page, routeCase(entry.app, "/"));
        const link = page.locator(`a[href="${entry.path}"]:visible`).first();
        if (!(await link.count())) break;
        await page.evaluate(() => {
          window.__navigationClick = null;
          document.addEventListener(
            "click",
            (event) => {
              if (event.target.closest("a")) window.__navigationClick = performance.now();
            },
            { once: true, capture: true },
          );
        });
        await link.click();
        await page.waitForURL(origin + entry.path);
        await ready(page, entry);
        const observedDataReadyMs = await page.evaluate(() =>
          window.__navigationClick === null ? null : performance.now() - window.__navigationClick,
        );
        assert.ok(
          observedDataReadyMs !== null && observedDataReadyMs >= 0,
          "Must observe an actual client link click",
        );
        report.navigation.push({
          app: entry.app,
          route: entry.route,
          device: device.name,
          run: run + 1,
          observedDataReadyMs,
          source: "/",
          cache: "client-navigation-with-normal-prefetch",
        });
      }
    }
  } finally {
    await context.close();
  }
}

try {
  fixture = await startPerformanceFixture({
    root,
    webPort: ports.web,
    adminPort: ports.admin,
    apiPort: ports.api,
    socketPort: ports.socket,
  });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  report.environment.browser = browser.version();
  for (const app of apps) {
    const allRoutes = await discoverPages(root, app),
      entries = allRoutes.map((route) => routeCase(app, route));
    report.coverage.push(...entries);
    const origin = await launchApp(app);
    const filter = process.env.BENCH_ROUTES?.split(",");
    const selected = filter ? entries.filter((entry) => filter.includes(entry.route)) : entries;
    for (const device of devices) {
      await measurePages(origin, selected, device);
      if (!filter) await measureNavigation(origin, entries, device);
    }
    if (app === "web" && process.env.BENCH_GAMES !== "0") {
      for (const device of devices) {
        for (const surrender of [false, true]) {
          try {
            console.log(`Measuring ${device.name} ${surrender ? "surrender" : "natural"} match`);
            report.games.push(
              await measureMatch(browser, origin, device, fixture, {
                surrender,
                screenshotPath: join(
                  output,
                  `game-${device.name}-${surrender ? "surrender" : "natural"}.png`,
                ),
              }),
            );
            await writeFile(join(output, "raw.json"), JSON.stringify(report, null, 2));
          } catch (error) {
            report.failures.push({
              journey: surrender ? "surrender" : "natural-match",
              device: device.name,
              error: String(error),
            });
            console.error(String(error));
          }
        }
        if (allRoutes.includes("/solo"))
          try {
            report.solo.push(await measureSolo(browser, origin, device));
          } catch (error) {
            report.failures.push({
              journey: "solo-clock",
              device: device.name,
              error: String(error),
            });
            console.error(String(error));
          }
      }
    }
  }
  report.environment.unknownFixtureRoutes = [...new Set(fixture.unknown)];
  report.summary = summarize(report.pages);
  await writeFile(join(output, "raw.json"), JSON.stringify(report, null, 2));
  const lines = [
    "# Local production performance measurements",
    "",
    `Commit: ${report.commit}`,
    `Chrome: ${report.environment.browser}; ${runs} repetitions; no CPU/network throttling.`,
    "",
    "Backend data is a loopback fixture; game transport uses the real local Socket.IO server. Mobile means viewport/touch emulation. Readiness is a post-load observed upper bound including automation round trips and paint checks, not first data arrival. Paint values stop at this observation and are lab samples, not field Core Web Vitals.",
    "",
    "| App / route / device / account / cache | n | Observed ready upper bound median / p95 ms | TTFB median ms | LCP sample median ms |",
    "|---|---:|---:|---:|---:|",
    ...report.summary.map(
      (row) =>
        `| ${row.key.replaceAll(" | ", " / ")} | ${row.samples} | ${row.observedDataReadyMs?.median.toFixed(1)} / ${row.observedDataReadyMs?.p95.toFixed(1)} | ${row.ttfbMs?.median.toFixed(1)} | ${row.lcpMs?.median.toFixed(1) ?? "not observed"} |`,
    ),
    "",
    `Failures: ${report.failures.length}. Complete per-run evidence, query counts, game timing and clock samples: raw.json.`,
    "",
    "Match duration includes real moves until a server end condition. Surrender scenarios are separate. The deliberate 3.2-second intro is included only in intro/join and total entry metrics. Natural-match durations depend on random tiles and are not a performance improvement claim.",
    "",
    "Not checked: real phone hardware, remote database latency, email delivery, field Speed Insights.",
  ];
  await writeFile(join(output, "report.md"), lines.join("\n") + "\n");
  assert.deepEqual(
    report.failures,
    [],
    "Some benchmark routes/journeys failed; raw.json retains partial evidence",
  );
} finally {
  if (browser) await browser.close();
  for (const child of children)
    if (child.exitCode === null) {
      const stopped = once(child, "exit");
      child.kill("SIGTERM");
      await stopped;
    }
  if (fixture) await fixture.close();
}
