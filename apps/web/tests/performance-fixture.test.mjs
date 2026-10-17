import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { startPerformanceFixture } from './performance-fixture.mjs';

test('partial benchmark startup releases its API port when the game port is occupied', { timeout: 10000 }, async () => {
  const occupied = createServer(), apiReservation = createServer();
  occupied.listen(0, '127.0.0.1'); apiReservation.listen(0, '127.0.0.1');
  await Promise.all([once(occupied, 'listening'), once(apiReservation, 'listening')]);
  const socketPort = occupied.address().port, apiPort = apiReservation.address().port;
  await new Promise(resolveClose => apiReservation.close(resolveClose));
  try {
    await assert.rejects(startPerformanceFixture({ root: resolve(import.meta.dirname, '../../..'), webPort: 3490, adminPort: 3491, apiPort, socketPort }), { code: 'EADDRINUSE' });
    const probe = createServer(); probe.listen(apiPort, '127.0.0.1'); await once(probe, 'listening');
    await new Promise(resolveClose => probe.close(resolveClose));
  } finally { await new Promise(resolveClose => occupied.close(resolveClose)); }
});
