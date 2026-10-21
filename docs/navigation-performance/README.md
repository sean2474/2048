# Navigation, loading and socket performance — 2026-10-22

This work starts from staging `8804ca0` (server-component boundary refactor). The production baseline is `c9ff17c7b16800f7db32638d62a2980b0134b75f`, which predates that refactor. Before/after results therefore measure the combined release, not an isolated change.

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

After-deployment records will identify the exact web and socket source revisions and preserve the same measurement definitions. A Lighthouse score of 95 is not a Vercel Real Experience Score of 95.
