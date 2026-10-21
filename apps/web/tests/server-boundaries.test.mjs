import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { startServerFixture } from './server-fixture.mjs';

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(new URL(`${entry.name}/`, directory)) : new URL(entry.name, directory)))).flat();
}

test('every route remains a server component; loading UI has no account dependency', async () => {
  for (const app of ['web', 'admin']) {
    const routes = (await files(new URL(`../../${app}/src/app/`, import.meta.url))).filter(file => /\/(page|loading)\.tsx$/.test(file.pathname));
    assert.ok(routes.length > 10);
    for (const route of routes) {
      const source = await readFile(route, 'utf8');
      assert.doesNotMatch(source, /^\s*['"]use client['"];?/m, route.pathname);
      if (app === 'web' && route.pathname.endsWith('/loading.tsx')) assert.doesNotMatch(source, /\bgetI18n\b/, 'route fallbacks must not await account preferences');
    }
  }
});

test('first request streams an animated server fallback before account preferences resolve', { timeout: 120000 }, async t => {
  let release, notify;
  const held = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { notify = resolve; });
  const fixture = await startServerFixture({ handle: async url => {
    if (url.pathname.endsWith('/player_preferences')) { notify(); await held; }
  } });
  t.after(async () => { release(); await fixture.close(); });
  const cookie = fixture.cookie();
  const responsePromise = fetch(fixture.origin + '/settings', { headers: { cookie: `${cookie.name}=${cookie.value}`, 'accept-language': 'en' }, signal: AbortSignal.timeout(30000) });
  await started;
  const response = await responsePromise;
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let html = '';
  try {
    while (!html.includes('data-skeleton=""')) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      html += decoder.decode(chunk.value);
    }
    assert.match(html, /skeleton-shimmer/);
    assert.doesNotMatch(html, /id="preferences-title"/, 'account content remains pending');
    const stylesheets = [...html.matchAll(/href="([^"]+\.css[^\"]*)"/g)].map(match => match[1]);
    assert.ok(stylesheets.length);
    const css = (await Promise.all(stylesheets.map(async path => (await fetch(new URL(path.replaceAll('&amp;', '&'), fixture.origin))).text()))).join('\n');
    assert.match(css, /@keyframes skeleton-shimmer/);
    assert.match(css, /prefers-reduced-motion/);
  } finally { release(); }
  while (true) { const chunk = await reader.read(); if (chunk.done) break; html += decoder.decode(chunk.value); }
  assert.match(html, /id="preferences-title"/);
});
