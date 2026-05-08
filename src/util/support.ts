import { Platform } from 'react-native';
import { BUILD_VERSION, OTA_VERSION } from '../version';

// Pre-fill mailto: links for bug reports + feature requests so the
// user's email client opens with the diagnostic info already pasted.
//
// Adapted from the Personal Assistant template; trimmed down for
// this project: we don't ship a debug-log capture (yet) and we
// haven't added expo-device, so the report includes BUILD_VERSION /
// OTA_VERSION + Platform.OS / Version. Adding expo-device later
// (and Constants.expoConfig.extra.gitBranch / commit / buildTime
// fields) is a drop-in extension.

export const SUPPORT_EMAIL = 'hotatticgames@gmail.com';

interface BuildInfo {
  build: string;
  ota: string;
}

function readBuildInfo(): BuildInfo {
  return { build: BUILD_VERSION, ota: OTA_VERSION };
}

function buildInfoMultiline(b: BuildInfo): string {
  return [
    `Build: ${b.build}`,
    `OTA:   ${b.ota}`,
    `OS:    ${Platform.OS} ${Platform.Version}`,
  ].join('\n');
}

export function composeBugReportUrl(): string {
  const info = readBuildInfo();
  const subject = `Endless Escape bug report — ${info.ota}`;
  const body = [
    'Describe what happened above this line. Anything below is for context — leave it as-is.',
    '',
    '--- diagnostic info (auto-generated) ---',
    buildInfoMultiline(info),
  ].join('\n');
  const params = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${SUPPORT_EMAIL}?${params}`;
}

export function composeFeatureRequestUrl(): string {
  const info = readBuildInfo();
  const subject = `Endless Escape feature request — ${info.ota}`;
  const body = [
    'Describe the feature you\'d like above this line.',
    '',
    '--- diagnostic info (auto-generated) ---',
    buildInfoMultiline(info),
  ].join('\n');
  const params = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${SUPPORT_EMAIL}?${params}`;
}
