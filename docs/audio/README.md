# Game sound palette

Effects are synthesized locally with Web Audio. No samples, downloads, extra dependencies or background music are required.

- Movement and merge use 11 material palettes: wood, paper, cloth, stone, water, garden, metal, crystal, magic, air and sun. Built-in skin IDs select a palette; custom catalog characters and patterns retain a compatible fallback.
- Paper rustles, cloth brushes, stone knocks, water bubbles and metal rings with non-harmonic partials. Movement stays short and quiet. Merge repeats vary pitch slightly, articulation, layer balance and timing instead of looping an ascending scale.
- X attack: filtered sawtooth sweep and air cut. Hard block: low drum and metal clack. Impact: dull thud and debris.
- Incoming: alternating square-wave warning. Start: two ticks and a rising chord. Win: ascending fanfare and high chord. Loss: soft falling tones. Draw: suspended plucks.
- Clear X: eraser and rising chime. Breathing Room: airy chord. Slowdown: ice hiss and falling crystals. Anchor: low latch and click. 32 Swap: crossing pitch sweeps.
- 레전더리 합성은 고양이 슬라이드, 토끼의 두 번 뛰기, 센티널 금속음, 기사 룬의 울림, 마법사의 공기음, 다이아몬드 수정음, 왕관의 금관음, 여우의 전기 스파크, 용의 낮은 울림, 불사조의 불꽃과 밝은 잔향까지 캐릭터 10종을 지원한다. 반복 변형에도 각 음색의 특징을 유지한다.

Only server-confirmed ability charge consumption produces a skill cue. Results interrupt existing effects. Repeated movement/merges are rate-limited and all effects share a strict 12-source cap; each source peaks at at most 0.08 before the user volume. Mute, zero volume, hidden tabs and navigation stop both oscillators and noise. Source, filter and envelope nodes disconnect when finished.

## Verification

- `pnpm --filter socket exec tsx --test tests/audio.test.ts tests/legendary-effects.test.ts`
- `node --test apps/web/tests/audio-render.browser.mjs` (Playwright runtime required): renders actual Web Audio waveforms, checks audible output, distinct signals, repeat variation, bounded decay and peak headroom at 100% volume.
- Run `audio.browser.mjs`, `legendary-effects.browser.mjs` and `skin-merge-preview.browser.mjs` with `TEST_WEB_ORIGIN` pointing to this worktree's web server. Live friend-match coverage also requires its socket server. Browser accounts are fictional fixtures.

`test-results/audio/sound-preview.wav` and `test-results/audio/render-checks.json` are regenerated from the real engine at maximum volume (the app defaults to 45%). Order: 15 event cues, then Classic, Paper, Woven Linen, Slate, Tide Pool, Meadow, Bronze Bastion, Astral Archive, Rune Script, Aurora, Dawn Oath, Storm Fox, Chrono Dragon, Star Phoenix, Kitty Club, Bunny Hop, Iron Sentinel, Rune Knight, Arcanist, Diamond Prism, Master Crown, and a merge variation. JSON also includes the rapid-merge stress case.

Committed files under `docs/audio/` are retained verification snapshots; reruns write to `test-results/audio/` and do not overwrite them. See the [artifact policy](../testing.md#결과-파일).

The renderer passes actual catalog tokens and IDs to the engine, covering all 11 material families and all 10 legendary characters. Earlier tests passed a skin ID where tokens were expected, so their skin waveform coverage was not reliable. Current checks verify distinct signals, finite samples, decay and headroom; they do not claim a subjective listening review.

Physical phone speakers, Bluetooth latency and Safari were not calibrated. Waveform checks confirm signal differences and headroom; they do not replace a listener's judgment of timbre.
