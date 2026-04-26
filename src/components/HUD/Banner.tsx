import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../../state/store';

export function Banner() {
  const runState = useStore((s) => s.runState);
  const startRun = useStore((s) => s.startRun);
  const resetForSegment = useStore((s) => s.resetForSegment);
  const segmentSeed = useStore((s) => s.segmentSeed);

  if (runState === 'playing') return null;

  const isCleared = runState === 'cleared';
  const isCaught = runState === 'caught';
  const title = isCleared ? 'SEGMENT CLEAR' : isCaught ? 'CAUGHT' : 'ENDLESS ESCASPE';
  const cta = isCleared ? 'NEXT SEGMENT' : isCaught ? 'RESTART' : 'START';

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
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
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: 'white',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 24,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 4,
  },
  btn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 32,
    backgroundColor: 'rgba(255,210,90,0.85)',
  },
  btnDown: {
    backgroundColor: 'rgba(255,180,40,0.95)',
  },
  btnLabel: {
    color: '#1b1b1b',
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: 16,
  },
});
