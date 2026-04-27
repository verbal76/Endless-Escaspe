import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from '../../state/store';

// Shown whenever the player is in the crawl/prone stance, irrespective
// of cover. Communicates posture, not stealth-state.
export function HiddenBadge() {
  const stance = useStore((s) => s.stance);
  if (stance !== 'crawl') return null;
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Text style={styles.label}>PRONE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(40, 90, 60, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(150, 240, 180, 0.7)',
  },
  label: {
    color: '#caffd6',
    fontWeight: '800',
    letterSpacing: 1.5,
    fontSize: 13,
  },
});
