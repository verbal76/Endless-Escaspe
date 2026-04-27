import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Game } from './src/game/Game';
import { useStore } from './src/state/store';
import { loadBestStars } from './src/util/storage';

export default function App() {
  // Keep the screen lit during play.
  useEffect(() => {
    activateKeepAwakeAsync('endless-escaspe');
    return () => {
      deactivateKeepAwake('endless-escaspe');
    };
  }, []);

  // Hydrate persistent best-stars on boot.
  useEffect(() => {
    loadBestStars().then((b) => useStore.getState().setBestStars(b));
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
