# Page rendering boundaries

The page boundary follows where data and interaction belong. Server pages own static content, verified account gates and read-only records. Client components own input, pending interaction state, live subscriptions and game animation. Persistent purchases, attendance, account preferences and nickname writes cross authenticated Server Actions; read-only loaders never perform those mutations. Moving an unchanged page behind a client wrapper does not reduce hydration and is not used as an optimization here.

## Web routes

| Routes | Server responsibility | Client responsibility |
| --- | --- | --- |
| `/`, `/find-match` | Page structure, account/rank records and navigation | Live availability and actions |
| `/history`, `/leaderboard` | Authenticated or public record queries, URL filters, tables and empty/error states | URL controls and refresh |
| `/settings` | Heading, account seed, guest panel, help and customization links | Account/deletion forms, preferences and audio controls |
| `/feedback` | Heading, explanation and navigation | Feedback fields and submission |
| `/tutorial` | Page frame, toolbar, heading and exit link | Practice boards, step state, coaching, keyboard and audio feedback |
| `/play/create`, `/play/join` | Heading, instructions and navigation | Room lifecycle, copy/code controls and match introduction |
| `/friends` | Heading and verified guest access panel | Friend search, contacts, invitations and conversation state |
| `/watch/[id]` | Heading, navigation and verified guest access panel | Live socket connection, boards and connection/replay state |
| `/how-to-play` | Full instructional content | Shared optional controls only |
| `/privacy`, `/terms` | Localized policy text and navigation | Shared optional controls only |
| `/login`, `/signup` | Configuration and verified-account checks; redirect signed-in non-anonymous users to `/` | Authentication forms |
| `/forgot-password`, `/reset-password` | Configuration checks, headings and navigation | Recovery forms |
| `/auth/error` | Error explanation and navigation | Shared optional controls only |
| `/play/online`, `/play/ranked` | Heading, rules, mode and verified ranked account gate | Queue/socket status, timer, cancellation and match introduction |
| `/loadout`, `/shop` | Catalog and account reads, wallet, ownership, URL filters/pagination, cards and static previews | Item dialog, legendary playback, equip and purchase controls |
| `/achievements` | Read-only achievement snapshot, attendance/progress summaries, reward cards and URL filters | Automatic attendance action, retry and refresh after changed state |
| `/solo`, `/play/[id]`, `/test` | Route validation, page structure, heading/navigation, rules, solo records/reward cards and loading slots | Game session, boards, keyboard/touch input, overlays and live timing |

Every web and administration `page.tsx` is a Server Component. A route must compose actual server content and focused interactive leaves; changing a whole-page component filename does not meet this boundary. `test` remains the existing interactive practice route, with its frame and instructions rendered on the server.

## Administration routes

| Routes | Server responsibility | Client responsibility |
| --- | --- | --- |
| `/` | Overview aggregates and charts; validated URL period/mode | URL selects and refresh; operations status notice |
| `/players`, `/feedback` | Queries, totals, records and URL pagination | Refresh; player status URL control |
| `/matches`, `/audit` | Validated URL filters, cursor queries and records | Refresh |
| `/players/[id]` | Player details, wallet/coin history, match/audit history and safe return link | Access-change and coin-adjustment forms with confirmation |
| `/matches/[id]` | Match details and safe return link | Refresh |
| `/seasons` | Current season and historical records | New-season form and confirmation |
| `/catalog` | Initial catalog query and page heading/help | Stateful content editor; explicit reload after mutations |
| `/operations` | Heading and operating instructions | Live polling, retained last-successful snapshot and refresh errors |
| `/login` | Configuration/session checks; redirect existing sessions to the console or MFA | Password sign-in and language controls |
| `/mfa` | Verified user and MFA gate; enrollment or verification instructions | Authenticator enrollment, code verification and sign-out |
| `/auth/error` | Page structure and instructional content | Language controls |

`getAdminAccess` caches verified user/role checks only within the current React server request. Both the console layout and every private data page use it, including the `aal2` requirement. Denied access makes no private record RPC. Supabase RPC authorization remains the final boundary. The catalog's server seed avoids a second initial fetch on hydration. Other record pages fetch only on navigation, filter changes or explicit refresh.

## Loading and regression coverage

- The root web shell reads only request cookies/headers before its Suspense boundary. Account and preference I/O runs inside that boundary, so the first response can contain useful loading UI. Loading routes use `getRequestI18n`, which never waits for account preferences.
- Server-rendered skeletons reserve meaningful space; interactive consumers receive placeholders as server-rendered slots. Skeleton CSS uses its own `skeleton-shimmer` keyframes, avoiding the old game `pulse` collision, and respects reduced motion without JavaScript. Admin permission redirects remain outside streaming boundaries.
- The root provider receives a validated anonymous public-catalog seed with a 30-second stale-while-revalidate cache. Private ownership/wallet reads remain request-scoped, and collection pages and purchase actions read current catalog data. URL filters and page changes fetch RSC data. Browser focus and live game updates remain explicit refresh paths.
- Server Actions derive identity from the verified session, validate input again, and rely on database ownership/atomic price checks. Expected user IDs are stale-tab guards, never authorization. No service-role key is exposed to the web application. Game moves, timers, and matchmaking retain their existing socket transport.
- `apps/admin/tests/server-pages.test.mjs` verifies record HTML without browser JavaScript, malicious-text escaping, normalized filters, per-request admin-check reuse, denial without private queries, recovery after backend errors and skeleton streaming before a held query resolves.
- `apps/admin/tests/admin-expansion.browser.mjs` covers URL pagination/back navigation, safe errors, moderation and season confirmation, rapid duplicate confirmation, focus recovery, operations proxy authorization and responsive overflow.
- `apps/admin/tests/catalog.browser.mjs` exercises catalog editing and mutation behavior with the server seed.
- `apps/web/tests/page-islands.browser.mjs` covers language changes, feedback/code input, guest gates, authenticated friend messaging and spectator retry, all tutorial steps and responsive board layout, and settings hydration without a duplicate nickname query. A cross-tab sign-out with a held server refresh immediately removes the prior account form and deletion dialog.
- Both applications support separate build directories via `NEXT_DIST_DIR`. Tests use local disposable API fixtures and isolated ports/build outputs. Production timing and bundle comparisons must use the separate measurement harness; development regression timings are not performance claims.

## Boundary regression checks

The new checks cover real rendered HTML before hydration, delayed database responses, authenticated Server Action requests, guest/invalid/stale-account rejection, and CSS animation with JavaScript disabled. They use only disposable loopback fixtures. Production databases and socket deployments are not changed by this refactor.

- `server-boundaries.test.mjs`: every route is server-side and the first response streams before account preferences resolve.
- `server-actions.browser.mjs`: settings/nickname action validation, account isolation, retained drafts on failure, and shimmer/reduced-motion behavior without hydration.
- Collection, achievement and game boundary suites verify server-owned data and markup plus the interactive leaves. Existing page-islands and admin server-page checks protect navigation, settings, tutorial, social interactions and permission redirects.

Related framework guidance: [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [Next.js 15 data fetching and streaming](https://nextjs.org/docs/15/app/getting-started/fetching-data), and [mutating data](https://nextjs.org/docs/app/getting-started/mutating-data).
