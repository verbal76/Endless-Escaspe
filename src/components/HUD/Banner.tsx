import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useStore } from '../../state/store';

const STAR_FILLED = '★';
const STAR_EMPTY = '☆';

export function Banner() {
  const runState = useStore((s) => s.runState);
  const startRun = useStore((s) => s.startRun);
  const resetForSegment = useStore((s) => s.resetForSegment);
  const segmentSeed = useStore((s) => s.segmentSeed);
  const stats = useStore((s) => s.lastStats);
  const stage = useStore((s) => s.stage);
  // Look up the best for whichever stage the user JUST finished:
  // setStage was already advanced in handleWin, so the just-cleared
  // stage is one less than the current.
  const justClearedStage = Math.max(1, stage - 1);
  const bestForJustClearedStage = useStore(
    (s) => s.bestStars[justClearedStage] ?? 0,
  );

  // Card entry animation: scales up from 90% with a fade-in each
  // time runState transitions into a banner-visible state. The
  // component itself stays mounted across runs (parent renders it
  // unconditionally), so we re-run the timing on every transition
  // rather than relying on mount-time hooks.
  const t = useSharedValue(0);
  useEffect(() => {
    if (runState === 'caught' || runState === 'cleared') {
      t.value = 0;
      t.value = withTiming(1, {
        duration: 320,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [runState, t]);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ scale: 0.9 + 0.1 * t.value }],
  }));

  // Idle (initial app launch) is handled by StartScreen now; the
  // Banner only renders the post-run states.
  if (runState === 'playing' || runState === 'idle') return null;

  const isCleared = runState === 'cleared';
  // 'caught' is the implicit default for the remaining branch but
  // we don't need a separate flag.
  const title = isCleared ? 'YOU MADE IT!' : 'CAUGHT';
  const cta = isCleared ? 'NEXT SEGMENT' : 'RESTART';

  const stars = isCleared && stats ? Math.max(1, Math.min(3, stats.stars)) : 0;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Animated.View style={[styles.card, cardStyle]}>
        <Text style={styles.title}>{title}</Text>

        {isCleared && (
          <>
            <Text style={styles.stars}>
              {STAR_FILLED.repeat(stars) + STAR_EMPTY.repeat(3 - stars)}
            </Text>
            <Text style={styles.bestLine}>
              Stage {justClearedStage} best:{' '}
              {bestForJustClearedStage > 0
                ? STAR_FILLED.repeat(bestForJustClearedStage) +
                  STAR_EMPTY.repeat(3 - bestForJustClearedStage)
                : '—'}
            </Text>
            {stats && (
              <View style={styles.statBlock}>
                <StatRow label="Times spotted" value={String(stats.timesSeen)} />
                <StatRow
                  label="Time detected"
                  value={`${stats.timeDetected.toFixed(1)}s`}
                />
                <StatRow
                  label="Run time"
                  value={`${stats.runDurationS.toFixed(1)}s`}
                />
                <StatRow label="Lives used" value={String(stats.livesUsed)} />
              </View>
            )}
          </>
        )}

        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.btnDown]}
          onPress={() => {
            if (isCleared) resetForSegment(segmentSeed + 1);
            else startRun();
          }}
        >
          <Text style={styles.btnLabel}>{cta}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
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
    borderColor: 'rgba(255, 210, 90, 0.55)',
    padding: 22,
    minWidth: 320,
    alignItems: 'center',
  },
  title: {
    color: '#ffd14a',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 14,
    textAlign: 'center',
  },
  stars: {
    color: '#ffd14a',
    fontSize: 40,
    letterSpacing: 6,
    marginBottom: 4,
  },
  bestLine: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 13,
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
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
  },
  statValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  btn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 210, 90, 0.85)',
  },
  btnDown: {
    backgroundColor: 'rgba(255, 180, 40, 0.95)',
  },
  btnLabel: {
    color: '#1b1b1b',
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: 16,
  },
});
