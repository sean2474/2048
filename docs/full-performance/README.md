# Reproducible page and game measurements

Run in an isolated worktree with its own dependencies and no dev servers. The harness builds both Next.js applications for production and starts loopback API fixtures plus the actual Socket.IO game server. It never loads a remote database client or writes remote data. Public backend URLs are overridden for both build and runtime. Keep the same ports, machine, Chrome, fixture data, and command for before/after runs.

```sh
pnpm install --frozen-lockfile
NODE_PATH=/path/to/playwright/node_modules BENCH_LABEL=before \
  node apps/web/tests/performance.browser.mjs
node --test apps/web/tests/performance-metrics.test.mjs
```

Available flags (no flags required):

- `BENCH_LABEL`: output directory name (`local` default; letters, numbers, hyphens).
- `BENCH_ROOT`: source worktree to build, default current harness repository.
- `BENCH_OUTPUT`: evidence directory, default `docs/full-performance/<label>`.
- `BENCH_PORT`: first of four dedicated loopback ports, default 3410 (web/admin/API/socket).
- `BENCH_RUNS`: samples per page/device/cache condition, default 5.
- `BENCH_APP=web|admin`: debug one app. Omit for complete coverage.
- `BENCH_ROUTES=/,/history`: debug selected route templates. Omit for complete coverage.
- `BENCH_GAMES=0`: debug pages only. Omit for match/solo journeys.

The root browser test files use the existing Node assert and Playwright conventions. No new package is required. Bundled Playwright can be used through `NODE_PATH`; installed Chrome is selected with `channel: chrome`.

`raw.json` contains source SHA, machine/browser, every discovered route, per-run metrics, request paths/counts, exceptions, game timings and solo clock accuracy. `report.md` summarizes median and nearest-rank p95. Five samples provide only a small lab comparison; p95 is the maximum of five samples, not a population estimate. Build logs and first-run screenshots are stored beside the raw file.

Cold means a fresh browser context/empty browser cache against an already-running production server. Warm means reloading that page in the same context. Neither claims a cold cloud function measurement. Data-ready uses a route-specific rendered content sentinel after loading statuses clear, and is separate from heading arrival, DOMContentLoaded and load. LCP is the observed entry through data-ready paint, not a field Core Web Vitals score. Cross-origin transfer bytes without Timing-Allow-Origin are unavailable. Real-time status connection to the fixture database is unsupported; realtime sockets are not used as page-data readiness criteria.

Desktop is 1440×900, mobile is 375×812 with touch/mobile emulation on the same desktop CPU. No synthetic CPU or network latency is applied. Authenticated page cases use a local fictional account on both the server and browser. Login/recovery/error pages use guest context. Dynamic play pages are covered by real match journeys; the spectator route has an offline-player page case and an active-match board entry in the natural-match journey. Normal visible application links from the dashboard are measured separately with normal router prefetching; cold/warm reload metrics do not pretend to measure client navigation.

Each device runs one natural match and one surrender match with two independent authenticated browser contexts. Both use the real local queue, socket transport, rules, random tiles, keyboard/touch input and result overlays. Natural matches alternate valid moves preferring the lowest immediate merge score at a fixed minimum 100ms cadence until a server end condition; the harness refuses to substitute surrender for natural completion. Queue, intentional intro/join (currently 3.2 seconds), first board, input-to-self/opponent packet, local input-to-rendered paint and end-packet-to-overlay are separate measurements. Natural match duration varies with the random boards and is not a performance improvement metric. Room duration includes the intro; playable duration starts at the first unpaused state. The solo check compares displayed clock progression against a monotonic wall interval over five seconds, while existing unit tests verify authoritative server clock semantics.

Not covered by this local benchmark: real phone hardware, external DB latency, real Internet routing, cloud cold starts, email delivery, or production Speed Insights samples. Remote staging measurements require a separately authorized run and must be reported separately; never present localhost timings as deployed latency.
