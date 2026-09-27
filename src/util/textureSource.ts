// Resolves a bundled image module to a `file://` path that expo-gl's
// native texImage2D can decode (it only reads `localUri` values that
// start with file://; anything else uploads nothing).
//
// Where an image lives on an Android release build depends on how the
// app launched:
//   - running an OTA update: expo-updates maps the asset hash to a
//     downloaded file, or to a `file:///android_res/...` resource for
//     assets that were already embedded in the APK;
//   - running the embedded bundle: expo-asset falls back to React
//     Native's resolver, which yields a bare drawable resource name
//     (e.g. `assets_characters_textured`) - valid for <Image>, but not
//     a file expo-gl can open.
// A texture preload that trusted expo-asset's first answer could end
// up with no texture on device (figures and vehicles then drew with
// their flat fallback palette). This tries each route in turn and
// reports every failure, so the caller can surface what happened.

export type AssetLike = {
  uri: string;
  localUri: string | null;
  width: number | null;
  height: number | null;
  downloadAsync(): Promise<unknown>;
};

export type PackagerMeta = {
  httpServerLocation: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
  // md5 of the file contents; lets the native copy be revalidated so
  // a newer APK never reuses a stale cached image.
  hash?: string;
  fileHashes?: string[];
};

export type TextureSourceDeps = {
  platform: string;
  fromModule(moduleId: number): AssetLike;
  // expo-asset's native downloadAsync: copies a remote URL, a
  // `file:///android_res/` path or a bare resource name into the
  // cache directory and returns the file:// URI.
  nativeDownload: ((uri: string, hash: string | null, type: string) => Promise<string>) | null;
  getMeta(moduleId: number): PackagerMeta | null | undefined;
};

export type TextureSource = {
  localUri: string;
  uri: string;
  width: number;
  height: number;
  route: string;
};

export type TextureSourceResult =
  | { ok: true; source: TextureSource; errors: string[] }
  | { ok: false; errors: string[] };

function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function hasScheme(uri: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(uri);
}

// Same encoding React Native uses when it packs images into
// res/drawable-* for release builds.
export function androidResourceName(meta: PackagerMeta): string {
  const base = meta.httpServerLocation.startsWith('/')
    ? meta.httpServerLocation.slice(1)
    : meta.httpServerLocation;
  return (base + '/' + meta.name)
    .toLowerCase()
    .replace(/\//g, '_')
    .replace(/([^a-z0-9_])/g, '')
    .replace(/^(?:assets|assetsunstable_path)_/, '');
}

export async function resolveTextureSource(
  moduleId: number,
  deps: TextureSourceDeps,
): Promise<TextureSourceResult> {
  const errors: string[] = [];
  const meta = deps.getMeta(moduleId) ?? null;
  const type = meta?.type ?? 'png';
  let width = meta?.width ?? 1;
  let height = meta?.height ?? 1;
  const contentHash = meta?.fileHashes?.[0] ?? meta?.hash ?? null;

  // Route 1: expo-asset's own resolution.
  let asset: AssetLike | null = null;
  try {
    asset = deps.fromModule(moduleId);
    await asset.downloadAsync();
    width = asset.width ?? width;
    height = asset.height ?? height;
    const local = asset.localUri ?? '';
    if (deps.platform === 'web') {
      // The browser path loads from any URL; nothing to convert.
      const uri = local || asset.uri;
      if (uri) return { ok: true, source: { localUri: uri, uri: asset.uri, width, height, route: 'asset' }, errors };
      errors.push('asset: no uri');
    } else if (local.startsWith('file://')) {
      return { ok: true, source: { localUri: local, uri: asset.uri, width, height, route: 'asset' }, errors };
    } else {
      errors.push(`asset: not a file (${local || asset.uri || 'empty'})`);
    }
  } catch (e) {
    errors.push(`asset: ${errText(e)}`);
  }

  if (deps.platform !== 'android' || !deps.nativeDownload) {
    return { ok: false, errors };
  }

  // Route 2: whatever expo-asset pointed at, if it is a resource
  // (bare name or file:///android_res/...) the native module can copy.
  const candidates: string[] = [];
  const pointed = asset ? asset.localUri || asset.uri : '';
  if (pointed && (!hasScheme(pointed) || pointed.startsWith('file:///android_res/'))) {
    candidates.push(pointed);
  }
  // Route 3: the drawable resource React Native packed into the APK,
  // derived from the packager metadata. Independent of expo-updates'
  // asset map, so it also covers a hash that map doesn't know.
  if (meta) {
    const name = androidResourceName(meta);
    if (!candidates.includes(name)) candidates.push(name);
  }

  for (const candidate of candidates) {
    try {
      const file = await deps.nativeDownload(candidate, contentHash, type);
      if (typeof file === 'string' && file.startsWith('file://')) {
        return { ok: true, source: { localUri: file, uri: candidate, width, height, route: `resource:${candidate}` }, errors };
      }
      errors.push(`resource ${candidate}: not a file (${String(file)})`);
    } catch (e) {
      errors.push(`resource ${candidate}: ${errText(e)}`);
    }
  }
  return { ok: false, errors };
}

// Build / Update Info row: "11/11 loaded", or which ones failed and
// why (full text on tap).
export function formatTextureRow(status: {
  total: number;
  loaded: number;
  details: Record<string, string>;
}): { label: string; value: string; full?: string } {
  const full = Object.keys(status.details)
    .sort()
    .map((k) => `${k}: ${status.details[k]}`)
    .join('\n');
  if (status.total === 0) return { label: 'Textures', value: 'Not loaded yet' };
  const value =
    status.loaded === status.total
      ? `${status.loaded}/${status.total} loaded`
      : `${status.loaded}/${status.total} loaded - ${status.total - status.loaded} FAILED`;
  return { label: 'Textures', value, full: full || undefined };
}
