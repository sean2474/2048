# Navigation, loading and socket performance — 2026-10-22

This work starts from staging `8804ca0` (server-component boundary refactor). The production baseline is `c9ff17c7b16800f7db32638d62a2980b0134b75f`, which predates that refactor. Before/after results therefore measure the combined release, not an isolated change.

## DNS follow-up — public routing corrected

After the owner approved the protection change, only `2048duo.io` and `www.2048duo.io` were switched from Cloudflare Proxied to DNS only. Normal public traffic now enters Vercel through `icn1` and executes in `hnd1`. The administrator and socket records were preserved.

The [post-change report](dns-routing-results.md) retains all 15 new mobile Lighthouse runs: route medians are **97, 97, 97, 98 and 97**. Home had one 94 and solo one 90; these are not omitted. Twelve desktop/mobile link navigations kept a single document, and production socket/game checks passed. **Vercel field RES95 is still not established**: the latest 24-hour desktop aggregate is 91 and mobile has no events. The measurements below describe the earlier Cloudflare path; use the follow-up for current routing.

## Expanded mobile checks

Android Chrome and iPhone WebKit touch emulation passed 56 route/width checks, settings persistence, menu navigation and an actual cross-browser private match with 12 touch moves, reload recovery and surrender. See the [mobile report](mobile-browser-results.md), including the transient locale observation and the limits of emulation.

## Changes

- Keep every web/admin `page.tsx` a Server Component; interactive controls remain focused client islands.
- Replace generic loading cards with route-specific server skeletons, including the root session boundary. Settings, matchmaking, feedback and collection skeleton geometry is checked against rendered mobile and desktop pages with delayed backend responses. CSS shimmer respects reduced motion.
- Keep internal navigation on Next Link; close the mobile menu immediately when navigation starts.
- Cache only the root provider’s public catalog seed with an anonymous client. A 30-second stale-while-revalidate window removes repeated display-data reads from navigation; failed refreshes retain the last validated seed. This is not a hard freshness deadline. Server-rendered catalog pages, solo details and purchase actions continue to read current data. Private data is never placed in this shared cache.
- Overlap independent collection, preference, catalog and wallet reads. Cache private wallet reads only within the React server request and always use verified user IDs.
- Avoid refreshing the entire dashboard for an unchanged initial quest response. Compare quest balance with the persistent root header snapshot, including soft navigation and rewards earned elsewhere.
- Remove the global 350 ms page entrance animation. Preserve game/tile animations.
- Configure Vercel SSR in Tokyo (`hnd1`), near the production database and game server; verify the deployed region before reporting success.
- Include solo/friends paths in the existing privacy-preserving Speed Insights whitelist.
- Skip spectator state serialization when no spectators subscribe. See [socket measurements](../socket-performance/README.md); this reduces a small amount of server CPU, not geographic network latency.
- Isolate browser-test TypeScript configuration so parallel fixtures do not rewrite each other's settings.

## Baseline and measurement limits

- [Production mobile Lighthouse](production-lighthouse-before.json): 66, LCP 6.5 s, FCP 3.5 s, CLS 0.022. One default-throttled CLI observation, not field data.
- [Staging mobile Lighthouse](staging-lighthouse-before.json): 97 with the previous server-boundary refactor already deployed. Different deployment and environment; not a controlled production comparison.
- [HTTP baseline](http-before.json): three sequential requests for each of five production routes, measured from this workstation. TTFB and complete streamed-response time are separate.
- [Vercel field baseline](speed-insights-before.json): Last 7 Days, desktop RES 89 / 107 events; mobile RES 80 / 14 events. Historical field scores cannot be reset or established by synthetic test runs. Per-metric details were unavailable on the current Vercel plan.

A Lighthouse score of 95 is not a Vercel Real Experience Score of 95.

## Production release and validation

The functional release is `6b8d0aa8380504ac32f6df922d5325d0cb38517f` (PR #21), promoted from staging `18e43a56bc88c9a587c7ef0c4659a2e27cd716c2`. Vercel confirmed:

- Web: `dpl_GBnVbQAH7NpGpPSGQZSVgfj2BN8D`, READY, `hnd1`, serving `www.2048duo.io`.
- Admin: `dpl_HsiyYoFcrad3cNrWPV114Np1o4Ji`, READY, `hnd1`, serving `admin.2048duo.io`.
- Socket: source `f1d619476dc2e7974f7d52af2800984f4a67c1f1`, healthy on the existing single `nrt` machine and volume. The later web commits do not change socket runtime sources, shared packages or lockfile.
- Both databases match all 37 repository migrations; this release needs no new migration.

Validation completed: 306 automated tests (272 socket, 7 locale/analytics, 5 deployment, 13 server-domain, 9 server-render/integration), 13 performance/loading browser checks, 8 boundary/action browser checks, additional current-price purchase and catalog-edit browser checks, web/admin production builds, all-app TypeScript and lint, and repository formatting. React, TypeScript and security review findings were resolved. All 27 web and 13 admin pages remain Server Components; the four ordinary anchors in app UI are one email link and three external privacy-policy links.

The public-seed integration test verifies cold failure recovery, draft exclusion, anonymous-only headers, account-specific wallet HTML, shared public reuse and failed background refresh recovery. Catalog definitions on server pages and purchase price validation remain current. The initial-loading test verifies that forged route/member headers cannot select the wrong loading view.

## Production measurements before the DNS change

[Mobile Lighthouse, all 15 runs](production-lighthouse-after.json), three fresh-browser observations for each public route, default simulated throttling:

| Public route | Three scores | Median |
|---|---|---:|
| Home | 73, 72, 71 | 72 |
| Settings | 72, 72, 73 | 72 |
| Find match | 70, 70, 73 | 70 |
| Leaderboard | 72, 73, 73 | 73 |
| Solo | 74, 72, 73 | 73 |

All 15 runs had CLS 0. These results **do not meet 95**. The single earlier production-home baseline was 66; it is not enough to estimate a controlled improvement distribution. Before/after network times and every sample are retained rather than selecting the highest score.

The authenticated [Vercel field dashboard](speed-insights-after.json) still shows historical Last 7 Days RES **89 desktop / 80 mobile**, with the same 107 / 14 events. No verified post-release field sample is available yet. Tests did not change telemetry scores or sampling; the unmodified Vercel client ignores automated/headless browsers.

[Production browser matches](production-browser-after.json): all four cases passed, covering desktop and mobile emulation with natural endings and surrender. The natural games generated 309 desktop and 196 mobile inputs. Input-to-render p50/p95 was **66.6 / 74.7 ms desktop** and **64.5 / 66.4 ms mobile emulation**. These are local browser measurements over the deployed network, not INP field statistics or physical-mobile measurements. No public queue or fixture backend was used.

[HTTP results](http-after.json) separate the first streamed byte from complete HTML:

| Route | Before median TTFB | After median TTFB | After complete HTML |
|---|---:|---:|---:|
| `/` | 764 ms | 879 ms | 1161 ms |
| `/settings` | 697 ms | 667 ms | 1063 ms |
| `/find-match` | 693 ms | 658 ms | 973 ms |
| `/leaderboard` | 658 ms | 804 ms | 1121 ms |
| `/solo` | 656 ms | 765 ms | 1114 ms |

## Domain-routing diagnosis before the DNS change

The public domain is proxied through Cloudflare. In this workstation's measurements, response headers show Cloudflare `LAX`, Vercel ingress `sfo1`, and function execution `hnd1`. The new Tokyo function location is verified, but the public route still crosses the US. This observation is specific to this network/time and does not establish every visitor's path.

The [alternating same-origin routing comparison](routing-comparison.json) preserved HTTPS Host/SNI/certificate validation and changed only the diagnostic TCP destination to the existing public Vercel alias. Three normal requests had median TTFB **656 ms**, versus **373 ms** directly to Vercel; full HTML was **946 ms** versus **462 ms**. Direct responses entered through `icn1` and executed in `hnd1`. The initial comparison used automatic locale detection, which may differ by network ingress; it isolates routing less strictly than the fixed-locale follow-up below. No DNS, proxy, firewall or account configuration was changed.

A [fixed-English follow-up](fixed-locale-routing-lighthouse.json) uses the same `duo.locale=en` preference cookie on both paths, one alternating pair per route:

| Route | Actual public route | Direct Vercel diagnostic |
|---|---:|---:|
| Home | 71 | 96 |
| Settings | 73 | 97 |
| Solo | 71 | 97 |

This supports the routing diagnosis on the same production code. It does not establish 95 on public DNS or guarantee a field score after a DNS change. The earlier [automatic-locale direct observations](direct-diagnostic-lighthouse.json), including a home score of 94, are also retained.

[Vercel recommends avoiding an extra reverse proxy](https://vercel.com/kb/guide/cloudflare-with-vercel). This initial report stopped before the DNS change because the Cloudflare dashboard was logged out. The owner subsequently logged in and explicitly approved changing the two public web records after inspection. The [DNS follow-up](dns-routing-results.md) records the applied settings, rollback and actual public-route retest. Cloudflare was not paused for the whole zone.

An `assetPrefix` detour was considered and rejected: it leaves HTML/RSC navigation on the slow route and adds cross-origin deployment-skew complexity for long-lived game tabs. See [Vercel cross-site Skew Protection](https://vercel.com/docs/skew-protection#allowed-domains-for-cross-site-fetch).

## Loading geometry evidence

Authenticated settings snapshots use the same 375px and 1440px viewport sizes before and after the held backend response. Tests compare the main/header, preferences, profile and delete-account positions and widths within 1px. Shimmer remains CSS-only, with reduced-motion support.

- [Mobile loading](settings-375-loading.png) / [mobile loaded](settings-375-ready.png)
- [Desktop loading](settings-1440-loading.png) / [desktop loaded](settings-1440-ready.png)

Intermediate staging observations are retained in [five-route measurements](staging-lighthouse-intermediate.json) and [solo iterations](staging-solo-iterations.json). The final staging solo score reached 95; it is not a substitute for the slower public production-domain result above.
