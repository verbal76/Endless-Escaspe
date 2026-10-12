import { Linking, Platform } from 'react-native';
import { composeMailtoReport, mailtoUrl } from './bugReport';
import { formatEntry, getEntries, getPreviousRun, logDebug } from './debug';
import { getAboutSources, getReleaseInfo } from './releaseRuntime';
import { formatAboutText } from './aboutInfo';
import { useStore } from '../state/store';
import { formatDetailRows, formatInfoLines, formatMenuLine, formatVitalsText, type InfoRow } from './releaseInfo';
import { getTextureStatus } from './textures';
import { formatTextureRow } from './textureSource';
import { formatFontRow, getFontStatus } from '../ui/fonts';
import { formatAuditRows, getRenderAudit } from './renderAudit';

// Pre-fill mailto: links for bug reports + feature requests so the
// user's email client opens with the diagnostic info already pasted.
//
// Adapted from the Personal Assistant template; trimmed down for
// this project: the report carries the full Build / Update Info
// (real APK + expo-updates metadata, see util/releaseInfo) plus
// Platform.OS / Version.

export const SUPPORT_EMAIL = 'hotatticgames@gmail.com';

function infoRows(): InfoRow[] {
  return [...formatDetailRows(getReleaseInfo()), ...technicalRows()];
}

const osLabel = () => `${Platform.OS} ${Platform.Version}`;

function buildInfoMultiline(): string {
  return formatInfoLines(formatMenuLine(getReleaseInfo()), infoRows(), osLabel()).join('\n');
}

// Everything in Build / Update Info as text, for the COPY / SHARE INFO
// button (Android share sheet: Copy, or send to any app).
export function composeVitalsText(): string {
  return formatVitalsText(formatMenuLine(getReleaseInfo()), infoRows(), osLabel(), new Date());
}

// COPY DIAGNOSTICS (Settings > About): release identity, OTA state, Play
// readiness and device as plain text, plus the technical rows. Contains
// no secrets, signing material, save contents or personal data.
export function technicalRows(): InfoRow[] {
  return [formatTextureRow(getTextureStatus()), formatFontRow(getFontStatus()), ...formatAuditRows(getRenderAudit())];
}

export function composeAboutText(): string {
  return formatAboutText(getAboutSources(useStore.getState().updatePhase), technicalRows());
}

export function composeBugReportUrl(): string {
  // The last 30 entries of each run, clipped and trimmed oldest-first
  // so the whole URL stays within what mail apps accept (see
  // util/bugReport.ts); the diagnostic block is always kept. The
  // previous-run slice is the crash-to-desktop catch: if the app died
  // last session those entries are the lead-up.
  return composeMailtoReport({
    to: SUPPORT_EMAIL,
    subject: `Endless Escape bug report — ${formatMenuLine(getReleaseInfo())}`,
    head: [
      'Describe what happened above this line. Anything below is for context — leave it as-is.',
      '',
      '--- diagnostic info (auto-generated) ---',
      buildInfoMultiline(),
    ],
    sections: [
      { title: 'previous run (pre-crash)', entries: (getPreviousRun() ?? []).slice(-30).map(formatEntry), empty: '(no previous-run entries)' },
      { title: 'current run', entries: getEntries().slice(-30).map(formatEntry), empty: '(no current-run entries)' },
    ],
  });
}

export function composeFeatureRequestUrl(): string {
  const subject = `Endless Escape feature request — ${formatMenuLine(getReleaseInfo())}`;
  const body = [
    'Describe the feature you\'d like above this line.',
    '',
    '--- diagnostic info (auto-generated) ---',
    buildInfoMultiline(),
  ].join('\n');
  return mailtoUrl(SUPPORT_EMAIL, subject, body);
}

// Opens a composed mailto: URL. Resolves false (and logs why) when no
// app can take it (e.g. no email client), so the caller can offer the
// COPY / SHARE INFO path instead of failing silently.
export async function openSupportUrl(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch (e) {
    logDebug('warn', '[support] could not open mail app', e);
    return false;
  }
}
