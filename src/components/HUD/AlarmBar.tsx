import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { selectRuleLevel, useStore } from '../../state/store';
import { cameraCountFor } from '../../scenes/Camera';
import { type as T } from '../../ui/theme';

// Top-of-screen yard-alarm bar fed by the segment's security
// cameras. Filling the bar summons an extra patrol; staying out of
// camera cones drains it. Hidden at stages with no cameras.
//
// When the alarm pegs at 1.0 ("the whole yard is looking for you")
// the entire bar pulses scale + intensity so the player can't miss
// the escalation; the pulse stops as soon as the bar drains below 1.

export function AlarmBar() {
  const alarmLevel = useStore((s) => s.alarmLevel);
  const stage = useStore(selectRuleLevel);
  const runState = useStore((s) => s.runState);
  // Endless / Daily: the distance readout owns the top-centre slot
  // (y 10-60), so the alarm bar sits below it.
  const endless = useStore((s) => s.gameMode !== 'campaign');
  const insets = useSafeAreaInsets();

  const pct = Math.max(0, Math.min(1, alarmLevel));
  const isHigh = pct >= 0.6;
  const isFull = pct >= 1;

  // Scale-pulse driver, only running while the alarm is full.
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (isFull) {
      pulse.value = 0;
      pulse.value = withRepeat(
        withTiming(1, { duration: 540, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) });
    }
  }, [isFull, pulse]);

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.07 }],
  }));

  if (cameraCountFor(stage) === 0) return null;
  if (runState !== 'playing') return null;

  return (
    <Animated.View
      style={[styles.wrap, { top: endless ? Math.max(66, insets.top + 50) : Math.max(32, insets.top + 16) }, wrapStyle]}
      pointerEvents="none"
    >
      <Text style={[styles.label, isHigh && styles.labelHot]}>YARD ALARM</Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${pct * 100}%` },
            isHigh && styles.fillHot,
            isFull && styles.fillFull,
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    width: 220,
    alignItems: 'center',
  },
  label: {
    color: 'rgba(255, 200, 200, 0.85)',
    fontSize: T.caption,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 3,
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowRadius: 2,
  },
  labelHot: {
    color: '#ff6060',
  },
  track: {
    width: '100%',
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 100, 100, 0.4)',
  },
  fill: {
    height: '100%',
    backgroundColor: 'rgba(255, 140, 60, 0.8)',
  },
  fillHot: {
    backgroundColor: 'rgba(255, 80, 60, 0.9)',
  },
  fillFull: {
    backgroundColor: '#ff3030',
  },
});
