import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Game } from './src/game/Game';
import { useStore } from './src/state/store';
import { loadBestStars, loadSaves, loadSettings } from './src/util/storage';

export default function App() {
  // Keep the screen lit during play.
  useEffect(() => {
    activateKeepAwakeAsync('endless-escaspe');
    return () => {
      deactivateKeepAwake('endless-escaspe');
    };
  }, []);

  // Hydrate persistent best-stars, user settings, and character
  // saves on boot. The active save's skin is applied later, when the
  // player picks a save (or creates one) on the start screen.
  useEffect(() => {
    loadBestStars().then((b) => useStore.getState().setBestStars(b));
    loadSettings().then((s) => {
      useStore.getState().setMasterVolume(s.masterVolume);
      useStore.getState().setWeatherEnabled(s.weatherEnabled);
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
