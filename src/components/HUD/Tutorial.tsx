import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useStore } from '../../state/store';
import { saveSettings } from '../../util/storage';

// Top-down 2D intro cutscene. Auto-plays four beats illustrating
// the core stealth loop: walk past guards, get spotted, hide behind
// cover, get caught. Non-interactive aside from a skip button.
//
// Why 2D and not the real 3D scene: this teaches geometric
// abstractions (line of sight, detection meter, cover) which read
// most clearly from above. Players still get the actual 3D game
// the moment the cutscene ends.

// ---- Stage layout (px). Rendered at a fixed pixel size centred on
// the screen; the surrounding overlay handles different device
// dimensions through flex centering.
const STAGE_W = 320;
const STAGE_H = 380;

const PLAYER_R = 12;
const GUARD_R = 14;
const RING_R = 36;          // detection-ring radius around the player
const CONE_HALF_BASE = 60;  // half-width of the vision cone's base
const CONE_LENGTH = 220;    // cone extent from guard outward

// Stage coordinates (origin = top-left of stage).
const PLAYER_START = { x: 60, y: 340 };
const GUARD_POS = { x: 160, y: 80 };
const COVER = { x: 130, y: 220, w: 60, h: 30 };

const BEAT_MS = 3500;
const OUTRO_MS = 1300;

const TOTAL_BEATS = 4;

const POPUPS: { title: string; body: string }[] = [
  {
    title: 'Walk past guards',
    body: 'Each guard has a yellow vision cone. Stay out of it and you stay invisible.',
  },
  {
    title: 'Detection ring',
    body: 'Step into a cone and the ring around you fills. Yellow → orange → red means you\'re seen.',
  },
  {
    title: 'Use cover',
    body: 'Hide behind cover blocks to break line of sight. The meter drains while you\'re hidden.',
  },
  {
    title: 'Avoid getting caught',
    body: 'Let the ring fill all the way and the alarm goes off. One catch and the segment restarts.',
  },
];

export function Tutorial() {
  const showTutorial = useStore((s) => s.showTutorial);
  const setShowTutorial = useStore((s) => s.setShowTutorial);
  const masterVolume = useStore((s) => s.masterVolume);
  const weatherEnabled = useStore((s) => s.weatherEnabled);

  const [beat, setBeat] = useState(0);

  // Animated state. Player position, guard rotation (degrees, 0 =
  // pointing down toward player), detection level (0..1), the "!"
  // pop scale above the guard during the catch beat, and the red
  // catch-flash overlay.
  const playerX = useSharedValue(PLAYER_START.x);
  const playerY = useSharedValue(PLAYER_START.y);
  const detection = useSharedValue(0);
  const guardAngle = useSharedValue(180);
  const popScale = useSharedValue(0);
  const catchFlash = useSharedValue(0);

  // Card-entry shared value drives popup fade/slide on each beat.
  const cardT = useSharedValue(0);

  const dismissAndPersist = () => {
    setShowTutorial(false);
    // Mark the tutorial as seen so it doesn't auto-replay next launch.
    // The active save and skin live in their own storage; this only
    // touches the global settings file.
    saveSettings({ masterVolume, weatherEnabled, tutorialSeen: true });
  };

  // Reset state on (re-)mount of the tutorial. showTutorial flipping
  // false→true means the user just opened it from the start screen
  // or first-launch hook fired; play from beat 0.
  useEffect(() => {
    if (!showTutorial) return;
    setBeat(0);
    playerX.value = PLAYER_START.x;
    playerY.value = PLAYER_START.y;
    detection.value = 0;
    guardAngle.value = 180;
    popScale.value = 0;
    catchFlash.value = 0;
  }, [showTutorial, playerX, playerY, detection, guardAngle, popScale, catchFlash]);

  // Auto-advance beats; dismiss after the outro of the last beat.
  useEffect(() => {
    if (!showTutorial) return;
    if (beat >= TOTAL_BEATS) {
      const t = setTimeout(dismissAndPersist, OUTRO_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setBeat(beat + 1), BEAT_MS);
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
      playerX.value = withTiming(160, {
        duration: BEAT_MS - 200,
        easing: Easing.inOut(Easing.quad),
      });
    } else if (beat === 1) {
      // Beat 2: guard rotates to face the player; player walks up
      // into the cone; detection rises.
      guardAngle.value = withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) });
      playerY.value = withTiming(260, {
        duration: BEAT_MS - 200,
        easing: Easing.inOut(Easing.quad),
      });
      detection.value = withDelay(
        700,
        withTiming(0.7, { duration: BEAT_MS - 900, easing: Easing.out(Easing.quad) }),
      );
    } else if (beat === 2) {
      // Beat 3: slip behind cover; detection drains.
      playerY.value = withTiming(280, { duration: 600, easing: Easing.out(Easing.cubic) });
      playerX.value = withTiming(160, { duration: 600, easing: Easing.out(Easing.cubic) });
      detection.value = withDelay(
        500,
        withTiming(0, { duration: BEAT_MS - 700, easing: Easing.in(Easing.quad) }),
      );
    } else if (beat === 3) {
      // Beat 4: walk back into the cone; "!" pops; ring caps; flash.
      playerY.value = withTiming(180, { duration: 1000, easing: Easing.out(Easing.cubic) });
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
    }
  }, [
    beat,
    showTutorial,
    playerX,
    playerY,
    detection,
    guardAngle,
    popScale,
    catchFlash,
    cardT,
  ]);

  const playerStyle = useAnimatedStyle(() => ({
    left: playerX.value - PLAYER_R,
    top: playerY.value - PLAYER_R,
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
      left: playerX.value - RING_R,
      top: playerY.value - RING_R,
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

  return (
    <View style={styles.root}>
      <Pressable
        onPress={dismissAndPersist}
        hitSlop={8}
        style={({ pressed }) => [styles.skipBtn, pressed && styles.skipBtnDown]}
      >
        <Text style={styles.skipLabel}>SKIP</Text>
      </Pressable>

      <View style={styles.stageWrap}>
        <View style={styles.stage}>
          {/* Goal stripe at the top of the stage. */}
          <View style={styles.goalStripe} />
          <Text style={styles.goalLabel}>EXIT</Text>

          {/* Cover block. */}
          <View
            style={[
              styles.cover,
              { left: COVER.x, top: COVER.y, width: COVER.w, height: COVER.h },
            ]}
          />
          <Text style={[styles.coverLabel, { left: COVER.x, top: COVER.y - 14 }]}>
            COVER
          </Text>

          {/* Vision cone. Wrapper sized 0×0 so transformOrigin sits
              at the apex (the wrapper's centre = the guard's spot).
              The triangle is built via the standard CSS-border trick. */}
          <Animated.View
            style={[
              styles.coneOrigin,
              { left: GUARD_POS.x, top: GUARD_POS.y },
              coneStyle,
            ]}
          >
            <View style={styles.coneTri} />
          </Animated.View>

          {/* Guard. */}
          <View
            style={[
              styles.guard,
              { left: GUARD_POS.x - GUARD_R, top: GUARD_POS.y - GUARD_R },
            ]}
          />
          <View
            style={[
              styles.guardEye,
              { left: GUARD_POS.x - 3, top: GUARD_POS.y - 3 },
            ]}
          />

          {/* "!" pop above the guard during the catch beat. */}
          <Animated.View
            style={[
              styles.guardPop,
              { left: GUARD_POS.x - 8, top: GUARD_POS.y - 38 },
              popStyle,
            ]}
          >
            <Text style={styles.guardPopText}>!</Text>
          </Animated.View>

          {/* Detection ring. */}
          <Animated.View style={[styles.ring, ringStyle]} />

          {/* Player. */}
          <Animated.View style={[styles.player, playerStyle]} />

          {/* Catch flash overlay (clipped to the stage). */}
          <Animated.View
            pointerEvents="none"
            style={[styles.catchFlash, catchStyle]}
          />
        </View>

        <Animated.View style={[styles.popupCard, cardStyle]}>
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
    top: 24,
    right: 24,
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
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  stageWrap: {
    alignItems: 'center',
  },
  stage: {
    width: STAGE_W,
    height: STAGE_H,
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
    fontSize: 9,
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
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  coneOrigin: {
    position: 'absolute',
    width: 0,
    height: 0,
    transformOrigin: '0px 0px',
  },
  coneTri: {
    width: 0,
    height: 0,
    marginLeft: -CONE_HALF_BASE,
    borderLeftWidth: CONE_HALF_BASE,
    borderRightWidth: CONE_HALF_BASE,
    borderBottomWidth: CONE_LENGTH,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(255, 220, 90, 0.22)',
  },
  guard: {
    position: 'absolute',
    width: GUARD_R * 2,
    height: GUARD_R * 2,
    borderRadius: GUARD_R,
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
    color: '#ff3838',
    fontSize: 22,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 3,
  },
  ring: {
    position: 'absolute',
    width: RING_R * 2,
    height: RING_R * 2,
    borderRadius: RING_R,
    borderWidth: 3,
    backgroundColor: 'transparent',
  },
  player: {
    position: 'absolute',
    width: PLAYER_R * 2,
    height: PLAYER_R * 2,
    borderRadius: PLAYER_R,
    backgroundColor: '#a05423',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  catchFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ff3838',
  },
  popupCard: {
    marginTop: 22,
    backgroundColor: 'rgba(20, 24, 32, 0.92)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 210, 90, 0.45)',
    paddingHorizontal: 18,
    paddingVertical: 14,
    width: STAGE_W,
    alignItems: 'center',
  },
  popupTitle: {
    color: '#ffd14a',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 6,
  },
  popupBody: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
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
    backgroundColor: '#ffd14a',
  },
});
