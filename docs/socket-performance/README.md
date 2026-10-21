# Socket response and broadcast measurements

Measured 2026-10-22 from the development Mac, with Node 26.0.0. These are direct Socket.IO measurements, separate from browser rendering and Vercel Speed Insights. They cannot establish a Speed Insights score or a population latency distribution.

## Deployed baseline

Both Fly applications were healthy, started, single-machine deployments in `nrt`, with 1 shared CPU and 1 GB RAM. Both reported image digest `sha256:10cd129b6acba219973973487590fb577d9a5681f7728960faa17edf97f7a48b` (`launch-20261019`). The deployment source SHA was not independently established by this benchmark. The production `dfw` numbers in the older full-performance report describe an earlier deployment.

Each target received three sequential private guest friend matches, twelve alternating moves per match, and one guest solo run with twelve moves. Inputs were spaced at least 150 ms apart. No public/ranked queue, authenticated account, load test, secret or real-player data was used. Matches ended with surrender. Solo disconnected normally. Normal guest records/checkpoints may persist; no remote data was deleted.

| Observation | Samples per target | Staging p50 / p95 ms | Production p50 / p95 ms |
|---|---:|---:|---:|
| Socket connection | 7 | 158.31 / 165.52 | 159.81 / 167.20 |
| Private room creation | 3 | 37.65 / 38.05 | 37.26 / 38.84 |
| Join code → room ready | 3 | 39.66 / 42.53 | 40.39 / 40.91 |
| Both joins → playable state | 3 | 39.04 / 39.04 | 39.33 / 39.71 |
| Input → own state | 36 | 38.28 / 40.76 | 37.68 / 40.64 |
| Input → opponent state | 36 | 38.54 / 40.87 | 38.40 / 40.02 |
| Solo input → acknowledgement | 12 | 37.99 / 40.33 | 37.96 / 41.64 |
| Surrender → result | 3 | 39.10 / 39.81 | 39.60 / 40.34 |

The one solo-start observation was 262.19 ms staging and 152.14 ms production. Starting a persistent run awaits checkpoint read/write; ordinary moves do not. One observation does not support a p95 conclusion. HTTP health p50 was 38.93 / 39.28 ms; its first connection included DNS/TLS and reached 191.85 / 184.08 ms. Connection timings also include DNS/TLS, transport setup and client scheduling. There is no application ping protocol, and multiplayer responds with authoritative state rather than an input acknowledgement. The two players' state payloads were checked for agreement after each measured move.

Production deployment-control status before and after measurement reported zero active matches, solo sessions and pending writes, no storage error, and no drain. No deployment was performed as part of this baseline.

Raw records: [staging](staging-before.json), [production](production-before.json).

## Measured code change

The input path is in-memory. `game.ts` previously emitted a full spectator snapshot for both perspectives on every broadcast, including when neither had subscribers. The installed Socket.IO adapter encodes JSON and prepares the WebSocket frame **before** looking for recipients. Thus two player packets caused four encoding operations even without spectators.

The change skips spectator emission when that perspective has no subscribers. Active viewers still receive the same payload, including pause/reconnect and terminal state. Player messages, authorization, limits, game rules, checkpointing and deployment drain are unchanged. This relies on the documented single-server architecture and its local Socket.IO adapter; distributed ownership must revisit the local subscriber check.

The paired CPU diagnostic uses the exact preceding broadcast implementation from `8804ca0` and the new implementation in the same process, alternates their order over seven runs, and measures 20,000 broadcasts per run after warmup. Full 5×5 boards exercise real Socket.IO encoding/framing without network clients or a listening port.

| CPU observation | Previous implementation | Updated implementation |
|---|---:|---:|
| Median milliseconds per broadcast | 0.01851 | 0.00957 |
| Encoded packets without spectators | 4 | 2 |

The observed CPU reduction is 48.3% for this isolated broadcast scenario on an Apple M5 Max, an absolute saving of approximately 0.009 ms. This improves CPU headroom; it is not a claim of a 48.3% improvement in deployed ~38 ms response latency. CPU-only measurements cannot predict Fly shared-CPU throughput under load. [Paired raw result](broadcast-paired.json).

## Verification and reruns

- The new regression failed before the change (four packets versus two) and passes afterward. It covers no spectators, one subscribed perspective, exact player/viewer payloads, and the last viewer leaving.
- All 85 focused broadcast, multiplayer, spectator, solo, solo-progress and deployment-control tests passed.
- Socket TypeScript checks and separate checks for both benchmark scripts passed.
- Existing real Socket.IO spectator tests cover live boards, pause/reconnect, results, permission denial and revoked friendships.

From the repository root, after installing this worktree's dependencies:

```sh
pnpm --filter socket exec tsx scripts/benchmark-broadcast.ts
pnpm --filter socket exec tsx scripts/benchmark-latency.ts staging ../../docs/socket-performance/staging-after.json
pnpm --filter socket exec tsx scripts/benchmark-latency.ts production ../../docs/socket-performance/production-after.json
```

Use a new output path. The remote benchmark reserves the artifact before connecting and refuses to overwrite earlier evidence. It accepts only the fixed staging/production endpoints from the deployment guide. Remote runs require authorization for the chosen target. Repeat after the parent task has deployed and verified the intended build; retain baseline and post-deployment records separately.
