import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { input } from '../../systems/InputSystem';

// Hold-to-look arrows. Press and hold the left arrow to swing the
// camera 45 deg to the left; release and the camera lerps back to
// straight-ahead. Same for right.
//
// Layout (per user feedback): RIGHT arrow sits directly under the
// stance-button stack, which lives at right:63 with 78px-wide
// buttons. The LEFT arrow sits a little further to the left of
// the stack (further from the screen edge) at the same vertical
// position. Both buttons are below the stack, in the bottom-right
// corner of the HUD.
//
// The stance stack starts at bottom:100 (pushed up to make room),
// so the look-arrow row sits at bottom:30 directly underneath.

const LOOK_YAW_DEG = 45;
const LOOK_YAW_RAD = (LOOK_YAW_DEG * Math.PI) / 180;
const ARROW_SIZE = 50;

export function LookButtons() {
  return (
    <>
      <Pressable
        onPressIn={() => {
          input.viewYaw = -LOOK_YAW_RAD;
        }}
        onPressOut={() => {
          input.viewYaw = 0;
        }}
        style={({ pressed }) => [styles.left, pressed && styles.btnActive]}
      >
        <Text style={styles.glyph}>‹</Text>
      </Pressable>
      <Pressable
        onPressIn={() => {
          input.viewYaw = LOOK_YAW_RAD;
        }}
        onPressOut={() => {
          input.viewYaw = 0;
        }}
        style={({ pressed }) => [styles.right, pressed && styles.btnActive]}
      >
        <Text style={styles.glyph}>›</Text>
      </Pressable>
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
  // Right arrow: directly below the stance stack (stack right edge at
  // right:63, 78px wide -> centred under the column at right:77).
  right: {
    ...baseBtn,
    right: 63 + (78 - ARROW_SIZE) / 2,
  },
  // Left arrow: a little to the left of the stack, same vertical row.
  left: {
    ...baseBtn,
    right: 63 + 78 + 14,
  },
  btnActive: {
    backgroundColor: 'rgba(120, 200, 255, 0.45)',
    borderColor: 'rgba(140, 220, 255, 0.85)',
  },
  glyph: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 32,
    marginTop: -4,
  },
});
