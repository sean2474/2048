import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { percentile, summarize } from './performance-metrics.mjs';

const [beforeFile, afterFile, outputFile] = process.argv.slice(2);
assert.ok(beforeFile && afterFile, 'Usage: node performance-compare.mjs before/raw.json after/raw.json [comparison.md]');
// Earlier captures used dataReadyMs; renaming preserves the measured numbers and clarifies their meaning.
const normalize = data => JSON.parse(JSON.stringify(data).replaceAll('"dataReadyMs":', '"observedDataReadyMs":'));
const before = normalize(JSON.parse(await readFile(resolve(beforeFile), 'utf8'))), after = normalize(JSON.parse(await readFile(resolve(afterFile), 'utf8')));
for (const field of ['mode', 'node', 'platform', 'arch', 'cpu', 'browser', 'runs', 'throttling']) assert.deepEqual(after.environment[field], before.environment[field], `Different benchmark ${field}`);
assert.equal(after.environment.observationWindowMs ?? 0, before.environment.observationWindowMs ?? 0, 'Different observation horizon');
assert.deepEqual(before.failures, []); assert.deepEqual(after.failures, []);
const oldRows = summarize(before.pages), newRows = summarize(after.pages);
assert.deepEqual(oldRows.map(row => row.key).sort(), newRows.map(row => row.key).sort(), 'Route/device/cache/account coverage must match');
const f = number => Number.isFinite(number) ? number.toFixed(1) : '—';
const median = values => values.length ? percentile(values, .5) : null;
const lines = ['# Before / after production-build comparison', '', `Before source: ${before.commit}`, `After source: ${after.commit}`, '', 'Same machine, Chrome and fixture data; five lab samples per page/cache/device case. No network or CPU throttling. Mobile is desktop-based touch/viewport emulation. Local fixture database timings are not real Supabase or Internet latency. p95 of five samples is simply the largest observation.', '', 'Native browser FCP, TTFB, DOMContentLoaded and load are primary. Raw observed LCP is provisional and omitted from this comparison because the readiness observation horizon varies. Observed-ready is a post-load upper bound including locator checks, automation round trips and paint checks; it is not first content readiness. LCP is observed through this readiness check, not a final field Core Web Vitals score.', '', '| App / route / device / account / cache | FCP median before → after ms | TTFB median before → after ms | Load median before → after ms | Observed ready upper bound before → after ms |', '|---|---:|---:|---:|---:|'];
for (const row of oldRows) {
  const next = newRows.find(item => item.key === row.key);
  assert.equal(row.samples, next.samples);
  lines.push(`| ${row.key.replaceAll(' | ', ' / ')} | ${f(row.fcpMs?.median)} → ${f(next.fcpMs?.median)} | ${f(row.ttfbMs?.median)} → ${f(next.ttfbMs?.median)} | ${f(row.loadMs?.median)} → ${f(next.loadMs?.median)} | ${f(row.observedDataReadyMs?.median)} → ${f(next.observedDataReadyMs?.median)} |`);
}
lines.push('', '## Initial route JavaScript', '', 'Exact unique app-build-manifest JS file sizes, with gzip applied separately to each file. Runtime lazy imports are outside these initial-manifest totals.', '', '| App / route | Raw bytes before → after | Gzip bytes before → after |', '|---|---:|---:|');
for (const row of before.bundles) {
  const next = after.bundles.find(item => item.app === row.app && item.route === row.route); assert.ok(next, `Missing bundle ${row.app}${row.route}`);
  lines.push(`| ${row.app} ${row.route} | ${row.jsBytes} → ${next.jsBytes} | ${row.gzipBytes} → ${next.gzipBytes} |`);
}
lines.push('', '## Preference reads per full navigation', '', 'Whole fixture-window counts include normal application-link prefetches and their server renders. Medians combine desktop/mobile samples; isolated SSR request deduplication is covered by separate runtime tests.', '', '| App / route | Cold median before → after | Warm median before → after |', '|---|---:|---:|');
for (const route of [...new Set(before.pages.filter(row => row.auth).map(row => `${row.app} ${row.route}`))]) {
  const count = (report, cache) => median(report.pages.filter(row => `${row.app} ${row.route}` === route && row.cache === cache).map(row => row.preferencesQueries ?? row.backendRequests.filter(path => path.endsWith('/player_preferences')).length));
  lines.push(`| ${route} | ${count(before, 'cold')} → ${count(after, 'cold')} | ${count(before, 'warm')} → ${count(after, 'warm')} |`);
}
lines.push('', '## Real local game journeys', '', 'Natural games use actual random boards and alternating valid inputs with minimum immediate merge score; their lengths describe this test policy, not typical human duration or an optimization gain. Separate surrender rows do not replace natural completion. Socket RTT is local transport; input-paint uses browser input/DOM observers and two animation frames.', '', '| Device / ending | Input samples before / after | Self update median ms | Opponent update median ms | Input paint median ms | Playable duration before / after seconds |', '|---|---:|---:|---:|---:|---:|');
for (const game of before.games) {
  const next = after.games.find(item => item.device === game.device && item.kind === game.kind); assert.ok(next);
  const metric = (row, key) => median(row.inputs.map(item => item[key]));
  lines.push(`| ${game.device} / ${game.kind} | ${game.inputs.length} / ${next.inputs.length} | ${f(metric(game, 'selfStateMs'))} → ${f(metric(next, 'selfStateMs'))} | ${f(metric(game, 'opponentStateMs'))} → ${f(metric(next, 'opponentStateMs'))} | ${f(median(game.inputPaintMs))} → ${f(median(next.inputPaintMs))} | ${f(game.playableDurationMs / 1000)} / ${f(next.playableDurationMs / 1000)} |`);
}
lines.push('', '## Solo clock', '', '| Device | Start response / board observed before → after ms | Visible clock drift before → after ms | After server clock drift ms |', '|---|---:|---:|---:|');
for (const solo of before.solo) { const next = after.solo.find(item => item.device === solo.device); assert.ok(next); lines.push(`| ${solo.device} | ${f(solo.startToBoardMs)} → ${f(next.startToBoardMs)} | ${f(solo.absoluteClockErrorMs)} → ${f(next.absoluteClockErrorMs)} | ${f(next.authoritativeClockErrorMs)} |`); }
lines.push('', 'Actual application-link navigation samples, per-run p95, queue/intro/board/result timings and complete request paths are retained in both raw.json files. Intentional intro time is separate from transport latency.', '', 'Not checked: actual phone hardware, production field Speed Insights, Internet/database latency, cloud cold starts, or representative human match duration. Shared-host CPU activity and small sample sizes can affect results.');
await writeFile(resolve(outputFile ?? `${dirname(resolve(afterFile))}/../comparison.md`), lines.join('\n') + '\n');
console.log(`Compared ${oldRows.length} page/device/cache/account groups and ${before.games.length} real matches per version.`);
