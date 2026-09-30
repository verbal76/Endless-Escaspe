import * as THREE from 'three';
import { Asset } from 'expo-asset';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
// @ts-expect-error - plain JS module without type declarations
import { getAssetByID } from '@react-native/assets-registry/registry';
import { logDebug } from './debug';
import { base64ToBytes, decodePng } from './png';
import { TEXTURE_PNG_BASE64 } from './textureData';
import {
  resolveTextureSource,
  type AssetLike,
  type PackagerMeta,
  type TextureSourceDeps,
  type TextureSourceResult,
} from './textureSource';

// Texture loader for the expo-gl + bare three.js stack.
//
// Primary path: the texture PNGs are embedded in the JS bundle
// (textureData.ts, generated from assets/ by
// scripts/gen-texture-probes.mjs), decoded in JS (png.ts) and uploaded
// as raw RGBA DataTextures. That path uses no native asset code at all.
//
// Why: in the GitHub-built release APKs, expo-audio's `expo-asset: "*"`
// peer dependency pulled in expo-asset 55.x (an SDK 55 package) at the
// top of node_modules, and autolinking compiled that native module
// against SDK 54's expo-modules-core. Every native
// ExpoAsset.downloadAsync then threw NoSuchMethodError
// (AppContext.getFilePermission), so no image file could be resolved and
// every textured model fell back to its flat colour. The embedded path
// works on every installed APK regardless of the native asset module.
//
// Fallback path (only if decoding ever fails): resolve the image file
// through expo-asset (textureSource.ts) and let expo-gl's texImage2D
// read it from its file:// localUri.
//
// All textures are loaded once at app startup (preloadAllTextures);
// get*() calls then return the cached Texture so figure / vehicle
// factories can resolve synchronously during scene rebuild.

type Cache = Record<string, THREE.Texture | null>;
const CACHE: Cache = {};

export type TextureStatus = {
  total: number;
  loaded: number;
  // key -> how it loaded (route) or why it didn't (all errors).
  details: Record<string, string>;
};
const STATUS: TextureStatus = { total: 0, loaded: 0, details: {} };

// Snapshot for Settings > Build / Update Info and bug reports.
export function getTextureStatus(): TextureStatus {
  return { total: STATUS.total, loaded: STATUS.loaded, details: { ...STATUS.details } };
}

const ExpoAssetNative = requireOptionalNativeModule<{
  downloadAsync(uri: string, hash: string | null, type: string): Promise<string>;
}>('ExpoAsset');

const DEPS: TextureSourceDeps = {
  platform: Platform.OS,
  fromModule: (id) => Asset.fromModule(id) as unknown as AssetLike,
  nativeDownload: ExpoAssetNative ? (uri, hash, type) => ExpoAssetNative.downloadAsync(uri, hash, type) : null,
  getMeta: (id) => getAssetByID(id) as PackagerMeta | undefined,
};

// Sampling settings shared by both load paths.
function configure(tex: THREE.Texture, key: string): THREE.Texture {
  // Survives .clone() (Texture.copy copies userData), so the render
  // audit can match any texture back to its source PNG.
  tex.userData.textureKey = key;
  // flipY on: the first (top) PNG row lands in the last GL row, which
  // is how the Kenney OBJ UVs expect the palette / sheet to sit (an
  // earlier flipY=false made police bodies sample brown, lights green).
  // Applies to raw pixel uploads as well as image uploads.
  tex.flipY = true;
  // The PNGs hold sRGB colour. Without this three treated them as
  // linear and gamma-encoded them again on output, which washed every
  // texture out (chalky props, beige prisoner, grey-green ground).
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Nearest-neighbour keeps the palette colours crisp (linear blends
  // sample neighbouring cells, producing muddy intermediates on small
  // palette atlases like colormap.png).
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

function textureFromEmbeddedPng(key: string): THREE.DataTexture | null {
  const b64 = TEXTURE_PNG_BASE64[key];
  if (!b64) return null;
  const png = decodePng(base64ToBytes(b64));
  const tex = new THREE.DataTexture(png.rgba, png.width, png.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  return configure(tex, key) as THREE.DataTexture;
}

async function loadAssetTexture(
  key: string,
  module: number,
): Promise<THREE.Texture | null> {
  if (CACHE[key]) return CACHE[key];
  STATUS.total += 1;
  const errors: string[] = [];
  try {
    const tex = textureFromEmbeddedPng(key);
    if (tex) {
      STATUS.loaded += 1;
      STATUS.details[key] = `embedded ${tex.image.width}x${tex.image.height}`;
      CACHE[key] = tex;
      return tex;
    }
    errors.push('embedded: no data for this key');
  } catch (e) {
    errors.push(`embedded: ${e instanceof Error ? e.message : String(e)}`);
  }
  let result: TextureSourceResult;
  try {
    result = await resolveTextureSource(module, DEPS);
  } catch (e) {
    result = { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
  if (!result.ok) {
    STATUS.details[key] = `FAILED: ${[...errors, ...result.errors].join('; ')}`;
    logDebug('warn', `[textures] ${key} ${STATUS.details[key]}`);
    CACHE[key] = null;
    return null;
  }
  const src = result.source;
  STATUS.loaded += 1;
  STATUS.details[key] = src.route;
  logDebug('log', `[textures] ${key} via ${src.route} after: ${[...errors, ...result.errors].join('; ')}`);
  const tex = new THREE.Texture();
  // Asset shape that expo-gl's texImage2D wrapper expects: when
  // `downloadAsync` is present on the image object, the wrapper
  // pulls localUri off it (it must be a file:// path on native) and
  // forwards to the native upload.
  tex.image = {
    width: src.width,
    height: src.height,
    uri: src.uri,
    localUri: src.localUri,
    downloadAsync: async () => {
      // already resolved; no-op so the wrapper's truthiness check
      // still passes.
    },
  } as unknown as HTMLImageElement;
  CACHE[key] = configure(tex, key);
  return tex;
}

// Pre-load every texture the game might need before the GLView
// mounts. Awaited from App.tsx so the figure / vehicle factories that
// run inside onContextCreate find all textures ready in CACHE.
export async function preloadAllTextures(): Promise<void> {
  await Promise.all([
    loadAssetTexture(
      'character-d',
      require('../../assets/characters/texture-d.png'),
    ),
    loadAssetTexture(
      'character-g',
      require('../../assets/characters/texture-g.png'),
    ),
    loadAssetTexture(
      'character-j',
      require('../../assets/characters/texture-j.png'),
    ),
    loadAssetTexture(
      'vehicle-colormap',
      require('../../assets/vehicles/colormap.png'),
    ),
    // Prop textures - the 64x64 Kenney detail PNGs that the prop
    // OBJ MTLs reference. Tiled / repeated by the kit's UV layout.
    loadAssetTexture('prop-wall', require('../../assets/props/wall.png')),
    loadAssetTexture('prop-metal_wall', require('../../assets/props/metal_wall.png')),
    loadAssetTexture('prop-concrete', require('../../assets/props/concrete.png')),
    loadAssetTexture('prop-signs', require('../../assets/props/signs.png')),
    loadAssetTexture('prop-roof', require('../../assets/props/roof.png')),
    loadAssetTexture('prop-grass', require('../../assets/props/grass.png')),
    loadAssetTexture('prop-dirt', require('../../assets/props/dirt.png')),
  ]);
}

export function getCharacterTexture(
  kind: 'd' | 'g' | 'j',
): THREE.Texture | null {
  return CACHE[`character-${kind}`] ?? null;
}

export function getVehicleColormap(): THREE.Texture | null {
  return CACHE['vehicle-colormap'] ?? null;
}

// Prop texture lookup keyed by the MTL `newmtl` name from each
// Kenney prop OBJ. Returns null if the texture wasn't preloaded
// (caller falls back to a solid colour). Covers wall, wall_metal,
// concrete, signs, roof and dirt (assets/props/dirt.png); grass goes
// through getGrassTexture, and the tree materials (leafsDark,
// woodBarkDark) use solid colours.
export function getPropTexture(materialName: string): THREE.Texture | null {
  switch (materialName) {
    case 'wall':
      return CACHE['prop-wall'] ?? null;
    case 'wall_metal':
      return CACHE['prop-metal_wall'] ?? null;
    case 'concrete':
      return CACHE['prop-concrete'] ?? null;
    case 'signs':
      return CACHE['prop-signs'] ?? null;
    case 'roof':
      return CACHE['prop-roof'] ?? null;
    case 'dirt':
      return CACHE['prop-dirt'] ?? null;
    default:
      return null;
  }
}

// Ground tile texture: separate from per-MTL prop textures so the
// caller can apply a custom repeat factor (the ground tile spans the
// whole playfield and needs to repeat many times to read as a field
// of grass rather than one stretched tile).
export function getGrassTexture(): THREE.Texture | null {
  return CACHE['prop-grass'] ?? null;
}
