import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  androidResourceName,
  formatTextureRow,
  resolveTextureSource,
  type AssetLike,
  type PackagerMeta,
  type TextureSourceDeps,
} from '../src/util/textureSource';

const META: PackagerMeta = {
  httpServerLocation: '/assets/assets/characters',
  name: 'texture-d',
  type: 'png',
  width: 64,
  height: 64,
  fileHashes: ['abc123'],
};

function asset(localUri: string | null, uri: string, fail = false): AssetLike {
  return {
    uri,
    localUri,
    width: 64,
    height: 64,
    downloadAsync: async () => {
      if (fail) throw new Error('Unable to download asset from url: ');
    },
  };
}

function deps(over: Partial<TextureSourceDeps>): TextureSourceDeps {
  return {
    platform: 'android',
    fromModule: () => asset('file:///data/.expo-internal/abc.png', ''),
    nativeDownload: async () => 'file:///cache/ExponentAsset-abc.png',
    getMeta: () => META,
    ...over,
  };
}

test('resource name matches the drawable React Native packs into release APKs', () => {
  assert.equal(androidResourceName(META), 'assets_characters_textured');
  assert.equal(
    androidResourceName({ ...META, httpServerLocation: '/assets/assets/vehicles', name: 'colormap' }),
    'assets_vehicles_colormap',
  );
});

test('OTA launch: a downloaded file:// asset is used as-is', async () => {
  const calls: string[] = [];
  const r = await resolveTextureSource(1, deps({ nativeDownload: async (u) => (calls.push(u), 'file:///x') }));
  assert.ok(r.ok);
  assert.equal(r.source.localUri, 'file:///data/.expo-internal/abc.png');
  assert.equal(r.source.route, 'asset');
  assert.deepEqual(calls, []);
});

test('embedded launch: a bare drawable name is copied to a readable file', async () => {
  const calls: Array<[string, string | null]> = [];
  const r = await resolveTextureSource(
    1,
    deps({
      fromModule: () => asset('assets_characters_textured', 'assets_characters_textured'),
      nativeDownload: async (u, h) => (calls.push([u, h]), 'file:///cache/ExponentAsset-abc.png'),
    }),
  );
  assert.ok(r.ok);
  assert.equal(r.source.localUri, 'file:///cache/ExponentAsset-abc.png');
  assert.deepEqual(calls, [['assets_characters_textured', 'abc123']]);
  assert.match(r.errors[0], /not a file/);
});

test('expo-asset failure (hash missing from the updates map) falls back to the APK drawable', async () => {
  const calls: string[] = [];
  const r = await resolveTextureSource(
    1,
    deps({
      fromModule: () => asset(null, '', true),
      nativeDownload: async (u) => (calls.push(u), 'file:///cache/ExponentAsset-abc.png'),
    }),
  );
  assert.ok(r.ok);
  assert.equal(r.source.route, 'resource:assets_characters_textured');
  assert.deepEqual(calls, ['assets_characters_textured']);
  assert.match(r.errors[0], /^asset: Unable to download/);
});

test('android_res path from expo-updates is tried before the derived name', async () => {
  const calls: string[] = [];
  const res = 'file:///android_res/drawable-mdpi/assets_characters_textured.png';
  const r = await resolveTextureSource(
    1,
    deps({
      fromModule: () => asset(null, res, true),
      nativeDownload: async (u) => {
        calls.push(u);
        if (u === res) throw new Error('not found');
        return 'file:///cache/y.png';
      },
    }),
  );
  assert.ok(r.ok);
  assert.deepEqual(calls, [res, 'assets_characters_textured']);
});

test('every route failing reports all errors instead of pretending', async () => {
  const r = await resolveTextureSource(
    1,
    deps({
      fromModule: () => asset(null, '', true),
      nativeDownload: async () => {
        throw new Error('Resources$NotFoundException');
      },
    }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 2);
});

test('web uses the asset URL directly', async () => {
  const r = await resolveTextureSource(
    1,
    deps({ platform: 'web', fromModule: () => asset(null, '/assets/texture-d.png'), nativeDownload: null }),
  );
  assert.ok(r.ok);
  assert.equal(r.source.localUri, '/assets/texture-d.png');
});

test('texture row reports honest counts', () => {
  assert.equal(formatTextureRow({ total: 0, loaded: 0, details: {} }).value, 'Not loaded yet');
  assert.equal(formatTextureRow({ total: 2, loaded: 2, details: { a: 'asset', b: 'asset' } }).value, '2/2 resolved');
  const row = formatTextureRow({ total: 2, loaded: 1, details: { a: 'asset', b: 'FAILED: x' } });
  assert.equal(row.value, '1/2 resolved - 1 FAILED');
  assert.equal(row.full, 'a: asset\nb: FAILED: x');
});
