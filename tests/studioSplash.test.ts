import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { STUDIO_FADE_MS, STUDIO_LOGO_FILE, STUDIO_LOGO_PATH, STUDIO_SPLASH_BACKGROUND, STUDIO_SPLASH_MS, splashPlan } from '../src/util/studioSplash';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

test('studio splash: ~2.5 s with fades, only when the canonical image is bundled', () => {
  assert.equal(STUDIO_SPLASH_MS, 2500);
  assert.deepEqual(splashPlan(null), { show: false, durationMs: 0, fadeMs: 0, holdMs: 0 });
  assert.deepEqual(splashPlan(undefined), { show: false, durationMs: 0, fadeMs: 0, holdMs: 0 });
  assert.deepEqual(splashPlan(123), { show: true, durationMs: 2500, fadeMs: STUDIO_FADE_MS, holdMs: 2500 - 2 * STUDIO_FADE_MS });
});

test('studio splash: total time stays within the 2-3 s brief', () => {
  assert.equal(splashPlan(1, 100).durationMs, 2000);
  assert.equal(splashPlan(1, 60000).durationMs, 3000);
  assert.equal(splashPlan(1, NaN).durationMs, 2500);
  const p = splashPlan(1);
  assert.equal(p.fadeMs * 2 + p.holdMs, p.durationMs);
});

test('canonical asset: exact filename, exact bytes (git blob e11f8c57...), 1536x1024 RGBA', () => {
  assert.equal(STUDIO_LOGO_FILE, 'Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png');
  assert.equal(STUDIO_LOGO_PATH, STUDIO_LOGO_FILE);
  assert.ok(existsSync(resolve(process.cwd(), STUDIO_LOGO_PATH)), 'the canonical PNG must exist at the repository root');
  const d = readFileSync(resolve(process.cwd(), STUDIO_LOGO_PATH));
  const blob = createHash('sha1').update(`blob ${d.length}\0`).update(d).digest('hex');
  assert.equal(blob, 'e11f8c576652b82780967a02ee4b4acd12e8a3c8', 'the owner-supplied logo must not be modified or replaced');
  assert.deepEqual([...d.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(d.readUInt32BE(16), 1536);
  assert.equal(d.readUInt32BE(20), 1024);
  assert.equal(d[24], 8, 'bit depth');
  assert.equal(d[25], 6, 'colour type 6 = RGBA');
});

// Decode the PNG's alpha channel (non-interlaced 8-bit RGBA) to prove the
// transparency is real - not a checkerboard baked into opaque pixels.
function alphaAt(png: Buffer): (x: number, y: number) => number {
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  const idat: Buffer[] = [];
  for (let i = 8; i < png.length; ) {
    const len = png.readUInt32BE(i);
    if (png.toString('latin1', i + 4, i + 8) === 'IDAT') idat.push(png.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const cur = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v: number;
      if (f === 0) v = cur;
      else if (f === 1) v = cur + a;
      else if (f === 2) v = cur + b;
      else if (f === 3) v = cur + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[y * stride + x] = v & 255;
    }
  }
  return (x, y) => px[y * stride + x * bpp + 3];
}

test('canonical asset: transparency is real (transparent corners, opaque artwork)', () => {
  const alpha = alphaAt(readFileSync(resolve(process.cwd(), STUDIO_LOGO_PATH)));
  for (const [x, y] of [[0, 0], [1535, 0], [0, 1023], [1535, 1023], [5, 5], [1530, 1018]]) assert.equal(alpha(x, y), 0, `corner ${x},${y} must be transparent`);
  for (const [x, y] of [[768, 512], [300, 800], [1200, 800], [768, 40]]) assert.equal(alpha(x, y), 255, `artwork pixel ${x},${y} must be opaque`);
});

test('studio splash: the bundled source is exactly the canonical PNG', () => {
  const src = read('src/ui/studioSplashSource.ts');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(code.includes(`require('../../${STUDIO_LOGO_PATH}')`), 'STUDIO_SPLASH_SOURCE must require the canonical logo');
  assert.doesNotMatch(src + read('src/util/studioSplash.ts'), /branding\/Hot_Attic_Games_Master_Logo\.png/, 'the old obsolete path must not be referenced');
});

test('studio splash: presentation keeps aspect ratio, uses transparency, is silent and bounded', () => {
  const c = read('src/ui/StudioSplash.tsx');
  assert.match(c, /resizeMode="contain"/, 'whole artwork, never cropped or stretched');
  assert.match(c, /backgroundColor: STUDIO_SPLASH_BACKGROUND/);
  assert.equal(STUDIO_SPLASH_BACKGROUND, '#0b0d12', 'same as the native splash / boot background: no flash between them');
  assert.match(c, /useSafeAreaInsets/, 'respects safe areas');
  assert.match(c, /onError=\{finish\}/, 'a failed image load cannot strand the user');
  assert.match(c, /setTimeout\(finish,/, 'backstop timer so the card can never hang');
  assert.doesNotMatch(c, /Text|Pressable|TouchableOpacity|expo-audio/, 'no text, buttons or sound over the artwork');
});

test('cold-launch order: studio card first, once per process, boot runs underneath, resume never replays it', () => {
  const app = read('App.tsx');
  const iSplash = app.indexOf('<StudioSplash');
  const iGame = app.indexOf('<Game />');
  assert.ok(iSplash > 0 && iGame > iSplash, 'StudioSplash must render before Game');
  assert.match(app, /useState\(!splashPlan\(STUDIO_SPLASH_SOURCE\)\.show\)/, 'one-shot state, initialised from the plan');
  const resume = app.slice(app.indexOf('AppState.addEventListener'), app.indexOf('const savesReady'));
  assert.doesNotMatch(resume, /setSplashDone/, 'background / resume must not touch the splash');
  assert.doesNotMatch(app, /setSplashDone\(false\)/, 'the splash is never re-armed');
  // Boot (settings, saves, textures) is started in the mount effect, not after the splash.
  assert.ok(app.indexOf('loadSaves()') > 0 && app.indexOf('loadSaves()') < iSplash, 'save / settings loading starts behind the splash');
  // The update flow is mounted independently of the splash.
  assert.match(app, /<UpdateApplier \/>/);
});
