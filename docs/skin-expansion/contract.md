# Skin expansion and competitive UI details

> 20개 스킨 확장 당시의 계약·검증 기록이다. 무료 제공 범위와 음색 수는 당시 상태다. 현재 [꾸미기](../loadout-and-economy.md)·[카탈로그](../content-catalog.md)·[시각 기준](../visual-asset-guide.md)을 따른다.

- Twenty skins available to accounts at no coin cost, five per rarity. Add material, sci-fi, armor and magic themes without replacing existing selections.
- Shared preview/game number rendering, readable numeric plates, unchanged obstacle identity, compact twelve-card paging and rarity filters.
- Match participants carry their own validated skin ID. Both perspectives, reconnects and results must preserve that assignment.
- Extend the approved metallic rank visual language across the other user-facing pages using original SVG emblems and restrained framing. Per the follow-up, coin/loadout/logo are clear monochrome line illustrations without metallic frames. Preserve the existing color scheme, behavior, copy and accessibility.
- Legendary tiles have short, theme-specific merge animations and synthesized merge sounds. Preserve numeral readability; honor mute, volume and reduced motion; only the local player produces merge audio.
- Verify mobile/tablet/desktop, both locales, all new skin selections, numeric bounds, persistence, server identity isolation and two-client match rendering. No purchase mechanics or new ranking rules.

## Verified artifacts

- `pages.json`: 15 user pages at 1440×900, 768×1024 and 375×812, unchanged page background and primary colors.
- `measurements.json`: all 20 skins and numeric values 2–32768, at board widths 500, 343 and 210 px.
- `legendary-effects.json`: five distinct sound signatures, three motion styles, mute and reduced-motion checks.
- `match-magic.png` / `match-classic.png`: two real clients against an isolated in-memory Socket.IO server, mirrored skins through reload and match result.
- Migration `20261015171853_expanded_skins.sql` applied; remote CHECK contains all 20 IDs.
- Browser account saves use fictional responses. Actual account authorization and SQL persistence are covered by server and local PostgreSQL tests. No real accounts were edited during browser QA.

## Scope and limits

Preserved concurrent profile-icon, compact-catalog, guest-access and audio changes. No new dependencies, ranking changes or purchase mechanics. No web/socket production deployment or physical-device speaker calibration.
