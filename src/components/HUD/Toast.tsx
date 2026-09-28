import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useStore } from '../../state/store';
import { type as T } from '../../ui/theme';

const HOLD_MS = 2600;

const TONE_BG = {
  info: 'rgba(20,24,32,0.86)',
  warn: 'rgba(90,20,20,0.88)',
  tip: 'rgba(20,24,32,0.86)',
} as const;
const TONE_BORDER = {
  info: 'rgba(255,255,255,0.25)',
  warn: 'rgba(255,110,100,0.85)',
  tip: 'rgba(255,209,74,0.8)',
} as const;

// Small top-centre notice. Never blocks input and never stacks: a new
// toast replaces the current one.
export function Toast() {
  const toast = useStore((s) => s.toast);
  const runState = useStore((s) => s.runState);
  // Stay clear of the other top-centre HUD: the boss SURVIVE timer
  // (y 64-120) and, in Endless / Daily, the distance readout plus the
  // camera-alarm bar beneath it (y 10-92).
  const bossTimer = useStore((s) => s.bossTimeRemaining > 0);
  const endless = useStore((s) => s.gameMode !== 'campaign');
  const top = bossTimer ? 126 : endless ? 98 : 64;
  const o = useSharedValue(0);
  const y = useSharedValue(-10);

  useEffect(() => {
    if (!toast) return;
    o.value = withSequence(
      withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
      withDelay(HOLD_MS, withTiming(0, { duration: 320 })),
    );
    y.value = -10;
    y.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.back(1.4)) });
    const t = setTimeout(() => {
      if (useStore.getState().toast?.id === toast.id) useStore.getState().clearToast();
    }, HOLD_MS + 520);
    return () => clearTimeout(t);
  }, [toast?.id]);

  const style = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateY: y.value }],
  }));

  if (!toast || runState !== 'playing') return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.box,
        { top, backgroundColor: TONE_BG[toast.tone], borderColor: TONE_BORDER[toast.tone] },
        style,
      ]}
    >
      <Text style={styles.text}>{toast.text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    top: 64,
    alignSelf: 'center',
    maxWidth: '60%',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  text: {
    color: '#ffffff',
    fontSize: T.body,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
