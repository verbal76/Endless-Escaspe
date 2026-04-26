import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Game } from './src/game/Game';

export default function App() {
  // Keep the screen lit while the user is in the app. Cheap to wire up
  // here; gameplay sessions are short and the user shouldn't drop into
  // a screen-off state mid-run.
  useEffect(() => {
    activateKeepAwakeAsync('endless-escaspe');
    return () => {
      deactivateKeepAwake('endless-escaspe');
    };
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
