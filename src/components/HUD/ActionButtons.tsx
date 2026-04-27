import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { input } from '../../systems/InputSystem';
import type { Stance } from '../../types/world';

// Stance picker only. RUN is its own component (RunButton) sitting
// near the joystick on the left side of the screen.

const STANCES: Array<{ label: string; value: Stance }> = [
  { label: 'CROUCH', value: 'crouch' },
  { label: 'WALK', value: 'walk' },
];

export function ActionButtons() {
  const [stance, setStance] = useState<Stance>('walk');

  const pickStance = (s: Stance) => {
    input.stance = s;
    setStance(s);
  };

  return (
    <View style={styles.col}>
      {STANCES.map((s) => (
        <Pressable
          key={s.value}
          onPress={() => pickStance(s.value)}
          style={[styles.btn, stance === s.value && styles.btnActive]}
        >
          <Text style={styles.label}>{s.label}</Text>
        </Pressable>
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
