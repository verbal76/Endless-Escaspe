import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { FixedText as Text } from '../../ui/Text';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { input } from '../../systems/InputSystem';
import { useStore } from '../../state/store';
import type { Stance } from '../../types/world';
import { hud, type as T } from '../../ui/theme';
import { BTN_GAP, BTN_H, BTN_W, CLUSTER_RIGHT, STANCE_BOTTOM } from '../../ui/hudLayout';

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
  const runState = useStore((s) => s.runState);
  // Subscribe to store.stance instead of holding a local copy so the
  // button highlight tracks the actual player stance - including the
  // 'walk' reset that resetSegment() applies on every level start
  // (otherwise a CROUCH highlight from the prior segment would persist
  // visually even though the player is back in walk).
  const stance = useStore((s) => s.stance);
  const setStance = useStore((s) => s.setStance);

  const pickStance = (s: Stance) => {
    input.stance = s;
    setStance(s);
  };

  if (runState !== 'playing') return null;

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
    right: CLUSTER_RIGHT,
    bottom: STANCE_BOTTOM,
    flexDirection: 'column',
    gap: BTN_GAP,
  },
  btn: {
    width: BTN_W,
    height: BTN_H,
    borderRadius: BTN_H / 2,
    backgroundColor: hud.fill,
    borderWidth: hud.ringWidth,
    borderColor: hud.ring,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: {
    backgroundColor: hud.goldFill,
    borderColor: hud.goldRing,
  },
  label: {
    color: hud.label,
    ...hud.textShadow,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontSize: T.small,
  },
});
