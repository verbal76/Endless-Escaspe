import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { readBuildExtra, resolveReleaseInfo, type ReleaseInfo } from './releaseInfo';
import type { AboutSources } from './aboutInfo';
import type { UpdatePhase } from './updateFlow';

// Snapshot of what is running right now (read once; the running
// bundle can't change without a reload).
let cached: ReleaseInfo | null = null;

export function getReleaseInfo(): ReleaseInfo {
  if (cached) return cached;
  let info: ReleaseInfo;
  try {
    info = resolveReleaseInfo({
      appVersion: Application.nativeApplicationVersion,
      buildNumber: Application.nativeBuildVersion,
      // expo-updates only runs in native release builds.
      updatesEnabled: Platform.OS !== 'web' && Updates.isEnabled,
      isEmbeddedLaunch: Updates.isEmbeddedLaunch,
      updateId: Updates.updateId,
      runtimeVersion: Updates.runtimeVersion,
      channel: Updates.channel,
      createdAt: Updates.createdAt,
      manifest: Updates.manifest,
      isEmergencyLaunch: Updates.isEmergencyLaunch,
      emergencyReason: Updates.emergencyLaunchReason,
      embeddedAppConfig: Constants.expoConfig,
    });
  } catch {
    info = resolveReleaseInfo({
      appVersion: null,
      buildNumber: null,
      updatesEnabled: false,
      isEmbeddedLaunch: false,
      updateId: null,
      runtimeVersion: null,
      channel: null,
      createdAt: null,
      manifest: null,
    });
  }
  cached = info;
  return info;
}

export type UpdateCheckResult =
  | { kind: 'disabled' }
  | { kind: 'none' }
  | { kind: 'downloaded' }
  | { kind: 'error'; message: string };

// Manual "check now": fetch a newer compatible update if the channel
// has one. The caller decides whether to reload into it.
export async function checkForNewUpdate(): Promise<UpdateCheckResult> {
  if (!Updates.isEnabled) return { kind: 'disabled' };
  try {
    const res = await Updates.checkForUpdateAsync();
    if (!res.isAvailable) return { kind: 'none' };
    await Updates.fetchUpdateAsync();
    return { kind: 'downloaded' };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

export function reloadIntoUpdate(): Promise<void> {
  return Updates.reloadAsync();
}

// Everything the About screen / COPY DIAGNOSTICS reports. Read live (the
// update phase and capture time change); values that can't be read are
// null and shown as unavailable.
export function getAboutSources(updatePhase: UpdatePhase, now: Date = new Date()): AboutSources {
  const release = getReleaseInfo();
  let manifest: unknown = null;
  try {
    manifest = Updates.manifest;
  } catch {
    manifest = null;
  }
  const build = readBuildExtra(manifest, { expoConfig: Constants.expoConfig });
  const consts = (Platform.constants ?? {}) as { Release?: unknown; Model?: unknown };
  let locale: string | null = null;
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale || null;
  } catch {
    locale = null;
  }
  const api = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  return {
    appName: Constants.expoConfig?.name ?? Application.applicationName ?? null,
    packageId: Application.applicationId ?? null,
    release,
    device: {
      platform: Platform.OS,
      osVersion: typeof consts.Release === 'string' ? consts.Release : null,
      apiLevel: Number.isFinite(api) ? api : null,
      model: typeof consts.Model === 'string' ? consts.Model : null,
      locale,
    },
    targetSdk: build.targetSdk,
    signing: build.signing,
    buildType: __DEV__ ? 'development' : 'release',
    updatePhase,
    capturedAt: now,
  };
}
