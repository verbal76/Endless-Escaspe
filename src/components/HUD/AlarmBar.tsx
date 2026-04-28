import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from '../../state/store';
import { cameraCountFor } from '../../scenes/Camera';

// Top-of-screen yard-alarm bar fed by the segment's security
// cameras. Filling the bar summons an extra patrol; staying out of
// camera cones drains it. Hidden at stages with no cameras.
export function AlarmBar() {
  const alarmLevel = useStore((s) => s.alarmLevel);
  const stage = useStore((s) => s.stage);
  const runState = useStore((s) => s.runState);
  if (cameraCountFor(stage) === 0) return null;
  if (runState !== 'playing') return null;
  const pct = Math.max(0, Math.min(1, alarmLevel));
  const isHigh = pct >= 0.6;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <Text style={[styles.label, isHigh && styles.labelHot]}>YARD ALARM</Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${pct * 100}%` },
            isHigh && styles.fillHot,
            pct >= 1 && styles.fillFull,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    width: 220,
    alignItems: 'center',
  },
  label: {
    color: 'rgba(255, 200, 200, 0.85)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 3,
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowRadius: 2,
  },
  labelHot: {
    color: '#ff6060',
  },
  track: {
    width: '100%',
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 100, 100, 0.4)',
  },
  fill: {
    height: '100%',
    backgroundColor: 'rgba(255, 140, 60, 0.8)',
  },
  fillHot: {
    backgroundColor: 'rgba(255, 80, 60, 0.9)',
  },
  fillFull: {
    backgroundColor: '#ff3030',
  },
});
