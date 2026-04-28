import React from 'react';
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

// Hold-to-look arrows. Use react-native-gesture-handler instead of
// Pressable so they coexist with the joystick's Pan gesture - with
// Pressable, the React Native responder system would lock movement
// while a look arrow was held. Gesture.LongPress with minDuration:0
// fires immediately on touch and cooperates with sibling gestures.
//
// Each arrow runs its own pressed-state shared value so we can scale
// it down briefly on press as a tactile cue (the joystick also picks
// up the touch but that's fine - the visual still reads).

const LOOK_YAW_DEG = 45;
const LOOK_YAW_RAD = (LOOK_YAW_DEG * Math.PI) / 180;
const ARROW_SIZE = 50;

function setYaw(v: number) {
  input.viewYaw = v;
}

function useLookButton(yaw: number) {
  const pressed = useSharedValue(0);
  const gesture = React.useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(0)
        .maxDistance(99999)
        .onStart(() => {
          'worklet';
          pressed.value = withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) });
          runOnJS(setYaw)(yaw);
        })
        .onFinalize(() => {
          'worklet';
          pressed.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) });
          runOnJS(setYaw)(0);
        }),
    [yaw, pressed],
  );
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.06 }],
    opacity: 1 - pressed.value * 0.15,
  }));
  return { gesture, style };
}

export function LookButtons() {
  const left = useLookButton(LOOK_YAW_RAD);
  const right = useLookButton(-LOOK_YAW_RAD);

  return (
    <>
      <GestureDetector gesture={left.gesture}>
        <Animated.View style={[styles.left, left.style]}>
          <Text style={styles.glyph}>‹</Text>
        </Animated.View>
      </GestureDetector>
      <GestureDetector gesture={right.gesture}>
        <Animated.View style={[styles.right, right.style]}>
          <Text style={styles.glyph}>›</Text>
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const baseBtn = {
  position: 'absolute' as const,
  bottom: 30,
  width: ARROW_SIZE,
  height: ARROW_SIZE,
  borderRadius: ARROW_SIZE / 2,
  backgroundColor: 'rgba(255, 255, 255, 0.10)',
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.20)',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

const styles = StyleSheet.create({
  right: {
    ...baseBtn,
    right: 63 + (78 - ARROW_SIZE) / 2,
  },
  left: {
    ...baseBtn,
    right: 63 + 78 + 14,
  },
  glyph: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 32,
    marginTop: -4,
  },
});
