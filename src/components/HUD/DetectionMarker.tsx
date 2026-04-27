import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useStore } from '../../state/store';

// One bar showing the highest detection across all guards. Multi-guard
// scenarios use the max so the player gets a single, unambiguous
// "how alarmed is the most alarmed guard" reading.
export function DetectionMarker() {
  const v = useStore((s) => {
    let max = 0;
    for (const k in s.detection) {
      const x = s.detection[k];
      if (x > max) max = x;
    }
    return max;
  });
  const pct = Math.round(v * 100);
  const color = v > 0.85 ? '#ff4444' : v > 0.5 ? '#ffaa33' : '#ffd14a';

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 50,
    right: 24,
    width: 160,
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
});
