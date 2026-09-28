import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Game } from './src/game/Game';
import { useStore } from './src/state/store';
import { installDebugLogger, logDebug } from './src/util/debug';
import { loadSaves, loadSettings } from './src/util/storage';
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
    loadSettings().then((s) => {
      useStore.getState().setMasterVolume(s.masterVolume);
      useStore.getState().setMusicVolume(s.musicVolume);
      useStore.getState().setWeatherEnabled(s.weatherEnabled);
      useStore.getState().setBossModeUnlocked(s.bossModeUnlocked);
      useStore.getState().setBossModeEnabled(s.bossModeEnabled);
    });
    loadSaves().then((m) => useStore.getState().setSaves(m));
    // Textures and the display font load in parallel; the font never
    // blocks boot for long (it resolves false on failure).
    Promise.all([preloadAllTextures(), loadDisplayFont()]).then(() => {
      // One line each in logcat identifying the running code and how
      // the texture files resolved (checked by the Android render CI).
      const info = getReleaseInfo();
      console.log(
        `[release] ${JSON.stringify({ line: formatMenuLine(info), source: info.source, updateId: info.updateId, gitSha: info.gitSha, otaSequence: info.otaSequence })}`,
      );
      console.log(`[textures] ${JSON.stringify(getTextureStatus())}`);
      console.log(`[font] ${JSON.stringify(getFontStatus())}`);
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
