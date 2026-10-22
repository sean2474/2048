# Public-domain routing follow-up — 2026-10-22

The two public web records now connect directly to Vercel. This follow-up changes DNS and documentation only. Measurements used the existing production web commit `a0ab06b8aff4c96aa7885aec17e89e4a70716e6c`, deployment `dpl_Fa9W8pLDXZ4K9Bs4tYZuzrqcfUN8`, region `hnd1`. Neither the application nor the socket image was redeployed to obtain these results.

## Applied configuration

After login, the Cloudflare dashboard showed no custom security rules, configured rate-limit rules or Worker routes. Default Cloudflare protection was present. The owner explicitly approved bypassing that HTTP protection for the two web addresses while retaining Vercel HTTPS and platform DDoS mitigation.

| Name | Type and target | Before | After |
|---|---|---|---|
| `2048duo.io` | CNAME `3866120569410319.vercel-dns-016.com` | Proxied | DNS only |
| `www.2048duo.io` | CNAME `3866120569410319.vercel-dns-016.com` | Proxied | DNS only |

Both records retain Auto TTL. `admin.2048duo.io` remains Proxied, `socket.2048duo.io` remains DNS only, and verification TXT records and nameservers are unchanged. Cloudflare was not paused for the zone. [Configuration record and rollback](dns-change.json).

The system resolver, 1.1.1.1 and 8.8.8.8 returned the Vercel destination after the change. Public HTTP responses identify `server: Vercel`, with ingress `icn1` and SSR `hnd1`, instead of the previously observed Cloudflare `LAX` → Vercel `sfo1` → `hnd1` path. This is evidence from one workstation, not a guarantee of every visitor's route. [DNS and HTTP verification](dns-verification.json).

HTTP upgrades to HTTPS, HTTPS apex redirects to `www` with the original path, and certificates validate normally. `/settings` returns 200 with HSTS. The unchanged administrator host redirects unauthenticated `/players` requests to `/login` through Cloudflare. Socket health returns 200.

## Real public-route mobile Lighthouse

[All 15 runs](dns-only-public-lighthouse.json), Lighthouse 13.5.0 default simulated mobile throttling, three fresh browsers per route. These use normal public DNS with no host mapping, alternate origin, injected latency or scoring changes. They serve the automatically selected Korean locale. The first home observation preceded a three-second dependency install in the report worktree; exact overlap cannot be excluded. It is retained. No builds or other benchmarks ran during the remaining observations.

| Route | All three scores | Median | Median LCP |
|---|---|---:|---:|
| `/` | 94, 97, 97 | 97 | 2.57 s |
| `/settings` | 97, 97, 96 | 97 | 2.57 s |
| `/find-match` | 98, 97, 97 | 97 | 2.57 s |
| `/leaderboard` | 98, 98, 97 | 98 | 2.41 s |
| `/solo` | 98, 90, 97 | 97 | 2.57 s |

All runs had CLS 0 and TBT 0. FCP ranged from 1.09 to 1.38 seconds. Every route median exceeds 95, but individual runs do not all reach 95. The earlier public-route medians were 70–73; those observations also differed in time and automatic locale, so this is not an isolated controlled effect estimate. The earlier fixed-locale alternating diagnostic remains in [the original report](README.md#domain-routing-diagnosis-before-the-dns-change).

## HTTP and navigation

[HTTP samples](dns-only-http.json) use three new curl processes per route with the same English preference cookie as the [pre-change comparison](dns-routing-before.json). DNS and TLS use their normal public paths; timings distinguish the first streamed byte from complete HTML.

| Route | Median first byte | Median complete HTML |
|---|---:|---:|
| `/` | 145 ms | 227 ms |
| `/settings` | 142 ms | 223 ms |
| `/find-match` | 134 ms | 181 ms |
| `/leaderboard` | 142 ms | 306 ms |
| `/solo` | 139 ms | 209 ms |

For settings, the earlier public median was 653 ms / 1055 ms. Its alternating direct diagnostic was 360 ms / 441 ms. The new public result is 142 ms / 223 ms, measured roughly three hours later. Time-of-day network and cache variation prevent attributing the entire difference to DNS alone. All 15 new responses were 200 from Vercel and lacked a Cloudflare Ray header.

[Navigation checks](dns-only-navigation.json) visited settings, feedback, find match, leaderboard, instructions and solo through actual header links in fresh desktop (1440×900) and mobile-emulation (375×812) contexts. Each context made only its original document request across all six transitions: internal links perform client navigation. All twelve destination headings appeared, mobile menus closed, and there were no JavaScript page errors or failed same-origin HTTP responses. Warm click-to-heading observations ranged from 45–209 ms desktop and 291–329 ms mobile; these include automation actionability and menu closing, and are neither cold-load timings nor INP.

## Socket and game checks

The existing production socket machine `8e25d4c7757e78` remains in `nrt`, running source `f1d619476dc2e7974f7d52af2800984f4a67c1f1` and image `sha256:9bcc3546d5c7fec6f14b3b5a5b410291b6c96271d3958e86c4fbf9a3f8f55def`.

[Direct socket rerun](dns-only-socket.json): three private guest friend rooms and one guest solo session, no public/ranked queue. Authoritative player/opponent state agreement was checked. All requests and cleanup completed successfully.

| Observation | Samples | p50 / p95 |
|---|---:|---:|
| WebSocket connection | 7 | 164.0 / 172.4 ms |
| Input → own state | 36 | 38.6 / 44.1 ms |
| Input → opponent state | 36 | 39.0 / 44.8 ms |
| Solo input → acknowledgement | 12 | 38.1 / 45.1 ms |

The unchanged socket endpoint does not pass through the modified web DNS records. These samples verify continued operation, not a DNS-induced socket speedup. Small correlated samples do not establish population percentiles.

[Production browser checks](dns-only-browser-matches.json) passed private-room creation, joining, playable boards, surrender and result rendering for desktop and mobile emulation. These two targeted cases performed no game moves; movement was covered by the socket rerun above and the earlier full browser benchmark. After tests, the server reported no active matches, solo sessions, pending writes, storage error or drain. No server restart or remote data deletion was performed.

## Vercel field score remains pending

The authenticated dashboard was read again after the DNS change. [Observed field values](dns-only-speed-insights.json):

| Window | Desktop | Mobile |
|---|---|---|
| Last 7 Days | RES 89, 107 events | RES 90, 14 events |
| Last 24 Hours | RES 91, 44 events | No events; score unavailable |

These rolling windows include pre-change visits and do not isolate the new route. A missing mobile sample is not a score of zero. **Vercel RES ≥95 has not been established.** The synthetic Lighthouse scores cannot substitute for post-change real-user data. No telemetry scores, sampling rules or bot exclusions were altered, and no paid plan was enabled. A future field check needs actual visits after this change, with sufficient observations for the relevant devices/routes.

## Recovery

If a routing problem appears, switch only `2048duo.io` and `www.2048duo.io` back to Proxied in Cloudflare, preserving their CNAME targets and Auto TTL. Resolver caches may delay propagation. Recheck HTTPS, apex redirect, page navigation and game connections. Do not change the administrator or socket records or restart the game server for this DNS rollback.

References: [Vercel reverse-proxy guidance](https://vercel.com/kb/guide/can-i-use-a-proxy-on-top-of-my-vercel-deployment), [Vercel Firewall](https://vercel.com/docs/vercel-firewall).
