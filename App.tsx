import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Game } from './src/game/Game';
import { useStore } from './src/state/store';
import { loadSaves, loadSettings } from './src/util/storage';

export default function App() {
  // Keep the screen lit during play.
  useEffect(() => {
    activateKeepAwakeAsync('endless-escaspe');
    return () => {
      deactivateKeepAwake('endless-escaspe');
    };
  }, []);

  // Hydrate user settings and character saves on boot. Per-stage
  // best-stars live on each Save and are mirrored into the store
  // when a save is loaded on the start screen.
  useEffect(() => {
    loadSettings().then((s) => {
      useStore.getState().setMasterVolume(s.masterVolume);
      useStore.getState().setWeatherEnabled(s.weatherEnabled);
      useStore.getState().setBossModeUnlocked(s.bossModeUnlocked);
      useStore.getState().setBossModeEnabled(s.bossModeEnabled);
    });
    loadSaves().then((m) => useStore.getState().setSaves(m));
  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" hidden />
        <Game />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
