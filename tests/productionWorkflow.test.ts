import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p: string[]) => readFileSync(path.join(root, ...p), 'utf8');

test('production-build.yml can only be started by hand and requires the confirm text', () => {
  const lines = read('.github', 'workflows', 'production-build.yml').split('\n');
  // The `on:` block: top-level keys between `on:` and `permissions:`.
  const start = lines.findIndex((l) => l === 'on:');
  const end = lines.findIndex((l, i) => i > start && /^\S/.test(l));
  const triggers = lines
    .slice(start + 1, end)
    .filter((l) => /^ {2}\S/.test(l))
    .map((l) => l.trim().replace(/:.*/, ''));
  assert.deepEqual(triggers, ['workflow_dispatch']);
  const text = lines.join('\n');
  assert.match(text, /if: github\.event_name == 'workflow_dispatch' && inputs\.confirm == 'BUILD PRODUCTION'/);
  assert.match(text, /--non-interactive/);
  assert.doesNotMatch(text, /eas submit/);
  assert.doesNotMatch(text, /eas update/);
});

test('eas.json: production profiles use EAS-managed credentials (no credentials file) and their own channel', () => {
  const eas = JSON.parse(read('eas.json'));
  for (const name of ['production', 'production-apk']) assert.ok(eas.build[name], name);
  assert.equal(eas.build.production.channel, 'production');
  assert.equal(eas.build.production.env.EE_UPDATE_CHANNEL, 'production');
  assert.equal(eas.build.preview.channel, 'preview');
  // credentialsSource "local" would require credentials.json; EAS-managed is the default.
  assert.equal(JSON.stringify(eas).includes('credentialsSource'), false);
  assert.equal(JSON.stringify(eas).includes('credentials.json'), false);
});

test('app.config.js: EE_UPDATE_CHANNEL selects the channel header, default stays preview', () => {
  const require = createRequire(import.meta.url);
  const make = require('../app.config.js') as (a: { config: any }) => any;
  const appJson = require('../app.json').expo;
  const saved = process.env.EE_UPDATE_CHANNEL;
  try {
    delete process.env.EE_UPDATE_CHANNEL;
    assert.equal(make({ config: appJson }).updates.requestHeaders['expo-channel-name'], 'preview');
    process.env.EE_UPDATE_CHANNEL = 'production';
    const prod = make({ config: appJson });
    assert.equal(prod.updates.requestHeaders['expo-channel-name'], 'production');
    assert.equal(prod.updates.url, appJson.updates.url);
    process.env.EE_UPDATE_CHANNEL = 'Bad Channel!';
    assert.equal(make({ config: appJson }).updates.requestHeaders['expo-channel-name'], 'preview');
  } finally {
    if (saved === undefined) delete process.env.EE_UPDATE_CHANNEL;
    else process.env.EE_UPDATE_CHANNEL = saved;
  }
});

test('native batch config: blocked permissions, nav bar plugin, pinned worklets', () => {
  const app = JSON.parse(read('app.json')).expo;
  assert.deepEqual([...app.android.blockedPermissions].sort(), [
    'android.permission.ACTIVITY_RECOGNITION',
    'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    'android.permission.RECORD_AUDIO',
  ]);
  assert.deepEqual(app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-navigation-bar'), ['expo-navigation-bar', { visibility: 'hidden' }]);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['react-native-worklets'], '0.5.1');
  assert.equal(pkg.dependencies['expo-sensors'], undefined);
  assert.equal(pkg.dependencies['@types/three'], undefined);
  assert.ok(pkg.devDependencies['@types/three']);
  assert.equal(pkg.engines.node, '>=22.18');
});
