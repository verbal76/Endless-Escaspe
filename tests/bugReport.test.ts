import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipEntry, composeMailtoReport, LOG_ENTRY_MAX_CHARS, MAILTO_MAX_LENGTH } from '../src/util/bugReport';

const stack = (i: number) =>
  `12:00:${String(i % 60).padStart(2, '0')} ERROR entry ${i} TypeError: x is undefined\n` +
  Array.from({ length: 30 }, (_, k) => `    at fn${k} (index.android.bundle:1:${1000 + k})`).join('\n');

const report = (prev: string[], current: string[], maxLength?: number) =>
  composeMailtoReport({
    to: 'support@example.com',
    subject: 'bug — v0.2.1 • Build 13 • OTA 121',
    head: ['Describe it above.', '', '--- diagnostic info (auto-generated) ---', 'Source commit  133f35b925\nOS  android 34'],
    sections: [
      { title: 'previous run (pre-crash)', entries: prev, empty: '(no previous-run entries)' },
      { title: 'current run', entries: current, empty: '(no current-run entries)' },
    ],
    maxLength,
  });
const body = (url: string) => decodeURIComponent(url.slice(url.indexOf('&body=') + 6));

test('bug report: 60 stack-sized entries stay within the mailto budget, diagnostics intact', () => {
  const prev = Array.from({ length: 30 }, (_, i) => stack(i));
  const current = Array.from({ length: 30 }, (_, i) => stack(100 + i));
  const url = report(prev, current);
  assert.ok(url.length <= MAILTO_MAX_LENGTH, `url is ${url.length} chars`);
  const text = body(url);
  assert.match(text, /Source commit {2}133f35b925/);
  // Oldest first: the previous run goes before any current-run entry.
  assert.match(text, /--- previous run \(pre-crash\), last 0 of 30 entries ---\n\(omitted: report size limit\)/);
  assert.match(text, /--- current run, last \d+ of 30 entries ---/);
  // The newest entry survives; entries are clipped.
  assert.ok(text.includes('entry 129 '));
  assert.ok(!text.includes('entry 100 '));
  for (const line of text.split('\n').filter((l) => l.startsWith('12:00:'))) {
    assert.ok(line.length <= LOG_ENTRY_MAX_CHARS);
  }
});

test('bug report: small logs are sent whole; empty sections say so', () => {
  const text = body(report(['12:00:00 INFO  boot'], []));
  assert.match(text, /--- previous run \(pre-crash\), 1 entries ---\n12:00:00 INFO {2}boot/);
  assert.match(text, /--- current run ---\n\(no current-run entries\)/);
});

test('bug report: trimming drops the oldest entries first', () => {
  const prev = ['p1', 'p2', 'p3'].map((p) => `${p} ${'x'.repeat(100)}`);
  const current = ['c1', 'c2'].map((c) => `${c} ${'y'.repeat(100)}`);
  const full = report(prev, current, 100_000);
  const tight = report(prev, current, full.length - 60);
  const text = body(tight);
  assert.ok(!text.includes('p1 ') && text.includes('p2 ') && text.includes('c1 '));
  assert.equal(clipEntry('abcdef', 4), 'abc…');
  assert.equal(clipEntry('abc', 4), 'abc');
});
