import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
} from 'react-native-reanimated';
import { input } from '../../systems/InputSystem';
import { useStore } from '../../state/store';

const SIZE = 130;
const KNOB = 56;
const RADIUS = SIZE / 2 - KNOB / 2;

const writeAxes = (x: number, y: number) => {
  input.axisX = x;
  input.axisY = y;
};

export function Joystick() {
  const runState = useStore((s) => s.runState);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  const gesture = Gesture.Pan()
    .minDistance(0)
    .onChange((e) => {
      const dx = e.translationX;
      const dy = e.translationY;
      const len = Math.hypot(dx, dy);
      const cl = len > RADIUS ? RADIUS / len : 1;
      const cx = dx * cl;
      const cy = dy * cl;
      tx.value = cx;
      ty.value = cy;
      // Up on screen = forward in world; Reanimated y is screen-down so invert.
      runOnJS(writeAxes)(cx / RADIUS, -cy / RADIUS);
    })
    .onFinalize(() => {
      tx.value = 0;
      ty.value = 0;
      runOnJS(writeAxes)(0, 0);
    });

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  // Hide between runs so the splash demo's scripted input isn't
  // fighting an idle touch on the joystick area.
  if (runState !== 'playing') return null;

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.base}>
        <Animated.View style={[styles.knob, knobStyle]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    bottom: 40,
    left: 30,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});
