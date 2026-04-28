import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { input } from '../../systems/InputSystem';

// RUN is a speed-toggle that doubles whatever stance speed is active.
// Placed up-and-left of the joystick so the player's left thumb can
// reach it without their eye leaving the action.
export function RunButton() {
  const [running, setRunning] = useState(false);

  const toggle = () => {
    const next = !running;
    input.run = next;
    setRunning(next);
  };

  return (
    <Pressable
      onPress={toggle}
      hitSlop={8}
      style={[styles.btn, running && styles.btnActive]}
    >
      <Text style={[styles.label, running && styles.labelActive]}>RUN</Text>
    </Pressable>
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
