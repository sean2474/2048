# Mobile browser verification — 2026-10-22

The production site `https://www.2048duo.io` was tested through normal public DNS using web commit `a0ab06b8aff4c96aa7885aec17e89e4a70716e6c`. These checks use fresh guest sessions against the real deployed web and socket services. No account credentials, public matchmaking queue, mocked backend or injected production delay was used.

## Coverage and results

[Full run](mobile-browser-qa.json): installed Chrome 155.0.8059.85 with Pixel 7 touch/device settings, and WebKit 26.5 with iPhone 13 settings, hosted on the desktop. This exercises both browser engines, touch input and mobile layout. It is **not a physical Android or iPhone hardware test**, and does not establish physical-device CPU, battery, thermal or cellular-network performance.

- Both browsers passed all 28 route/width combinations: `/`, `/settings`, `/find-match`, `/leaderboard`, `/feedback`, `/solo`, `/tutorial`, each at widths 320, 375, 390 and 430 CSS pixels with height 844. None exceeded the requested document width.
- Volume and mute persisted after reload, and the test-sound button was disabled while muted. Custom shortcut preferences also persisted.
- The keybindings dialog fit the viewport and closed by touch. Screenshots were captured after its entrance animation completed.
- Korean and English selection updated visible server headings as well as client controls in the final run. Korean persisted through reload.
- The mobile menu closed after navigation to feedback; that transition issued no new top-level document request. The feedback → settings → tutorial links also worked by touch.
- A tutorial direction-button tap merged the starting tiles and displayed the completion step. The tutorial also fit landscape 844×390 without horizontal document overflow.
- The final complete run recorded no JavaScript page errors or same-origin HTTP responses at or above 400.

Additional [compact/landscape checks](mobile-compact-qa.json) passed in both engines at 320×568, 375×667 and 844×390: the keybindings dialog stayed within the viewport, its Cancel button remained reachable by touch, and navigation to feedback worked without horizontal overflow. Each viewport used a fresh page to avoid overlapping programmatic navigation.

## Real cross-browser game

Chrome created a private guest friend room and WebKit joined it. The browsers alternated **12 valid moves**: one native Chrome touch swipe and eleven direction-button taps. Each input produced matching authoritative player/opponent state at the two clients.

Reloading the Chrome player during the active match preserved its guest session and restored both players to the unpaused game. WebKit then surrendered through the confirmation dialog, and both browsers displayed the result. The active boards also fit their 390×844 viewports. This scenario passed twice, once independently and once after the full settings/navigation checks. No game-server restart or data deletion was needed.

## Transient observation retained

One earlier Chrome full-flow attempt showed mixed language after selecting English: client controls changed, but server-rendered Settings headings remained Korean beyond the 15-second test wait. The [observation record](mobile-language-observation.json) is retained rather than hidden by the later pass. Ten minimal production cycles and three full production Chrome flow repetitions did not reproduce it. The independent final complete two-engine run also passed. A deterministic cause has **not** been established, so no application-language fix is claimed.

The harness was also corrected to wait for visible headings, use actual in-app links instead of overlapping programmatic navigation, and wait for the initial page to settle before entering a room code. In the first cross-browser room-join attempt, the submit button stayed disabled after early input and the test timed out. After waiting for initial loading before entering the code, both complete matches passed; an application root cause for that first timeout was not established. Those harness failures are not treated as verified application regressions.

Authenticated account editing, purchases and ranked matchmaking were outside this guest mobile run. Existing server/action tests cover their application boundaries separately. Physical-device verification and fresh Vercel real-user samples remain separate from these results.

## Mobile speed

The [normal-public-DNS Lighthouse results](dns-only-public-lighthouse.json) retain all three simulated-mobile runs for five routes: medians **97, 97, 97, 98 and 97**, with individual home 94 and solo 90 observations included. These scores are not the Vercel Real Experience Score. The latest inspected rolling Vercel window still does not establish field RES ≥95; see the [DNS and performance follow-up](dns-routing-results.md#vercel-field-score-remains-pending).
