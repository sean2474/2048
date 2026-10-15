# Skin rarities and competitive rank styling

Added six free skins alongside the three existing IDs: dotted/checkered rare tiles, meadow/tide epic themes, and cat/rabbit legendary characters. `NumberTile` is shared by catalog previews and playable `Tile`; numerical labels remain real text. Five-digit values scale to fit. X/hard block colors and semantics remain unchanged; X typography now also fits the minimum board size.

Rarity filters reset only the skin page. Category-specific paging, equipped summary, persistence and ability preview behavior remain intact. The new skin allow-list migration was applied to the configured Supabase project, and its local filename matches remote version `20261015165552`. It changes no player data, balance or access policy.

The user then chose a serious direction for tiers and rankings while keeping character skins optional. The shared six-tier icon now uses metal shields, chevrons, stars, gems and a crown. The leaderboard uses a restrained slate/gold hero and podium accents; Elo thresholds and ranking queries are unchanged.

Validation:

- Web/socket TypeScript and focused web ESLint pass.
- Wallet/preferences tests: 10 pass, including all catalog IDs, invalid-ID rejection and RLS.
- Loadout browser regression passes: tabs, 6/4 ability paging, retained selection, cookies, save failures/retry, Korean/English and SSR loading.
- Skin browser regression passes: every filter at 3 viewport sizes, 6/3 skin paging, off-filter selection, both character skins, reload persistence, tutorial integration, real numeric tile bounds from 2 to 32768 on 500/343/210px boards, unchanged obstacle colors.
- Rank browser regression passes: all six emblems, responsive table/podium, both languages, keyboard, reduced motion, one/two/six-player responses, loading/empty/error/retry and guest entry gate.

Run browser checks against the local IPv6 web server with bundled Playwright:

```sh
NODE_PATH=/Users/sean2474/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules node --test apps/web/tests/loadout.browser.mjs apps/web/tests/skin-rarities.browser.mjs apps/web/tests/leaderboard.browser.mjs
```

No live account browser writes, production web build/deployment, real-device session, full screen-reader audit or multiplayer server regression in this pass. All browser writes use disposable guest contexts; rank fixture rows never reach the database.
