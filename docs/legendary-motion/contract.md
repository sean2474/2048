# Legendary merge identities

> 초기 레전더리 5종의 모션 작업 계약이다. 이후 추가 테마에도 [시각 자산 가이드](../visual-asset-guide.md)의 공통 가독성·동작 줄이기·오디오 규칙을 적용한다.

Players should recognize a legendary skin by its merge, beyond a color variation. Keep the existing game palette, score, input and sound behavior. Five skins get distinct brief motion and original edge artwork: cat squash/paws, bunny hop/petals, sentinel lock/brackets, rune knight strike/diamond runes, arcanist rise/orbiting magic circle. Share the artwork and CSS between real tiles and the detail preview. Ordinary skins retain their existing merge.

Each effect lasts 420ms, stays near its tile, leaves the number readable and does not gate game input. No loop, global flash, layout shift or particle engine. Reduced-motion suppresses the decorative layers and movement. Existing preview controls, replay, cancellation, mute and guest access must continue to work.

Inspect the tutorial and detail preview at 1440×900, 768×1024 and 375×812. Test all five identities, sound routing, replay, ordinary merges, reduced motion, final opacity and absence of decoration on ghosts/obstacles. Save representative mid-effect screenshots and computed animation measurements locally.

Add a Korean production guide for UI icons, profile/ability art, board skins and animation. Link the guide from README; include source-of-truth paths, current SVG metrics, export constraints, prompt templates and a compact review checklist. Preserve concurrent work in the shared checkout.
