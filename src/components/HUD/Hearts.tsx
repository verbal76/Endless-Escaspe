import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from '../../state/store';

export function Hearts() {
  const hearts = useStore((s) => s.hearts);
  return (
    <View style={styles.row}>
      {[0, 1, 2].map((i) => (
        <Text
          key={i}
          style={[styles.heart, i >= hearts && styles.heartGone]}
        >
          {i < hearts ? '♥' : '♡'}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    top: 50,
    left: 24,
    flexDirection: 'row',
    gap: 4,
  },
  heart: {
    fontSize: 28,
    color: '#ff5577',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  heartGone: {
    color: 'rgba(255,255,255,0.3)',
  },
});
