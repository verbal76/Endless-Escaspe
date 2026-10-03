import React, { useEffect } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '../../ui/Pressable';
import { Text } from '../../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../state/store';
import { color as ui, fonts, radius, type as T, touch } from '../../ui/theme';

// How to Play: a short rules reference, opened from the start screen
// (with WATCH INTRO to replay the animated tutorial) and from the pause
// panel. Every line matches the game's actual rules; stage-specific
// rules are also taught in play when they first appear
// (util/stageTips.ts).

export const HOW_TO_PLAY: { title: string; lines: string[] }[] = [
  {
    title: 'Controls',
    lines: [
      'Left thumb, anywhere on the left side: move.',
      'CROUCH / WALK: your stance. RUN: tap on or off - running stands you up and sprints.',
      'Hold ‹ › to look around. Pickup buttons appear while you carry one: tap to use.',
      'Gear, top left: pause.',
    ],
  },
  {
    title: 'Being seen',
    lines: [
      'Guards see inside their cone only. Outside it you are invisible.',
      'The dots at your feet show the most alert guard: yellow = noticed, orange = searching, red = can shoot, full = chase.',
      'A chase needs a guard to see you. Noise, lights and dogs can only make guards search.',
    ],
  },
  {
    title: 'Cover',
    lines: [
      'A prop hides you only while it is between you and the guard or camera.',
      'Standing needs a prop at least chest-high. Crouched, low walls hide you too.',
    ],
  },
  {
    title: 'Noise',
    lines: [
      'The circle around you shows how far you are heard. Standing still is silent.',
      'Crouching is quiet; running is loud. Rain masks footsteps.',
    ],
  },
  {
    title: 'Lights',
    lines: [
      'Standing in a floodlight alerts every guard and lets them see further. Crouch or keep moving.',
      'From stage 8 some beams follow you. At night guards see less - unless you are lit.',
    ],
  },
  {
    title: 'Shots',
    lines: [
      'A guard with red dots and a clear view aims: a red laser shows the shot coming.',
      'Break line of sight to cancel it. Tall props stop bullets; low walls do not.',
    ],
  },
  {
    title: 'Tools',
    lines: [
      'Pickups lie around every stage. You keep them if caught; they reset each stage.',
      'Crowbar: stuns the nearest guard for 4 s or scares dogs away. A miss wastes it.',
      'Smoke: a 5 s cloud guards can’t see through (cameras can). Dogs lose your scent.',
      'Rock: THROW lands ahead of you; nearby guards go to check the noise.',
    ],
  },
  {
    title: 'Threats by stage',
    lines: [
      '3: forks - a guarded short lane with 2 pickups, or a long safe one.',
      '5: RUN drains stamina.   6: guards scan where they last saw you.',
      '8: dogs, and floodlights that follow you.   10: boss arena, cameras, 2 hearts.',
      '12: guards radio each other.   14: razor wire on the fences.   20: 1 heart.',
    ],
  },
  {
    title: 'Hearts and bosses',
    lines: [
      'A guard’s touch, a dog bite, a bullet or razor wire costs a heart and sends you back.',
      'Every 10th stage: survive 60 s in the arena. Losing means a retry.',
      'Beating a boss gives +1 heart for the next 10 stages.',
    ],
  },
  {
    title: 'Stars and coins',
    lines: [
      'Stars rate four things: times spotted, time detected, speed and hearts lost.',
      'Coins: 10 per new star (+5 on a first clear), 1 per 25 m in Endless, 1 per 20 m in Daily (+10 for your first Daily each day).',
      'Coins buy outfits. Outfits are only for looks.',
    ],
  },
  {
    title: 'Modes',
    lines: [
      'Campaign: stages with a finish line.',
      'Endless: no end - harder every 120 m, always 3 hearts.',
      'Daily: Endless on the same yard for everyone that day.',
    ],
  },
];

// `where` picks the instance: the home-screen one renders in the main
// HUD, the pause one inside the pause panel's modal.
export function HowToPlay({ where }: { where: 'home' | 'pause' }) {
  const open = useStore((s) => s.howToPlay === where);
  const setHowToPlay = useStore((s) => s.setHowToPlay);
  const setShowTutorial = useStore((s) => s.setShowTutorial);
  const insets = useSafeAreaInsets();

  // Home screen: Android back closes the reference. (Inside the pause
  // panel the modal's onRequestClose handles back.)
  useEffect(() => {
    if (!open || where !== 'home') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setHowToPlay(null);
      return true;
    });
    return () => sub.remove();
  }, [open, where, setHowToPlay]);

  if (!open) return null;

  return (
    <View
      style={[
        styles.backdrop,
        {
          paddingTop: Math.max(12, insets.top + 8),
          paddingBottom: Math.max(12, insets.bottom + 8),
          paddingLeft: Math.max(16, insets.left + 12),
          paddingRight: Math.max(16, insets.right + 12),
        },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>HOW TO PLAY</Text>
          <View style={styles.headerBtns}>
            {where === 'home' ? (
              <Pressable
                onPress={() => {
                  setHowToPlay(null);
                  setShowTutorial(true);
                }}
                style={({ pressed }) => [styles.btn, styles.btnSecondary, pressed && styles.btnDown]}
              >
                <Text style={styles.btnLabelLight}>WATCH INTRO</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel="Close How to Play"
              onPress={() => setHowToPlay(null)}
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnDown]}
            >
              <Text style={styles.btnLabelDark}>CLOSE</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {HOW_TO_PLAY.map((sec) => (
            <View key={sec.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{sec.title.toUpperCase()}</Text>
              {sec.lines.map((l, i) => (
                <Text key={i} style={styles.line}>
                  {l}
                </Text>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ui.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    flex: 1,
    width: '100%',
    maxWidth: 760,
    backgroundColor: ui.panelSolid,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 74, 0.55)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  title: {
    color: ui.gold,
    fontFamily: fonts.display,
    fontSize: T.title,
    letterSpacing: 1.5,
  },
  headerBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    minHeight: touch.min,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: ui.gold,
    borderColor: ui.goldLight,
  },
  btnSecondary: {
    backgroundColor: '#1f2733',
    borderColor: ui.info,
  },
  btnDown: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  btnLabelDark: {
    color: ui.onGold,
    fontWeight: '900',
    letterSpacing: 1.2,
    fontSize: T.small,
  },
  btnLabelLight: {
    color: ui.text,
    fontWeight: '900',
    letterSpacing: 1.2,
    fontSize: T.small,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 14,
  },
  section: {
    gap: 4,
  },
  sectionTitle: {
    color: ui.gold,
    fontSize: T.small,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  line: {
    color: ui.textBody,
    fontSize: T.body,
    lineHeight: 20,
  },
});
