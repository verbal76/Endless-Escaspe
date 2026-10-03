import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useStore } from '../../state/store';
import { dangerTintOpacity } from '../../util/feel';

// Screen-edge feedback, kept thin so it never covers play:
//   - amber -> red tint that builds as the highest guard meter rises
//     (nothing below 30%, so ordinary suspicion stays quiet)
//   - a sharp red pulse on every catch (pairs with the hit-stop)
// No gradient library: each edge stacks three strips of decreasing
// width to fake a soft falloff.

const BANDS = [
  { size: 56, alpha: 0.25 },
  { size: 30, alpha: 0.35 },
  { size: 12, alpha: 0.5 },
];

function Edges({ rgb }: { rgb: string }) {
  return (
    <>
      {BANDS.map((b, i) => (
        <React.Fragment key={i}>
          <View style={[styles.top, { height: b.size, backgroundColor: `rgba(${rgb}, ${b.alpha})` }]} />
          <View style={[styles.bottom, { height: b.size, backgroundColor: `rgba(${rgb}, ${b.alpha})` }]} />
          <View style={[styles.left, { width: b.size, backgroundColor: `rgba(${rgb}, ${b.alpha})` }]} />
          <View style={[styles.right, { width: b.size, backgroundColor: `rgba(${rgb}, ${b.alpha})` }]} />
        </React.Fragment>
      ))}
    </>
  );
}

export function EdgeVignette() {
  const runState = useStore((s) => s.runState);
  const danger = useStore((s) => s.dangerLevel);
  const catchCounter = useStore((s) => s.catchCounter);
  const amber = useSharedValue(0);
  const red = useSharedValue(0);
  const hit = useSharedValue(0);

  useEffect(() => {
    const o = runState === 'playing' ? dangerTintOpacity(danger) : 0;
    const redShare = Math.max(0, Math.min(1, (danger - 0.6) / 0.4));
    amber.value = withTiming(o * (1 - redShare), { duration: 250 });
    red.value = withTiming(o * redShare, { duration: 250 });
  }, [danger, runState]);

  useEffect(() => {
    if (catchCounter === 0) return;
    hit.value = withSequence(
      withTiming(0.9, { duration: 60, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 650, easing: Easing.in(Easing.quad) }),
    );
  }, [catchCounter]);

  const amberStyle = useAnimatedStyle(() => ({ opacity: amber.value }));
  const redStyle = useAnimatedStyle(() => ({ opacity: Math.max(red.value, hit.value) }));

  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, amberStyle]}>
        <Edges rgb="255, 170, 40" />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, redStyle]}>
        <Edges rgb="255, 40, 40" />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  left: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  right: { position: 'absolute', top: 0, bottom: 0, right: 0 },
});
