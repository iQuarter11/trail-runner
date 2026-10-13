import test from 'node:test';
import assert from 'node:assert/strict';
import { locatePosition, locationErrorMessage } from '../dist/location.js';
test('map location accepts an approximate fix first', async () => {
  const position = { coords: { accuracy: 800 } };
  const result = await locatePosition({ getCurrentPosition(ok, fail, options) { assert.equal(options.enableHighAccuracy, false); ok(position); } });
  assert.equal(result, position);
});
test('unavailable approximate fix retries precise location', async () => {
  let calls = 0;
  const result = await locatePosition({ getCurrentPosition(ok, fail, options) { calls++; if(calls===1) fail({ code: 2 }); else { assert.equal(options.enableHighAccuracy, true); ok('fix'); } } });
  assert.equal(result,'fix'); assert.equal(calls,2);
});
test('permission denial never retries or loops the browser prompt', async () => {
  let calls = 0;
  await assert.rejects(locatePosition({ getCurrentPosition(ok, fail) { calls++; fail({code:1}); } }), error => error.code === 1);
  assert.equal(calls,1);
  assert.match(locationErrorMessage({code:1}), /blocked/);
  assert.match(locationErrorMessage({code:3}), /timed out/);
  assert.match(locationErrorMessage({code:2}), /in-app browser/);
});
test('unsupported and insecure contexts fail before requesting location', async () => {
  await assert.rejects(locatePosition(null),error=>error.code==='unsupported');
  await assert.rejects(locatePosition({getCurrentPosition(){throw Error('must not call');}},false),error=>error.code==='insecure');
});
