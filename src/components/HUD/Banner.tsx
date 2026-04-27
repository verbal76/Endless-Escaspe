import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

  if (runState === 'playing') return null;

  const isCleared = runState === 'cleared';
  const isCaught = runState === 'caught';
  const title = isCleared ? 'YOU MADE IT!' : isCaught ? 'CAUGHT' : 'ENDLESS ESCASPE';
  const cta = isCleared ? 'NEXT SEGMENT' : isCaught ? 'RESTART' : 'START';

  const stars = isCleared && stats ? Math.max(1, Math.min(3, stats.stars)) : 0;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={styles.card}>
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
      </View>
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
