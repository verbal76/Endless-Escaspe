import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useStore } from '../../state/store';

// Shield-with-skull catch notification. Pops centred on the screen
// every time the player takes a hit (soft or run-ending) so the
// player sees what happened before the respawn / run-end transition.
//
// Triggered by `catchCounter` rather than runState so a soft hit
// (heart lost but the run continues) still fires - runState only
// flips to 'caught' on the run-ending hit and would skip the cue
// for the first two hits otherwise.
//
// Visual: a pseudo police-shield View with a large skull glyph and
// "ARRESTED" / "KILLED" label. Stylised via stacked rounded-rect
// pieces (RN has no SVG out of the box and we want zero new deps).

const HOLD_MS = 700;
const FADE_IN_MS = 140;
const FADE_OUT_MS = 240;

export function CatchFlash() {
  const catchCounter = useStore((s) => s.catchCounter);
  const lastDeathCause = useStore((s) => s.lastDeathCause);
  const opacity = useSharedValue(0);
  const pop = useSharedValue(0);

  useEffect(() => {
    // Skip the initial render (counter starts at 0; we don't want
    // a flash on first mount).
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

  const label =
    lastDeathCause === 'killed' ? 'KILLED' : 'ARRESTED';

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, wrapStyle]}>
      <View style={styles.shield}>
        <View style={styles.shieldInner}>
          <Text style={styles.skull}>💀</Text>
        </View>
        <View style={styles.shieldPoint} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
  );
}

const SHIELD_W = 130;
const SHIELD_H = 130;

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Shield silhouette: a rounded rectangle on top with a tapered
  // triangle point on the bottom. Two stacked Views since RN has no
  // clip-path. The point is a square rotated 45 degrees and clipped
  // by the inner card sitting over its top half.
  shield: {
    width: SHIELD_W,
    height: SHIELD_H + 30,
    alignItems: 'center',
  },
  shieldInner: {
    width: SHIELD_W,
    height: SHIELD_H,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
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
  shieldPoint: {
    position: 'absolute',
    top: SHIELD_H - 14,
    width: 80,
    height: 80,
    backgroundColor: 'rgba(180, 30, 30, 0.92)',
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderColor: 'rgba(255, 230, 230, 0.92)',
    transform: [{ rotate: '45deg' }],
  },
  skull: {
    fontSize: 76,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 6,
  },
  label: {
    marginTop: 26,
    color: '#ff5050',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 4,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowRadius: 4,
  },
});
