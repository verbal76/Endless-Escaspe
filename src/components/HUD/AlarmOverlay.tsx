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

const GUARD_ID = 1;

// Visual stand-in for a siren until expo-audio lands. The screen-edge
// red border pulses with detection: low detection = subtle, slow throb;
// peak detection = aggressive flashing red border. Pure RN/Reanimated
// so it ships as an OTA bundle.
export function AlarmOverlay() {
  const v = useStore((s) => s.detection[GUARD_ID] ?? 0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (v <= 0.05) {
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
