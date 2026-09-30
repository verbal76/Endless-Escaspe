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
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      {FEATHER.map((alpha, i) => (
        <View
          key={i}
          style={[
            styles.ring,
            { top: i * RING_W, left: i * RING_W, right: i * RING_W, bottom: i * RING_W, borderColor: `rgba(255, 42, 42, ${alpha})` },
          ]}
        />
      ))}
    </Animated.View>
  );
}

// Feathered red edge: thin nested rings fading toward the centre read
// as a soft glow (the old 14 px + 30 px hard borders looked like a
// debug rectangle).
const RING_W = 5;
const FEATHER = [0.85, 0.6, 0.42, 0.3, 0.2, 0.13, 0.08, 0.04];

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderWidth: RING_W,
  },
});
