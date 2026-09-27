// Release / update identification for the main menu and the
// Build / Update Info panel.
//
// Every value here comes from real build or update metadata - never
// from a hand-edited constant:
//   - app version / Android build number: the installed APK's own
//     versionName / versionCode (expo-application)
//   - runtime version, channel, update ID, embedded-vs-OTA, created
//     time: the running bundle's expo-updates state
//   - OTA sequence + source commit: the `release` block that
//     app.config.js writes into `extra` from CI environment
//     variables (EE_OTA_SEQUENCE, EE_GIT_SHA) when the APK is built or
//     the update is published. It travels inside the running
//     manifest, so it always describes the code actually running.
//
// Missing metadata is reported as unavailable, never guessed.

export type ReleaseSources = {
  appVersion: string | null;
  buildNumber: string | null;
  updatesEnabled: boolean;
  isEmbeddedLaunch: boolean;
  updateId: string | null;
  runtimeVersion: string | null;
  channel: string | null;
  createdAt: Date | null;
  // The running manifest (embedded or downloaded), any shape.
  manifest: unknown;
};

export type ReleaseInfo = {
  appVersion: string | null;
  buildNumber: string | null;
  runtimeVersion: string | null;
  channel: string | null;
  // 'ota' = running a downloaded update; 'embedded' = the bundle that
  // shipped inside the APK; 'disabled' = expo-updates not active
  // (dev / debug builds, web).
  source: 'ota' | 'embedded' | 'disabled';
  updateId: string | null;
  otaSequence: number | null;
  gitSha: string | null;
  // When the running bundle was created (embedded: build time;
  // OTA: publish time), as reported by expo-updates.
  createdAt: Date | null;
};

export const UNAVAILABLE = 'Unavailable';

type ReleaseExtra = { gitSha?: unknown; otaSequence?: unknown };

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function nonEmptyString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t === 'undefined' || t === 'null') return null;
  return t;
}

// Locate extra.release in either manifest shape: EAS/expo-updates
// manifests nest the app config under extra.expoClient; classic /
// embedded shapes may carry extra directly.
export function readReleaseExtra(manifest: unknown): ReleaseExtra | null {
  const m = asObject(manifest);
  if (!m) return null;
  const candidates: unknown[] = [];
  const extra = asObject(m.extra);
  if (extra) {
    const expoClient = asObject(extra.expoClient);
    if (expoClient) candidates.push(asObject(expoClient.extra)?.release);
    candidates.push(extra.release);
  }
  const expoConfig = asObject(m.expoConfig);
  if (expoConfig) candidates.push(asObject(expoConfig.extra)?.release);
  for (const c of candidates) {
    const o = asObject(c);
    if (o) return o as ReleaseExtra;
  }
  return null;
}

export function parseSha(v: unknown): string | null {
  const s = nonEmptyString(v);
  return s && /^[0-9a-f]{7,40}$/i.test(s) ? s.toLowerCase() : null;
}

export function parseSequence(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function resolveReleaseInfo(src: ReleaseSources): ReleaseInfo {
  const release = readReleaseExtra(src.manifest);
  // A downloaded update always has an ID; "enabled but no ID" (e.g.
  // the web shim) must not be reported as an OTA.
  const updateId = nonEmptyString(src.updateId);
  const source: ReleaseInfo['source'] = !src.updatesEnabled
    ? 'disabled'
    : src.isEmbeddedLaunch
      ? 'embedded'
      : updateId
        ? 'ota'
        : 'disabled';
  return {
    appVersion: nonEmptyString(src.appVersion),
    buildNumber: nonEmptyString(src.buildNumber),
    runtimeVersion: nonEmptyString(src.runtimeVersion),
    channel: nonEmptyString(src.channel),
    source,
    // An update ID only identifies downloaded code when we're
    // actually running one; for the embedded bundle expo-updates
    // reports the embedded update's ID, which we still show.
    updateId: source === 'disabled' ? null : updateId,
    // The OTA sequence is only meaningful for a downloaded update.
    // Never show it for embedded / disabled launches, even if some
    // stale value were present in the manifest.
    otaSequence: source === 'ota' ? parseSequence(release?.otaSequence) : null,
    gitSha: parseSha(release?.gitSha),
    createdAt: src.createdAt && !isNaN(src.createdAt.getTime()) ? src.createdAt : null,
  };
}

export function formatOtaSequence(n: number): string {
  return String(n).padStart(3, '0');
}

// Compact main-menu line, e.g. "v0.2.0 • Build 9 • OTA 101".
export function formatMenuLine(info: ReleaseInfo): string {
  const parts: string[] = [];
  parts.push(info.appVersion ? `v${info.appVersion}` : `Version ${UNAVAILABLE.toLowerCase()}`);
  parts.push(info.buildNumber ? `Build ${info.buildNumber}` : `Build ${UNAVAILABLE.toLowerCase()}`);
  if (info.source === 'ota') {
    parts.push(info.otaSequence !== null ? `OTA ${formatOtaSequence(info.otaSequence)}` : `OTA ${shortId(info.updateId) ?? UNAVAILABLE.toLowerCase()}`);
  } else if (info.source === 'embedded') {
    parts.push('Embedded');
  } else {
    parts.push('Updates off');
  }
  return parts.join(' • ');
}

export function shortId(id: string | null, len: number = 8): string | null {
  return id ? id.slice(0, len) : null;
}

export type InfoRow = { label: string; value: string; full?: string };

export function formatDetailRows(info: ReleaseInfo): InfoRow[] {
  const u = (v: string | null) => v ?? UNAVAILABLE;
  return [
    { label: 'Version', value: u(info.appVersion) },
    { label: 'Android build', value: u(info.buildNumber) },
    { label: 'Runtime', value: u(info.runtimeVersion) },
    { label: 'Channel', value: u(info.channel) },
    {
      label: 'Running code',
      value:
        info.source === 'ota'
          ? 'Over-the-air update'
          : info.source === 'embedded'
            ? 'Embedded in APK'
            : 'Updates disabled (dev build)',
    },
    {
      label: 'OTA sequence',
      value:
        info.source === 'ota'
          ? info.otaSequence !== null
            ? formatOtaSequence(info.otaSequence)
            : UNAVAILABLE
          : 'None (embedded bundle)',
    },
    { label: 'Update ID', value: shortId(info.updateId, 13) ?? UNAVAILABLE, full: info.updateId ?? undefined },
    { label: 'Source commit', value: shortId(info.gitSha, 10) ?? UNAVAILABLE, full: info.gitSha ?? undefined },
    { label: 'Published', value: info.createdAt ? info.createdAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : UNAVAILABLE },
  ];
}
