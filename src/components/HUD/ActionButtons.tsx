import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { input } from '../../systems/InputSystem';
import type { Stance } from '../../types/world';

// Stance picker only. RUN is its own component (RunButton) sitting
// near the joystick on the left side of the screen.
//
// Uses GestureDetector / Gesture.Tap rather than Pressable so the
// taps cooperate with the joystick's Pan gesture - Pressable shares
// the React Native responder system with active Pan, which means a
// second-finger tap during a thumbstick hold gets dropped. With
// Gesture.Tap the buttons fire reliably while moving.

const STANCES: Array<{ label: string; value: Stance }> = [
  { label: 'CROUCH', value: 'crouch' },
  { label: 'WALK', value: 'walk' },
];

function StanceButton({
  label,
  value,
  active,
  onPick,
}: {
  label: string;
  value: Stance;
  active: boolean;
  onPick: (s: Stance) => void;
}) {
  const pressed = useSharedValue(0);
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(99999)
        .onBegin(() => {
          'worklet';
          pressed.value = withTiming(1, { duration: 80, easing: Easing.out(Easing.quad) });
        })
        .onEnd(() => {
          'worklet';
          runOnJS(onPick)(value);
        })
        .onFinalize(() => {
          'worklet';
          pressed.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) });
        }),
    [value, onPick, pressed],
  );

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.06 }],
    opacity: 1 - pressed.value * 0.15,
  }));

  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={[styles.btn, active && styles.btnActive, style]}>
        <Text style={styles.label}>{label}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

export function ActionButtons() {
  const [stance, setStance] = useState<Stance>('walk');

  const pickStance = (s: Stance) => {
    input.stance = s;
    setStance(s);
  };

  return (
    <View style={styles.col}>
      {STANCES.map((s) => (
        <StanceButton
          key={s.value}
          label={s.label}
          value={s.value}
          active={stance === s.value}
          onPick={pickStance}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  col: {
    position: 'absolute',
    // Shifted left half a button width (right:24 -> 63) plus pushed
    // up to bottom:100 to make room for the look-arrow row that
    // sits directly underneath the stack at bottom:30.
    right: 63,
    bottom: 100,
    flexDirection: 'column',
    gap: 8,
  },
  btn: {
    width: 78,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: {
    backgroundColor: 'rgba(255,210,90,0.35)',
    borderColor: 'rgba(255,210,90,0.65)',
  },
  label: {
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '700',
    letterSpacing: 0.5,
    fontSize: 13,
  },
});
