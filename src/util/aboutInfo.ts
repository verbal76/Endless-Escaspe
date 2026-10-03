// Settings > About: release identity, device, OTA and Google Play
// readiness, as labelled sections and as plain text for COPY DIAGNOSTICS.
//
// Pure formatting over already-read sources (see releaseRuntime.ts /
// components/HUD/AboutPanel.tsx). Nothing here is guessed: a value that
// can't be read is shown as "Unavailable" (with the reason where it
// helps), never invented. No secrets, tokens, signing material, save
// contents or personal data are ever included.

import { formatMenuLine, formatOtaSequence, UNAVAILABLE, type ReleaseInfo } from './releaseInfo';
import { phaseLabel, type UpdatePhase } from './updateFlow';

// Google Play target API requirement. VERIFIED 2026-10-03 from
// https://developer.android.com/google/play/requirements/target-sdk
// (page updated 2026-10-01): since 2026-08-31 new apps and updates must
// target Android 16 / API 36 (extension to 2026-11-01 can be requested).
// tests/playTarget.test.ts fails if the built target SDK drops below it;
// bump both when Google raises the bar.
export const PLAY_REQUIRED_TARGET_SDK = 36;
export const PLAY_REQUIREMENT_VERIFIED_ON = '2026-10-03';

export type PlayCompliance = 'YES' | 'NO' | 'UNVERIFIED';

export function playCompliance(targetSdk: number | null, required: number = PLAY_REQUIRED_TARGET_SDK): PlayCompliance {
  if (targetSdk === null) return 'UNVERIFIED';
  return targetSdk >= required ? 'YES' : 'NO';
}

export type SigningLabel = 'Debug (not for release)' | 'Internal' | 'Upload / Play' | 'Production' | string;

export function signingLabel(signing: string | null): string {
  switch ((signing ?? '').toLowerCase()) {
    case 'debug':
      return 'Debug (not for release)';
    case 'internal':
      return 'Internal';
    case 'upload':
    case 'play':
      return 'Upload / Play';
    case 'production':
      return 'Production';
    default:
      return `${UNAVAILABLE} (set by the native build)`;
  }
}

export type DeviceInfo = {
  platform: string; // 'android'
  osVersion: string | null; // "14"
  apiLevel: number | null; // 34
  model: string | null;
  locale: string | null;
};

export type AboutSources = {
  appName: string | null;
  packageId: string | null;
  release: ReleaseInfo;
  device: DeviceInfo;
  targetSdk: number | null;
  signing: string | null;
  // 'release' | 'development' (JS __DEV__)
  buildType: string;
  updatePhase: UpdatePhase;
  capturedAt: Date;
};

export type AboutRow = { label: string; value: string };
export type AboutSection = { title: string; rows: AboutRow[] };

const u = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? UNAVAILABLE : String(v));

function utc(d: Date | null): string {
  return d ? d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : UNAVAILABLE;
}

export function buildAbout(s: AboutSources): AboutSection[] {
  const r = s.release;
  const compliance = playCompliance(s.targetSdk);
  const running =
    r.source === 'ota' ? 'Over-the-air update' : r.source === 'embedded' ? (r.emergency ? 'Embedded (update failed)' : 'Embedded in APK') : 'Updates disabled (dev build)';
  return [
    {
      title: 'Application',
      rows: [{ label: 'Name', value: u(s.appName) }],
    },
    {
      title: 'Install',
      rows: [
        { label: 'Package ID', value: u(s.packageId) },
        { label: 'Version', value: u(r.appVersion) },
        { label: 'Native / runtime version', value: u(r.runtimeVersion) },
        { label: 'Android build (versionCode)', value: u(r.buildNumber) },
        { label: 'Source commit', value: u(r.gitSha) },
        { label: 'Build type', value: s.buildType },
        { label: 'Channel', value: u(r.channel) },
      ],
    },
    {
      title: 'Updates (OTA)',
      rows: [
        { label: 'Updates enabled', value: r.source === 'disabled' ? 'No' : 'Yes' },
        { label: 'Running code', value: running },
        { label: 'Update status', value: phaseLabel(s.updatePhase) },
        { label: 'OTA sequence', value: r.source === 'ota' ? (r.otaSequence !== null ? formatOtaSequence(r.otaSequence) : UNAVAILABLE) : r.source === 'embedded' ? 'None (embedded bundle)' : 'Not applicable' },
        { label: 'Update ID', value: u(r.updateId) },
        { label: 'Published / created', value: utc(r.createdAt) },
        { label: 'OTA source commit', value: r.source === 'ota' ? u(r.gitSha) : 'Not applicable' },
        { label: 'Integrity', value: r.source === 'ota' ? 'Verified by expo-updates before launch' : 'Not applicable' },
        ...(r.emergency ? [{ label: 'Fallback reason', value: u(r.emergencyReason) }] : []),
      ],
    },
    {
      title: 'Google Play readiness',
      rows: [
        { label: 'Target SDK (API)', value: s.targetSdk !== null ? String(s.targetSdk) : `${UNAVAILABLE} (needs a build that reports it)` },
        { label: 'Play requires', value: `API ${PLAY_REQUIRED_TARGET_SDK} (verified ${PLAY_REQUIREMENT_VERIFIED_ON})` },
        { label: 'Play API compliant', value: compliance },
        { label: 'Signing', value: signingLabel(s.signing) },
      ],
    },
    {
      title: 'Device',
      rows: [
        { label: 'Platform', value: u(s.device.platform) },
        { label: 'Android version', value: u(s.device.osVersion) },
        { label: 'API level', value: u(s.device.apiLevel) },
        { label: 'Model', value: u(s.device.model) },
        { label: 'Locale', value: u(s.device.locale) },
        { label: 'Captured at', value: utc(s.capturedAt) },
      ],
    },
  ];
}

// Plain text for COPY DIAGNOSTICS (pasteable into a chat). `technical`
// rows (texture/font/render-audit) are appended under their own heading.
export function formatAboutText(s: AboutSources, technical: AboutRow[] = []): string {
  const lines: string[] = [`${s.appName ?? 'Endless Escape'} - About / Diagnostics`, formatMenuLine(s.release), ''];
  for (const sec of buildAbout(s)) {
    lines.push(`[${sec.title}]`);
    for (const row of sec.rows) lines.push(`${row.label}: ${row.value}`);
    lines.push('');
  }
  if (technical.length) {
    lines.push('[Technical]');
    for (const row of technical) lines.push(`${row.label}: ${row.value}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}
