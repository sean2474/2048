# Ranked cosmetic sets

Reaching a ranked tier permanently unlocks a matching board skin and profile icon, including every lower tier. These sets are earned rewards and are excluded from coin purchases.

| Tier | Established peak | Achievement, skin and icon ID | Skin rarity |
| --- | --- | --- | --- |
| Bronze | Below 1000 | `rank-bronze` | Rare |
| Silver | 1000–1199 | `rank-silver` | Rare |
| Gold | 1200–1399 | `rank-gold` | Epic |
| Platinum | 1400–1599 | `rank-platinum` | Epic |
| Diamond | 1600–1799 | `rank-diamond` | Legendary |
| Master | 1800 or higher | `rank-master` | Legendary |

An established peak requires `season_ratings.placement_games = 10` and a non-null `peak_rating`. Provisional ratings do not qualify. The highest qualifying peak across all seasons drives `achievement_state().highestRank` (0 for no established rank, 1–6 for Bronze–Master).

The database awards sets after trusted season-rating writes. Match retries are idempotent, late old-season results can qualify, and demotion or a new season does not remove ownership. The migration backfills existing established season peaks. It extends existing cosmetic and achievement constraints, preserving separately deployed solo rewards, and leaves the existing achievement-progress calculation in place.

Clients can only read their own unlocks. A separate equipment trigger requires the corresponding rank achievement for either piece of a set; existing achievement and paid-cosmetic guards continue to run. `achievement_state()` remains read-only, and no public reward-granting RPC is added.

Tests cover every threshold, placement completion through the trusted match RPC, replayed results, demotion, rollover, late results, backfill, existing solo extensions, private ownership and equipment authorization. Browser tests and rendered evidence live under `docs/rank-cosmetics/`.

`apps/socket/tests/rank-cosmetics-remote-smoke.ts` exercises the same rules on staging PostgreSQL through Supabase REST, including the browser's GET state request and the trusted match RPC. It requires explicit staging environment variables and an authenticated Supabase CLI. Only disposable accounts and their matches are created; the test deletes those fixtures and reports retained IDs if cleanup fails.
