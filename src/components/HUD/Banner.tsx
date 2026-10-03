import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { buttonFill, buttonLabel, buttonPressed, color as ui, type as T, fonts } from '../../ui/theme';

import { STAT_DETECTED_3, STAT_TIMES_3 } from '../../util/scoring';
import { SkullIcon } from '../../ui/icons';
import { dailyRunAgainDay, dailySeed } from '../../util/daily';

const STAR_FILLED = '★';
const STAR_EMPTY = '☆';

export function Banner() {
  const runState = useStore((s) => s.runState);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardMaxHeight = windowHeight - Math.max(insets.top, 8) - Math.max(insets.bottom, 8) - 12;
  // Short landscape phones (< 400 dp tall): tighter spacing so the
  // whole card, button included, fits without scrolling.
  const compact = windowHeight < 400;
  const resetForSegment = useStore((s) => s.resetForSegment);
  const segmentSeed = useStore((s) => s.segmentSeed);
  const stats = useStore((s) => s.lastStats);
  const stage = useStore((s) => s.stage);
  const setRunState = useStore((s) => s.setRunState);
  const lastDeathCause = useStore((s) => s.lastDeathCause);
  const summary = useStore((s) => s.runSummary);
  const requestRestart = useStore((s) => s.requestRestart);
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
  const endlessRun = !!summary && summary.mode !== 'campaign' && !isCleared;
  const title = endlessRun
    ? summary!.mode === 'daily'
      ? 'DAILY RUN OVER'
      : 'RUN OVER'
    : isCleared
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
          // Never taller than the visible screen: on 360 dp-tall phones
          // the full stats card (~370 dp) clipped top and bottom; it
          // now scrolls inside instead.
          { maxHeight: cardMaxHeight },
          cardStyle,
        ]}
      >
        <ScrollView style={styles.cardScroll} contentContainerStyle={styles.cardContent} bounces={false}>
        <Text style={[styles.title, isCleared ? styles.titleCleared : styles.titleCaught, compact && styles.titleCompact]}>
          {title}
        </Text>

        {endlessRun ? (
          <Text style={styles.distance}>{summary!.distanceM} m</Text>
        ) : isCleared ? (
          <Text style={[styles.stars, compact && styles.starsCompact]}>
            {STAR_FILLED.repeat(stars) + STAR_EMPTY.repeat(3 - stars)}
          </Text>
        ) : (
          // Death panel mirrors the win panel: same card width, same
          // entry animation, same stats block - just skulls in place
          // of stars and a red-themed border + button.
          <View style={[styles.skullRow, compact && styles.skullRowCompact]}>
            {Array.from({ length: skullCount }).map((_, i) => (
              <SkullIcon key={i} size={compact ? 26 : 34} color={ui.danger} />
            ))}
          </View>
        )}

        {isCleared && (
          <Text style={[styles.bestLine, compact && styles.bestLineCompact]}>
            Stage {justClearedStage} best:{' '}
            {bestForJustClearedStage > 0
              ? STAR_FILLED.repeat(bestForJustClearedStage) +
                STAR_EMPTY.repeat(3 - bestForJustClearedStage)
              : '—'}
          </Text>
        )}

        {endlessRun ? (
          <View style={[styles.statBlock, compact && styles.statBlockCompact]}>
            <StatRow compact={compact} index={0} label={summary!.mode === 'daily' ? `Best today (${summary!.day})` : 'Best distance'} value={`${summary!.bestM} m`} />
            <StatRow compact={compact} index={1} label="Coins earned" value={`+${summary!.coinsEarned}`} />
            <StatRow compact={compact} index={2} label="Coins" value={String(summary!.coinsTotal)} />
            <StatRow compact={compact} index={3} label="Lives used" value={String(stats?.livesUsed ?? 0)} />
          </View>
        ) : stats && (
          <View style={[styles.statBlock, compact && styles.statBlockCompact]}>
            {/* Each row shows its full-marks target, so players can see
                what the stars ask for (scoring.ts). */}
            <StatRow compact={compact} index={0} label="Times spotted" value={String(stats.timesSeen)} target={`${STAR_FILLED} ${STAT_TIMES_3}`} />
            <StatRow compact={compact}
              index={1}
              label="Time detected"
              value={`${stats.timeDetected.toFixed(1)}s`}
              target={`${STAR_FILLED} ≤ ${STAT_DETECTED_3}s`}
            />
            <StatRow compact={compact}
              index={2}
              label="Run time"
              value={`${stats.runDurationS.toFixed(1)}s`}
              target={stats.timeTarget3 ? `${STAR_FILLED} ≤ ${stats.timeTarget3}s` : undefined}
            />
            <StatRow compact={compact} index={3} label="Lives used" value={String(stats.livesUsed)} target={`${STAR_FILLED} 0`} />
            {isCleared && summary ? (
              <StatRow compact={compact} index={4} label="Coins earned" value={`+${summary.coinsEarned} · total ${summary.coinsTotal}`} />
            ) : null}
          </View>
        )}

        {endlessRun ? (
          <View style={styles.btnRow}>
            <Pressable
              style={({ pressed }) => [styles.btn, compact && styles.btnCompact, pressed && styles.btnDown]}
              onPress={() => {
                // Daily: the same seeded run again - unless the UTC day
                // has rolled over, then today's Daily. Endless: a fresh yard.
                if (summary!.mode === 'daily') {
                  const st = useStore.getState();
                  const next = dailyRunAgainDay(st.dailyDay, new Date());
                  if (next.sameDay) requestRestart();
                  else {
                    st.setGameMode('daily', next.day);
                    st.startRun();
                    resetForSegment(dailySeed(next.day));
                  }
                } else resetForSegment((Math.random() * 0x7fffffff) | 0);
              }}
            >
              <Text style={styles.btnLabel}>RUN AGAIN</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btn, compact && styles.btnCompact, styles.btnDeath, pressed && styles.btnDeathDown]}
              onPress={() => setRunState('idle')}
            >
              <Text style={[styles.btnLabel, styles.btnLabelDeath]}>MAIN MENU</Text>
            </Pressable>
          </View>
        ) : isCleared ? (
          <Pressable
            style={({ pressed }) => [styles.btn, compact && styles.btnCompact, pressed && styles.btnDown]}
            onPress={() => resetForSegment(segmentSeed + 1)}
          >
            <Text style={styles.btnLabel}>NEXT STAGE</Text>
          </Pressable>
        ) : (
          // Caught panel: send the player back to the start screen
          // when they're ready. No auto-dismiss - the user wanted to
          // dwell on the death summary the same way they dwell on a
          // win.
          <Pressable
            style={({ pressed }) => [styles.btn, compact && styles.btnCompact, styles.btnDeath, pressed && styles.btnDeathDown]}
            onPress={() => setRunState('idle')}
          >
            <Text style={[styles.btnLabel, styles.btnLabelDeath]}>MAIN MENU</Text>
          </Pressable>
        )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// Each row fades + slides in with a stagger keyed off its index, so
// the four-row stat block reads as a flow rather than a wall of
// numbers landing at once. The card-entry animation finishes around
// 320ms; the first row starts ~280ms in and each subsequent row
// follows 70ms later.
function StatRow({
  index,
  label,
  value,
  target,
  compact = false,
}: {
  index: number;
  label: string;
  value: string;
  target?: string;
  compact?: boolean;
}) {
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
    <Animated.View style={[styles.statRow, compact && styles.statRowCompact, style]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>
        {value}
        {target ? <Text style={styles.statTarget}>{`   ${target}`}</Text> : null}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  distance: {
    color: ui.gold,
    fontSize: 34,
    fontFamily: fonts.display,
    marginVertical: 4,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: 'rgba(20, 24, 32, 0.92)',
    borderRadius: 18,
    borderWidth: 2,
    paddingVertical: 12,
    paddingHorizontal: 22,
    minWidth: 320,
  },
  cardScroll: {
    flexGrow: 0,
  },
  cardContent: {
    alignItems: 'center',
    paddingVertical: 10,
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
  skullRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    marginBottom: 14,
  },
  skullRowCompact: {
    marginBottom: 6,
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
  titleCompact: { marginBottom: 4 },
  starsCompact: { fontSize: 30, marginBottom: 0 },
  bestLineCompact: { marginBottom: 6 },
  statBlockCompact: { marginBottom: 10 },
  statRowCompact: { paddingVertical: 2 },
  btnCompact: { paddingVertical: 10 },
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
  statTarget: {
    color: ui.gold,
    fontWeight: '600',
  },
  // Shared button system (theme.ts): advance = primary, leave = danger.
  btn: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 32,
    borderWidth: 2,
    ...buttonFill('primary'),
  },
  btnDown: buttonPressed,
  btnLabel: {
    ...buttonLabel('primary'),
    letterSpacing: 1.4,
    fontSize: T.label,
  },
  // Death panel button: red theme to match the cardCaught border so
  // the call-to-action reads as a "leave" rather than an "advance".
  btnDeath: buttonFill('danger'),
  btnDeathDown: buttonPressed,
  btnLabelDeath: {
    ...buttonLabel('danger'),
    fontFamily: undefined,
    fontWeight: '900',
  },
});
