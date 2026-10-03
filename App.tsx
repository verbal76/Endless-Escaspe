import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { setAudioModeAsync } from 'expo-audio';
import { Game } from './src/game/Game';
import { UpdateApplier, UpdateApplyingOverlay } from './src/components/HUD/UpdateApplying';
import { StudioSplash } from './src/ui/StudioSplash';
import { STUDIO_SPLASH_SOURCE } from './src/ui/studioSplashSource';
import { splashPlan } from './src/util/studioSplash';
import { boundedStep } from './src/util/async';
import { setHapticsEnabled as setHapticsGate } from './src/util/haptics';
import { useStore } from './src/state/store';
import { installDebugLogger, logDebug } from './src/util/debug';
import { getSavesLoadReport, loadSaves, loadSettings, saveSettings, setSavesWriteFailureListener } from './src/util/storage';
import { setActiveSettingsAutosave, startSettingsAutosave } from './src/util/settingsAutosave';
import { getTextureStatus, preloadAllTextures } from './src/util/textures';
import { getReleaseInfo } from './src/util/releaseRuntime';
import { formatMenuLine } from './src/util/releaseInfo';
import { getFontStatus, loadDisplayFont } from './src/ui/fonts';

export default function App() {
  // Gate the Game (and its onContextCreate, where figures + vehicles
  // are built) on texture preload. expo-gl uploads textures natively
  // from asset-shaped image objects, but the Asset URI must already
  // be resolved before the renderer reads texture.image - otherwise
  // the GL upload silently falls back to a 1-pixel default.
  const [texturesReady, setTexturesReady] = useState(false);
  // Opening studio card (shown once per launch, never on resume; boot
  // below keeps running underneath it). Off until the canonical logo is
  // added - see src/ui/studioSplashSource.ts.
  const [splashDone, setSplashDone] = useState(!splashPlan(STUDIO_SPLASH_SOURCE).show);
  // OTA activation runs only where expo-updates is active (native
  // release builds); never on web / dev builds.
  const updatesEnabled = getReleaseInfo().source !== 'disabled';

  useEffect(() => {
    activateKeepAwakeAsync('endless-escaspe');
    return () => {
      deactivateKeepAwake('endless-escaspe');
    };
  }, []);

  useEffect(() => {
    // Install the crash-trail logger before anything else so this
    // run's error / warn output is captured, and so the prior run's
    // log is rotated into 'previous' for inclusion in bug reports.
    installDebugLogger().then(() => {
      logDebug('log', 'app boot');
    });
    const settingsReady = loadSettings().then((s) => {
      useStore.getState().setMasterVolume(s.masterVolume);
      useStore.getState().setMusicVolume(s.musicVolume);
      useStore.getState().setWeatherEnabled(s.weatherEnabled);
      useStore.getState().setHapticsEnabled(s.hapticsEnabled);
      useStore.getState().setTutorialSeen(s.tutorialSeen);
      useStore.getState().setBossModeUnlocked(s.bossModeUnlocked);
      useStore.getState().setBossModeEnabled(s.bossModeEnabled);
    });
    // From here on every settings change is saved as it happens (started
    // after the load so the loaded values aren't written straight back).
    let autosave: ReturnType<typeof startSettingsAutosave> | null = null;
    let disposed = false;
    settingsReady
      .catch(() => undefined)
      .then(() => {
        if (disposed) return;
        autosave = startSettingsAutosave(useStore, saveSettings);
        setActiveSettingsAutosave(autosave);
      });
    // The haptics module gate follows the store setting.
    setHapticsGate(useStore.getState().hapticsEnabled);
    const unsubHaptics = useStore.subscribe((st, prev) => {
      if (st.hapticsEnabled !== prev.hapticsEnabled) setHapticsGate(st.hapticsEnabled);
    });
    const appStateSub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') autosave?.flush();
    });
    const savesReady = loadSaves().then((m) => {
      useStore.getState().setSaves(m);
      if (getSavesLoadReport().recovered) useStore.getState().showToast('Saves restored from backup', 'warn');
    });
    // A failed save is never silent (at most one notice per 30 s).
    let lastWriteNotice = -Infinity;
    setSavesWriteFailureListener(() => {
      const now = Date.now();
      if (now - lastWriteNotice < 30000) return;
      lastWriteNotice = now;
      useStore.getState().showToast('Couldn’t save progress - storage error', 'warn');
    });
    // Audio session (audio review E-1): mix with other apps' audio so
    // the game never pauses the player's own music / podcast, and stay
    // silent in the background. Set before Game mounts (it gates boot
    // below) so no player has requested exclusive focus first.
    const audioModeReady = setAudioModeAsync({
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
      playsInSilentMode: false,
    }).catch((e) => logDebug('warn', '[audio] setAudioModeAsync failed', e));
    // Boot waits for textures, the display font, the audio session and the
    // saved settings / characters (so the first sound already uses the
    // saved volume and the menu shows the real save list). Every step is
    // time-limited and can't fail the boot: a hung or failing step is
    // logged and the game starts anyway - never a blank screen.
    const step = <T,>(name: string, p: Promise<T>, ms: number) =>
      boundedStep(p, ms).then((r) => {
        if (r === 'timeout') logDebug('warn', `[boot] ${name} still pending after ${ms} ms - continuing`);
      }, (e) => logDebug('error', `[boot] ${name} failed`, e));
    Promise.all([
      step('textures', preloadAllTextures(), 8000),
      step('font', loadDisplayFont(), 4000),
      step('audio mode', audioModeReady, 2000),
      step('settings', settingsReady, 3000),
      step('saves', savesReady, 3000),
    ]).then(() => {
      // One line each in logcat identifying the running code and how
      // the texture files resolved (checked by the Android render CI).
      const info = getReleaseInfo();
      console.log(
        `[release] ${JSON.stringify({ line: formatMenuLine(info), source: info.source, updateId: info.updateId, gitSha: info.gitSha, otaSequence: info.otaSequence })}`,
      );
      console.log(`[textures] ${JSON.stringify(getTextureStatus())}`);
      console.log(`[font] ${JSON.stringify(getFontStatus())}`);
    }).catch((e) => logDebug('error', '[boot] diagnostics failed', e)).finally(() => {
      setTexturesReady(true);
    });
    return () => {
      disposed = true;
      appStateSub.remove();
      unsubHaptics();
      autosave?.stop();
      setActiveSettingsAutosave(null);
      setSavesWriteFailureListener(null);
    };
  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" hidden />
        {!splashDone && STUDIO_SPLASH_SOURCE !== null ? (
          <StudioSplash source={STUDIO_SPLASH_SOURCE} onDone={() => setSplashDone(true)} />
        ) : texturesReady ? (
          <Game />
        ) : (
          // Boot screen while textures / font / saves load (bounded to a
          // few seconds), so a slow phone never shows a blank view.
          <View style={styles.boot}>
            <Text style={styles.bootTitle} maxFontSizeMultiplier={1.3}>ENDLESS ESCAPE</Text>
            <ActivityIndicator color="#ffd14a" />
          </View>
        )}
        {updatesEnabled ? <UpdateApplier /> : null}
        <UpdateApplyingOverlay />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, backgroundColor: '#0b0d12', alignItems: 'center', justifyContent: 'center', gap: 16 },
  bootTitle: { color: '#ffd14a', fontSize: 28, fontWeight: '900', letterSpacing: 3 },
});
