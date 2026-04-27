import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { input } from '../../systems/InputSystem';
import type { Stance } from '../../types/world';

// Four buttons total. CRAWL / CROUCH / WALK are mutually exclusive
// stance radios; RUN is an independent speed-toggle that doubles
// whatever stance speed is active. RUN works in every stance ("you
// can crawl-run, it's just crawling faster").

const STANCES: Array<{ label: string; value: Stance }> = [
  { label: 'CRAWL', value: 'crawl' },
  { label: 'CROUCH', value: 'crouch' },
  { label: 'WALK', value: 'walk' },
];

export function ActionButtons() {
  const [stance, setStance] = useState<Stance>('walk');
  const [running, setRunning] = useState(false);

  const pickStance = (s: Stance) => {
    input.stance = s;
    setStance(s);
  };

  const toggleRun = () => {
    const next = !running;
    input.run = next;
    setRunning(next);
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
      <Pressable
        onPress={toggleRun}
        style={[styles.btn, styles.runBtn, running && styles.runBtnActive]}
      >
        <Text style={[styles.label, running && styles.runLabelActive]}>RUN</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  col: {
    position: 'absolute',
    right: 24,
    bottom: 30,
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
  // Visually separated so it reads as "speed", not "another stance".
  runBtn: {
    marginTop: 6,
    backgroundColor: 'rgba(120,200,255,0.10)',
    borderColor: 'rgba(120,200,255,0.30)',
  },
  runBtnActive: {
    backgroundColor: 'rgba(120,200,255,0.45)',
    borderColor: 'rgba(140,220,255,0.85)',
  },
  label: {
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '700',
    letterSpacing: 0.5,
    fontSize: 13,
  },
  runLabelActive: {
    color: '#dff4ff',
  },
});
