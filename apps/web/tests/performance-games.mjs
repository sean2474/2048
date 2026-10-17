import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { fixtureCookies, PLAYER, RIVAL } from './performance-fixture.mjs';

export function packets(page) {
  const events = [], waiters = new Set();
  function receive(payload, direction) {
    for (const part of String(payload).split('\x1e')) {
      const encoded = /^4([23])\d*(\[.*\])$/.exec(part);
      if (!encoded) continue;
      let frame; try { frame = JSON.parse(encoded[2]); } catch { continue; }
      const message = encoded[1] === '3' && frame[0] && typeof frame[0] === 'object' && 'state' in frame[0] ? { t: 'soloReply', ...frame[0] } : frame[0] === 'message' ? frame[1] : null;
      if (!message) continue;
      const event = { at: performance.now(), direction, message };
      events.push(event);
      for (const waiter of waiters) if (waiter.predicate(event)) { waiters.delete(waiter); clearTimeout(waiter.timer); waiter.resolve(event); }
    }
  }
  page.on('websocket', socket => { socket.on('framesent', event => receive(event.payload, 'sent')); socket.on('framereceived', event => receive(event.payload, 'received')); });
  page.on('response', response => { if (response.url().includes('/socket.io/') && response.request().method() === 'GET') void response.text().then(body => receive(body, 'received')).catch(() => {}); });
  page.on('request', request => { if (request.url().includes('/socket.io/') && request.method() === 'POST') receive(request.postData() ?? '', 'sent'); });
  return { events, close() { for (const waiter of waiters) clearTimeout(waiter.timer); waiters.clear(); }, wait(predicate, timeout = 20000) { return new Promise((resolve, reject) => { const waiter = { predicate, resolve, timer: setTimeout(() => { waiters.delete(waiter); reject(Error('Timed out waiting for benchmark game packet')); }, timeout) }; waiters.add(waiter); }); } };
}

async function inputProbe(page) {
  await page.evaluate(() => {
    window.__inputTimes = [];
    let input = null;
    document.addEventListener('keydown', event => { if (event.key.startsWith('Arrow')) input = performance.now(); }, true);
    document.addEventListener('pointerdown', event => { if (event.target.closest('button[aria-label^="Move "]')) input = performance.now(); }, true);
    new MutationObserver(records => {
      if (input === null || !records.some(record => record.target instanceof Element && record.target.closest('.game-you [data-skin]'))) return;
      const started = input; input = null;
      requestAnimationFrame(() => requestAnimationFrame(() => window.__inputTimes.push(performance.now() - started)));
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
}

export async function measureMatch(browser, origin, device, fixture, { surrender = false, maxMoves = 2000, friend = false, screenshotPath } = {}) {
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ locale: 'en-US', viewport: device.viewport, isMobile: device.mobile, hasTouch: device.mobile })));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  await Promise.all(contexts.map((context, index) => context.addCookies(friend ? [{ name: 'duo.locale', value: 'en', url: origin }] : fixtureCookies(origin, 'web', index ? RIVAL : PLAYER))));
  const streams = pages.map(packets), errors = [];
  let spectator, watchReadyMs = null;
  pages.forEach(page => page.on('pageerror', error => errors.push(error.message)));
  const latest = index => [...streams[index].events].reverse().find(event => event.direction === 'received' && ['state', 'end'].includes(event.message.t));
  try {
    const found = streams.map(stream => stream.wait(event => event.direction === 'received' && event.message.t === (friend ? 'roomReady' : 'matchFound')));
    const active = streams.map(stream => stream.wait(event => event.direction === 'received' && event.message.t === 'state' && !event.message.paused));
    const queueAt = performance.now();
    if (friend) {
      await pages[0].goto(`${origin}/play/create`);
      const code = await pages[0].getByTestId('join-code').innerText();
      assert.match(code, /^[A-Z0-9]{6}$/);
      await pages[1].goto(`${origin}/play/join`);
      await pages[1].locator('#room-code').fill(code);
      await pages[1].locator('form button[type="submit"]').click();
    } else await Promise.all(pages.map(page => page.goto(`${origin}/play/online`)));
    const matched = await Promise.all(found);
    assert.equal(matched[0].message.roomId, matched[1].message.roomId);
    const started = await Promise.all(active);
    await Promise.all(pages.map(page => page.locator('.match-screen .game-you [data-skin]').waitFor()));
    const boardAt = performance.now();
    await Promise.all(pages.map(inputProbe));
    if (!surrender && !friend) {
      spectator = await browser.newContext({ locale: 'en-US', viewport: device.viewport, isMobile: device.mobile, hasTouch: device.mobile });
      await spectator.addCookies(fixtureCookies(origin, 'web', PLAYER));
      const watchPage = await spectator.newPage(), watchAt = performance.now();
      await watchPage.goto(`${origin}/watch/${RIVAL}`);
      await watchPage.locator('.game-stage .game-you [data-skin]').waitFor();
      watchReadyMs = performance.now() - watchAt;
      await spectator.close(); spectator = null;
    }
    const ends = streams.map(stream => stream.wait(event => event.direction === 'received' && event.message.t === 'end', 240000));
    // Attach rejection handling immediately while actual moves run.
    const ended = Promise.all(ends); ended.catch(() => {});
    const inputs = [];
    let moves = 0, surrenderAt = null;
    if (surrender) {
      await pages[0].getByRole('button', { name: 'Surrender', exact: true }).click();
      surrenderAt = performance.now();
      await pages[0].getByRole('alertdialog').getByRole('button', { name: 'Surrender', exact: true }).click();
    } else {
      for (; moves < maxMoves && latest(0)?.message.t !== 'end'; moves++) {
        const index = moves % 2, page = pages[index], state = latest(index)?.message;
        assert.equal(state?.t, 'state');
        const directions = ['left', 'up', 'right', 'down'];
        const candidates = directions.map(dir => ({ dir, result: fixture.applyMove(state.you.board, dir, () => .5, [], false) })).filter(item => item.result.moved).sort((a, b) => a.result.scoreDelta - b.result.scoreDelta);
        assert.ok(candidates.length, 'Server should end a locked board');
        const dir = candidates[0].dir;
        const pending = streams.map(stream => stream.wait(event => event.direction === 'received' && ['state', 'end'].includes(event.message.t) && (event.message.t === 'end' || !event.message.paused)));
        const sentAt = performance.now();
        if (device.mobile) await page.getByRole('button', { name: `Move ${dir}`, exact: true }).click();
        else await page.keyboard.press(`Arrow${dir[0].toUpperCase()}${dir.slice(1)}`);
        const updated = await Promise.all(pending);
        const outgoing = [...streams[index].events].reverse().find(event => event.direction === 'sent' && event.at >= sentAt && event.message.t === 'input');
        assert.ok(outgoing, 'Actual browser input must reach the socket');
        inputs.push({ selfStateMs: updated[index].at - outgoing.at, opponentStateMs: updated[1 - index].at - outgoing.at });
        if (updated[0].message.t === 'end') break;
        // Fixed 100ms human-like move cadence prevents rate-limit bursts; excluded from RTT metrics.
        await delay(Math.max(0, 100 - (performance.now() - sentAt)));
      }
      assert.equal(latest(0)?.message.t, 'end', `Natural match exceeded ${maxMoves} moves; do not replace it with surrender`);
    }
    const results = await ended;
    await Promise.all(pages.map(page => page.locator('.match-end[data-outcome]').waitFor()));
    const resultPaintAt = performance.now();
    assert.equal(results[0].message.matchId, results[1].message.matchId);
    assert.equal(results[0].message.reason === 'surrender', surrender);
    assert.deepEqual(errors, []);
    // The first locator observation only establishes mounted geometry. Measure actual finite animation completion separately.
    await Promise.all(pages.map(page => page.evaluate(async () => {
      const animations = document.querySelector('.match-end').getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations !== Infinity);
      await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
      await new Promise(resolvePaint => requestAnimationFrame(() => requestAnimationFrame(resolvePaint)));
    })));
    const resultAnimationAt = performance.now();
    if (screenshotPath) await pages[1].screenshot({ path: screenshotPath, fullPage: true });
    const inputPaintMs = (await Promise.all(pages.map(page => page.evaluate(() => window.__inputTimes)))).flat();
    const record = fixture.matches.find(match => match.id === matched[0].message.roomId);
    return { device: device.name, kind: surrender ? 'surrender' : 'natural', policy: 'alternate valid moves with minimum merge score at >=100ms cadence; naturally fills boards', watchReadyMs, roomId: matched[0].message.roomId, reason: results[0].message.reason, moves: moves + (surrender ? 0 : 1), roomCreationToReadyMs: friend ? matched[1].at - queueAt : null, joinCodeRequestToReadyMs: friend ? matched[1].at - streams[1].events.find(event => event.direction === 'sent' && event.message.t === 'joinRoomWithCode').at : null, queueNavigationToFoundMs: friend ? null : matched[1].at - queueAt, secondQueueRequestToFoundMs: friend ? null : matched[1].at - Math.max(...streams.map(stream => stream.events.find(event => event.direction === 'sent' && event.message.t === 'findMatch').at)), introAndJoinMs: Math.max(...started.map(event => event.at)) - Math.max(...matched.map(event => event.at)), firstBoardMs: boardAt - queueAt, playableDurationMs: results[0].at - Math.max(...started.map(event => event.at)), roomWallDurationMs: record ? Date.parse(record.endedAt) - Date.parse(record.startedAt) : null, resultPacketToOverlayMs: resultPaintAt - Math.max(...results.map(event => event.at)), resultPacketToAnimationCompleteMs: resultAnimationAt - Math.max(...results.map(event => event.at)), surrenderToResultMs: surrenderAt === null ? null : results[0].at - [...streams[0].events].reverse().find(event => event.direction === 'sent' && event.message.t === 'surrender').at, inputs, inputPaintMs };
  } finally { streams.forEach(stream => stream.close()); if (spectator) await spectator.close(); await Promise.all(contexts.map(context => context.close())); }
}

export async function measureSolo(browser, origin, device) {
  const context = await browser.newContext({ locale: 'en-US', viewport: device.viewport, isMobile: device.mobile, hasTouch: device.mobile });
  await context.addCookies(fixtureCookies(origin, 'web', device.mobile ? RIVAL : PLAYER));
  const page = await context.newPage(), stream = packets(page);
  try {
    await page.goto(`${origin}/solo`);
    const start = page.getByRole('button', { name: 'Start time attack', exact: true });
    await start.waitFor();
    const initialReply = stream.wait(event => event.message.t === 'soloReply' && event.message.state?.status === 'playing');
    const at = performance.now(); await start.click();
    const initialServer = await initialReply;
    await page.getByRole('button', { name: 'Restart run', exact: true }).waitFor();
    const readyMs = performance.now() - at;
    const display = page.locator('[aria-label="Solo controls"] dd').first();
    const parse = text => { const match = /^(\d+):(\d+)(?:\.(\d+))?$/.exec(text.trim()); assert.ok(match, `Unexpected clock ${text}`); return (+match[1] * 60 + +match[2]) * 1000 + +(match[3] ?? '0').padEnd(3, '0'); };
    const firstAt = performance.now(), first = parse(await display.innerText());
    await page.waitForFunction(() => { const el = document.querySelector('[aria-label="Solo controls"] dd'); return el && Number(el.textContent.split(':')[1]) >= 5; }, null, { timeout: 10000 });
    const last = parse(await display.innerText()), elapsed = performance.now() - firstAt;
    const clockErrorMs = Math.abs(last - first - elapsed);
    const finalReply = stream.wait(event => event.message.t === 'soloReply' && event.message.state?.status === 'playing');
    await page.keyboard.press('ArrowLeft');
    const finalServer = await finalReply;
    const serverDeltaMs = finalServer.message.state.elapsedMs - initialServer.message.state.elapsedMs;
    const packetIntervalMs = finalServer.at - initialServer.at;
    assert.ok(Math.abs(serverDeltaMs - packetIntervalMs) < 350, 'Authoritative solo elapsed time must follow wall time');
    assert.ok(clockErrorMs < 350, `Visible solo clock drifted ${clockErrorMs}ms`);
    return { device: device.name, startToBoardMs: readyMs, observedWallMs: elapsed, displayedDeltaMs: last - first, absoluteClockErrorMs: clockErrorMs, serverElapsedDeltaMs: serverDeltaMs, packetIntervalMs, authoritativeClockErrorMs: Math.abs(serverDeltaMs - packetIntervalMs), scope: 'Visible progression and actual socket-reported authoritative elapsed time over five seconds.' };
  } finally { stream.close(); await context.close(); }
}
