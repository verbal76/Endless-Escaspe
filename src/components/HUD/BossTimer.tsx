import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../state/store';
import { color as ui, type as T, fonts } from '../../ui/theme';

// Survive-the-timer countdown for boss-arena segments. Centred
// near the top of the screen (just below the AlarmBar's natural
// position) so the player can read it at a glance. Hidden when
// store.bossTimeRemaining is 0 / out of an arena, or when the
// game isn't actively playing.

export function BossTimer() {
  const remaining = useStore((s) => s.bossTimeRemaining);
  const runState = useStore((s) => s.runState);
  const insets = useSafeAreaInsets();
  if (remaining <= 0) return null;
  if (runState !== 'playing') return null;

  // Tighten + recolour on the final 10 seconds so the HUD shouts
  // the deadline.
  const urgent = remaining <= 10;
  return (
    <View
      style={[styles.wrap, { top: Math.max(64, insets.top + 48) }]}
      pointerEvents="none"
    >
      <Text style={[styles.label, urgent && styles.labelUrgent]}>SURVIVE</Text>
      <Text style={[styles.value, urgent && styles.valueUrgent]}>
        {remaining}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
  },
  label: {
    color: 'rgba(255, 220, 90, 0.85)',
    fontSize: T.caption,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowRadius: 3,
  },
  labelUrgent: {
    color: ui.danger,
  },
  value: {
    color: ui.gold,
    fontSize: T.heading,
    fontFamily: fonts.display,
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowRadius: 4,
  },
  valueUrgent: {
    color: ui.danger,
  },
});
