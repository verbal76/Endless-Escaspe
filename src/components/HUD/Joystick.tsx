import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { applyDeadZone, input } from '../../systems/InputSystem';
import { useStore } from '../../state/store';

const SIZE = 130;
const KNOB = 56;
const RADIUS = SIZE / 2 - KNOB / 2;
// Resting spot for the stick when no thumb is down (also where the
// faint hint ring sits so new players know where to touch).
const REST_X = 30 + SIZE / 2;
const REST_BOTTOM = 40 + SIZE / 2;

const writeAxes = (x: number, y: number) => {
  const v = applyDeadZone(x, y);
  input.axisX = v.x;
  input.axisY = v.y;
};

// Floating joystick: the stick's centre appears wherever the left
// thumb first lands inside the movement zone (left ~42% of the screen,
// below the top HUD strip) and the knob follows from there. Lifting
// the thumb returns it to its faint resting position.
export function Joystick() {
  const runState = useStore((s) => s.runState);
  // Stick centre in zone-local coordinates.
  const cx = useSharedValue(0);
  const cy = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const active = useSharedValue(0);
  const zoneH = useSharedValue(0);

  const gesture = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      cx.value = e.x;
      cy.value = e.y;
      tx.value = 0;
      ty.value = 0;
      active.value = withTiming(1, { duration: 90 });
    })
    .onChange((e) => {
      const dx = e.translationX;
      const dy = e.translationY;
      const len = Math.hypot(dx, dy);
      const cl = len > RADIUS ? RADIUS / len : 1;
      const kx = dx * cl;
      const ky = dy * cl;
      tx.value = kx;
      ty.value = ky;
      runOnJS(writeAxes)(kx / RADIUS, -ky / RADIUS);
    })
    .onFinalize(() => {
      tx.value = 0;
      ty.value = 0;
      active.value = withTiming(0, { duration: 160 });
      runOnJS(writeAxes)(0, 0);
    });

  const baseStyle = useAnimatedStyle(() => {
    const restX = REST_X;
    const restY = zoneH.value - REST_BOTTOM;
    const x = active.value > 0 ? cx.value : restX;
    const y = active.value > 0 ? cy.value : restY;
    return {
      opacity: 0.35 + 0.65 * active.value,
      transform: [{ translateX: x - SIZE / 2 }, { translateY: y - SIZE / 2 }],
    };
  });
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  if (runState !== 'playing') return null;

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.zone}
        onLayout={(ev) => {
          zoneH.value = ev.nativeEvent.layout.height;
        }}
      >
        <Animated.View pointerEvents="none" style={[styles.base, baseStyle]}>
          <View style={styles.deadZone} />
          <Animated.View style={[styles.knob, knobStyle]} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  zone: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: '42%',
    top: '28%',
  },
  base: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deadZone: {
    position: 'absolute',
    width: SIZE * 0.3,
    height: SIZE * 0.3,
    borderRadius: SIZE * 0.15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});
