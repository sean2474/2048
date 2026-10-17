# Home LCP observation diagnostic

The full benchmark stopped its observer after variable readiness checks. Some before samples stopped at 150 ms and could not capture a later profile-text candidate. These diagnostic runs use the same minimum 1000 ms navigation observation horizon with five cold/warm samples on desktop and mobile emulation. They are separate lab diagnostics, not final field Core Web Vitals.

Before product source: e1052c7 (checkout 65e6814). After product source: a6327c1. Both use measurement harness e981e47. No CPU/network throttling.

| Device / cache | Before observed LCP median ms | After observed LCP median ms | Before observation range ms | After observation range ms |
|---|---:|---:|---:|---:|
| desktop / cold | 372.0 | 356.0 | 1005.6–1012.3 | 1002.7–1009.1 |
| desktop / warm | 292.0 | 292.0 | 1001.2–1011.9 | 1008.6–1016.6 |
| mobile-emulation / cold | 372.0 | 372.0 | 1005.4–1017.8 | 1003.5–1006.7 |
| mobile-emulation / warm | 292.0 | 296.0 | 1007.6–1015.0 | 1008.1–1017.2 |

Final candidates:
- P — Elo and your established tier carry over. Play 10 ranked matches each season to enter its standings. — URL: none

The large final candidate is the server-rendered player-profile season explanation, not an image. Matched-horizon measurements do not reproduce the earlier 200→360 ms apparent desktop regression. No product edit was made in response to that provisional signal. The raw candidate timelines and observation endpoints are retained in lcp-before/raw.json and lcp-after/raw.json.
