import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRoute, miles } from '../src/lib/routes.ts';
const points = [[-73.97, 40.78], [-73.96, 40.79]];
test('walking route retains geometry and all leg instructions', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(url, /mapbox\/walking\/-73.97,40.78;-73.96,40.79/);
    return { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 1609.344, geometry: { type: 'LineString', coordinates: points }, legs: [{ steps: [{ maneuver: { instruction: 'Turn left' } }] }, { steps: [{ maneuver: { instruction: 'Arrive' } }] }] }] }) };
  };
  try {
    const route = await fetchRoute(points, 'pk.test');
    assert.equal(miles(route.distanceMeters), '1.00');
    assert.deepEqual(route.instructions, ['Turn left', 'Arrive']);
    assert.deepEqual(route.geometry.coordinates, points);
  } finally { globalThis.fetch = original; }
});
test('rejects unroutable paths and API failures', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ code: 'NoRoute', routes: [] }) });
    await assert.rejects(fetchRoute(points, 'pk.test'), /No walking route/);
    globalThis.fetch = async () => ({ ok: false, status: 401 });
    await assert.rejects(fetchRoute(points, 'pk.test'), /401/);
    await assert.rejects(fetchRoute([], 'pk.test'), /2 and 25/);
  } finally { globalThis.fetch = original; }
});
