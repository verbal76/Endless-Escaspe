import * as THREE from 'three';
import { Asset } from 'expo-asset';

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

async function loadAssetTexture(
  key: string,
  module: number,
): Promise<THREE.Texture | null> {
  if (CACHE[key]) return CACHE[key];
  try {
    const asset = Asset.fromModule(module);
    await asset.downloadAsync();
    const tex = new THREE.Texture();
    // Asset shape that expo-gl's texImage2D wrapper expects: when
    // `downloadAsync` is present on the image object, the wrapper
    // pulls localUri/uri off it and forwards to the native upload.
    tex.image = {
      width: asset.width ?? 1,
      height: asset.height ?? 1,
      uri: asset.uri,
      localUri: asset.localUri ?? undefined,
      downloadAsync: async () => {
        // already downloaded; no-op so the wrapper's truthiness
        // check still passes.
      },
    } as unknown as HTMLImageElement;
    // Kenney textures are authored with UV.y = 0 at the bottom (OpenGL
    // convention). three.js defaults flipY=true (DOM image convention).
    // Disable flip so the model's UVs land on the right palette cell.
    tex.flipY = false;
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
  } catch {
    CACHE[key] = null;
    return null;
  }
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
