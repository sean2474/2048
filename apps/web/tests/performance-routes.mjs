import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { MATCH, PLAYER, RIVAL } from './performance-fixture.mjs';

export async function discoverPages(root, app) {
  const pages = [];
  async function walk(folder, parts) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(join(folder, entry.name), entry.name.startsWith('(') ? parts : [...parts, entry.name]);
      else if (entry.name === 'page.tsx') pages.push('/' + parts.join('/'));
    }
  }
  await walk(join(root, 'apps', app, 'src/app'), []);
  return pages.sort();
}

const webReady = {
  '/': { selector: 'main a[href="/find-match"]' },
  '/history': { text: 'Benchmark Rival' },
  '/leaderboard': { text: 'Benchmark Player' },
  '/loadout': { selector: '[role="tablist"]' },
  '/shop': { selector: '#shop-items > li' },
  '/achievements': { selector: '#achievement-rewards progress' },
  '/friends': { text: 'Benchmark Rival' },
  '/solo': { selector: '[aria-label="Solo controls"] button:not([disabled])' },
  '/play/create': { selector: '[data-testid="join-code"]' },
  '/play/online': { text: 'Looking for an opponent' },
  '/play/ranked': { text: 'Looking for an opponent' },
  '/play/join': { selector: '#room-code' },
  '/tutorial': { selector: '.game-you [data-skin]' },
  '/settings': { selector: 'main button' },
  '/feedback': { selector: 'main textarea' },
  '/login': { selector: 'input[type="password"]' },
  '/signup': { selector: 'input[type="password"]' },
  '/forgot-password': { selector: 'input[type="email"]' },
  '/reset-password': { selector: 'main' },
  '/auth/error': { selector: 'main a' },
};
const adminReady = {
  '/': { text: 'Completed matches' },
  '/matches': { text: MATCH },
  '/matches/[id]': { text: 'Benchmark Rival' },
  '/players': { text: 'Benchmark Player' },
  '/players/[id]': { text: 'View all matches' },
  '/audit': { text: 'Benchmark audit note' },
  '/seasons': { text: 'Benchmark season' },
  '/catalog': { selector: 'aside li button' },
  '/feedback': { text: 'Benchmark feedback' },
  '/operations': { text: 'Result storage' },
  '/login': { selector: 'input[type="password"]' },
  '/auth/error': { selector: 'a' },
};
export function routeCase(app, route) {
  if (app === 'web' && route === '/play/[id]') return { app, route, journey: 'real-match' };
  if (app === 'web' && route === '/watch/[id]') return { app, route, path: `/watch/${RIVAL}`, auth: true, ready: { text: 'No match available to watch' }, state: 'offline-player' };
  const publicRoute = ['/login', '/signup', '/forgot-password', '/reset-password', '/auth/error'].includes(route);
  return { app, route, path: route.replace('[id]', route.startsWith('/matches') ? MATCH : PLAYER), auth: !publicRoute, ready: (app === 'web' ? webReady : adminReady)[route] ?? { selector: 'main' }, ...(route === '/test' ? { state: 'legacy-route' } : route === '/reset-password' ? { state: 'no-recovery-session' } : {}) };
}
