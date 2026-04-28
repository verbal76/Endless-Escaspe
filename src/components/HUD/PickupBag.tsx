import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useStore } from '../../state/store';
import { input } from '../../systems/InputSystem';
import type { PickupKind } from '../../types/world';

// Stack of pickup-use buttons sitting above the stance column on the
// right edge of the screen. Each button shows its remaining count
// and is dimmed when empty; tapping it sets the matching one-shot
// input flag, which Game.tsx consumes on the next update tick.
//
// Buttons use Gesture.Tap (not Pressable) so they cooperate with
// the joystick's Pan gesture - the player can pop a smoke bomb or
// swing the crowbar while still moving.

type Slot = {
  kind: PickupKind;
  label: string;
  glyph: string;
  active: string;
  border: string;
};

const SLOTS: Slot[] = [
  {
    kind: 'crowbar',
    label: 'CROWBAR',
    glyph: '⛏',
    active: 'rgba(255,150,80,0.45)',
    border: 'rgba(255,180,120,0.8)',
  },
  {
    kind: 'smokebomb',
    label: 'SMOKE',
    glyph: '●',
    active: 'rgba(180,200,220,0.5)',
    border: 'rgba(220,230,240,0.85)',
  },
];

function PickupSlot({ slot, count }: { slot: Slot; count: number }) {
  const empty = count <= 0;
  const pressed = useSharedValue(0);

  const fire = () => {
    if (empty) return;
    if (slot.kind === 'crowbar') input.useCrowbar = true;
    else input.useSmokeBomb = true;
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
          runOnJS(fire)();
        })
        .onFinalize(() => {
          'worklet';
          pressed.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) });
        }),
    // fire closes over `empty` + `slot.kind`; recreate per change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slot.kind, empty, pressed],
  );

  const style = useAnimatedStyle(() => {
    if (empty) return { opacity: 0.45 };
    return {
      transform: [{ scale: 1 - pressed.value * 0.06 }],
      opacity: 1 - pressed.value * 0.15,
    };
  });

  return (
    <GestureDetector gesture={tap}>
      <Animated.View
        style={[
          styles.btn,
          !empty && { borderColor: slot.border, backgroundColor: slot.active },
          style,
        ]}
      >
        <Text style={[styles.glyph, empty && styles.glyphEmpty]}>{slot.glyph}</Text>
        <Text style={[styles.count, empty && styles.countEmpty]}>{count}</Text>
        <Text style={[styles.label, empty && styles.labelEmpty]}>{slot.label}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

export function PickupBag() {
  const inventory = useStore((s) => s.inventory);
  const runState = useStore((s) => s.runState);
  if (runState !== 'playing') return null;

  return (
    <View style={styles.col}>
      {SLOTS.map((slot) => (
        <PickupSlot key={slot.kind} slot={slot} count={inventory[slot.kind]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  col: {
    position: 'absolute',
    // Sit above the stance column. ActionButtons.tsx uses right:63,
    // bottom:100 with 56-tall buttons + 8 gap. Two stance buttons
    // stack to ~120 px tall, so put the pickup column directly above
    // that with the same right:63 alignment.
    right: 63,
    bottom: 230,
    flexDirection: 'column',
    gap: 8,
  },
  btn: {
    width: 78,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '800',
  },
  glyphEmpty: {
    color: 'rgba(255,255,255,0.55)',
  },
  count: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 1,
  },
  countEmpty: {
    color: 'rgba(255,255,255,0.55)',
  },
  label: {
    color: 'rgba(255,255,255,0.80)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 1,
  },
  labelEmpty: {
    color: 'rgba(255,255,255,0.45)',
  },
});
