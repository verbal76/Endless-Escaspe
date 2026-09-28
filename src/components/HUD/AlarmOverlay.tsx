import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useStore } from '../../state/store';

// Visual stand-in for a siren until expo-audio is wired. The screen-
// edge red border pulses with the *most alarmed* guard's detection so
// the player gets a single, unambiguous threat reading regardless of
// how many guards are on the field.
export function AlarmOverlay() {
  // Quantised to 0.1 steps: the raw max changes every frame while any
  // meter moves, which re-rendered this view and restarted the pulse
  // 60 times a second (so it never visibly pulsed).
  const v = useStore((s) => {
    let max = 0;
    for (const k in s.detection) {
      const x = s.detection[k];
      if (x > max) max = x;
    }
    return Math.round(max * 10) / 10;
  });
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (v <= 0.20) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    // Pulse half-period in ms: at v=0 → 1000ms, at v=1 → 200ms.
    const halfPeriod = Math.max(120, 600 - v * 480);
    pulse.value = 0;
    pulse.value = withRepeat(
      withTiming(1, { duration: halfPeriod, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [v, pulse]);

  const style = useAnimatedStyle(() => {
    // Base intensity scales with detection; the pulse modulates ±50%.
    const base = Math.min(1, v) * 0.7;
    const opacity = base * (0.55 + 0.45 * pulse.value);
    return { opacity };
  });

  // pointerEvents="none" so the overlay never eats joystick / button taps.
  return (
    <Animated.View pointerEvents="none" style={[styles.outer, style]}>
      <View style={styles.inner} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 14,
    borderColor: '#ff2a2a',
  },
  inner: {
    flex: 1,
    borderWidth: 30,
    borderColor: 'rgba(255, 80, 60, 0.35)',
  },
});
