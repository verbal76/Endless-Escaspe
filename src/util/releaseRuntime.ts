import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { resolveReleaseInfo, type ReleaseInfo } from './releaseInfo';

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
