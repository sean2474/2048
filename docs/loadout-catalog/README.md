# Current catalog update — 2026-10-16

The current loadout page contains skins and circular profile icons only, in compact 3/4/6-column cards with a shared owned-only filter. Guest loadouts are fixed in shared settings and verified server match data. Locked cards show login requirements; achievement unlocks remain planned. Ability selection now lives in the Find match modal, with one-line summaries and expandable details. All concepts use one-button activation.

Validation: 34 preference, multiplayer and wallet tests pass; web/socket TypeScript and focused ESLint pass. In-app browser checks cover guest defaults, login/achievement details, owned filters, empty filters, keyboard close/focus restoration, and 320/375px layouts. Account persistence is covered by store tests; no real account settings were changed. The updated standalone browser scripts were syntax-checked, not run in this pass. Production build/deployment and real-device testing were not performed.

Screenshots: `current-icons.jpg` and `current-abilities.jpg`.

---

The notes below describe the earlier catalog implementation and are superseded by the update above.

# Loadout catalog verification

Changed the loadout page and existing translation dictionary only, plus documentation/test evidence. The schema, setting persistence, wallet read/error handling, skin geometry and ability effects remain unchanged. Page size is six for either category, each category keeps its own page while mounted, and the current selection is shown above both tabs. The header/wallet and cards are more compact, with two mobile columns.

Passed: web TypeScript check; focused ESLint; keyboard, pagination, off-page selection, reload persistence, clearing, guest save failure/recovery and responsive browser regression. `measurements.json` records widths and the tested states. Screenshots were reviewed locally. No catalog items or account data were created for testing.

With the local web dev server listening on IPv6 port 3001:

```sh
NODE_PATH=/Users/sean2474/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules node --test apps/web/tests/loadout.browser.mjs
```

Not checked: production build/deployment, signed-in account storage, real-device touch input or a full screen-reader session. Only three skins currently exist, so the six-item overflow boundary was exercised with the ten existing abilities; both categories use the same page-size and pagination controls. Search and rarity filters were not added.
