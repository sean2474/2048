import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { measureMatch } from "./performance-games.mjs";

// Explicit standalone run: real deployed pages/sockets, fresh guests, private friend codes only.
const target = process.env.BENCH_REMOTE_TARGET;
assert.ok(
  ["staging", "production"].includes(target),
  "Set BENCH_REMOTE_TARGET explicitly after the target deployment is verified",
);
const deployedCommit = process.env.BENCH_DEPLOYED_COMMIT,
  socketBuildCommit = process.env.BENCH_SOCKET_BUILD_COMMIT;
assert.match(deployedCommit ?? "", /^[a-f0-9]{40}$/, "Supply the verified web deployment commit");
assert.match(socketBuildCommit ?? "", /^[a-f0-9]{40}$/, "Supply the verified socket build commit");
const origin =
  target === "staging" ? "https://2048-web-staging.vercel.app" : "https://www.2048duo.io";
const root = resolve(import.meta.dirname, "../../..");
const output = resolve(
  process.env.BENCH_OUTPUT ?? join(root, "docs/full-performance", `remote-${target}`),
);
const allCases = [
  "desktop:natural",
  "desktop:surrender",
  "mobile-emulation:natural",
  "mobile-emulation:surrender",
];
const selectedCases = process.env.BENCH_REMOTE_CASES?.split(",") ?? allCases;
assert.ok(
  selectedCases.length &&
    new Set(selectedCases).size === selectedCases.length &&
    selectedCases.every((value) => allCases.includes(value)),
  "Choose known unique device:ending cases",
);
const require = createRequire(import.meta.url),
  { chromium } = require("playwright");
const requireTs = createRequire(join(root, "apps/socket/package.json"))("tsx/cjs/api").require;
const { applyMove } = requireTs(join(root, "packages/game-core/src/index.ts"), import.meta.url);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = {
  measuredAt: new Date().toISOString(),
  target,
  origin,
  harnessCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  browser: browser.version(),
  environment:
    "Actual network and deployed web/socket; no intercepted requests, seeded boards, auth fixture, or injected latency. Guest private friend rooms only.",
  games: [],
  failures: [],
};
report.deployedCommit = deployedCommit;
report.socketBuildCommit = socketBuildCommit;
report.casesRequested = selectedCases;
await mkdir(output, { recursive: true });
try {
  for (const device of [
    { name: "desktop", viewport: { width: 1440, height: 900 }, mobile: false },
    { name: "mobile-emulation", viewport: { width: 375, height: 812 }, mobile: true },
  ]) {
    for (const surrender of [false, true]) {
      if (!selectedCases.includes(`${device.name}:${surrender ? "surrender" : "natural"}`))
        continue;
      console.log(
        `Measuring deployed ${target} ${device.name} ${surrender ? "surrender" : "natural"} private friend match`,
      );
      try {
        report.games.push(
          await measureMatch(
            browser,
            origin,
            device,
            { applyMove, matches: [] },
            {
              surrender,
              friend: true,
              screenshotPath: join(
                output,
                `${device.name}-${surrender ? "surrender" : "natural"}.png`,
              ),
            },
          ),
        );
      } catch (error) {
        report.failures.push({
          device: device.name,
          kind: surrender ? "surrender" : "natural",
          error: String(error),
        });
      }
      await writeFile(join(output, "raw.json"), JSON.stringify(report, null, 2));
    }
  }
  assert.deepEqual(
    report.failures,
    [],
    "Deployed measurements had failures; partial evidence is retained",
  );
} finally {
  await browser.close();
}
