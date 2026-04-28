import React, { useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { input } from '../../systems/InputSystem';

// RUN is a speed-toggle that doubles whatever stance speed is active.
// Placed up-and-left of the joystick so the player's left thumb can
// reach it without their eye leaving the action.
//
// Uses Gesture.Tap so a second-finger tap during a joystick Pan
// fires reliably; Pressable shares the responder pipeline with the
// active Pan and would drop the toggle when the player is moving.
export function RunButton() {
  const [running, setRunning] = useState(false);
  const pressed = useSharedValue(0);

  const toggle = () => {
    setRunning((prev) => {
      const next = !prev;
      input.run = next;
      return next;
    });
  };

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
          runOnJS(toggle)();
        })
        .onFinalize(() => {
          'worklet';
          pressed.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) });
        }),
    [pressed],
  );

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.06 }],
    opacity: 1 - pressed.value * 0.15,
  }));

  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={[styles.btn, running && styles.btnActive, style]}>
        <Text style={[styles.label, running && styles.labelActive]}>RUN</Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    // Right of the joystick. Joystick lives at left:30, bottom:40,
    // size 130 - so its right edge is x=160. Put RUN to its right
    // and slightly above so it's reachable by the left thumb without
    // overlapping the joystick gesture area.
    left: 180,
    bottom: 60,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(120,200,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(120,200,255,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: {
    backgroundColor: 'rgba(120,200,255,0.45)',
    borderColor: 'rgba(140,220,255,0.85)',
  },
  label: {
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '800',
    letterSpacing: 0.5,
    fontSize: 14,
  },
  labelActive: {
    color: '#dff4ff',
  },
});
