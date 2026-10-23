# Reproducible page and game measurements

Run in an isolated worktree with its own dependencies and no dev servers. The harness builds both Next.js applications for production and starts loopback API fixtures plus the actual Socket.IO game server. It never loads a remote database client or writes remote data. Public backend URLs are overridden for both build and runtime. Keep the same ports, machine, Chrome, fixture data, and command for before/after runs.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chrome
BENCH_LABEL=local-check node apps/web/tests/performance.browser.mjs
node --test apps/web/tests/performance-metrics.test.mjs
```

Choose a new label or `BENCH_OUTPUT` directory for each capture. The harness writes directly to that directory; do not reuse the committed `before`, `after` or remote evidence directories.

Available flags (no flags required):

- `BENCH_LABEL`: output directory name (`local` default; letters, numbers, hyphens).
- `BENCH_ROOT`: source worktree to build, default current harness repository.
- `BENCH_OUTPUT`: evidence directory, default `test-results/full-performance/<label>`.
- `BENCH_PORT`: first of four dedicated loopback ports, default 3410 (web/admin/API/socket).
- `BENCH_RUNS`: samples per page/device/cache condition, default 5.
- `BENCH_APP=web|admin`: debug one app. Omit for complete coverage.
- `BENCH_ROUTES=/,/history`: debug selected route templates. Omit for complete coverage.
- `BENCH_GAMES=0`: debug pages only. Omit for match/solo journeys.
- `BENCH_OBSERVE_MS=1000`: diagnostic minimum observation horizon from navigation start; default 0 stops at the readiness observation. Keep identical values when comparing diagnostic runs.

Use Node 24.x and the pinned root Playwright development dependency installed by pnpm. Chrome is selected with `channel: chrome`; an external `NODE_PATH` runtime is not required. See the [test guide](../testing.md) for the standard checks and artifact policy.

`raw.json` contains source SHA, machine/browser, every discovered route, per-run metrics, request paths/counts, exceptions, game timings and solo clock accuracy. `report.md` summarizes median and nearest-rank p95. Five samples provide only a small lab comparison; p95 is the maximum of five samples, not a population estimate. Build logs and first-run screenshots are stored beside the raw file.

Cold means a fresh browser context/empty browser cache against an already-running production server. Warm means reloading that page in the same context. Neither claims a cold cloud function measurement. observedDataReadyMs is an upper bound recorded after page load, route-specific content sentinel checks, and two animation frames. It includes automation round trips and is not the first time data became ready. Compare actual browser Performance API TTFB, FCP, DOMContentLoaded and load as primary loading timings. Heading arrival is timestamped by a browser MutationObserver. Client-navigation readiness is also an observed upper bound. LCP is the observed entry through the post-load readiness observation, not a field Core Web Vitals score. Cross-origin transfer bytes without Timing-Allow-Origin are unavailable. Real-time status connection to the fixture database is unsupported; realtime sockets are not used as page-data readiness criteria.

Desktop is 1440×900, mobile is 375×812 with touch/mobile emulation on the same desktop CPU. No synthetic CPU or network latency is applied. Authenticated page cases use a local fictional account on both the server and browser. Login/recovery/error pages use guest context. Dynamic play pages are covered by real match journeys; the spectator route has an offline-player page case and an active-match board entry in the natural-match journey. Normal visible application links from the dashboard are measured separately with normal router prefetching; cold/warm reload metrics do not pretend to measure client navigation.

Each device runs one natural match and one surrender match with two independent authenticated browser contexts. Both use the real local queue, socket transport, rules, random tiles, keyboard/touch input and result overlays. Natural matches alternate valid moves preferring the lowest immediate merge score at a fixed minimum 100ms cadence until a server end condition; the harness refuses to substitute surrender for natural completion. Queue, intentional intro/join (currently 3.2 seconds), first board, input-to-self/opponent packet, local input-to-rendered paint and end-packet-to-overlay are separate measurements. Natural match duration varies with the random boards and is not a performance improvement metric. Room duration includes the intro; playable duration starts at the first unpaused state. The solo check compares displayed clock progression against a monotonic wall interval over five seconds, while existing unit tests verify authoritative server clock semantics.

The full-run LCP observer stops at a variable readiness horizon, so its raw values are provisional and excluded from before/after improvement conclusions. FCP, TTFB and load timings do not have that horizon problem. Focused home diagnostics use the same minimum one-second horizon and capture LCP candidate element tag, id, short text and image URL. Even those diagnostic samples are lab observations, not final field LCP. Whole fixture request counts include normal link prefetches and their server renders. Socket packet intervals use driver-observed event timestamps and include transport plus observation overhead; they are not isolated server processing times.

The current solo harness also checks actual socket-reported authoritative elapsed time. The original before capture has only visible clock drift, so server drift is after-only correctness evidence. Before surrender confirmation timing includes button automation and is retained under a separate name; packet-based surrender latency is not compared to that value.

Not covered by this local benchmark: real phone hardware, external DB latency, real Internet routing, cloud cold starts, email delivery, or production Speed Insights samples. Remote staging measurements require a separately authorized run and must be reported separately; never present localhost timings as deployed latency.

After a deployment has been explicitly verified, deployed guest-only private friend matches can be measured separately. This command never enters a public/ranked queue or signs in and has no DB cleanup code. Normal guest match records may be stored by the deployed server. Run only on the target authorized for this task:

```sh
BENCH_REMOTE_TARGET=staging \
  BENCH_OUTPUT=/tmp/2048-duo-remote-staging-check \
  BENCH_DEPLOYED_COMMIT='replace-with-verified-web-sha' \
  BENCH_SOCKET_BUILD_COMMIT='replace-with-verified-socket-sha' \
  node apps/web/tests/performance-remote.browser.mjs
```

`BENCH_DEPLOYED_COMMIT` and `BENCH_SOCKET_BUILD_COMMIT` must contain the verified 40-character deployment/build SHAs; the harness records these supplied identities and does not itself verify a cloud provider release. `BENCH_REMOTE_TARGET` must be explicitly `staging` or `production`; URLs are fixed to the deployment guide. Each device opens its own private friend room, joins using the code, plays to a natural end, then separately tests surrender. Real network input/state/render and entry/result timings are captured without intercepting requests. Exact server room wall duration is unavailable in guest browser packets and is left null. `BENCH_OUTPUT` optionally changes the artifact destination.

Compare complete local runs with `node apps/web/tests/performance-compare.mjs docs/full-performance/before/raw.json docs/full-performance/after/raw.json /tmp/2048-duo-comparison-check.md`. The explicit output path preserves the committed comparison. It rejects mixed machine/browser/configuration or different page-case coverage and reports raw/gzip initial JavaScript, preference query counts, native timings, observed readiness bounds and game samples.

`resultPacketToOverlayMs` records the first observed mounted overlay geometry; opacity animation may still be running. New deployed runs separately record `resultPacketToAnimationCompleteMs` after finite overlay animations finish and two animation frames pass. Screenshots are then taken of the settled result. This extra measurement was not present in the local before/after capture.

For a diagnosed harness failure, `BENCH_REMOTE_CASES=desktop:natural` (or comma-separated known device:ending cases) restricts a rerun. Always set a separate `BENCH_OUTPUT` for that attempt and preserve the initial failure evidence. The raw report records the requested subset; do not present a subset as full coverage.
