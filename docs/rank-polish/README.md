# Rank screen polish — 2026-10-16

Six metallic shield emblems are shared by the leaderboard, player profile and match history. Following the user's revised direction, faces and playful ornaments were replaced by chevrons, a star, gems and a crown. The rank page uses a restrained slate/gold header, tier progression strip, actual top-three podium and responsive standings. Elo boundaries/query order and live-query behavior are unchanged. The schema infers its existing tier literal return types so the badge palette is checked exhaustively. One shared Button class restores visible keyboard outlines, discovered during rendered testing.

Scope: `apps/web/src/components/widget/tier-badge.tsx`, leaderboard page/CSS, dashboard/history tier call sites, existing Korean dictionary, `packages/schema/ranking.ts` return type, shared Button focus style. No dependency/config/export or database migration needed. Existing unrelated workspace changes were preserved.

Verification: typecheck and focused lint; existing tier-boundary and locale tests; the browser regression below. It covers all six badges, escaped player text, three viewports, English/Korean, keyboard focus, reduced motion, 1/2/6-player responses, empty/loading/error/retry and the guest ranked gate. The browser regression was rerun for the metallic revision. Screenshots with fixture names are browser-intercepted data; no fixtures were written to the database. `live-*` screenshots are historical captures of the earlier design using the actual public ranking read.

Run with the local web dev server listening on IPv6 port 3001 and Playwright available through the bundled runtime:

```sh
NODE_PATH=/Users/sean2474/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules node --test apps/web/tests/leaderboard.browser.mjs
```

The screenshots/evidence are local artifacts. The shared badge's dashboard/history call sites passed TypeScript/lint, but those authenticated screens were not separately exercised with a signed-in account in this pass. No production build/deploy, real-device touch session, full screen-reader audit or multiplayer regression was performed.
