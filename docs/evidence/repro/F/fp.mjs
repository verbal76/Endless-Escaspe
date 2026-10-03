import { createFingerprintAsync, SourceSkips } from '/home/user/Endless-Escaspe/node_modules/@expo/fingerprint/build/index.js';
const fp = await createFingerprintAsync('/home/user/Endless-Escaspe', { platforms: ['android'], sourceSkips: SourceSkips.ExpoConfigVersions | SourceSkips.ExpoConfigExtraSection | SourceSkips.PackageJsonScriptsAll | SourceSkips.GitIgnore });
console.log(fp.hash);
