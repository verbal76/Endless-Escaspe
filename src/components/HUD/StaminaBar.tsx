import React from 'react';
import { StyleSheet, View } from 'react-native';
import { selectRuleLevel, useStore } from '../../state/store';
import { staminaEnabledFor } from '../../util/progression';

// Bottom-left stamina bar. Only visible at stages where stamina
// gates running; full / empty values are pulled from the store
// (Game.tsx mirrors player.stamina onto store.stamina each frame).
export function StaminaBar() {
  const stamina = useStore((s) => s.stamina);
  const stage = useStore(selectRuleLevel);
  const runState = useStore((s) => s.runState);
  if (!staminaEnabledFor(stage)) return null;
  if (runState !== 'playing') return null;
  const pct = Math.max(0, Math.min(1, stamina));
  const empty = pct < 0.05;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${pct * 100}%` },
            empty && styles.fillEmpty,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 16,
    left: 24,
    width: 120,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.45)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  fill: {
    height: '100%',
    backgroundColor: 'rgba(120, 220, 160, 0.85)',
  },
  fillEmpty: {
    backgroundColor: 'rgba(255, 120, 120, 0.85)',
  },
});
