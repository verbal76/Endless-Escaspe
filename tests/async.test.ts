import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundedStep } from '../src/util/async';

test('boundedStep: value, timeout and rejection', async () => {
  assert.equal(await boundedStep(Promise.resolve(7), 50), 7);
  assert.equal(await boundedStep(new Promise(() => {}), 20), 'timeout');
  await assert.rejects(boundedStep(Promise.reject(new Error('x')), 50), /x/);
});
