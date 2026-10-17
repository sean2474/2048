# Page rendering boundaries

The page boundary follows where data and interaction belong. Server pages own static content, verified account gates and read-only records. Client components own input, mutations, live subscriptions and animation. Moving an unchanged page behind a client wrapper does not reduce hydration and is not used as an optimization here.

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
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | Configuration checks, headings and navigation | Authentication forms |
| `/auth/error` | Error explanation and navigation | Shared optional controls only |
| `/play/online`, `/play/ranked` | Route selects the queue mode | Existing live matchmaking screen: socket status, timer, cancellation and match introduction |
| `/loadout`, `/shop` | Shared layout and provider seed | Interactive filters, previews, selections and purchases remain direct client pages; animated legendary previews load only when opened |
| `/achievements` | Shared layout and provider seed | Automatic attendance/unlock synchronization, retry and progress filters remain client-side; sorted progress is memoized |
| `/solo`, `/play/[id]`, `/test` | Shared layout and provider seed | Stateful game boards, keyboard/touch input, overlays and live timing intentionally remain client pages |

The remaining client page roots are intentional, not relocated whole-page wrappers. Their actual rendering/request improvements are separate from the server-page split. `test` is the existing local interactive practice route.

## Administration routes

| Routes | Server responsibility | Client responsibility |
| --- | --- | --- |
| `/` | Overview aggregates and charts; validated URL period/mode | URL selects and refresh; operations status notice |
| `/players`, `/feedback` | Queries, totals, records and URL pagination | Refresh; player status URL control |
| `/matches`, `/audit` | Validated URL filters, cursor queries and records | Refresh |
| `/players/[id]` | Player details, match/audit history and safe return link | Reason/confirmation form for access changes |
| `/matches/[id]` | Match details and safe return link | Refresh |
| `/seasons` | Current season and historical records | New-season form and confirmation |
| `/catalog` | Initial catalog query and page heading/help | Stateful content editor; explicit reload after mutations |
| `/operations` | Heading and operating instructions | Live polling, retained last-successful snapshot and refresh errors |
| `/login`, `/auth/error` | Page structure and instructional content | Authentication/language controls |

`getAdminAccess` caches verified user/role checks only within the current React server request. Both the console layout and every private data page use it. Denied access makes no private record RPC. Supabase RPC authorization remains the final boundary. The catalog's server seed avoids a second initial fetch on hydration. Other record pages fetch only on navigation, filter changes or explicit refresh.

## Loading and regression coverage

- Shared web loading UI, record-specific loading boundaries, catalog card skeletons, attendance placeholders, friend records and spectator board placeholders reserve meaningful space. The admin console has a record-shaped streaming loading boundary. Skeleton animation respects reduced motion.
- `apps/admin/tests/server-pages.test.mjs` verifies record HTML without browser JavaScript, malicious-text escaping, normalized filters, per-request admin-check reuse, denial without private queries, recovery after backend errors and skeleton streaming before a held query resolves.
- `apps/admin/tests/admin-expansion.browser.mjs` covers URL pagination/back navigation, safe errors, moderation and season confirmation, rapid duplicate confirmation, focus recovery, operations proxy authorization and responsive overflow.
- `apps/admin/tests/catalog.browser.mjs` exercises catalog editing and mutation behavior with the server seed.
- `apps/web/tests/page-islands.browser.mjs` covers language changes, feedback/code input, guest gates, authenticated friend messaging and spectator retry, all tutorial steps and responsive board layout, and settings hydration without a duplicate nickname query. A cross-tab sign-out with a held server refresh immediately removes the prior account form and deletion dialog.
- Both applications support separate build directories via `NEXT_DIST_DIR`. Tests use local disposable API fixtures and isolated ports/build outputs. Production timing and bundle comparisons must use the separate measurement harness; development regression timings are not performance claims.
