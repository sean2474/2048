# Local production performance measurements

Commit: e5494649b2d4403d0b4eb9f5cbf66151b3d1c5b2
Chrome: 155.0.8059.80; 5 repetitions; no CPU/network throttling.

Backend data is a loopback fixture; game transport uses the real local Socket.IO server. Mobile means viewport/touch emulation. Readiness is a post-load observed upper bound including automation round trips and paint checks, not first data arrival. Paint values stop at this observation and are lab samples, not field Core Web Vitals.

| App / route / device / account / cache | n | Observed ready upper bound median / p95 ms | TTFB median ms | Provisional observed LCP median ms |
|---|---:|---:|---:|---:|
| web / / / desktop / account / cold | 5 | 410.2 / 512.2 | 10.1 | 360.0 |
| web / / / desktop / account / warm | 5 | 79.8 / 83.5 | 12.5 | 48.0 |
| web / /achievements / desktop / account / cold | 5 | 371.7 / 404.3 | 7.3 | 124.0 |
| web / /achievements / desktop / account / warm | 5 | 95.9 / 96.4 | 9.0 | 64.0 |
| web / /auth/error / desktop / guest / cold | 5 | 100.3 / 102.1 | 5.0 | 36.0 |
| web / /auth/error / desktop / guest / warm | 5 | 64.0 / 66.8 | 4.7 | 36.0 |
| web / /feedback / desktop / account / cold | 5 | 380.1 / 404.2 | 7.3 | 340.0 |
| web / /feedback / desktop / account / warm | 5 | 78.3 / 80.1 | 9.2 | 40.0 |
| web / /find-match / desktop / account / cold | 5 | 423.2 / 423.6 | 7.7 | 376.0 |
| web / /find-match / desktop / account / warm | 5 | 78.8 / 79.6 | 10.6 | 48.0 |
| web / /forgot-password / desktop / guest / cold | 5 | 373.9 / 375.3 | 5.0 | 340.0 |
| web / /forgot-password / desktop / guest / warm | 5 | 77.6 / 78.5 | 6.8 | 36.0 |
| web / /friends / desktop / account / cold | 5 | 124.1 / 139.3 | 7.5 | 108.0 |
| web / /friends / desktop / account / warm | 5 | 97.1 / 101.1 | 6.7 | 64.0 |
| web / /history / desktop / account / cold | 5 | 385.1 / 407.6 | 7.6 | 340.0 |
| web / /history / desktop / account / warm | 5 | 78.9 / 79.7 | 10.7 | 40.0 |
| web / /how-to-play / desktop / account / cold | 5 | 403.3 / 407.4 | 7.4 | 372.0 |
| web / /how-to-play / desktop / account / warm | 5 | 78.1 / 82.5 | 10.5 | 48.0 |
| web / /leaderboard / desktop / account / cold | 5 | 388.9 / 389.9 | 9.2 | 356.0 |
| web / /leaderboard / desktop / account / warm | 5 | 79.2 / 97.2 | 10.4 | 48.0 |
| web / /loadout / desktop / account / cold | 5 | 404.5 / 408.6 | 7.0 | 340.0 |
| web / /loadout / desktop / account / warm | 5 | 79.5 / 95.0 | 8.5 | 48.0 |
| web / /login / desktop / guest / cold | 5 | 372.9 / 375.0 | 4.8 | 340.0 |
| web / /login / desktop / guest / warm | 5 | 78.7 / 79.2 | 6.8 | 36.0 |
| web / /play/create / desktop / account / cold | 5 | 122.8 / 123.5 | 7.3 | 108.0 |
| web / /play/create / desktop / account / warm | 5 | 79.7 / 83.7 | 6.3 | 64.0 |
| web / /play/join / desktop / account / cold | 5 | 105.6 / 107.2 | 6.9 | 44.0 |
| web / /play/join / desktop / account / warm | 5 | 64.1 / 71.2 | 5.7 | 32.0 |
| web / /play/online / desktop / account / cold | 5 | 123.3 / 135.0 | 7.0 | 108.0 |
| web / /play/online / desktop / account / warm | 5 | 95.9 / 96.8 | 5.9 | 48.0 |
| web / /play/ranked / desktop / account / cold | 5 | 390.4 / 404.0 | 6.7 | 340.0 |
| web / /play/ranked / desktop / account / warm | 5 | 96.2 / 96.7 | 8.4 | 64.0 |
| web / /reset-password / desktop / guest / cold | 5 | 93.4 / 106.2 | 4.5 | 48.0 |
| web / /reset-password / desktop / guest / warm | 5 | 65.1 / 70.0 | 4.2 | 40.0 |
| web / /settings / desktop / account / cold | 5 | 390.7 / 391.4 | 7.7 | 356.0 |
| web / /settings / desktop / account / warm | 5 | 79.7 / 80.4 | 9.4 | 40.0 |
| web / /shop / desktop / account / cold | 5 | 372.3 / 373.9 | 6.6 | 340.0 |
| web / /shop / desktop / account / warm | 5 | 96.3 / 97.0 | 8.3 | 64.0 |
| web / /signup / desktop / guest / cold | 5 | 372.9 / 374.4 | 4.7 | 340.0 |
| web / /signup / desktop / guest / warm | 5 | 64.4 / 79.7 | 6.2 | 36.0 |
| web / /solo / desktop / account / cold | 5 | 405.9 / 407.8 | 7.2 | 340.0 |
| web / /solo / desktop / account / warm | 5 | 97.2 / 103.1 | 8.5 | 80.0 |
| web / /test / desktop / account / cold | 5 | 406.3 / 407.0 | 6.4 | 340.0 |
| web / /test / desktop / account / warm | 5 | 78.1 / 78.7 | 11.1 | 48.0 |
| web / /tutorial / desktop / account / cold | 5 | 388.8 / 389.5 | 7.1 | 108.0 |
| web / /tutorial / desktop / account / warm | 5 | 78.5 / 81.1 | 9.8 | 40.0 |
| web / /watch/[id] / desktop / account / cold | 5 | 122.8 / 125.5 | 6.6 | 92.0 |
| web / /watch/[id] / desktop / account / warm | 5 | 80.9 / 81.0 | 6.2 | 68.0 |
| web / / / mobile-emulation / account / cold | 5 | 427.7 / 439.4 | 8.1 | 372.0 |
| web / / / mobile-emulation / account / warm | 5 | 80.9 / 97.4 | 11.6 | 44.0 |
| web / /achievements / mobile-emulation / account / cold | 5 | 399.6 / 401.9 | 6.7 | 120.0 |
| web / /achievements / mobile-emulation / account / warm | 5 | 96.0 / 112.4 | 9.9 | 80.0 |
| web / /auth/error / mobile-emulation / guest / cold | 5 | 91.1 / 102.1 | 5.0 | 40.0 |
| web / /auth/error / mobile-emulation / guest / warm | 5 | 62.7 / 64.4 | 4.5 | 36.0 |
| web / /feedback / mobile-emulation / account / cold | 5 | 375.9 / 404.1 | 6.8 | 340.0 |
| web / /feedback / mobile-emulation / account / warm | 5 | 78.6 / 83.2 | 10.7 | 48.0 |
| web / /find-match / mobile-emulation / account / cold | 5 | 373.2 / 406.5 | 7.9 | 340.0 |
| web / /find-match / mobile-emulation / account / warm | 5 | 77.9 / 79.0 | 9.9 | 48.0 |
| web / /forgot-password / mobile-emulation / guest / cold | 5 | 371.5 / 371.8 | 4.9 | 340.0 |
| web / /forgot-password / mobile-emulation / guest / warm | 5 | 79.1 / 79.4 | 7.9 | 40.0 |
| web / /friends / mobile-emulation / account / cold | 5 | 122.3 / 124.2 | 7.1 | 92.0 |
| web / /friends / mobile-emulation / account / warm | 5 | 97.0 / 97.5 | 6.2 | 64.0 |
| web / /history / mobile-emulation / account / cold | 5 | 404.2 / 407.5 | 7.6 | 340.0 |
| web / /history / mobile-emulation / account / warm | 5 | 79.2 / 87.1 | 10.4 | 40.0 |
| web / /how-to-play / mobile-emulation / account / cold | 5 | 404.8 / 423.4 | 7.1 | 360.0 |
| web / /how-to-play / mobile-emulation / account / warm | 5 | 78.1 / 97.7 | 12.2 | 48.0 |
| web / /leaderboard / mobile-emulation / account / cold | 5 | 404.8 / 407.8 | 8.5 | 340.0 |
| web / /leaderboard / mobile-emulation / account / warm | 5 | 79.0 / 96.6 | 10.3 | 48.0 |
| web / /loadout / mobile-emulation / account / cold | 5 | 401.5 / 406.3 | 6.6 | 340.0 |
| web / /loadout / mobile-emulation / account / warm | 5 | 79.4 / 96.2 | 9.8 | 40.0 |
| web / /login / mobile-emulation / guest / cold | 5 | 371.3 / 382.8 | 5.0 | 340.0 |
| web / /login / mobile-emulation / guest / warm | 5 | 77.3 / 78.9 | 6.4 | 36.0 |
| web / /play/create / mobile-emulation / account / cold | 5 | 119.1 / 122.0 | 6.6 | 104.0 |
| web / /play/create / mobile-emulation / account / warm | 5 | 80.9 / 92.5 | 5.9 | 64.0 |
| web / /play/join / mobile-emulation / account / cold | 5 | 105.0 / 107.3 | 6.9 | 40.0 |
| web / /play/join / mobile-emulation / account / warm | 5 | 63.9 / 64.3 | 6.6 | 32.0 |
| web / /play/online / mobile-emulation / account / cold | 5 | 122.6 / 125.0 | 6.5 | 108.0 |
| web / /play/online / mobile-emulation / account / warm | 5 | 93.4 / 97.4 | 6.2 | 64.0 |
| web / /play/ranked / mobile-emulation / account / cold | 5 | 390.7 / 400.0 | 6.9 | 340.0 |
| web / /play/ranked / mobile-emulation / account / warm | 5 | 97.2 / 112.9 | 10.2 | 68.0 |
| web / /reset-password / mobile-emulation / guest / cold | 5 | 101.4 / 105.9 | 5.1 | 76.0 |
| web / /reset-password / mobile-emulation / guest / warm | 5 | 63.6 / 64.3 | 4.7 | 36.0 |
| web / /settings / mobile-emulation / account / cold | 5 | 387.2 / 389.3 | 7.4 | 356.0 |
| web / /settings / mobile-emulation / account / warm | 5 | 78.4 / 81.3 | 9.6 | 48.0 |
| web / /shop / mobile-emulation / account / cold | 5 | 370.6 / 372.4 | 6.5 | 340.0 |
| web / /shop / mobile-emulation / account / warm | 5 | 95.2 / 96.1 | 8.0 | 64.0 |
| web / /signup / mobile-emulation / guest / cold | 5 | 372.6 / 373.1 | 5.0 | 340.0 |
| web / /signup / mobile-emulation / guest / warm | 5 | 78.3 / 80.4 | 9.0 | 40.0 |
| web / /solo / mobile-emulation / account / cold | 5 | 403.3 / 405.2 | 7.4 | 340.0 |
| web / /solo / mobile-emulation / account / warm | 5 | 81.1 / 93.0 | 9.5 | 40.0 |
| web / /test / mobile-emulation / account / cold | 5 | 400.5 / 405.6 | 6.7 | 340.0 |
| web / /test / mobile-emulation / account / warm | 5 | 77.6 / 79.3 | 8.9 | 40.0 |
| web / /tutorial / mobile-emulation / account / cold | 5 | 389.0 / 389.9 | 7.1 | 108.0 |
| web / /tutorial / mobile-emulation / account / warm | 5 | 79.8 / 83.4 | 9.3 | 40.0 |
| web / /watch/[id] / mobile-emulation / account / cold | 5 | 118.4 / 123.5 | 6.5 | 88.0 |
| web / /watch/[id] / mobile-emulation / account / warm | 5 | 78.1 / 80.7 | 6.3 | 48.0 |
| admin / / / desktop / account / cold | 5 | 378.6 / 477.6 | 6.8 | 344.0 |
| admin / / / desktop / account / warm | 5 | 63.8 / 71.1 | 8.4 | 36.0 |
| admin / /audit / desktop / account / cold | 5 | 371.8 / 383.6 | 6.2 | 352.0 |
| admin / /audit / desktop / account / warm | 5 | 63.5 / 63.7 | 6.9 | 32.0 |
| admin / /auth/error / desktop / guest / cold | 5 | 88.1 / 90.3 | 3.6 | 56.0 |
| admin / /auth/error / desktop / guest / warm | 5 | 48.9 / 55.3 | 3.3 | 24.0 |
| admin / /catalog / desktop / account / cold | 5 | 372.7 / 384.1 | 6.6 | 356.0 |
| admin / /catalog / desktop / account / warm | 5 | 63.8 / 362.9 | 8.3 | 36.0 |
| admin / /feedback / desktop / account / cold | 5 | 388.6 / 389.9 | 5.8 | 332.0 |
| admin / /feedback / desktop / account / warm | 5 | 63.9 / 64.7 | 7.0 | 36.0 |
| admin / /login / desktop / guest / cold | 5 | 89.4 / 96.1 | 3.3 | 60.0 |
| admin / /login / desktop / guest / warm | 5 | 54.0 / 64.0 | 3.1 | 24.0 |
| admin / /matches / desktop / account / cold | 5 | 383.1 / 385.5 | 5.7 | 348.0 |
| admin / /matches / desktop / account / warm | 5 | 63.4 / 63.6 | 6.5 | 32.0 |
| admin / /matches/[id] / desktop / account / cold | 5 | 371.6 / 373.9 | 5.8 | 336.0 |
| admin / /matches/[id] / desktop / account / warm | 5 | 63.4 / 63.6 | 7.4 | 36.0 |
| admin / /operations / desktop / account / cold | 5 | 120.9 / 122.5 | 5.1 | 108.0 |
| admin / /operations / desktop / account / warm | 5 | 64.0 / 65.4 | 4.8 | 48.0 |
| admin / /players / desktop / account / cold | 5 | 370.8 / 371.5 | 5.9 | 356.0 |
| admin / /players / desktop / account / warm | 5 | 63.4 / 63.6 | 7.0 | 32.0 |
| admin / /players/[id] / desktop / account / cold | 5 | 374.0 / 389.3 | 5.9 | 340.0 |
| admin / /players/[id] / desktop / account / warm | 5 | 62.7 / 62.9 | 6.7 | 32.0 |
| admin / /seasons / desktop / account / cold | 5 | 371.6 / 372.7 | 5.6 | 336.0 |
| admin / /seasons / desktop / account / warm | 5 | 63.0 / 63.9 | 6.7 | 36.0 |
| admin / / / mobile-emulation / account / cold | 5 | 372.3 / 378.0 | 5.6 | 340.0 |
| admin / / / mobile-emulation / account / warm | 5 | 63.1 / 63.3 | 6.4 | 32.0 |
| admin / /audit / mobile-emulation / account / cold | 5 | 372.6 / 386.2 | 5.3 | 352.0 |
| admin / /audit / mobile-emulation / account / warm | 5 | 63.4 / 67.8 | 6.3 | 32.0 |
| admin / /auth/error / mobile-emulation / guest / cold | 5 | 86.8 / 89.4 | 3.1 | 56.0 |
| admin / /auth/error / mobile-emulation / guest / warm | 5 | 59.0 / 65.0 | 2.9 | 24.0 |
| admin / /catalog / mobile-emulation / account / cold | 5 | 372.4 / 382.6 | 6.2 | 340.0 |
| admin / /catalog / mobile-emulation / account / warm | 5 | 63.2 / 80.0 | 7.8 | 36.0 |
| admin / /feedback / mobile-emulation / account / cold | 5 | 355.1 / 387.6 | 5.5 | 340.0 |
| admin / /feedback / mobile-emulation / account / warm | 5 | 63.9 / 71.4 | 6.5 | 32.0 |
| admin / /login / mobile-emulation / guest / cold | 5 | 90.6 / 100.9 | 3.2 | 48.0 |
| admin / /login / mobile-emulation / guest / warm | 5 | 47.6 / 63.0 | 3.0 | 24.0 |
| admin / /matches / mobile-emulation / account / cold | 5 | 372.0 / 386.8 | 5.6 | 356.0 |
| admin / /matches / mobile-emulation / account / warm | 5 | 63.3 / 68.8 | 6.3 | 32.0 |
| admin / /matches/[id] / mobile-emulation / account / cold | 5 | 371.6 / 373.8 | 6.0 | 340.0 |
| admin / /matches/[id] / mobile-emulation / account / warm | 5 | 63.2 / 850.6 | 7.2 | 36.0 |
| admin / /operations / mobile-emulation / account / cold | 5 | 116.6 / 125.6 | 4.8 | 104.0 |
| admin / /operations / mobile-emulation / account / warm | 5 | 64.3 / 65.8 | 4.5 | 36.0 |
| admin / /players / mobile-emulation / account / cold | 5 | 372.9 / 373.6 | 5.2 | 356.0 |
| admin / /players / mobile-emulation / account / warm | 5 | 63.1 / 71.1 | 6.9 | 32.0 |
| admin / /players/[id] / mobile-emulation / account / cold | 5 | 368.9 / 389.6 | 5.4 | 352.0 |
| admin / /players/[id] / mobile-emulation / account / warm | 5 | 63.5 / 64.3 | 6.5 | 32.0 |
| admin / /seasons / mobile-emulation / account / cold | 5 | 373.1 / 374.3 | 5.0 | 340.0 |
| admin / /seasons / mobile-emulation / account / warm | 5 | 62.4 / 64.1 | 7.2 | 36.0 |

Failures: 0. Complete per-run evidence, query counts, game timing and clock samples: raw.json.

Match duration includes real moves until a server end condition. Surrender scenarios are separate. The deliberate 3.2-second intro is included only in intro/join and total entry metrics. Natural-match durations depend on random tiles and are not a performance improvement claim.

Not checked: real phone hardware, remote database latency, email delivery, field Speed Insights.

Raw observed LCP uses a variable observation horizon and must not support before/after LCP conclusions. Native FCP, TTFB and load comparisons are in ../comparison.md.
