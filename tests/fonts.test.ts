import { test } from 'node:test';
import assert from 'node:assert/strict';

test('display font status: loaded, failed with reason, never throws', async () => {
  const g = globalThis as unknown as { __fontStub?: { fail?: string; registered?: boolean }; require?: unknown };
  // Metro turns require('...ttf') into an asset id; ESM tests have no require.
  g.require ??= () => 1;
  const { loadDisplayFont, getFontStatus, formatFontRow } = await import('../src/ui/fonts');
  assert.equal(formatFontRow(getFontStatus()).value, 'Not loaded yet');

  g.__fontStub = { fail: "Call to function 'ExpoAsset.downloadAsync' has been rejected" };
  assert.equal(await loadDisplayFont(), false);
  const failed = formatFontRow(getFontStatus());
  assert.match(failed.value, /FAILED/);
  assert.match(failed.full ?? '', /ExpoAsset/);

  g.__fontStub = {};
  assert.equal(await loadDisplayFont(), true);
  assert.equal(formatFontRow(getFontStatus()).value, 'Black Ops One loaded');
});
