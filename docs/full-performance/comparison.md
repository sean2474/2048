# Before / after production-build comparison

Before product: e1052c7; measurement checkout: f80930efcaba8bc87765a87cc439eac4053a490e
After product: a6327c1aabc78a0d73589fb1e36e3a49d42f78fc; measurement checkout: e5494649b2d4403d0b4eb9f5cbf66151b3d1c5b2

Same machine, Chrome and fixture data; five lab samples per page/cache/device case. No network or CPU throttling. Mobile is desktop-based touch/viewport emulation. Local fixture database timings are not real Supabase or Internet latency. p95 of five samples is simply the largest observation.

Native browser FCP, TTFB, DOMContentLoaded and load are primary. Raw observed LCP is provisional and omitted from this comparison because the readiness observation horizon varies. Observed-ready is a post-load upper bound including locator checks, automation round trips and paint checks; it is not first content readiness. LCP is observed through this readiness check, not a final field Core Web Vitals score.

| App / route / device / account / cache | FCP median before → after ms | TTFB median before → after ms | Load median before → after ms | Observed ready upper bound before → after ms |
|---|---:|---:|---:|---:|
| web / / / desktop / account / cold | 88.0 → 40.0 | 10.1 → 10.1 | 55.3 → 41.4 | 243.8 → 410.2 |
| web / / / desktop / account / warm | 40.0 → 48.0 | 11.0 → 12.5 | 24.6 → 28.6 | 80.4 → 79.8 |
| web / /achievements / desktop / account / cold | 40.0 → 40.0 | 7.3 → 7.3 | 43.9 → 45.1 | 401.4 → 371.7 |
| web / /achievements / desktop / account / warm | 48.0 → 40.0 | 10.3 → 9.0 | 27.7 → 25.0 | 95.7 → 95.9 |
| web / /auth/error / desktop / guest / cold | 44.0 → 36.0 | 4.9 → 5.0 | 35.7 → 35.2 | 90.4 → 100.3 |
| web / /auth/error / desktop / guest / warm | 36.0 → 36.0 | 4.8 → 4.7 | 15.5 → 15.1 | 64.0 → 64.0 |
| web / /feedback / desktop / account / cold | 40.0 → 44.0 | 7.4 → 7.3 | 43.0 → 38.3 | 388.1 → 380.1 |
| web / /feedback / desktop / account / warm | 40.0 → 40.0 | 9.2 → 9.2 | 24.9 → 24.5 | 78.3 → 78.3 |
| web / /find-match / desktop / account / cold | 40.0 → 44.0 | 7.2 → 7.7 | 38.8 → 39.5 | 422.9 → 423.2 |
| web / /find-match / desktop / account / warm | 44.0 → 48.0 | 10.8 → 10.6 | 27.4 → 27.1 | 79.2 → 78.8 |
| web / /forgot-password / desktop / guest / cold | 40.0 → 44.0 | 4.9 → 5.0 | 35.1 → 35.0 | 372.6 → 373.9 |
| web / /forgot-password / desktop / guest / warm | 36.0 → 36.0 | 7.5 → 6.8 | 22.3 → 21.8 | 78.2 → 77.6 |
| web / /friends / desktop / account / cold | 44.0 → 44.0 | 6.6 → 7.5 | 46.3 → 40.1 | 122.5 → 124.1 |
| web / /friends / desktop / account / warm | 32.0 → 32.0 | 6.3 → 6.7 | 18.8 → 18.9 | 84.3 → 97.1 |
| web / /history / desktop / account / cold | 40.0 → 44.0 | 7.5 → 7.6 | 37.6 → 38.3 | 404.9 → 385.1 |
| web / /history / desktop / account / warm | 44.0 → 40.0 | 9.7 → 10.7 | 26.4 → 25.4 | 79.0 → 78.9 |
| web / /how-to-play / desktop / account / cold | 40.0 → 40.0 | 7.1 → 7.4 | 45.1 → 43.7 | 405.6 → 403.3 |
| web / /how-to-play / desktop / account / warm | 32.0 → 48.0 | 8.7 → 10.5 | 26.3 → 29.0 | 80.1 → 78.1 |
| web / /leaderboard / desktop / account / cold | 40.0 → 40.0 | 9.3 → 9.2 | 41.6 → 41.0 | 388.7 → 388.9 |
| web / /leaderboard / desktop / account / warm | 36.0 → 36.0 | 9.6 → 10.4 | 25.8 → 28.6 | 79.9 → 79.2 |
| web / /loadout / desktop / account / cold | 40.0 → 44.0 | 8.3 → 7.0 | 46.7 → 44.1 | 401.6 → 404.5 |
| web / /loadout / desktop / account / warm | 40.0 → 40.0 | 7.6 → 8.5 | 22.2 → 25.7 | 80.1 → 79.5 |
| web / /login / desktop / guest / cold | 36.0 → 40.0 | 5.1 → 4.8 | 35.1 → 34.9 | 372.2 → 372.9 |
| web / /login / desktop / guest / warm | 36.0 → 36.0 | 7.4 → 6.8 | 22.2 → 21.8 | 79.9 → 78.7 |
| web / /play/create / desktop / account / cold | 40.0 → 44.0 | 6.6 → 7.3 | 46.3 → 38.9 | 122.1 → 122.8 |
| web / /play/create / desktop / account / warm | 32.0 → 32.0 | 5.9 → 6.3 | 18.3 → 17.5 | 80.0 → 79.7 |
| web / /play/join / desktop / account / cold | 52.0 → 44.0 | 6.5 → 6.9 | 46.5 → 40.0 | 102.1 → 105.6 |
| web / /play/join / desktop / account / warm | 32.0 → 32.0 | 5.9 → 5.7 | 18.7 → 17.1 | 63.7 → 64.1 |
| web / /play/online / desktop / account / cold | 52.0 → 44.0 | 6.4 → 7.0 | 40.8 → 40.7 | 131.5 → 123.3 |
| web / /play/online / desktop / account / warm | 32.0 → 32.0 | 5.9 → 5.9 | 18.1 → 17.4 | 96.3 → 95.9 |
| web / /play/ranked / desktop / account / cold | 40.0 → 44.0 | 6.7 → 6.7 | 37.3 → 36.3 | 388.7 → 390.4 |
| web / /play/ranked / desktop / account / warm | 32.0 → 36.0 | 7.8 → 8.4 | 22.8 → 23.4 | 97.1 → 96.2 |
| web / /reset-password / desktop / guest / cold | 40.0 → 44.0 | 5.1 → 4.5 | 35.5 → 34.4 | 101.9 → 93.4 |
| web / /reset-password / desktop / guest / warm | 36.0 → 32.0 | 4.5 → 4.2 | 15.2 → 14.5 | 64.1 → 65.1 |
| web / /settings / desktop / account / cold | 40.0 → 44.0 | 8.2 → 7.7 | 46.0 → 38.3 | 399.1 → 390.7 |
| web / /settings / desktop / account / warm | 36.0 → 40.0 | 7.5 → 9.4 | 22.0 → 25.4 | 81.0 → 79.7 |
| web / /shop / desktop / account / cold | 40.0 → 40.0 | 6.9 → 6.6 | 43.9 → 42.8 | 373.2 → 372.3 |
| web / /shop / desktop / account / warm | 48.0 → 40.0 | 8.6 → 8.3 | 25.3 → 25.4 | 94.8 → 96.3 |
| web / /signup / desktop / guest / cold | 40.0 → 44.0 | 4.9 → 4.7 | 35.3 → 35.0 | 372.1 → 372.9 |
| web / /signup / desktop / guest / warm | 40.0 → 36.0 | 7.7 → 6.2 | 22.8 → 21.0 | 76.4 → 64.4 |
| web / /solo / desktop / account / cold | 40.0 → 44.0 | 7.3 → 7.2 | 45.7 → 45.7 | 387.5 → 405.9 |
| web / /solo / desktop / account / warm | 44.0 → 40.0 | 10.2 → 8.5 | 27.8 → 25.0 | 97.3 → 97.2 |
| web / /test / desktop / account / cold | 40.0 → 40.0 | 6.7 → 6.4 | 42.2 → 41.7 | 388.5 → 406.3 |
| web / /test / desktop / account / warm | 40.0 → 48.0 | 8.1 → 11.1 | 23.3 → 29.5 | 79.4 → 78.1 |
| web / /tutorial / desktop / account / cold | 40.0 → 40.0 | 7.0 → 7.1 | 45.6 → 39.2 | 388.4 → 388.8 |
| web / /tutorial / desktop / account / warm | 44.0 → 40.0 | 9.5 → 9.8 | 26.6 → 25.7 | 78.2 → 78.5 |
| web / /watch/[id] / desktop / account / cold | 44.0 → 40.0 | 6.5 → 6.6 | 42.9 → 36.7 | 122.7 → 122.8 |
| web / /watch/[id] / desktop / account / warm | 36.0 → 36.0 | 6.2 → 6.2 | 18.5 → 17.4 | 79.8 → 80.9 |
| web / / / mobile-emulation / account / cold | 40.0 → 44.0 | 7.9 → 8.1 | 37.6 → 38.2 | 423.3 → 427.7 |
| web / / / mobile-emulation / account / warm | 48.0 → 44.0 | 11.5 → 11.6 | 28.6 → 29.0 | 79.3 → 80.9 |
| web / /achievements / mobile-emulation / account / cold | 40.0 → 36.0 | 6.7 → 6.7 | 42.2 → 41.8 | 400.4 → 399.6 |
| web / /achievements / mobile-emulation / account / warm | 48.0 → 48.0 | 8.8 → 9.9 | 27.1 → 27.6 | 96.0 → 96.0 |
| web / /auth/error / mobile-emulation / guest / cold | 40.0 → 40.0 | 4.7 → 5.0 | 34.0 → 34.4 | 87.6 → 91.1 |
| web / /auth/error / mobile-emulation / guest / warm | 36.0 → 36.0 | 4.5 → 4.5 | 15.5 → 15.5 | 63.7 → 62.7 |
| web / /feedback / mobile-emulation / account / cold | 40.0 → 44.0 | 7.4 → 6.8 | 41.2 → 36.7 | 405.3 → 375.9 |
| web / /feedback / mobile-emulation / account / warm | 44.0 → 48.0 | 9.1 → 10.7 | 26.7 → 27.9 | 77.8 → 78.6 |
| web / /find-match / mobile-emulation / account / cold | 40.0 → 44.0 | 7.1 → 7.9 | 38.3 → 37.9 | 371.3 → 373.2 |
| web / /find-match / mobile-emulation / account / warm | 40.0 → 48.0 | 9.2 → 9.9 | 24.9 → 26.7 | 77.7 → 77.9 |
| web / /forgot-password / mobile-emulation / guest / cold | 40.0 → 40.0 | 4.9 → 4.9 | 34.5 → 34.2 | 371.7 → 371.5 |
| web / /forgot-password / mobile-emulation / guest / warm | 36.0 → 40.0 | 6.9 → 7.9 | 21.8 → 22.4 | 77.9 → 79.1 |
| web / /friends / mobile-emulation / account / cold | 40.0 → 44.0 | 6.7 → 7.1 | 46.3 → 38.4 | 122.5 → 122.3 |
| web / /friends / mobile-emulation / account / warm | 36.0 → 36.0 | 5.9 → 6.2 | 19.2 → 18.5 | 96.1 → 97.0 |
| web / /history / mobile-emulation / account / cold | 40.0 → 44.0 | 7.2 → 7.6 | 36.5 → 36.8 | 404.6 → 404.2 |
| web / /history / mobile-emulation / account / warm | 40.0 → 40.0 | 10.0 → 10.4 | 25.7 → 26.7 | 80.2 → 79.2 |
| web / /how-to-play / mobile-emulation / account / cold | 40.0 → 40.0 | 7.2 → 7.1 | 43.7 → 42.2 | 406.0 → 404.8 |
| web / /how-to-play / mobile-emulation / account / warm | 40.0 → 48.0 | 7.8 → 12.2 | 24.2 → 31.7 | 81.6 → 78.1 |
| web / /leaderboard / mobile-emulation / account / cold | 40.0 → 40.0 | 8.3 → 8.5 | 40.1 → 40.0 | 388.6 → 404.8 |
| web / /leaderboard / mobile-emulation / account / warm | 32.0 → 44.0 | 9.8 → 10.3 | 28.5 → 29.9 | 78.6 → 79.0 |
| web / /loadout / mobile-emulation / account / cold | 40.0 → 40.0 | 7.1 → 6.6 | 43.2 → 42.9 | 403.5 → 401.5 |
| web / /loadout / mobile-emulation / account / warm | 40.0 → 40.0 | 8.7 → 9.8 | 25.5 → 27.5 | 78.9 → 79.4 |
| web / /login / mobile-emulation / guest / cold | 40.0 → 36.0 | 5.0 → 5.0 | 34.7 → 34.8 | 371.3 → 371.3 |
| web / /login / mobile-emulation / guest / warm | 36.0 → 36.0 | 6.6 → 6.4 | 22.5 → 21.4 | 78.3 → 77.3 |
| web / /play/create / mobile-emulation / account / cold | 40.0 → 40.0 | 6.8 → 6.6 | 45.0 → 37.6 | 121.8 → 119.1 |
| web / /play/create / mobile-emulation / account / warm | 36.0 → 32.0 | 6.1 → 5.9 | 18.7 → 17.4 | 80.8 → 80.9 |
| web / /play/join / mobile-emulation / account / cold | 40.0 → 40.0 | 6.7 → 6.9 | 46.2 → 39.6 | 104.8 → 105.0 |
| web / /play/join / mobile-emulation / account / warm | 32.0 → 32.0 | 5.8 → 6.6 | 18.9 → 18.6 | 64.1 → 63.9 |
| web / /play/online / mobile-emulation / account / cold | 56.0 → 44.0 | 6.6 → 6.5 | 40.6 → 40.5 | 130.8 → 122.6 |
| web / /play/online / mobile-emulation / account / warm | 32.0 → 32.0 | 6.1 → 6.2 | 18.2 → 18.3 | 81.3 → 93.4 |
| web / /play/ranked / mobile-emulation / account / cold | 40.0 → 40.0 | 6.7 → 6.9 | 35.7 → 35.4 | 388.7 → 390.7 |
| web / /play/ranked / mobile-emulation / account / warm | 36.0 → 36.0 | 9.9 → 10.2 | 25.9 → 26.0 | 96.7 → 97.2 |
| web / /reset-password / mobile-emulation / guest / cold | 40.0 → 40.0 | 4.8 → 5.1 | 33.7 → 33.9 | 87.8 → 101.4 |
| web / /reset-password / mobile-emulation / guest / warm | 32.0 → 32.0 | 4.4 → 4.7 | 15.2 → 15.8 | 63.6 → 63.6 |
| web / /settings / mobile-emulation / account / cold | 40.0 → 40.0 | 6.9 → 7.4 | 43.5 → 37.1 | 402.8 → 387.2 |
| web / /settings / mobile-emulation / account / warm | 40.0 → 40.0 | 9.3 → 9.6 | 26.8 → 25.5 | 79.0 → 78.4 |
| web / /shop / mobile-emulation / account / cold | 40.0 → 40.0 | 6.6 → 6.5 | 43.4 → 42.3 | 372.3 → 370.6 |
| web / /shop / mobile-emulation / account / warm | 44.0 → 40.0 | 8.7 → 8.0 | 26.3 → 26.1 | 96.0 → 95.2 |
| web / /signup / mobile-emulation / guest / cold | 40.0 → 40.0 | 4.9 → 5.0 | 34.8 → 34.9 | 371.0 → 372.6 |
| web / /signup / mobile-emulation / guest / warm | 40.0 → 40.0 | 7.9 → 9.0 | 22.9 → 24.1 | 63.0 → 78.3 |
| web / /solo / mobile-emulation / account / cold | 40.0 → 40.0 | 7.4 → 7.4 | 44.7 → 45.1 | 404.8 → 403.3 |
| web / /solo / mobile-emulation / account / warm | 48.0 → 40.0 | 10.1 → 9.5 | 27.5 → 27.6 | 87.7 → 81.1 |
| web / /test / mobile-emulation / account / cold | 40.0 → 40.0 | 7.0 → 6.7 | 41.9 → 41.9 | 406.3 → 400.5 |
| web / /test / mobile-emulation / account / warm | 40.0 → 40.0 | 9.2 → 8.9 | 26.0 → 25.5 | 76.6 → 77.6 |
| web / /tutorial / mobile-emulation / account / cold | 40.0 → 44.0 | 7.2 → 7.1 | 45.3 → 38.0 | 387.3 → 389.0 |
| web / /tutorial / mobile-emulation / account / warm | 44.0 → 40.0 | 9.6 → 9.3 | 27.0 → 25.7 | 80.2 → 79.8 |
| web / /watch/[id] / mobile-emulation / account / cold | 40.0 → 36.0 | 6.7 → 6.5 | 42.9 → 35.9 | 123.2 → 118.4 |
| web / /watch/[id] / mobile-emulation / account / warm | 32.0 → 32.0 | 6.8 → 6.3 | 19.4 → 18.4 | 78.9 → 78.1 |
| admin / / / desktop / account / cold | 68.0 → 56.0 | 6.9 → 6.8 | 52.3 → 42.5 | 111.3 → 378.6 |
| admin / / / desktop / account / warm | 32.0 → 36.0 | 5.6 → 8.4 | 15.7 → 20.1 | 64.0 → 63.8 |
| admin / /audit / desktop / account / cold | 72.0 → 56.0 | 5.3 → 6.2 | 55.1 → 42.0 | 132.5 → 371.8 |
| admin / /audit / desktop / account / warm | 36.0 → 32.0 | 4.8 → 6.9 | 15.3 → 18.2 | 63.9 → 63.5 |
| admin / /auth/error / desktop / guest / cold | 52.0 → 56.0 | 3.4 → 3.6 | 42.6 → 43.0 | 86.7 → 88.1 |
| admin / /auth/error / desktop / guest / warm | 24.0 → 24.0 | 3.3 → 3.3 | 11.2 → 11.4 | 48.9 → 48.9 |
| admin / /catalog / desktop / account / cold | 60.0 → 56.0 | 5.8 → 6.6 | 46.2 → 43.3 | 384.3 → 372.7 |
| admin / /catalog / desktop / account / warm | 36.0 → 36.0 | 6.1 → 8.3 | 19.0 → 20.6 | 79.8 → 63.8 |
| admin / /feedback / desktop / account / cold | 64.0 → 40.0 | 5.4 → 5.8 | 50.6 → 40.6 | 116.9 → 388.6 |
| admin / /feedback / desktop / account / warm | 36.0 → 36.0 | 4.7 → 7.0 | 14.4 → 18.9 | 64.2 → 63.9 |
| admin / /login / desktop / guest / cold | 60.0 → 60.0 | 3.2 → 3.3 | 44.5 → 44.6 | 88.2 → 89.4 |
| admin / /login / desktop / guest / warm | 24.0 → 24.0 | 3.1 → 3.1 | 11.3 → 11.4 | 55.5 → 54.0 |
| admin / /matches / desktop / account / cold | 72.0 → 56.0 | 5.1 → 5.7 | 54.7 → 41.8 | 134.2 → 383.1 |
| admin / /matches / desktop / account / warm | 32.0 → 32.0 | 4.9 → 6.5 | 15.5 → 18.1 | 63.7 → 63.4 |
| admin / /matches/[id] / desktop / account / cold | 56.0 → 44.0 | 5.7 → 5.8 | 51.3 → 40.7 | 117.9 → 371.6 |
| admin / /matches/[id] / desktop / account / warm | 36.0 → 36.0 | 4.6 → 7.4 | 14.7 → 19.4 | 64.3 → 63.4 |
| admin / /operations / desktop / account / cold | 60.0 → 60.0 | 5.1 → 5.1 | 48.6 → 46.5 | 117.3 → 120.9 |
| admin / /operations / desktop / account / warm | 28.0 → 32.0 | 4.6 → 4.8 | 14.2 → 14.1 | 64.1 → 64.0 |
| admin / /players / desktop / account / cold | 72.0 → 56.0 | 5.2 → 5.9 | 51.7 → 40.8 | 119.5 → 370.8 |
| admin / /players / desktop / account / warm | 32.0 → 32.0 | 4.4 → 7.0 | 14.7 → 18.9 | 64.0 → 63.4 |
| admin / /players/[id] / desktop / account / cold | 56.0 → 40.0 | 5.2 → 5.9 | 43.7 → 40.7 | 117.9 → 374.0 |
| admin / /players/[id] / desktop / account / warm | 36.0 → 32.0 | 4.8 → 6.7 | 14.8 → 18.6 | 63.0 → 62.7 |
| admin / /seasons / desktop / account / cold | 56.0 → 44.0 | 5.3 → 5.6 | 51.3 → 41.2 | 105.2 → 371.6 |
| admin / /seasons / desktop / account / warm | 32.0 → 36.0 | 4.6 → 6.7 | 14.7 → 19.3 | 64.2 → 63.0 |
| admin / / / mobile-emulation / account / cold | 56.0 → 40.0 | 5.0 → 5.6 | 50.9 → 40.4 | 118.7 → 372.3 |
| admin / / / mobile-emulation / account / warm | 36.0 → 32.0 | 4.6 → 6.4 | 14.8 → 18.9 | 64.0 → 63.1 |
| admin / /audit / mobile-emulation / account / cold | 72.0 → 40.0 | 5.1 → 5.3 | 55.0 → 41.1 | 135.9 → 372.6 |
| admin / /audit / mobile-emulation / account / warm | 36.0 → 32.0 | 4.7 → 6.3 | 15.2 → 18.5 | 64.0 → 63.4 |
| admin / /auth/error / mobile-emulation / guest / cold | 44.0 → 56.0 | 3.1 → 3.1 | 42.6 → 42.5 | 86.7 → 86.8 |
| admin / /auth/error / mobile-emulation / guest / warm | 24.0 → 24.0 | 3.0 → 2.9 | 11.1 → 11.1 | 59.6 → 59.0 |
| admin / /catalog / mobile-emulation / account / cold | 40.0 → 40.0 | 5.4 → 6.2 | 45.2 → 42.5 | 372.2 → 372.4 |
| admin / /catalog / mobile-emulation / account / warm | 36.0 → 36.0 | 6.0 → 7.8 | 19.1 → 21.2 | 79.6 → 63.2 |
| admin / /feedback / mobile-emulation / account / cold | 64.0 → 40.0 | 4.9 → 5.5 | 49.1 → 39.7 | 120.7 → 355.1 |
| admin / /feedback / mobile-emulation / account / warm | 36.0 → 32.0 | 4.5 → 6.5 | 14.5 → 18.5 | 63.9 → 63.9 |
| admin / /login / mobile-emulation / guest / cold | 60.0 → 48.0 | 3.0 → 3.2 | 44.6 → 44.4 | 88.0 → 90.6 |
| admin / /login / mobile-emulation / guest / warm | 24.0 → 24.0 | 2.8 → 3.0 | 11.3 → 11.6 | 48.6 → 47.6 |
| admin / /matches / mobile-emulation / account / cold | 72.0 → 40.0 | 5.2 → 5.6 | 55.3 → 40.9 | 134.9 → 372.0 |
| admin / /matches / mobile-emulation / account / warm | 32.0 → 32.0 | 4.6 → 6.3 | 15.3 → 18.0 | 63.5 → 63.3 |
| admin / /matches/[id] / mobile-emulation / account / cold | 64.0 → 44.0 | 4.9 → 6.0 | 50.6 → 39.8 | 105.3 → 371.6 |
| admin / /matches/[id] / mobile-emulation / account / warm | 24.0 → 36.0 | 4.4 → 7.2 | 14.3 → 20.5 | 64.3 → 63.2 |
| admin / /operations / mobile-emulation / account / cold | 56.0 → 60.0 | 5.2 → 4.8 | 47.5 → 47.0 | 103.4 → 116.6 |
| admin / /operations / mobile-emulation / account / warm | 28.0 → 28.0 | 4.5 → 4.5 | 13.6 → 13.7 | 63.8 → 64.3 |
| admin / /players / mobile-emulation / account / cold | 60.0 → 40.0 | 5.2 → 5.2 | 51.2 → 39.7 | 118.7 → 372.9 |
| admin / /players / mobile-emulation / account / warm | 36.0 → 32.0 | 4.4 → 6.9 | 14.9 → 18.4 | 63.2 → 63.1 |
| admin / /players/[id] / mobile-emulation / account / cold | 56.0 → 40.0 | 4.9 → 5.4 | 42.5 → 40.1 | 118.5 → 368.9 |
| admin / /players/[id] / mobile-emulation / account / warm | 32.0 → 32.0 | 4.7 → 6.5 | 14.7 → 18.5 | 64.3 → 63.5 |
| admin / /seasons / mobile-emulation / account / cold | 56.0 → 40.0 | 4.8 → 5.0 | 50.9 → 39.6 | 105.1 → 373.1 |
| admin / /seasons / mobile-emulation / account / warm | 28.0 → 36.0 | 4.3 → 7.2 | 14.7 → 20.0 | 64.4 → 62.4 |

## Initial route JavaScript

Exact unique app-build-manifest JS file sizes, with gzip applied separately to each file. Runtime lazy imports are outside these initial-manifest totals.

| App / route | Raw bytes before → after | Gzip bytes before → after |
|---|---:|---:|
| web /forgot-password | 879868 → 879985 | 256897 → 256897 |
| web /login | 881117 → 881234 | 257261 → 257261 |
| web /reset-password | 879868 → 879985 | 256897 → 256897 |
| web /signup | 881119 → 881236 | 257261 → 257261 |
| web /_not-found | 871298 → 871415 | 253658 → 253658 |
| web /achievements | 904350 → 901819 | 263764 → 263177 |
| web /auth/error | 871298 → 871415 | 253658 → 253658 |
| web /feedback | 882517 → 879041 | 257981 → 256879 |
| web /find-match | 884521 → 884638 | 257887 → 257882 |
| web /friends | 898317 → 898597 | 262314 → 262391 |
| web /history | 873427 → 873544 | 254763 → 254763 |
| web /how-to-play | 871298 → 871415 | 253658 → 253658 |
| web /leaderboard | 873691 → 873808 | 254863 → 254863 |
| web /loadout | 912067 → 906776 | 266482 → 265219 |
| web / | 895429 → 895590 | 261441 → 261438 |
| web /play/[id] | 937943 → 938230 | 274746 → 274966 |
| web /play/create | 885689 → 882673 | 258929 → 258010 |
| web /play/join | 885514 → 882550 | 258960 → 258016 |
| web /play/online | 887779 → 887896 | 259487 → 259477 |
| web /play/ranked | 887779 → 887896 | 259487 → 259477 |
| web /settings | 906075 → 902580 | 264015 → 263412 |
| web /shop | 907044 → 901234 | 265143 → 263622 |
| web /solo | 923361 → 920057 | 270431 → 269514 |
| web /test | 901904 → 902037 | 264226 → 264232 |
| web /tutorial | 922789 → 920051 | 270190 → 269579 |
| web /watch/[id] | 902750 → 902535 | 264010 → 263892 |
| admin /audit | 616293 → 608901 | 178107 → 175536 |
| admin /catalog | 691517 → 691105 | 195477 → 195390 |
| admin /feedback | 612641 → 608901 | 176862 → 175536 |
| admin /matches/[id] | 612961 → 608901 | 177048 → 175536 |
| admin /matches | 616293 → 608901 | 178107 → 175536 |
| admin /operations | 615449 → 614656 | 177664 → 177409 |
| admin / | 618994 → 610482 | 178772 → 176234 |
| admin /players/[id] | 657002 → 648276 | 190701 → 188515 |
| admin /players | 614734 → 609441 | 177676 → 175747 |
| admin /seasons | 650058 → 648122 | 189013 → 188460 |
| admin /_not-found | 399778 → 399778 | 116468 → 116476 |
| admin /auth/error | 409048 → 409048 | 120147 → 120158 |
| admin /login | 599107 → 599107 | 171601 → 171609 |

## Preference reads per full navigation

Whole fixture-window counts include normal application-link prefetches and their server renders. Medians combine desktop/mobile samples; isolated SSR request deduplication is covered by separate runtime tests.

| App / route | Cold median before → after | Warm median before → after |
|---|---:|---:|
| web / | 3 → 2 | 3 → 2 |
| web /achievements | 2 → 1 | 2 → 1 |
| web /feedback | 2 → 1 | 2 → 1 |
| web /find-match | 3 → 2 | 3 → 2 |
| web /friends | 2 → 1 | 2 → 1 |
| web /history | 2 → 1 | 2 → 1 |
| web /how-to-play | 2 → 1 | 2 → 1 |
| web /leaderboard | 2 → 1 | 2 → 1 |
| web /loadout | 2 → 1 | 2 → 1 |
| web /play/create | 2 → 1 | 2 → 1 |
| web /play/join | 2 → 1 | 2 → 1 |
| web /play/online | 2 → 1 | 2 → 1 |
| web /play/ranked | 2 → 1 | 2 → 1 |
| web /settings | 2 → 1 | 2 → 1 |
| web /shop | 2 → 1 | 2 → 1 |
| web /solo | 3 → 2 | 3 → 2 |
| web /test | 2 → 1 | 2 → 1 |
| web /tutorial | 2 → 1 | 2 → 1 |
| web /watch/[id] | 3 → 2 | 3 → 2 |
| admin / | 0 → 0 | 0 → 0 |
| admin /audit | 0 → 0 | 0 → 0 |
| admin /catalog | 0 → 0 | 0 → 0 |
| admin /feedback | 0 → 0 | 0 → 0 |
| admin /matches | 0 → 0 | 0 → 0 |
| admin /matches/[id] | 0 → 0 | 0 → 0 |
| admin /operations | 0 → 0 | 0 → 0 |
| admin /players | 0 → 0 | 0 → 0 |
| admin /players/[id] | 0 → 0 | 0 → 0 |
| admin /seasons | 0 → 0 | 0 → 0 |

## Real local game journeys

Natural games use actual random boards and alternating valid inputs with minimum immediate merge score; their lengths describe this test policy, not typical human duration or an optimization gain. Separate surrender rows do not replace natural completion. Socket RTT is local transport; input-paint uses browser input/DOM observers and two animation frames.

| Device / ending | Input samples before / after | Self update median ms | Opponent update median ms | Input paint median ms | Playable duration before / after seconds |
|---|---:|---:|---:|---:|---:|
| desktop / natural | 282 / 503 | 9.0 → 9.0 | 0.4 → 0.4 | 42.6 → 42.6 | 28.7 / 51.2 |
| desktop / surrender | 0 / 0 | — → — | — → — | — → — | 0.3 / 0.1 |
| mobile-emulation / natural | 374 / 504 | 15.0 → 14.7 | 0.2 → 0.3 | 48.0 → 47.7 | 38.1 / 51.3 |
| mobile-emulation / surrender | 0 / 0 | — → — | — → — | — → — | 0.3 / 0.3 |

## Solo clock

| Device | Start response / board observed before → after ms | Visible clock drift before → after ms | After server clock drift ms |
|---|---:|---:|---:|
| desktop | 338.4 → 293.0 | 8.8 → 13.6 | 14.5 |
| mobile-emulation | 292.6 → 400.2 | 13.0 → 9.6 | 15.7 |

Actual application-link navigation samples, per-run p95, queue/intro/board/result timings and complete request paths are retained in both raw.json files. Intentional intro time is separate from transport latency.

Not checked: actual phone hardware, production field Speed Insights, Internet/database latency, cloud cold starts, or representative human match duration. Shared-host CPU activity and small sample sizes can affect results.
