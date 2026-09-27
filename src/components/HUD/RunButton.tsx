import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { input } from '../../systems/InputSystem';
import { useStore } from '../../state/store';
import { type as T } from '../../ui/theme';

// RUN is a speed-toggle that doubles whatever stance speed is active.
// Lives in the right-hand action cluster (left of the CROUCH / WALK
// column) so the left thumb stays free for the floating joystick.
// While exhausted the button is dimmed and taps are ignored by the
// controller until stamina recovers.
//
// Uses Gesture.Tap so a second-finger tap during a joystick Pan
// fires reliably; Pressable shares the responder pipeline with the
// active Pan and would drop the toggle when the player is moving.
export function RunButton() {
  const runState = useStore((s) => s.runState);
  // Mirror via store so the highlight tracks the canonical run flag
  // (resetSegment() flips it back to false on every level start; a
  // local useState would keep the prior segment's highlight stuck on
  // even though the player is no longer running).
  const running = useStore((s) => s.running);
  const setRunning = useStore((s) => s.setRunning);
  const pressed = useSharedValue(0);

  const toggle = () => {
    const next = !useStore.getState().running;
    input.run = next;
    setRunning(next);
  };

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(99999)
        .onBegin(() => {
          'worklet';
          pressed.value = withTiming(1, { duration: 80, easing: Easing.out(Easing.quad) });
        })
        .onEnd(() => {
          'worklet';
          runOnJS(toggle)();
        })
        .onFinalize(() => {
          'worklet';
          pressed.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) });
        }),
    [pressed],
  );

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.06 }],
    opacity: 1 - pressed.value * 0.15,
  }));

  if (runState !== 'playing') return null;

  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={[styles.btn, running && styles.btnActive, style]}>
        <Text style={[styles.label, running && styles.labelActive]}>RUN</Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    // Right-hand cluster: the stance column sits at right:63 (78 wide,
    // bottom 100..220). RUN goes just left of it, centred on the
    // column, clear of the look arrows below (bottom 30).
    right: 63 + 78 + 14,
    bottom: 125,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(120,200,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(120,200,255,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: {
    backgroundColor: 'rgba(120,200,255,0.45)',
    borderColor: 'rgba(140,220,255,0.85)',
  },
  label: {
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '800',
    letterSpacing: 0.5,
    fontSize: T.body,
  },
  labelActive: {
    color: '#dff4ff',
  },
});
