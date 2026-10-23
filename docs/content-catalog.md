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
4. 업적 지표와 목표를 선택한다. 최고 연속 출석, 유효 대전 승수·최고 타일,
   최고 랭크, 싱글 완주 시간(ms), 무한모드 최고 타일, 다른 업적 달성 개수
   (`achievements`)를 지원한다. 완주 시간은 목표 이하, 나머지는 목표 이상이며
   랭크 목표는 1–6이다. 업적 개수는 한 번이라도 공개된 일반 업적의 해금을
   세며, 보관된 업적도 포함한다. 업적왕 등 `achievements` 지표의 컬렉션
   업적은 모두 집계에서 제외해 보상이 연쇄 해금되지 않게 한다.
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

Server loaders and the client catalog provider read `content_catalog()`. Administrator RPCs check
`is_game_admin()` membership and the TOTP-verified `aal2` session on every call;
no service key is shipped to either web app.
Mutations validate fields in SQL as well as shared Zod schemas. Drafts are hidden
from public reads. Uploads cannot overwrite or delete existing artwork. Trusted
repository SVGs use the seed script; the administrator upload accepts raster files.

업적은 서버가 소유한 대전·출석·랭크·싱글 기록으로 평가하며, 일반 업적 해금
시 컬렉션 업적도 확인한다. `sync_achievements()`는 재방문 이용자에게 새 규칙을
평가한다. 클라이언트는 달성 점수나 해금을 직접 제출하지 않는다. GET
`achievement_state()`는 읽기 전용이다.

The root provider uses an anonymous public seed with a 30-second stale-while-revalidate
cache; failed refreshes retain its last valid value. Its client copy refreshes on
navigation/focus after 60 seconds. Collection pages read the current catalog on the
server and refresh on focus, filtering and pagination; ownership and wallet data
are never shared across accounts. Failed page reads offer retry, and purchase actions
require a current valid catalog. Purchases send the displayed price; the transaction
locks the catalog item and wallet and rejects price changes
before charging. Duplicate concurrent requests charge once. During a rolling
release, the old two-argument purchase RPC only accepts the migration-time price;
new items and edited prices require the new client confirmation.

## Rollout and validation

`20261017160000_content_catalog.sql`과 대상 DB에 필요한 통합 후속 마이그레이션을
실제 적용 이력에 맞춰 반영한다. 이미 적용한 파일을 수정·재실행하지 않는다.
현재 [이미지 seed](catalog-assets.md)는 프로필 15개를 업로드하며 출석 아이콘은
기존 경로를 보존한 `attendance-king-v2.svg`를 사용한다. [배포 가이드](deployment.md)의
DB·이미지 → 소켓 → 웹 순서를 따르고 새 ID를 경기에서 사용하기 전에 소켓을 갱신한다.

초기 카탈로그는 솔로 테이블이 없으면 보상 8종을 초안으로 남겼다. 통합 후속
`20261017180000_integrated_solo.sql`은 솔로 저장·보상 연결을 설치하고 관리자가
수정하지 않은 초기 초안만 공개한다. `20261017180001_integrated_daily_catalog.sql`은
일일 퀘스트와 업적왕·컬렉션 지표를 연결하며 기존 해금·구매·지갑을 보존한다.
카탈로그 적용 DB에 이전 솔로·일일퀘 파일을 다시 실행하지 않는다.
[환경별 적용 순서와 검증 기록](full-performance/integration.md)

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

아래 수량·검증 결과는 카탈로그 기능 도입 당시 기록이다. 이후 솔로·일일퀘·업적왕과
이미지 통합 결과는 [전체 통합 기록](full-performance/integration.md)을 따른다.

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
