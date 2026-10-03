// Node ESM resolve hook for the unit tests. Node strips TypeScript
// types natively (22.18+), but the app source uses extensionless
// relative imports (Metro-style) and pulls in React Native / Expo
// modules that can't load outside the device runtime. This hook:
//   - resolves extensionless relative imports to .ts files
//   - redirects native-only packages to small stubs in tests/stubs
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const STUBS = {
  'expo-asset': 'expo-asset.mjs',
  'react-native': 'react-native.mjs',
  'expo-haptics': 'empty.mjs',
  'expo-audio': 'expo-audio.mjs',
  '@react-native-async-storage/async-storage': 'async-storage.mjs',
  '@react-native/assets-registry/registry': 'assets-registry.mjs',
  'expo-modules-core': 'expo-modules-core.mjs',
  'expo-font': 'expo-font.mjs',
};

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) {
    return { url: pathToFileURL(path.join(here, 'stubs', STUBS[specifier])).href, shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    if (!existsSync(base) || statSync(base).isDirectory()) {
      for (const cand of [base + '.ts', path.join(base, 'index.ts')]) {
        if (existsSync(cand)) return { url: pathToFileURL(cand).href, format: 'module-typescript', shortCircuit: true };
      }
    }
  }
  return next(specifier, context);
}
