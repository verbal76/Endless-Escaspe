import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { input } from '../../systems/InputSystem';

// Hold-to-look arrows. Press and hold the left arrow to swing the
// camera 45 deg to the left; release and the camera lerps back to
// straight-ahead. Same for right. Sit on the right edge above the
// stance buttons so the right thumb can reach them without
// occluding the action cluster.

const LOOK_YAW_DEG = 45;
const LOOK_YAW_RAD = (LOOK_YAW_DEG * Math.PI) / 180;

export function LookButtons() {
  return (
    <View pointerEvents="box-none" style={styles.row}>
      <Pressable
        onPressIn={() => {
          input.viewYaw = -LOOK_YAW_RAD;
        }}
        onPressOut={() => {
          input.viewYaw = 0;
        }}
        style={({ pressed }) => [styles.btn, pressed && styles.btnActive]}
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
        style={({ pressed }) => [styles.btn, pressed && styles.btnActive]}
      >
        <Text style={styles.glyph}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    right: 24,
    top: 84,
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.20)',
    alignItems: 'center',
    justifyContent: 'center',
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
