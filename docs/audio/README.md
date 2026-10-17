# Game sound palette

Effects are synthesized locally with Web Audio. No samples, downloads, extra dependencies or background music are required.

- Movement: quiet wooden tap with a short brushed texture.
- Merge: plucked two-note mallet; repeats cycle through a pentatonic set with alternating timing.
- X attack: filtered sawtooth sweep and air cut. Hard block: low drum and metal clack. Impact: dull thud and debris.
- Incoming: alternating square-wave warning. Start: two ticks and a rising chord. Win: ascending fanfare and high chord. Loss: soft falling tones. Draw: suspended plucks.
- Clear X: eraser and rising chime. Breathing Room: airy chord. Slowdown: ice hiss and falling crystals. Anchor: low latch and click. 32 Swap: crossing pitch sweeps.
- 레전더리 합성은 고양이 슬라이드, 토끼의 두 번 뛰기, 센티널 금속음, 기사 룬의 울림, 마법사의 공기음, 다이아몬드 수정음, 왕관의 금관음, 여우의 짧은 고음, 용의 상승 화음, 불사조의 밝은 상승음까지 캐릭터 10종을 지원한다. 반복 변형에도 각 음색의 특징을 유지한다.

Only server-confirmed ability charge consumption produces a skill cue. Results interrupt existing effects. Repeated movement/merges are rate-limited and all effects share a strict 12-source cap; each source peaks at at most 0.08 before the user volume. Mute, zero volume, hidden tabs and navigation stop both oscillators and noise. Source, filter and envelope nodes disconnect when finished.

## Verification

- `pnpm --filter socket exec tsx --test tests/audio.test.ts tests/legendary-effects.test.ts`
- `node --test apps/web/tests/audio-render.browser.mjs` (Playwright runtime required): renders actual Web Audio waveforms, checks audible output, distinct signals, repeat variation, bounded decay and peak headroom at 100% volume.
- Run `audio.browser.mjs`, `legendary-effects.browser.mjs` and `skin-merge-preview.browser.mjs` with `TEST_WEB_ORIGIN` pointing to this worktree's web server. Live friend-match coverage also requires its socket server. Browser accounts are fictional fixtures.

`sound-preview.wav`와 `render-checks.json`은 초기 음향 작업의 기록이다. 실제 엔진을 최대 볼륨으로 렌더했으며 앱의 기본 볼륨은 45%다. 순서는 이동·병합·X·하드블록·수신·충돌·시작·승리·패배·무승부·위 능력 5종·초기 레전더리 7종·병합 변형이다. JSON에는 측정한 피크·RMS·가청 지속시간을 기록했다.

현재 `audio-render.browser.mjs`도 초기 7종의 파형을 검사한다. 여우·용·불사조는 엔진과 `legendary-effects.test.ts`의 캐릭터별 검사에 포함되지만 위 WAV·파형 기록에는 포함되지 않는다. 이를 10종 전체의 청취·파형 검증으로 해석하지 않는다.

Physical phone speakers, Bluetooth latency and Safari were not calibrated. Waveform checks confirm signal differences and headroom; they do not replace a listener's judgment of timbre.
