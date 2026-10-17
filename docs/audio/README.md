# Game sound palette

Effects are synthesized locally with Web Audio. No samples, downloads, extra dependencies or background music are required.

- Movement: quiet wooden tap with a short brushed texture.
- Merge: plucked two-note mallet; repeats cycle through a pentatonic set with alternating timing.
- X attack: filtered sawtooth sweep and air cut. Hard block: low drum and metal clack. Impact: dull thud and debris.
- Incoming: alternating square-wave warning. Start: two ticks and a rising chord. Win: ascending fanfare and high chord. Loss: soft falling tones. Draw: suspended plucks.
- Clear X: eraser and rising chime. Breathing Room: airy chord. Slowdown: ice hiss and falling crystals. Anchor: low latch and click. 32 Swap: crossing pitch sweeps.
- Legendary merges: cat slide, rabbit double hop, sentinel metal, knight resonant runes, arcanist swelling air, diamond crystal and crown brass. Variants retain each character's timbre.

Only server-confirmed ability charge consumption produces a skill cue. Results interrupt existing effects. Repeated movement/merges are rate-limited and all effects share a strict 12-source cap; each source peaks at at most 0.08 before the user volume. Mute, zero volume, hidden tabs and navigation stop both oscillators and noise. Source, filter and envelope nodes disconnect when finished.

## Verification

- `pnpm --filter socket exec tsx --test tests/audio.test.ts tests/legendary-effects.test.ts`
- `node --test apps/web/tests/audio-render.browser.mjs` (Playwright runtime required): renders actual Web Audio waveforms, checks audible output, distinct signals, repeat variation, bounded decay and peak headroom at 100% volume.
- Run `audio.browser.mjs`, `legendary-effects.browser.mjs` and `skin-merge-preview.browser.mjs` with `TEST_WEB_ORIGIN` pointing to this worktree's web server. Live friend-match coverage also requires its socket server. Browser accounts are fictional fixtures.

`sound-preview.wav` uses the actual engine at full volume; the app defaults to 45%. The order is move, merge, X attack, hard block, incoming, impact, start, win, loss, draw, five skills in the order above, seven legendary themes, then a merge variation. `render-checks.json` records measured peaks, RMS levels and audible durations.

Physical phone speakers, Bluetooth latency and Safari were not calibrated. Waveform checks confirm signal differences and headroom; they do not replace a listener's judgment of timbre.
