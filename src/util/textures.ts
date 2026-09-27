import * as THREE from 'three';
import { Asset } from 'expo-asset';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
// @ts-expect-error - plain JS module without type declarations
import { getAssetByID } from '@react-native/assets-registry/registry';
import { logDebug } from './debug';
import {
  resolveTextureSource,
  type AssetLike,
  type PackagerMeta,
  type TextureSourceDeps,
  type TextureSourceResult,
} from './textureSource';

// Async texture loader for the expo-gl + bare three.js stack. React
// Native has no DOM Image, so three's TextureLoader.load() can't be
// used directly. Instead we build a bare THREE.Texture whose `image`
// is an asset-shaped object (uri / localUri / width / height /
// downloadAsync). expo-gl's overridden gl.texImage2D recognises that
// shape and uploads the pixel data natively - see the comment in
// node_modules/expo-gl/build/GLView.web.js getImageForAsset for the
// runtime hook.
//
// All textures we ship are loaded once at app startup (preloadAll
// below); subsequent get*() calls return the cached Texture so figure
// / vehicle factories can resolve synchronously during scene rebuild.

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

async function loadAssetTexture(
  key: string,
  module: number,
): Promise<THREE.Texture | null> {
  if (CACHE[key]) return CACHE[key];
  STATUS.total += 1;
  let result: TextureSourceResult;
  try {
    result = await resolveTextureSource(module, DEPS);
  } catch (e) {
    result = { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
  if (!result.ok) {
    STATUS.details[key] = `FAILED: ${result.errors.join('; ')}`;
    logDebug('warn', `[textures] ${key} ${STATUS.details[key]}`);
    CACHE[key] = null;
    return null;
  }
  const src = result.source;
  STATUS.loaded += 1;
  STATUS.details[key] = src.route;
  if (result.errors.length > 0) {
    logDebug('log', `[textures] ${key} via ${src.route} after: ${result.errors.join('; ')}`);
  }
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
  // Leave flipY at its three.js default (true). expo-gl's native
  // texImage2D path uploads the PNG already oriented for GL's
  // bottom-up V, so our earlier flipY=false produced a double-no-
  // flip and Kenney OBJ UVs landed on the wrong row of the palette
  // (police body sampling brown, lights sampling green, etc.). With
  // the default, V=0 sits at the bottom of the source PNG and the
  // OBJ UVs index the cells the kit author intended.
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Nearest-neighbour minification keeps the palette colours crisp
  // (linear blends sample neighbouring cells, producing muddy
  // intermediates on small palette atlases like colormap.png).
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  CACHE[key] = tex;
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
// (caller falls back to a solid colour). All eight MTL names are
// covered now; dirt is filled by the rock texture as a stand-in
// because the Kenney atlas didn't ship a dirt PNG.
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
