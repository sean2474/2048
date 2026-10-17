# Content catalog

The administrator's **Content catalog / 콘텐츠 관리** page (`/catalog`) manages board skins, profile
icons and achievements. Existing item and achievement IDs remain unchanged, so
purchases, paid prices, unlock dates and equipped items survive the migration.

## Editing content

1. Create a draft with a unique lowercase ID, names/descriptions and display order.
2. For cosmetics, choose free, coin purchase or achievement reward. Boards use
   editable rendering tokens and optional board/tile images; icons use an image.
3. Upload PNG, JPEG or WebP artwork (up to 2 MiB and 4096 pixels per dimension).
   Uploads receive a new immutable Storage path. Publish the reward cosmetic
   before publishing an achievement that grants it.
4. Choose an achievement metric and target. Supported metrics are attendance
   streak, eligible match wins, highest match tile, highest rank, solo completion
   time in milliseconds and highest endless tile. Solo time means **at most** the
   target; other metrics mean **at least** the target. Rank targets are 1–6.
5. Save and publish. Price, appearance, text, target and order remain editable.
   An already published acquisition method or achievement reward cannot change;
   create a new ID for a different entitlement.

Published entries can be archived, not deleted or returned to draft. Archive an
achievement before its reward. Archived content leaves discovery and sales while
existing owners can still equip it and opponents can still see it. Default
Classic and Fox stay available. Raising an achievement target never revokes an
earned unlock. A conflicting editor revision is rejected rather than overwritten.

The page preview shows board colors and uploaded artwork; game-specific character
animations and merge effects are rendered by the game. New visual assets and
rules using the supported metrics require no frontend redeploy. A new gameplay
metric or animation renderer still requires code and tests.

## Data and access

- `private.cosmetic_catalog`: cosmetic metadata, acquisition, price, status and
  revision; extends the existing catalog without replacing purchase records.
- `private.achievement_catalog`: declarative metric, target and cosmetic reward.
- `private.catalog_audit`: actor and before/after documents for administrator edits.
- `public.cosmetic_purchases` and `public.achievement_unlocks`: existing permanent
  ownership records; the migration does not rewrite them.
- Storage bucket `catalog-assets`: public artwork, administrator-only inserts.
  Existing icons are copied with the [asset seed command](catalog-assets.md).
  Existing procedural board art is stored as DB tokens, not rasterized images.

The client reads `content_catalog()`. Administrator RPCs check the existing
`is_game_admin()` role on every call; no service key is shipped to either web app.
Mutations validate fields in SQL as well as shared Zod schemas. Drafts are hidden
from public reads. Uploads cannot overwrite or delete existing artwork. Trusted
repository SVGs use the seed script; the administrator upload accepts raster files.

Achievements are evaluated from server-owned records by match, attendance, rank
and installed solo hooks. `sync_achievements()` also evaluates newly added rules
for returning users. Clients never submit an earned score or an unlock. The GET
`achievement_state()` remains read-only for older callers.

The game keeps the last verified catalog through transient failures, provides a
retry message and blocks purchases until a valid catalog is available. It refreshes
on navigation/focus after a 60-second cache interval. Purchases send the displayed
price; the transaction locks the catalog item and wallet and rejects price changes
before charging. Duplicate concurrent requests charge once. During a rolling
release, the old two-argument purchase RPC only accepts the migration-time price;
new items and edited prices require the new client confirmation.

## Rollout and validation

Apply `20261017160000_content_catalog.sql` once, then seed the existing 14 icon
files before releasing web code that reads Storage paths. Do not edit an applied
migration. Follow [deployment.md](deployment.md) for the target DB, socket and web
deployment order. Deploy the updated socket before allowing newly created IDs in
matches. The old client works with its original item set during the transition.

The migration preserves separately deployed legacy progress/guards. The eight
existing solo rewards are published only if both trusted solo record tables are
installed; otherwise they remain drafts. Unmerged daily-quest or achievement-king
work is not installed by this feature and must be integrated in its own change.

Local checks:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Browser checks cover administrator editing/upload/access controls and the game's
dynamic catalog, locking, ownership, archive behavior, image rendering, mobile
layout and price refresh. `apps/admin/tests/catalog.browser.mjs` runs against an
isolated mock backend; game checks use `WEB_TEST_ORIGIN` for a dedicated dev server.

The opt-in hosted integration test creates only disposable staging accounts,
catalog entries and artwork, tests real Storage/RLS and concurrent transactions,
then removes its own fixtures. Set `APP_ENV=staging`, `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` in the operator environment:

```sh
pnpm --filter socket exec tsx --test tests/catalog-remote-smoke.ts
```

It rejects the production URL and needs the authenticated Supabase CLI to seed
only fixture roles/progress/wallets. Credentials must never be committed or logged.
Compare counts and whole-row fingerprints for purchases, unlocks, preferences and
wallets immediately before and after migration, before running disposable fixtures.

### Staging verification — 2026-10-17

Migration `20261017160000` and the 14 initial Storage images were applied to the
staging project. Purchases, unlocks, preferences and wallet whole-row fingerprints
matched before/after migration and after fixture cleanup. The public catalog
contains 36 skins, 14 icons and 18 achievements, including already deployed solo
rewards. A repeated asset seed uploaded zero files and verified all 14 unchanged.

The hosted integration test passed real administrator PNG upload/public download,
non-admin denial, concurrent duplicate purchase, quoted-price rejection, permanent
ownership after edits/archives, new achievement evaluation and concurrent reward
archive/publication. No disposable catalog entries or audit rows remained. Local
216 tests, type checks, lint and web/admin production builds passed. Administrator
and game browser tests passed, including the retired-achievement and dark-palette
regressions. Production deployment is separate and was not performed by this change.
