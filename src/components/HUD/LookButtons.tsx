import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { input } from '../../systems/InputSystem';

// Hold-to-look arrows. Use react-native-gesture-handler instead of
// Pressable so they coexist with the joystick's Pan gesture - with
// Pressable, the React Native responder system would lock movement
// while a look arrow was held. Gesture.LongPress with minDuration:0
// fires immediately on touch and cooperates with sibling gestures.

const LOOK_YAW_DEG = 45;
const LOOK_YAW_RAD = (LOOK_YAW_DEG * Math.PI) / 180;
const ARROW_SIZE = 50;

function setYaw(v: number) {
  input.viewYaw = v;
}

export function LookButtons() {
  const leftGesture = React.useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(0)
        .maxDistance(99999)
        .onStart(() => {
          'worklet';
          runOnJS(setYaw)(LOOK_YAW_RAD);
        })
        .onFinalize(() => {
          'worklet';
          runOnJS(setYaw)(0);
        }),
    [],
  );

  const rightGesture = React.useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(0)
        .maxDistance(99999)
        .onStart(() => {
          'worklet';
          runOnJS(setYaw)(-LOOK_YAW_RAD);
        })
        .onFinalize(() => {
          'worklet';
          runOnJS(setYaw)(0);
        }),
    [],
  );

  return (
    <>
      <GestureDetector gesture={leftGesture}>
        <View style={styles.left}>
          <Text style={styles.glyph}>‹</Text>
        </View>
      </GestureDetector>
      <GestureDetector gesture={rightGesture}>
        <View style={styles.right}>
          <Text style={styles.glyph}>›</Text>
        </View>
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
