import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { setAudioModeAsync } from 'expo-audio';
import { Game } from './src/game/Game';
import { boundedStep } from './src/util/async';
import { useStore } from './src/state/store';
import { installDebugLogger, logDebug } from './src/util/debug';
import { getSavesLoadReport, loadSaves, loadSettings, setSavesWriteFailureListener } from './src/util/storage';
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
      useStore.getState().setTutorialSeen(s.tutorialSeen);
      useStore.getState().setBossModeUnlocked(s.bossModeUnlocked);
      useStore.getState().setBossModeEnabled(s.bossModeEnabled);
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
  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" hidden />
        {texturesReady && <Game />}
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
