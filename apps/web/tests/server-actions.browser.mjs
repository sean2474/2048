import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { startServerFixture, fixturePlayer } from './server-fixture.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

test('settings actions validate inputs, verify the cookie account and preserve controls', { timeout: 120000 }, async t => {
  let name = 'Fixture Challenger', customShortcuts = false, rejectWrites = false;
  const writes = [];
  const app = await startServerFixture({ handle: async (url, request, id) => {
    if (request.method === 'PATCH' && ['/rest/v1/players', '/rest/v1/player_preferences'].includes(url.pathname)) {
      let raw = ''; for await (const chunk of request) raw += chunk;
      const input = JSON.parse(raw); writes.push({ id, path: url.pathname, search: url.search, input });
      if (rejectWrites) return { status: 503, data: { message: 'fixture unavailable' } };
      if ('name' in input) name = input.name;
      if ('custom_shortcuts' in input) customShortcuts = input.custom_shortcuts;
    }
    if (url.pathname.endsWith('/players')) return { data: [{ id, name, username: null, image_path: null }] };
    if (url.pathname.endsWith('/player_preferences')) return { data: [{ player_id: id, locale: 'en', skin_id: 'classic', icon_id: 'orb', ability_id: null, custom_shortcuts: customShortcuts, keybindings: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', ability: 'Digit1' } }] };
  } }); t.after(app.close);
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  const context = await browser.newContext({ locale: 'en-US' });
  await context.addCookies([app.cookie(), { name: 'duo.locale', value: 'en', url: app.origin }]);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  const actionRequests = [];
  page.on('request', request => { if (request.headers()['next-action']) actionRequests.push({ id: request.headers()['next-action'], body: request.postData() }); });
  await page.goto(app.origin + '/settings');
  await page.getByRole('textbox', { name: 'Nickname', exact: true }).fill('Server saved name');
  await page.getByRole('button', { name: 'Save nickname', exact: true }).click();
  await page.getByText('Nickname saved.', { exact: true }).waitFor();
  assert.equal(name, 'Server saved name');
  const nicknameRequest = actionRequests.find(request => request.body?.includes('Server saved name'));
  assert.ok(nicknameRequest, 'nickname changes use a Next Server Action');
  await page.getByRole('switch', { name: 'Custom keyboard shortcuts', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[role="switch"][aria-labelledby="shortcuts-label"]')?.getAttribute('aria-checked') === 'true');
  assert.equal(customShortcuts, true);
  const settingsRequest = actionRequests.find(request => request.body?.includes('customShortcuts'));
  assert.ok(settingsRequest, 'preferences use a Next Server Action');

  async function invoke(action, args, authenticated = true) {
    const cookie = app.cookie();
    const response = await fetch(app.origin + '/settings', { method: 'POST', headers: { 'next-action': action.id, 'content-type': 'text/plain;charset=UTF-8', origin: app.origin, ...(authenticated ? { cookie: `${cookie.name}=${cookie.value}` } : {}) }, body: JSON.stringify(args) });
    return response.text();
  }
  let before = writes.length;
  assert.match(await invoke(nicknameRequest, [fixturePlayer, 'Guest attack'], false), /Could not save your nickname/);
  assert.match(await invoke(nicknameRequest, ['20000000-0000-4000-8000-000000000099', 'Wrong account']), /Could not save your nickname/);
  assert.match(await invoke(nicknameRequest, [fixturePlayer, ' '.repeat(5)]), /Use 1–32 characters/);
  assert.match(await invoke(settingsRequest, [fixturePlayer, { customShortcuts: 'yes', player_id: 'another' }]), /These settings are not valid/);
  assert.equal(writes.length, before, 'invalid/unauthorized actions never reach a mutation query');
  assert.ok(writes.every(write => write.id === fixturePlayer && new URLSearchParams(write.search).get(write.path.endsWith('/players') ? 'id' : 'player_id') === `eq.${fixturePlayer}`));

  rejectWrites = true;
  await page.getByRole('textbox', { name: 'Nickname', exact: true }).fill('Retained draft');
  await page.getByRole('button', { name: 'Save nickname', exact: true }).click();
  await page.getByText('Could not save your nickname. Please try again.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Nickname', exact: true }).inputValue(), 'Retained draft');
  assert.deepEqual(errors, []);
});

test('streamed skeleton animates before hydration and respects reduced motion', { timeout: 120000 }, async t => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const app = await startServerFixture({ handle: async url => { if (url.pathname.endsWith('/player_preferences')) await pending; } });
  t.after(async () => { release(); await app.close(); });
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.addCookies([app.cookie()]);
  const page = await context.newPage();
  await page.goto(app.origin + '/settings', { waitUntil: 'commit' });
  const placeholder = page.locator('[data-skeleton]').first();
  await placeholder.waitFor({ state: 'visible' });
  const first = await placeholder.evaluate(element => ({ name: getComputedStyle(element).animationName, position: getComputedStyle(element).backgroundPosition, height: element.getBoundingClientRect().height }));
  assert.equal(first.name, 'skeleton-shimmer');
  assert.ok(first.height > 0);
  await new Promise(resolve => setTimeout(resolve, 250));
  const second = await placeholder.evaluate(element => getComputedStyle(element).backgroundPosition);
  assert.notEqual(second, first.position, 'CSS shimmer advances without hydration');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await placeholder.evaluate(element => getComputedStyle(element).animationName), 'none');
  release();
});
