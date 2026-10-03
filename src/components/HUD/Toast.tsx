import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../../ui/Text';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../state/store';
import { type as T } from '../../ui/theme';
import { toastFrame } from '../../ui/hudLayout';

const HOLD_MS = 2600;
// Tips are read while moving: they stay up longer.
const TIP_HOLD_MS = 4200;

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

// Small notice. Never blocks input and never stacks: a new toast
// replaces the current one. Where it goes comes from ui/hudLayout: top
// centre on wide phones, otherwise in the band below the hearts and
// left of the right-hand controls (it used to cover the hearts, the
// BOSS PERK tag and THROW on narrow phones).
export function Toast() {
  const toast = useStore((s) => s.toast);
  const runState = useStore((s) => s.runState);
  // Stay clear of the other top-centre HUD: the boss SURVIVE timer
  // (y 64-120) and, in Endless / Daily, the distance readout plus the
  // camera-alarm bar beneath it (y 10-92).
  const bossTimer = useStore((s) => s.bossTimeRemaining > 0);
  const endless = useStore((s) => s.gameMode !== 'campaign');
  const perkTag = useStore((s) => s.gameMode === 'campaign' && s.perkRemainingStages > 0);
  const crowbar = useStore((s) => s.inventory.crowbar > 0);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const frame = toastFrame(width, height, insets, { bossTimer, endless, perkTag, crowbar });
  const o = useSharedValue(0);
  const y = useSharedValue(-10);

  useEffect(() => {
    if (!toast) return;
    const hold = toast.tone === 'tip' ? TIP_HOLD_MS : HOLD_MS;
    o.value = withSequence(
      withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
      withDelay(hold, withTiming(0, { duration: 320 })),
    );
    y.value = -10;
    y.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.back(1.4)) });
    const t = setTimeout(() => {
      if (useStore.getState().toast?.id === toast.id) useStore.getState().clearToast();
    }, hold + 520);
    return () => clearTimeout(t);
  }, [toast?.id]);

  const style = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateY: y.value }],
  }));

  // Gameplay notices show only while playing; a warning (a failed or
  // restored save) shows on the menus too, so it is never silent.
  if (!toast || (runState !== 'playing' && toast.tone !== 'warn')) return null;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.lane,
        frame.mode === 'centre'
          ? { top: frame.top, left: 0, right: 0, alignItems: 'center' }
          : { top: frame.top, left: frame.left, right: frame.right, alignItems: 'flex-start' },
      ]}
    >
      <Animated.View
        style={[
          styles.box,
          frame.mode === 'centre' && { maxWidth: frame.maxWidth },
          { backgroundColor: TONE_BG[toast.tone], borderColor: TONE_BORDER[toast.tone] },
          style,
        ]}
      >
        <Text style={styles.text}>{toast.text}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  lane: {
    position: 'absolute',
  },
  box: {
    maxWidth: '100%',
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
