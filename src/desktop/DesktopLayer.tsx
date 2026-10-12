import React, { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { installBackHandler } from './backHandler';
import { DesktopPrompts } from './DesktopPrompts';
import { startDesktopRuntime, type RuntimeState } from './runtime';

// Runs when this module is first imported (App.tsx imports it at the top), i.e. before any screen mounts:
// gives the web build the real "back" semantics every screen already relies on.
installBackHandler(BackHandler as unknown as Parameters<typeof installBackHandler>[0]);

// Web / desktop only (Android gets DesktopLayer.native.tsx). Adds keyboard + gamepad control, controller-only
// menu navigation and prompt glyphs on top of the unchanged game.
export function DesktopLayer() {
  const [state, setState] = useState<RuntimeState | null>(null);
  useEffect(() => startDesktopRuntime(setState), []);
  if (!state) return null;
  return <DesktopPrompts state={state} onCycleStyle={() => (globalThis as unknown as { window: { __eeCyclePromptStyle?: () => void } }).window.__eeCyclePromptStyle?.()} />;
}
