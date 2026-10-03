import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useStore } from '../../state/store';
import { SkullIcon } from '../../ui/icons';
import { color as ui, type as T, fonts } from '../../ui/theme';

// Catch notification: a red badge that pops centred on the screen
// every time the player takes a hit (soft or run-ending). Triggered
// by `catchCounter` rather than runState so a soft hit (heart lost
// but the run continues) still fires.
//
// Iconography:
//   ARRESTED -> handcuffs glyph (built from Views since there's no
//               handcuffs Unicode emoji in widely-deployed fonts)
//   KILLED   -> skull emoji

const HOLD_MS = 700;
const FADE_IN_MS = 140;
const FADE_OUT_MS = 240;

export function CatchFlash() {
  const catchCounter = useStore((s) => s.catchCounter);
  const lastDeathCause = useStore((s) => s.lastDeathCause);
  const opacity = useSharedValue(0);
  const pop = useSharedValue(0);

  useEffect(() => {
    if (catchCounter === 0) return;
    opacity.value = 0;
    pop.value = 0;
    opacity.value = withSequence(
      withTiming(1, { duration: FADE_IN_MS, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: HOLD_MS }),
      withTiming(0, { duration: FADE_OUT_MS, easing: Easing.in(Easing.cubic) }),
    );
    pop.value = withSequence(
      withTiming(1, { duration: FADE_IN_MS, easing: Easing.out(Easing.back(1.6)) }),
      withTiming(1, { duration: HOLD_MS }),
      withTiming(0.7, { duration: FADE_OUT_MS, easing: Easing.in(Easing.cubic) }),
    );
  }, [catchCounter, opacity, pop]);

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: 0.8 + 0.25 * pop.value }],
  }));

  const isArrested = lastDeathCause !== 'killed';
  const label = isArrested ? 'ARRESTED' : 'KILLED';

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, wrapStyle]}>
      <View style={styles.badge}>
        {isArrested ? <Handcuffs /> : <SkullIcon size={64} />}
      </View>
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
  );
}

// Handcuffs glyph: two hollow rings joined by a short bar. Pure
// Views so the symbol scales crisply at any badge size and we don't
// rely on a handcuffs emoji (no widely-deployed font ships one).
function Handcuffs() {
  return (
    <View style={styles.handcuffs}>
      <View style={styles.cuffRing} />
      <View style={styles.cuffBar} />
      <View style={styles.cuffRing} />
    </View>
  );
}

const BADGE_W = 130;
const BADGE_H = 130;
const RING = 46;
const RING_BORDER = 7;
const BAR_W = 18;
const BAR_H = 8;

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Single rounded-rect badge; the shield-point that used to live
  // underneath was removed - the badge itself is enough silhouette
  // and the prior point read as a stray diamond floating below.
  badge: {
    width: BADGE_W,
    height: BADGE_H,
    borderRadius: 22,
    backgroundColor: 'rgba(180, 30, 30, 0.92)',
    borderWidth: 3,
    borderColor: 'rgba(255, 230, 230, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  handcuffs: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cuffRing: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: RING_BORDER,
    borderColor: '#fff',
    backgroundColor: 'transparent',
  },
  cuffBar: {
    width: BAR_W,
    height: BAR_H,
    backgroundColor: '#fff',
    marginHorizontal: -2, // overlap rings slightly so the bar reads
                          // as joined to them rather than floating.
  },
  label: {
    marginTop: 22,
    color: ui.danger,
    fontSize: T.heading,
    fontFamily: fonts.display,
    letterSpacing: 4,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowRadius: 4,
  },
});
