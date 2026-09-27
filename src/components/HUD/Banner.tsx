import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useStore } from '../../state/store';
import { color as ui, type as T, fonts } from '../../ui/theme';

const STAR_FILLED = '★';
const STAR_EMPTY = '☆';
const SKULL = '💀';

export function Banner() {
  const runState = useStore((s) => s.runState);
  const resetForSegment = useStore((s) => s.resetForSegment);
  const segmentSeed = useStore((s) => s.segmentSeed);
  const stats = useStore((s) => s.lastStats);
  const stage = useStore((s) => s.stage);
  const setRunState = useStore((s) => s.setRunState);
  const lastDeathCause = useStore((s) => s.lastDeathCause);
  // Look up the best for whichever stage the user JUST finished:
  // setStage was already advanced in handleWin, so the just-cleared
  // stage is one less than the current.
  const justClearedStage = Math.max(1, stage - 1);
  const bestForJustClearedStage = useStore(
    (s) => s.bestStars[justClearedStage] ?? 0,
  );

  // Card entry animation: scales up from 90% with a fade-in each
  // time runState transitions into a banner-visible state. After
  // the entry settles we kick off an idle bounce that loops while
  // the card is on screen, so the panel reads as alive rather than
  // a static modal.
  const t = useSharedValue(0);
  const bounce = useSharedValue(0);
  useEffect(() => {
    if (runState === 'caught' || runState === 'cleared') {
      t.value = 0;
      bounce.value = 0;
      t.value = withTiming(1, {
        duration: 320,
        easing: Easing.out(Easing.cubic),
      });
      // Idle hover starts after the entry animation is well underway.
      // 0 -> 1 -> 0 ping-pongs scale + Y so the card breathes.
      bounce.value = withDelay(
        260,
        withRepeat(
          withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
          -1,
          true,
        ),
      );
    } else {
      cancelAnimation(bounce);
      bounce.value = 0;
    }
  }, [runState, t, bounce]);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [
      { translateY: -bounce.value * 5 },
      { scale: (0.9 + 0.1 * t.value) * (1 + 0.012 * bounce.value) },
    ],
  }));

  // Idle (initial app launch) is handled by StartScreen now; the
  // Banner only renders the post-run states ('caught' / 'cleared').
  if (runState === 'playing' || runState === 'idle') return null;

  const isCleared = runState === 'cleared';
  const title = isCleared
    ? 'YOU MADE IT!'
    : lastDeathCause === 'killed'
      ? 'KILLED'
      : 'ARRESTED';

  const stars = isCleared && stats ? Math.max(1, Math.min(3, stats.stars)) : 0;
  // Death panel skull count = lives used in this run, capped at 3 so
  // the row never overflows the card. Falls back to 3 if stats are
  // missing for any reason (older saves, mid-rebuild edge case).
  const skullCount = !isCleared
    ? Math.max(1, Math.min(3, stats?.livesUsed ?? 3))
    : 0;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Animated.View
        style={[
          styles.card,
          isCleared ? styles.cardCleared : styles.cardCaught,
          cardStyle,
        ]}
      >
        <Text style={[styles.title, isCleared ? styles.titleCleared : styles.titleCaught]}>
          {title}
        </Text>

        {isCleared ? (
          <Text style={styles.stars}>
            {STAR_FILLED.repeat(stars) + STAR_EMPTY.repeat(3 - stars)}
          </Text>
        ) : (
          // Death panel mirrors the win panel: same card width, same
          // entry animation, same stats block - just skulls in place
          // of stars and a red-themed border + button.
          <Text style={styles.skulls}>
            {SKULL.repeat(skullCount)}
          </Text>
        )}

        {isCleared && (
          <Text style={styles.bestLine}>
            Stage {justClearedStage} best:{' '}
            {bestForJustClearedStage > 0
              ? STAR_FILLED.repeat(bestForJustClearedStage) +
                STAR_EMPTY.repeat(3 - bestForJustClearedStage)
              : '—'}
          </Text>
        )}

        {stats && (
          <View style={styles.statBlock}>
            <StatRow index={0} label="Times spotted" value={String(stats.timesSeen)} />
            <StatRow
              index={1}
              label="Time detected"
              value={`${stats.timeDetected.toFixed(1)}s`}
            />
            <StatRow
              index={2}
              label="Run time"
              value={`${stats.runDurationS.toFixed(1)}s`}
            />
            <StatRow index={3} label="Lives used" value={String(stats.livesUsed)} />
          </View>
        )}

        {isCleared ? (
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnDown]}
            onPress={() => resetForSegment(segmentSeed + 1)}
          >
            <Text style={styles.btnLabel}>NEXT SEGMENT</Text>
          </Pressable>
        ) : (
          // Caught panel: send the player back to the start screen
          // when they're ready. No auto-dismiss - the user wanted to
          // dwell on the death summary the same way they dwell on a
          // win.
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnDeath, pressed && styles.btnDeathDown]}
            onPress={() => setRunState('idle')}
          >
            <Text style={[styles.btnLabel, styles.btnLabelDeath]}>MAIN MENU</Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

// Each row fades + slides in with a stagger keyed off its index, so
// the four-row stat block reads as a flow rather than a wall of
// numbers landing at once. The card-entry animation finishes around
// 320ms; the first row starts ~280ms in and each subsequent row
// follows 70ms later.
function StatRow({ index, label, value }: { index: number; label: string; value: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withDelay(
      280 + index * 70,
      withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }),
    );
  }, [t, index]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: (1 - t.value) * 6 }],
  }));
  return (
    <Animated.View style={[styles.statRow, style]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: 'rgba(20, 24, 32, 0.92)',
    borderRadius: 18,
    borderWidth: 2,
    padding: 22,
    minWidth: 320,
    alignItems: 'center',
  },
  cardCleared: {
    borderColor: 'rgba(255, 209, 74, 0.55)',
  },
  cardCaught: {
    borderColor: 'rgba(255, 80, 80, 0.65)',
  },
  title: {
    fontSize: 28,
    fontFamily: fonts.display,
    letterSpacing: 2,
    marginBottom: 14,
    textAlign: 'center',
  },
  titleCleared: {
    color: ui.gold,
  },
  titleCaught: {
    color: ui.danger,
  },
  stars: {
    color: ui.gold,
    fontSize: T.display,
    letterSpacing: 6,
    marginBottom: 4,
  },
  skulls: {
    color: ui.danger,
    fontSize: T.display,
    letterSpacing: 6,
    marginBottom: 14,
  },
  bestLine: {
    color: ui.textMuted,
    fontSize: T.small,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  statBlock: {
    width: 260,
    marginBottom: 18,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  statLabel: {
    color: ui.textMuted,
    fontSize: T.small,
  },
  statValue: {
    color: '#fff',
    fontSize: T.small,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  btn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 209, 74, 0.85)',
  },
  btnDown: {
    backgroundColor: 'rgba(255, 209, 74, 0.95)',
  },
  btnLabel: {
    color: '#1b1b1b',
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: T.label,
  },
  // Death panel button: red theme to match the cardCaught border so
  // the call-to-action reads as a "leave" rather than an "advance".
  btnDeath: {
    backgroundColor: 'rgba(255, 80, 80, 0.85)',
  },
  btnDeathDown: {
    backgroundColor: 'rgba(220, 50, 50, 0.95)',
  },
  btnLabelDeath: {
    color: '#1b1b1b',
  },
});
