import { Platform } from 'react-native';
import { formatEntry, getEntries, getPreviousRun } from './debug';
import { getReleaseInfo } from './releaseRuntime';
import { formatDetailRows, formatMenuLine } from './releaseInfo';
import { getTextureStatus } from './textures';
import { formatTextureRow } from './textureSource';
import { formatAuditRows, getRenderAudit } from './renderAudit';

// Pre-fill mailto: links for bug reports + feature requests so the
// user's email client opens with the diagnostic info already pasted.
//
// Adapted from the Personal Assistant template; trimmed down for
// this project: the report carries the full Build / Update Info
// (real APK + expo-updates metadata, see util/releaseInfo) plus
// Platform.OS / Version.

export const SUPPORT_EMAIL = 'hotatticgames@gmail.com';

function buildInfoMultiline(): string {
  const info = getReleaseInfo();
  const rows = [
    ...formatDetailRows(info),
    formatTextureRow(getTextureStatus()),
    ...formatAuditRows(getRenderAudit()),
  ].map((r) => `${r.label}: ${r.full ?? r.value}`);
  return [formatMenuLine(info), ...rows, `OS: ${Platform.OS} ${Platform.Version}`].join('\n');
}

export function composeBugReportUrl(): string {
  // Last 30 entries each is enough to fit comfortably under most
  // mailto: URL length caps (~8 KB on Android / iOS) while still
  // capturing a useful trail. The previous-run slice is the
  // crash-to-desktop catch: if the app died last session those
  // entries are the lead-up.
  const current = getEntries().slice(-30).map(formatEntry).join('\n');
  const prev = (getPreviousRun() ?? []).slice(-30).map(formatEntry).join('\n');
  const subject = `Endless Escape bug report — ${formatMenuLine(getReleaseInfo())}`;
  const body = [
    'Describe what happened above this line. Anything below is for context — leave it as-is.',
    '',
    '--- diagnostic info (auto-generated) ---',
    buildInfoMultiline(),
    '',
    '--- previous run (pre-crash, last 30 entries) ---',
    prev || '(no previous-run entries)',
    '',
    '--- current run (last 30 entries) ---',
    current || '(no current-run entries)',
  ].join('\n');
  const params = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${SUPPORT_EMAIL}?${params}`;
}

export function composeFeatureRequestUrl(): string {
  const subject = `Endless Escape feature request — ${formatMenuLine(getReleaseInfo())}`;
  const body = [
    'Describe the feature you\'d like above this line.',
    '',
    '--- diagnostic info (auto-generated) ---',
    buildInfoMultiline(),
  ].join('\n');
  const params = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${SUPPORT_EMAIL}?${params}`;
}
