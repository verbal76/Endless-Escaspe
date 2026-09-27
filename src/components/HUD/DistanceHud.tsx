import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from '../../state/store';
import { color as ui, fonts, type as T } from '../../ui/theme';

// Endless / Daily: distance and current level, top centre.
export function DistanceHud() {
  const mode = useStore((s) => s.gameMode);
  const runState = useStore((s) => s.runState);
  const distance = useStore((s) => s.distanceM);
  const level = useStore((s) => s.endlessLevel);
  const day = useStore((s) => s.dailyDay);
  if (mode === 'campaign' || runState !== 'playing') return null;
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Text style={styles.distance}>{distance} m</Text>
      <Text style={styles.sub}>
        {mode === 'daily' ? `DAILY ${day ?? ''} • ` : ''}LEVEL {level}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: ui.panelSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  distance: {
    color: ui.gold,
    fontSize: T.title,
    fontFamily: fonts.display,
  },
  sub: {
    color: ui.textMuted,
    fontSize: T.caption,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
