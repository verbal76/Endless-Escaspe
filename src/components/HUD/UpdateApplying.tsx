import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, AppState, Modal, StyleSheet, View } from 'react-native';
import * as Updates from 'expo-updates';
import { Text } from '../../ui/Text';
import { useStore } from '../../state/store';
import { color as ui, fonts, type as T } from '../../ui/theme';
import { flushDebugLog, logDebug } from '../../util/debug';
import { flushPendingSettings } from '../../util/settingsAutosave';
import { checkForNewUpdate } from '../../util/releaseRuntime';
import {
  APPLYING_MESSAGE,
  APPLY_WATCHDOG_MS,
  INITIAL_FLOW,
  applyFailed,
  decide,
  type FlowState,
  shouldCheckOnResume,
  type SafePoint,
} from '../../util/updateFlow';

// Automatic OTA activation (policy: util/updateFlow.ts).
//
// expo-updates discovers + downloads + verifies updates in the
// background; this component only decides WHEN the reload into a
// downloaded update is safe and shows the standard
// "Please wait, applying update" overlay while it happens. It is mounted
// only when updates are enabled (native release builds) - never on web /
// dev builds.
export function UpdateApplier() {
  const { isUpdatePending, isChecking, isDownloading, downloadedUpdate } = Updates.useUpdates();
  const runIdle = useStore((s) => s.runState === 'idle');
  const menuHome = useStore((s) => s.menuIdle);
  const noOverlay = useStore((s) => !s.paused && !s.showTutorial && s.gameModal === null && s.howToPlay === null && !s.aboutOpen);
  const flow = useRef<FlowState>(INITIAL_FLOW);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const safe: SafePoint = { runIdle, menuHome, noOverlay };
    const d = decide(
      flow.current,
      {
        enabled: true,
        isChecking,
        isDownloading,
        isUpdatePending,
        pendingUpdateId: downloadedUpdate?.updateId ?? null,
      },
      safe,
    );
    flow.current = d.next;
    useStore.getState().setUpdatePhase(d.next.phase);
    if (!d.apply) return;

    logDebug('log', `[update] applying ${downloadedUpdate?.updateId ?? '(unknown id)'}`);
    const fail = (why: string) => {
      logDebug('warn', `[update] activation did not complete: ${why}`);
      flow.current = applyFailed(flow.current);
      useStore.getState().setUpdatePhase('failed');
    };
    // Never leave the message up forever: a successful reload replaces
    // this JS runtime, so reaching the timer means activation is stuck.
    watchdog.current = setTimeout(() => fail('watchdog'), APPLY_WATCHDOG_MS);
    (async () => {
      try {
        // The reload ends this JS context: persist settings + crash trail first.
        await flushPendingSettings();
        await flushDebugLog().catch(() => undefined);
        await Updates.reloadAsync();
      } catch (e) {
        if (watchdog.current) clearTimeout(watchdog.current);
        fail(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [isUpdatePending, isChecking, isDownloading, downloadedUpdate?.updateId, runIdle, menuHome, noOverlay]);

  // Resume discovery (throttled): the launch check ran just now.
  const lastCheck = useRef<number | null>(Date.now());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const now = Date.now();
      if (!shouldCheckOnResume(now, lastCheck.current, useStore.getState().updatePhase)) return;
      lastCheck.current = now;
      // Downloads in the background; useUpdates() then reports it pending
      // and the effect above applies it at the next safe point.
      checkForNewUpdate().then(
        (r) => r.kind === 'error' && logDebug('warn', `[update] resume check failed: ${r.message}`),
        () => undefined,
      );
    });
    return () => sub.remove();
  }, []);

  useEffect(
    () => () => {
      if (watchdog.current) clearTimeout(watchdog.current);
    },
    [],
  );
  return null;
}

// The "Please wait, applying update" overlay, in the game's own panel
// style. It follows the real activation state (store.updatePhase) - no
// fixed timer - and covers everything so nothing can be tapped while the
// reload is under way. Indeterminate spinner: expo-updates reports no
// meaningful activation progress.
export function UpdateApplyingOverlay() {
  const applying = useStore((s) => s.updatePhase === 'applying');
  if (!applying) return null;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View style={styles.card} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.title}>{APPLYING_MESSAGE}</Text>
          <ActivityIndicator size="large" color={ui.gold} style={styles.spinner} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '92%',
    maxWidth: 460,
    backgroundColor: ui.panelSolid,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 209, 74, 0.55)',
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: 'center',
  },
  title: {
    color: ui.gold,
    fontSize: T.title,
    fontFamily: fonts.display,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  spinner: { marginTop: 16 },
});
