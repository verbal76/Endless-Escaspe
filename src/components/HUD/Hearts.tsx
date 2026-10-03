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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../state/store';
import { startingHeartsFor } from '../../util/progression';
import { color as ui, type as T } from '../../ui/theme';
import { heartsFrame } from '../../ui/hudLayout';

const FILLED_COLOR = ui.danger;
const EMPTY_COLOR = 'rgba(255,255,255,0.28)';
const OUTLINE = 'rgba(0,0,0,0.65)';

// Heart drawn from Views (a square turned 45 deg plus two circles for
// the lobes), so it looks the same on every phone - the ♥ / ♡ font
// glyphs varied by device font. A slightly larger dark copy behind it
// is the outline.
function HeartShape({ size, color }: { size: number; color: string }) {
  const sq = size * 0.62;
  const lobe = sq;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          width: sq,
          height: sq,
          left: (size - sq) / 2,
          top: size * 0.3,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: lobe,
          height: lobe,
          borderRadius: lobe / 2,
          left: size / 2 - lobe * 0.9,
          top: size * 0.08,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: lobe,
          height: lobe,
          borderRadius: lobe / 2,
          left: size / 2 - lobe * 0.1,
          top: size * 0.08,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function OutlinedHeart({ color }: { color: string }) {
  return (
    <View style={styles.heartBox}>
      <View style={styles.heartOutline}>
        <HeartShape size={HEART + 4} color={OUTLINE} />
      </View>
      <View style={styles.heartFill}>
        <HeartShape size={HEART} color={color} />
      </View>
    </View>
  );
}

const HEART = 22;

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

  // Cross-fade the filled and empty hearts.
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
      <Animated.View style={[styles.heart, filledStyle]}>
        <OutlinedHeart color={FILLED_COLOR} />
      </Animated.View>
      <Animated.View style={[styles.heart, emptyStyle]}>
        <OutlinedHeart color={EMPTY_COLOR} />
      </Animated.View>
    </View>
  );
}

export function Hearts() {
  const hearts = useStore((s) => s.hearts);
  const stage = useStore((s) => s.stage);
  const campaign = useStore((s) => s.gameMode === 'campaign');
  const runState = useStore((s) => s.runState);
  // Boss-perk active: +1 heart for the next perkRemainingStages
  // stages. The HUD renders an extra slot so the bonus heart is
  // visible in the row, plus a small "BOSS PERK Nx" tag underneath
  // showing how many stages remain on the buff.
  const perkRemainingStages = useStore((s) => s.perkRemainingStages);
  const insets = useSafeAreaInsets();
  // Late stages start the player with fewer hearts; only render
  // that many slots so the HUD doesn't lie about how much margin
  // is left.
  // Endless / Daily runs always start with stage-1 hearts and no boss
  // perk. Never show fewer slots than hearts actually held (a perk
  // heart granted on the last perk stage outlives the counter).
  const baseMax = startingHeartsFor(campaign ? stage : 1);
  const max = Math.max(hearts, baseMax + (campaign && perkRemainingStages > 0 ? 1 : 0));
  // Hidden between runs (idle / cleared / caught) so the start
  // screen doesn't carry a stale heart count over the title art.
  if (runState !== 'playing') return null;
  // Hearts now stack BELOW the settings gear (which sits at the
  // top of the screen). The gear is ~36 tall at top floor 24, so
  // the heart row's top floor lands at 64 with a small breathing
  // gap. The big top minimum still clears curved-display masks on
  // devices that hide the status bar (insets.top reports 0).
  const { top, left } = heartsFrame(insets);
  return (
    <View style={[{ top, left }, styles.wrap]}>
      <View style={styles.row}>
        {Array.from({ length: max }).map((_, i) => (
          <HeartSlot key={i} alive={i < hearts} />
        ))}
      </View>
      {campaign && perkRemainingStages > 0 && (
        <Text style={styles.perkTag}>
          BOSS PERK · {perkRemainingStages}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
  },
  perkTag: {
    marginTop: 2,
    color: ui.gold,
    fontSize: T.caption,
    fontWeight: '900',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 3,
  },
  row: {
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
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartBox: {
    width: HEART + 4,
    height: HEART + 4,
  },
  heartOutline: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  heartFill: {
    position: 'absolute',
    left: 2,
    top: 2,
  },
});
