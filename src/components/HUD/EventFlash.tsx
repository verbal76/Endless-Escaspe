import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useStore } from '../../state/store';

// Brief full-screen flash on segment win / catch transitions. Sits
// underneath the Banner card so the card itself stays readable; the
// flash supplies the perceptual punch that the static card lacks.
//
// Catches use a saturated red flash; wins use a warm gold. Each runs
// once on the runState transition and fades to nothing in ~600ms.

const CAUGHT_COLOR = 'rgba(255, 60, 50, 1)';
const CLEARED_COLOR = 'rgba(255, 210, 90, 1)';

export function EventFlash() {
  const runState = useStore((s) => s.runState);
  const opacity = useSharedValue(0);
  const color = useSharedValue<string>(CAUGHT_COLOR);

  useEffect(() => {
    if (runState === 'caught') {
      color.value = CAUGHT_COLOR;
      opacity.value = withSequence(
        withTiming(0.55, { duration: 80, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 520, easing: Easing.in(Easing.quad) }),
      );
    } else if (runState === 'cleared') {
      color.value = CLEARED_COLOR;
      opacity.value = withSequence(
        withTiming(0.40, { duration: 100, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 500, easing: Easing.in(Easing.quad) }),
      );
    }
  }, [runState, opacity, color]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    backgroundColor: color.value,
  }));

  return <Animated.View pointerEvents="none" style={[styles.fill, style]} />;
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});
