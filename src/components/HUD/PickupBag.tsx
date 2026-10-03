import React, { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { FixedText as Text } from '../../ui/Text';
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
import { color as ui, hud, type as T } from '../../ui/theme';
import { BTN_H, BTN_W, pickupLayout } from '../../ui/hudLayout';

// Pickup-use buttons above the stance column on the right edge of the
// screen (positions: ui/hudLayout.pickupLayout - on phones under
// 406 dp tall the crowbar moves into the THROW row instead of climbing
// to the top edge). A button only shows while the player holds
// that item (count > 0); an empty slot keeps its space as an invisible
// placeholder so the other controls never shift. Tapping sets the
// matching one-shot input flag, which Game.tsx consumes on the next
// update tick.
//
// Buttons use Gesture.Tap (not Pressable) so they cooperate with
// the joystick's Pan gesture - the player can pop a smoke bomb or
// swing the crowbar while still moving.

type Slot = {
  kind: PickupKind;
  label: string;
  active: string;
  border: string;
};

const SLOTS: Slot[] = [
  {
    kind: 'crowbar',
    label: 'CROWBAR',
    active: 'rgba(110, 58, 24, 0.62)',
    border: '#ffb478',
  },
  {
    kind: 'smokebomb',
    label: 'SMOKE',
    active: 'rgba(52, 64, 80, 0.62)',
    border: '#dce6f0',
  },
];

// Tiny drawn icons - the previous text glyph for crowbar (⛏) is
// actually a pickaxe on most fonts. These are stylised tools made
// from 2-3 absolutely-positioned Views, so the icon ships without
// extra assets and reads accurately.
function CrowbarIcon({ tint }: { tint: string }) {
  return (
    <View style={iconStyles.box}>
      {/* Diagonal shaft */}
      <View
        style={[
          iconStyles.crowbarShaft,
          { backgroundColor: tint },
        ]}
      />
      {/* Hooked claw at the upper end */}
      <View
        style={[
          iconStyles.crowbarHook,
          { backgroundColor: tint },
        ]}
      />
    </View>
  );
}

function SmokeIcon({ tint }: { tint: string }) {
  return (
    <View style={iconStyles.box}>
      <View style={[iconStyles.smokeBody, { backgroundColor: tint }]} />
      <View style={[iconStyles.smokeCap, { backgroundColor: tint }]} />
    </View>
  );
}

function RockIcon({ tint }: { tint: string }) {
  return (
    <View style={iconStyles.box}>
      <View style={[iconStyles.rock, { backgroundColor: tint }]} />
    </View>
  );
}

// Throwable rock: separate from the main column (the right edge only
// fits two stacked slots in landscape), sitting above RUN.
const ROCK_SLOT: Slot = {
  kind: 'rock',
  label: 'THROW',
  active: 'rgba(78, 70, 56, 0.62)',
  border: '#e6dcc8',
};

function PickupSlot({ slot, count, highlight }: { slot: Slot; count: number; highlight: boolean }) {
  const empty = count <= 0;
  const pressed = useSharedValue(0);

  const fire = () => {
    if (empty) return;
    if (slot.kind === 'crowbar') input.useCrowbar = true;
    else if (slot.kind === 'rock') input.throwRock = true;
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

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.06 }],
    opacity: 1 - pressed.value * 0.15,
  }));

  // Nothing to use: keep the slot's footprint so the rest of the
  // cluster stays put, but draw nothing and take no touches.
  if (empty) return <View style={styles.placeholder} pointerEvents="none" />;

  return (
    <GestureDetector gesture={tap}>
      <Animated.View
        style={[
          styles.btn,
          { borderColor: slot.border, backgroundColor: slot.active },
          // Target in swing range: gold ring matching the world marker.
          highlight && styles.inRange,
          style,
        ]}
      >
        {slot.kind === 'crowbar' ? (
          <CrowbarIcon tint="#f0d8a8" />
        ) : slot.kind === 'rock' ? (
          <RockIcon tint="#e8e0d0" />
        ) : (
          <SmokeIcon tint="#e8eef7" />
        )}
        <Text style={styles.count}>{count}</Text>
        <Text style={styles.label}>{slot.label}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

export function PickupBag() {
  const inventory = useStore((s) => s.inventory);
  const runState = useStore((s) => s.runState);
  const crowbarInRange = useStore((s) => s.crowbarInRange);
  const { height } = useWindowDimensions();
  if (runState !== 'playing') return null;
  const pos = pickupLayout(height);

  return (
    <>
      <View style={[styles.slot, pos.rock]}>
        <PickupSlot slot={ROCK_SLOT} count={inventory.rock} highlight={false} />
      </View>
      {SLOTS.map((slot) => (
        <View key={slot.kind} style={[styles.slot, slot.kind === 'crowbar' ? pos.crowbar : pos.smoke]}>
          <PickupSlot
            slot={slot}
            count={inventory[slot.kind]}
            highlight={slot.kind === 'crowbar' && crowbarInRange && inventory.crowbar > 0}
          />
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
  },
  btn: {
    width: BTN_W,
    height: BTN_H,
    borderRadius: 28,
    backgroundColor: hud.fill,
    borderWidth: hud.ringWidth,
    borderColor: hud.ring,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    width: BTN_W,
    height: BTN_H,
  },
  inRange: {
    borderColor: ui.gold,
    borderWidth: 2,
  },
  count: {
    color: hud.label,
    ...hud.textShadow,
    fontSize: T.caption,
    fontWeight: '800',
    marginTop: 1,
  },
  label: {
    color: hud.label,
    ...hud.textShadow,
    fontSize: T.caption,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginTop: 1,
  },
});

// Drawn pickup icons. Each lives in a 22x22 box; absolute children
// position the strokes that form the silhouette.
const iconStyles = StyleSheet.create({
  rock: {
    position: 'absolute',
    top: 5,
    left: 4,
    width: 14,
    height: 12,
    borderRadius: 5,
    transform: [{ rotate: '18deg' }],
  },
  box: {
    width: 22,
    height: 22,
  },
  crowbarShaft: {
    position: 'absolute',
    top: 9,
    left: 0,
    width: 22,
    height: 3,
    borderRadius: 1.5,
    transform: [{ rotate: '-32deg' }],
  },
  crowbarHook: {
    position: 'absolute',
    top: 1,
    right: -1,
    width: 5,
    height: 7,
    borderRadius: 1,
    transform: [{ rotate: '20deg' }],
  },
  smokeBody: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 10,
    height: 14,
    borderRadius: 5,
  },
  smokeCap: {
    position: 'absolute',
    top: 3,
    left: 5,
    width: 12,
    height: 4,
    borderRadius: 2,
  },
});
