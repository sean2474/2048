# Compact loadout catalog — 2026-10-16

> 초기 카탈로그 화면 계약이다. 아래 페이지 크기·탭·게스트 선택·정적 목록은 과거 범위다. 현재 [꾸미기 화면](../loadout-and-economy.md)과 [DB 카탈로그](../content-catalog.md)를 기준으로 변경한다.

The user wants the skin/ability screen to stay manageable as collections grow. Keep equipped skin and preview-only ability visible in a compact summary. Separate skins and abilities with accessible tabs. Show at most six items per category page, preserving separate page positions; use two columns on phones and three on larger screens. Preserve full ability descriptions, save errors, disabled/loading states, free skins and preview-only ability disclosures. Use existing settings hooks, Button, catalog and dictionaries. No new rarity model, search/filter, prices, effects, dependencies or database writes beyond the existing explicit selection actions.

Targets: 375x812, 768x1024, 1440x900. Verify keyboard tab switching and focus, paging boundaries, category/page persistence, selection and deselection, cookie persistence, Korean/English, all phone card text and horizontal overflow. Loading and errors retain the existing settings/wallet feedback. The catalogs are compile-time constants, so empty catalog and partial server catalog responses do not apply. Public guest selection is supported; account storage behavior is unchanged and separate from this UI work.

Scope: loadout page, existing web message dictionary, browser regression test and local evidence. Existing skin corner geometry must remain intact.
