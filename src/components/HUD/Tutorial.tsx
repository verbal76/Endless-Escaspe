import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../state/store';
import { saveSettings } from '../../util/storage';
import { color as ui, type as T, fonts } from '../../ui/theme';

// Top-down 2D intro cutscene. Auto-plays four beats illustrating
// the core stealth loop: walk past guards, get spotted, hide behind
// cover, get caught. Non-interactive aside from a skip button.
//
// Why 2D and not the real 3D scene: this teaches geometric
// abstractions (line of sight, detection meter, cover) which read
// most clearly from above. Players still get the actual 3D game
// the moment the cutscene ends.

// ---- Stage layouts. Two presets so the cutscene fits both portrait
// and landscape without overflowing. The portrait stage stacks the
// popup card below; the landscape stage drops the card to the side
// of a smaller stage so a typical phone in horizontal orientation
// (height ~360-400) doesn't clip the top or bottom.

type StageLayout = {
  W: number;
  H: number;
  PLAYER_R: number;
  GUARD_R: number;
  RING_R: number;
  CONE_HALF_BASE: number;
  CONE_LENGTH: number;
  PLAYER_START: { x: number; y: number };
  GUARD_POS: { x: number; y: number };
  COVER: { x: number; y: number; w: number; h: number };
  // Where the player walks in each beat. Same coordinates as PLAYER_START.
  beat0Target: { x: number; y: number };
  beat1Target: { x: number; y: number };
  beat2Target: { x: number; y: number };
  beat3Target: { x: number; y: number };
};

const PORTRAIT_LAYOUT: StageLayout = {
  W: 320,
  H: 380,
  PLAYER_R: 12,
  GUARD_R: 14,
  RING_R: 36,
  CONE_HALF_BASE: 60,
  CONE_LENGTH: 220,
  PLAYER_START: { x: 60, y: 340 },
  GUARD_POS: { x: 160, y: 80 },
  COVER: { x: 130, y: 220, w: 60, h: 30 },
  beat0Target: { x: 160, y: 340 },
  beat1Target: { x: 160, y: 260 },
  beat2Target: { x: 160, y: 280 },
  beat3Target: { x: 160, y: 180 },
};

// Landscape stage is shorter and the player path is compressed to
// match. Same overall flow (walk → spotted → cover → caught) but
// fits a ~360px-tall display with room for top/bottom padding.
const LANDSCAPE_LAYOUT: StageLayout = {
  W: 260,
  H: 240,
  PLAYER_R: 9,
  GUARD_R: 11,
  RING_R: 28,
  CONE_HALF_BASE: 46,
  CONE_LENGTH: 150,
  PLAYER_START: { x: 50, y: 210 },
  GUARD_POS: { x: 130, y: 56 },
  COVER: { x: 108, y: 138, w: 44, h: 22 },
  beat0Target: { x: 130, y: 210 },
  beat1Target: { x: 130, y: 168 },
  beat2Target: { x: 130, y: 178 },
  beat3Target: { x: 130, y: 116 },
};

const BEAT_MS = 3500;
const OUTRO_MS = 1300;

// Beats 0-3 animate the little stage; 4-5 are read-only cards, so
// they stay up longer.
const BEAT_DURATIONS = [BEAT_MS, BEAT_MS + 500, BEAT_MS + 500, BEAT_MS + 1000, 5200, 5200];
const TOTAL_BEATS = BEAT_DURATIONS.length;

const POPUPS: { title: string; body: string }[] = [
  {
    title: 'Stay out of the light',
    body: 'Guards see in a cone in front of them. Outside it they can\'t see you, but they can still hear you.',
  },
  {
    title: 'Watch the ring',
    body: 'In a cone, the ring at your feet fills: yellow, orange, red. At red guards chase and aim. A red laser means a shot is coming, so break line of sight!',
  },
  {
    title: 'Cover works one way',
    body: 'Tall props only hide you when they are between you and the guard. Get the prop between you and them and the meter drains.',
  },
  {
    title: 'Hearts',
    body: 'A guard\'s touch, a dog, a bullet or razor wire costs a heart and sends you back to the start. Lose them all and the run ends.',
  },
  {
    title: 'Noise',
    body: 'Walking and running make noise; the ring around you shows how far it carries. CROUCH to move almost silently. From stage 5, RUN uses stamina.',
  },
  {
    title: 'Tools and the exit',
    body: 'Crowbars knock out a guard or scare off a dog. Smoke blocks sight and makes dogs lose your scent. Reach the green line to escape.',
  },
];

export function Tutorial() {
  const showTutorial = useStore((s) => s.showTutorial);
  const setShowTutorial = useStore((s) => s.setShowTutorial);
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const isLandscape = win.width > win.height;
  const L = isLandscape ? LANDSCAPE_LAYOUT : PORTRAIT_LAYOUT;

  const [beat, setBeat] = useState(0);

  // Animated state. Player position, guard rotation (degrees, 0 =
  // pointing down toward player), detection level (0..1), the "!"
  // pop scale above the guard during the catch beat, and the red
  // catch-flash overlay.
  const playerX = useSharedValue(L.PLAYER_START.x);
  const playerY = useSharedValue(L.PLAYER_START.y);
  const detection = useSharedValue(0);
  const guardAngle = useSharedValue(180);
  const popScale = useSharedValue(0);
  const catchFlash = useSharedValue(0);

  // Card-entry shared value drives popup fade/slide on each beat.
  const cardT = useSharedValue(0);

  const dismissAndPersist = () => {
    setShowTutorial(false);
    // Mark the tutorial as seen so it doesn't auto-replay next launch.
    // saveSettings merges with the existing on-disk record, so we
    // only patch the field we care about here - no risk of clobbering
    // a stale volume / weather value the user changed mid-tutorial.
    saveSettings({ tutorialSeen: true });
    useStore.getState().setTutorialSeen(true);
  };

  // Reset state on (re-)mount of the tutorial. showTutorial flipping
  // false→true means the user just opened it from the start screen
  // or first-launch hook fired; play from beat 0.
  useEffect(() => {
    if (!showTutorial) return;
    setBeat(0);
    playerX.value = L.PLAYER_START.x;
    playerY.value = L.PLAYER_START.y;
    detection.value = 0;
    guardAngle.value = 180;
    popScale.value = 0;
    catchFlash.value = 0;
  }, [
    showTutorial,
    L.PLAYER_START.x,
    L.PLAYER_START.y,
    playerX,
    playerY,
    detection,
    guardAngle,
    popScale,
    catchFlash,
  ]);

  // Auto-advance beats; dismiss after the outro of the last beat.
  useEffect(() => {
    if (!showTutorial) return;
    if (beat >= TOTAL_BEATS) {
      const t = setTimeout(dismissAndPersist, OUTRO_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setBeat(beat + 1), BEAT_DURATIONS[beat] ?? BEAT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat, showTutorial]);

  // Drive the beat-specific animations. Splitting per-beat keeps
  // each block legible; the shared values reset on re-mount above.
  useEffect(() => {
    if (!showTutorial) return;
    cardT.value = 0;
    cardT.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });

    if (beat === 0) {
      // Beat 1: walk right along the bottom, guard facing away.
      playerX.value = withTiming(L.beat0Target.x, {
        duration: BEAT_MS - 200,
        easing: Easing.inOut(Easing.quad),
      });
    } else if (beat === 1) {
      // Beat 2: guard rotates to face the player; player walks up
      // into the cone; detection rises.
      guardAngle.value = withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) });
      playerY.value = withTiming(L.beat1Target.y, {
        duration: BEAT_MS - 200,
        easing: Easing.inOut(Easing.quad),
      });
      detection.value = withDelay(
        700,
        withTiming(0.7, { duration: BEAT_MS - 900, easing: Easing.out(Easing.quad) }),
      );
    } else if (beat === 2) {
      // Beat 3: slip behind cover; detection drains.
      playerY.value = withTiming(L.beat2Target.y, { duration: 600, easing: Easing.out(Easing.cubic) });
      playerX.value = withTiming(L.beat2Target.x, { duration: 600, easing: Easing.out(Easing.cubic) });
      detection.value = withDelay(
        500,
        withTiming(0, { duration: BEAT_MS - 700, easing: Easing.in(Easing.quad) }),
      );
    } else if (beat === 3) {
      // Beat 4: walk back into the cone; "!" pops; ring caps; flash.
      playerY.value = withTiming(L.beat3Target.y, { duration: 1000, easing: Easing.out(Easing.cubic) });
      detection.value = withDelay(
        700,
        withTiming(1, { duration: 1500, easing: Easing.in(Easing.quad) }),
      );
      popScale.value = withDelay(
        1900,
        withSequence(
          withTiming(1.4, { duration: 130, easing: Easing.out(Easing.quad) }),
          withTiming(1.0, { duration: 130, easing: Easing.in(Easing.quad) }),
        ),
      );
      catchFlash.value = withDelay(
        2100,
        withSequence(
          withTiming(0.55, { duration: 90, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 700, easing: Easing.in(Easing.quad) }),
        ),
      );
    } else {
      // Text-only cards: settle the stage back to a calm pose.
      detection.value = withTiming(0, { duration: 600 });
      guardAngle.value = withTiming(180, { duration: 600 });
      popScale.value = withTiming(0, { duration: 200 });
      playerX.value = withTiming(L.PLAYER_START.x, { duration: 900 });
      playerY.value = withTiming(L.PLAYER_START.y, { duration: 900 });
    }
  }, [
    beat,
    showTutorial,
    L,
    playerX,
    playerY,
    detection,
    guardAngle,
    popScale,
    catchFlash,
    cardT,
  ]);

  // Player + ring positions read from the layout struct so they
  // re-target correctly when the screen rotates. Closing over `L`
  // here means useSharedValue listeners pick up the new constants
  // on each render pass.
  const playerR = L.PLAYER_R;
  const ringR = L.RING_R;
  const playerStyle = useAnimatedStyle(() => ({
    left: playerX.value - playerR,
    top: playerY.value - playerR,
  }));

  // Detection ring: colour shifts yellow → orange → red as the value
  // climbs. We approximate with three discrete colours (matching the
  // in-game guard-state markers) so the visual reads as clearly
  // categorical, not continuous.
  const ringStyle = useAnimatedStyle(() => {
    const v = detection.value;
    const opacity = 0.18 + v * 0.55;
    let color = 'rgba(255, 209, 74, 1)'; // alert yellow
    if (v >= 0.75) color = 'rgba(255, 56, 56, 1)'; // chase red
    else if (v >= 0.4) color = 'rgba(255, 154, 48, 1)'; // investigate orange
    return {
      left: playerX.value - ringR,
      top: playerY.value - ringR,
      borderColor: color,
      opacity,
      transform: [{ scale: 1 + v * 0.12 }],
    };
  });

  const coneStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${guardAngle.value}deg` }],
  }));

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: popScale.value }],
    opacity: popScale.value > 0 ? 1 : 0,
  }));

  const catchStyle = useAnimatedStyle(() => ({
    opacity: catchFlash.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardT.value,
    transform: [{ translateY: (1 - cardT.value) * 8 }],
  }));

  if (!showTutorial) return null;

  const popup = POPUPS[Math.min(beat, TOTAL_BEATS - 1)];

  // Card width: matches the stage in portrait; takes whatever's left
  // after the stage in landscape, with a minimum so the body text
  // doesn't compress to one word per line on narrow displays.
  const cardWidth = isLandscape ? Math.max(220, win.width - L.W - 80) : L.W;

  return (
    <View style={styles.root}>
      <Pressable
        onPress={dismissAndPersist}
        hitSlop={8}
        style={({ pressed }) => [
          styles.skipBtn,
          { top: Math.max(12, insets.top) + 8, right: Math.max(16, insets.right) + 8 },
          pressed && styles.skipBtnDown,
        ]}
      >
        <Text style={styles.skipLabel}>SKIP</Text>
      </Pressable>

      <View style={isLandscape ? styles.stageWrapHoriz : styles.stageWrapVert}>
        <View
          style={[
            styles.stage,
            { width: L.W, height: L.H },
          ]}
        >
          {/* Goal stripe at the top of the stage. */}
          <View style={styles.goalStripe} />
          <Text style={styles.goalLabel}>EXIT</Text>

          {/* Cover block. */}
          <View
            style={[
              styles.cover,
              { left: L.COVER.x, top: L.COVER.y, width: L.COVER.w, height: L.COVER.h },
            ]}
          />
          <Text style={[styles.coverLabel, { left: L.COVER.x, top: L.COVER.y - 12 }]}>
            COVER
          </Text>

          {/* Vision cone. Wrapper sized 0×0 with transformOrigin at
              the apex so rotations pivot around the guard's centre.
              The triangle uses the standard CSS-border trick. */}
          <Animated.View
            style={[
              styles.coneOrigin,
              { left: L.GUARD_POS.x, top: L.GUARD_POS.y },
              coneStyle,
            ]}
          >
            <View
              style={{
                width: 0,
                height: 0,
                marginLeft: -L.CONE_HALF_BASE,
                borderLeftWidth: L.CONE_HALF_BASE,
                borderRightWidth: L.CONE_HALF_BASE,
                borderBottomWidth: L.CONE_LENGTH,
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderBottomColor: 'rgba(255, 220, 90, 0.22)',
              }}
            />
          </Animated.View>

          {/* Guard. */}
          <View
            style={[
              styles.guard,
              {
                left: L.GUARD_POS.x - L.GUARD_R,
                top: L.GUARD_POS.y - L.GUARD_R,
                width: L.GUARD_R * 2,
                height: L.GUARD_R * 2,
                borderRadius: L.GUARD_R,
              },
            ]}
          />
          <View
            style={[
              styles.guardEye,
              { left: L.GUARD_POS.x - 3, top: L.GUARD_POS.y - 3 },
            ]}
          />

          {/* "!" pop above the guard during the catch beat. */}
          <Animated.View
            style={[
              styles.guardPop,
              { left: L.GUARD_POS.x - 8, top: L.GUARD_POS.y - L.GUARD_R - 24 },
              popStyle,
            ]}
          >
            <Text style={styles.guardPopText}>!</Text>
          </Animated.View>

          {/* Detection ring. */}
          <Animated.View
            style={[
              styles.ring,
              {
                width: L.RING_R * 2,
                height: L.RING_R * 2,
                borderRadius: L.RING_R,
              },
              ringStyle,
            ]}
          />

          {/* Player. */}
          <Animated.View
            style={[
              styles.player,
              {
                width: L.PLAYER_R * 2,
                height: L.PLAYER_R * 2,
                borderRadius: L.PLAYER_R,
              },
              playerStyle,
            ]}
          />

          {/* Catch flash overlay (clipped to the stage). */}
          <Animated.View
            pointerEvents="none"
            style={[styles.catchFlash, catchStyle]}
          />
        </View>

        <Animated.View
          style={[
            styles.popupCard,
            { width: cardWidth, marginTop: isLandscape ? 0 : 18, marginLeft: isLandscape ? 18 : 0 },
            cardStyle,
          ]}
        >
          <Text style={styles.popupTitle}>{popup.title}</Text>
          <Text style={styles.popupBody}>{popup.body}</Text>
          <View style={styles.beatDots}>
            {Array.from({ length: TOTAL_BEATS }).map((_, i) => (
              <View
                key={i}
                style={[styles.beatDot, i === Math.min(beat, TOTAL_BEATS - 1) && styles.beatDotActive]}
              />
            ))}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

// Animated styles factored after the component since they reference
// the layout struct chosen at render time. We re-derive playerStyle /
// ringStyle inside the component above so they always read the
// layout-aware PLAYER_R / RING_R; the remaining style records below
// are layout-independent.

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 10, 14, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  skipBtn: {
    position: 'absolute',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  skipBtnDown: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  skipLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: T.caption,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  stageWrapVert: {
    alignItems: 'center',
  },
  stageWrapHoriz: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stage: {
    backgroundColor: 'rgba(40, 56, 38, 0.85)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  goalStripe: {
    position: 'absolute',
    top: 18,
    left: 14,
    right: 14,
    height: 3,
    backgroundColor: 'rgba(80, 230, 130, 0.85)',
  },
  goalLabel: {
    position: 'absolute',
    top: 24,
    alignSelf: 'center',
    color: 'rgba(80, 230, 130, 0.85)',
    fontSize: T.caption,
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  cover: {
    position: 'absolute',
    backgroundColor: 'rgba(70, 80, 95, 0.95)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  coverLabel: {
    position: 'absolute',
    color: 'rgba(180, 190, 210, 0.7)',
    fontSize: T.caption,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  coneOrigin: {
    position: 'absolute',
    width: 0,
    height: 0,
    transformOrigin: '0px 0px',
  },
  guard: {
    position: 'absolute',
    backgroundColor: '#2b4f8e',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  guardEye: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff5cc',
  },
  guardPop: {
    position: 'absolute',
    width: 16,
    alignItems: 'center',
  },
  guardPopText: {
    color: ui.danger,
    fontSize: 22,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 3,
  },
  ring: {
    position: 'absolute',
    borderWidth: 3,
    backgroundColor: 'transparent',
  },
  player: {
    position: 'absolute',
    backgroundColor: '#a05423',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  catchFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ui.danger,
  },
  popupCard: {
    backgroundColor: 'rgba(20, 24, 32, 0.92)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 209, 74, 0.45)',
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  popupTitle: {
    color: ui.gold,
    fontSize: T.body,
    fontFamily: fonts.display,
    letterSpacing: 2,
    marginBottom: 6,
  },
  popupBody: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: T.small,
    lineHeight: 18,
    textAlign: 'center',
  },
  beatDots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  beatDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  beatDotActive: {
    backgroundColor: ui.gold,
  },
});
