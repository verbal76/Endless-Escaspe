import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyRunAgainDay, dailySeed } from '../src/util/daily';

test('daily RUN AGAIN: same yard before UTC midnight, today\'s Daily after it', () => {
  assert.deepEqual(dailyRunAgainDay('2026-10-02', new Date('2026-10-02T23:59:59Z')), { sameDay: true, day: '2026-10-02' });
  const after = dailyRunAgainDay('2026-10-02', new Date('2026-10-03T00:00:01Z'));
  assert.deepEqual(after, { sameDay: false, day: '2026-10-03' });
  assert.notEqual(dailySeed(after.day), dailySeed('2026-10-02'));
  assert.equal(dailyRunAgainDay(null, new Date('2026-10-03T12:00:00Z')).sameDay, false);
});
