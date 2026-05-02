import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../state/store';
import { startingHeartsFor } from '../../util/progression';

const FILLED_GLYPH = '♥';
const EMPTY_GLYPH = '♡';
const FILLED_COLOR = '#ff5577';
const EMPTY_COLOR = 'rgba(255,255,255,0.3)';

// Single heart slot. Animates between filled and empty: when its
// `alive` flips from true to false, it briefly pulses to ~140% scale
// while fading to the empty colour. The alive=true entry path is a
// quick 200ms ease-in (used when a segment refills the bar).
function HeartSlot({ alive }: { alive: boolean }) {
  const scale = useSharedValue(1);
  const fill = useSharedValue(alive ? 1 : 0);

  useEffect(() => {
    if (alive) {
      // Re-fill: snap to filled colour with a small bounce.
      fill.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
      scale.value = withSequence(
        withTiming(1.15, { duration: 120, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 120, easing: Easing.in(Easing.quad) }),
      );
    } else {
      // Heart lost: pulse outward then fade colour.
      fill.value = withTiming(0, { duration: 360, easing: Easing.in(Easing.quad) });
      scale.value = withSequence(
        withTiming(1.4, { duration: 160, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 220, easing: Easing.in(Easing.quad) }),
      );
    }
  }, [alive, scale, fill]);

  // Cross-fade two glyphs so we never pop characters mid-frame.
  const filledStyle = useAnimatedStyle(() => ({
    opacity: fill.value,
    transform: [{ scale: scale.value }],
  }));
  const emptyStyle = useAnimatedStyle(() => ({
    opacity: 1 - fill.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.slot}>
      <Animated.Text style={[styles.heart, styles.filled, filledStyle]}>
        {FILLED_GLYPH}
      </Animated.Text>
      <Animated.Text style={[styles.heart, styles.empty, emptyStyle]}>
        {EMPTY_GLYPH}
      </Animated.Text>
    </View>
  );
}

export function Hearts() {
  const hearts = useStore((s) => s.hearts);
  const stage = useStore((s) => s.stage);
  const runState = useStore((s) => s.runState);
  const insets = useSafeAreaInsets();
  // Late stages start the player with fewer hearts; only render
  // that many slots so the HUD doesn't lie about how much margin
  // is left.
  const max = startingHeartsFor(stage);
  // Hidden between runs (idle / cleared / caught) so the start
  // screen doesn't carry a stale heart count over the title art.
  if (runState !== 'playing') return null;
  // Hearts now stack BELOW the settings gear (which sits at the
  // top of the screen). The gear is ~36 tall at top floor 24, so
  // the heart row's top floor lands at 64 with a small breathing
  // gap. The big top minimum still clears curved-display masks on
  // devices that hide the status bar (insets.top reports 0).
  const top = Math.max(64, insets.top + 52);
  const left = Math.max(16, insets.left + 12);
  return (
    <View style={[styles.row, { top, left }]}>
      {Array.from({ length: max }).map((_, i) => (
        <HeartSlot key={i} alive={i < hearts} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 6,
    // Explicit visible overflow so the rightmost slot's glyph + text
    // shadow never clip against the row's intrinsic width on devices
    // that default the row to a hidden overflow.
    overflow: 'visible',
  },
  slot: {
    // Slot widened from 32 -> 40 so the glyph + 3px text-shadow halo
    // fits comfortably even when the font's heart glyph reports an
    // advance width >28px (seen on some Android system fonts).
    width: 40,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  heart: {
    fontSize: 28,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  filled: {
    color: FILLED_COLOR,
  },
  empty: {
    color: EMPTY_COLOR,
  },
});
