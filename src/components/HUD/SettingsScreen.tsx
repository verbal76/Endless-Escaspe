import React, { useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../state/store';
import { saveSettings } from '../../util/storage';
import { composeBugReportUrl, composeFeatureRequestUrl } from '../../util/support';
import { BuildInfo } from './BuildInfo';
import { color as ui, type as T, fonts } from '../../ui/theme';

const SLIDER_TRACK_W = 220;
const SLIDER_KNOB_R = 13;

// Pan-gesture-driven slider. The knob position lives on a Reanimated
// shared value updated inside the worklet, so dragging doesn't trigger
// a React re-render per frame and the knob doesn't twitch / shake the
// way the prior responder-based version did. The store is committed
// only on each gesture update + on release, gated by a small threshold
// so coalesced sub-1% changes don't churn.
function VolumeSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const sv = useSharedValue(value);

  // Sync the shared value when the prop changes externally (e.g. on
  // panel open the store-loaded value should land on the knob).
  useEffect(() => {
    sv.value = value;
  }, [value, sv]);

  const commit = (v: number) => onChange(v);

  const pan = Gesture.Pan()
    .activateAfterLongPress(0)
    .minDistance(0)
    .onBegin((e) => {
      'worklet';
      const x = Math.max(0, Math.min(SLIDER_TRACK_W, e.x));
      sv.value = x / SLIDER_TRACK_W;
      runOnJS(commit)(sv.value);
    })
    .onUpdate((e) => {
      'worklet';
      const x = Math.max(0, Math.min(SLIDER_TRACK_W, e.x));
      sv.value = x / SLIDER_TRACK_W;
      runOnJS(commit)(sv.value);
    });

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sv.value * SLIDER_TRACK_W - SLIDER_KNOB_R }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    width: sv.value * SLIDER_TRACK_W,
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.sliderHit}>
        <View style={styles.sliderTrack} />
        <Animated.View style={[styles.sliderFill, fillStyle]} />
        <Animated.View style={[styles.sliderKnob, knobStyle]} />
      </View>
    </GestureDetector>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={[styles.toggleTrack, value && styles.toggleTrackOn]}
    >
      <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} />
    </Pressable>
  );
}

export function SettingsScreen() {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const setPaused = useStore((s) => s.setPaused);
  const setRunState = useStore((s) => s.setRunState);
  const requestRestart = useStore((s) => s.requestRestart);
  const masterVolume = useStore((s) => s.masterVolume);
  const setMasterVolume = useStore((s) => s.setMasterVolume);
  const musicVolume = useStore((s) => s.musicVolume);
  const setMusicVolume = useStore((s) => s.setMusicVolume);
  const weatherEnabled = useStore((s) => s.weatherEnabled);
  const setWeatherEnabled = useStore((s) => s.setWeatherEnabled);

  const persistSettings = () => {
    const st = useStore.getState();
    saveSettings({
      masterVolume: st.masterVolume,
      musicVolume: st.musicVolume,
      weatherEnabled: st.weatherEnabled,
    });
  };

  const openPanel = () => {
    setOpen(true);
    setPaused(true);
  };
  const close = () => {
    setOpen(false);
    setPaused(false);
    persistSettings();
  };
  const onResume = close;
  const onRestart = () => {
    setOpen(false);
    requestRestart();
    persistSettings();
  };
  const onMainMenu = () => {
    setOpen(false);
    setPaused(false);
    setRunState('idle');
    persistSettings();
  };
  const onLoadRun = () => {
    setOpen(false);
    setPaused(false);
    // Drop straight into the start screen's save list so the player
    // can pick another character / replay an earlier stage without
    // an extra tap on the home buttons.
    useStore.getState().setPendingStartMode('continue');
    setRunState('idle');
    persistSettings();
  };

  const onReportBug = () => {
    // openURL fails silently if no email client is installed; we just
    // ignore the rejection rather than blocking the panel.
    Linking.openURL(composeBugReportUrl()).catch(() => {});
  };
  const onFeatureRequest = () => {
    Linking.openURL(composeFeatureRequestUrl()).catch(() => {});
  };

  return (
    <>
      <Pressable
        accessibilityLabel="Settings"
        style={({ pressed }) => [
          styles.gearWrap,
          // Top-of-screen anchor: above the start-screen title row
          // and ahead of the heart row during gameplay (Hearts now
          // sit at top floor 64 so the two stack vertically).
          {
            top: Math.max(24, insets.top + 12),
            left: Math.max(16, insets.left + 12),
          },
          pressed && styles.gearPressed,
        ]}
        onPress={openPanel}
        hitSlop={10}
      >
        <Text style={styles.gearGlyph}>⚙</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        {/* Modal content lives in a separate native view tree from
            the App's GestureHandlerRootView, so gestures registered
            here would never fire. Wrap the modal's content in a
            local GHRoot so the volume + music sliders' Pan gesture
            reaches the gesture handler. */}
        <GestureHandlerRootView style={styles.ghRoot}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            {/* Title spans both columns. */}
            <Text style={styles.title}>GAME PAUSED</Text>

            {/* Two-column landscape layout: pause actions on the left,
                Settings + About on the right. Lays the whole panel
                out within the available height so the user doesn't
                have to scroll on a typical landscape phone. */}
            <View style={styles.columns}>
              <View style={styles.colLeft}>
                <Pressable
                  style={({ pressed }) => [styles.bigBtn, styles.btnResume, pressed && styles.btnPressed]}
                  onPress={onResume}
                >
                  <Text style={styles.bigLabel}>RESUME</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.bigBtn, styles.btnRestart, pressed && styles.btnPressed]}
                  onPress={onRestart}
                >
                  <Text style={styles.bigLabel}>RESTART</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.bigBtn, styles.btnLoad, pressed && styles.btnPressed]}
                  onPress={onLoadRun}
                >
                  <Text style={styles.bigLabel}>LOAD RUN</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.bigBtn, styles.btnMain, pressed && styles.btnPressed]}
                  onPress={onMainMenu}
                >
                  <Text style={styles.bigLabel}>MAIN MENU</Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.colRight}
                contentContainerStyle={styles.colRightContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.sectionHeading}>Settings</Text>
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Volume</Text>
                  <VolumeSlider value={masterVolume} onChange={setMasterVolume} />
                </View>
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Music</Text>
                  <VolumeSlider value={musicVolume} onChange={setMusicVolume} />
                </View>
                <View style={styles.settingRow}>
                  <View style={styles.toggleLabelWrap}>
                    <Text style={styles.settingLabel}>Weather effects</Text>
                    <Text style={styles.subLabel}>
                      {weatherEnabled
                        ? 'Rain / snow active'
                        : 'Off (AI senses boosted)'}
                    </Text>
                  </View>
                  <Toggle value={weatherEnabled} onChange={setWeatherEnabled} />
                </View>

                <Text style={styles.sectionHeading}>Feedback</Text>
                <View style={styles.feedbackRow}>
                  <Pressable
                    onPress={onReportBug}
                    style={({ pressed }) => [
                      styles.feedbackBtn,
                      pressed && styles.btnPressed,
                    ]}
                  >
                    <Text style={styles.feedbackLabel}>REPORT A BUG</Text>
                  </Pressable>
                  <Pressable
                    onPress={onFeatureRequest}
                    style={({ pressed }) => [
                      styles.feedbackBtn,
                      pressed && styles.btnPressed,
                    ]}
                  >
                    <Text style={styles.feedbackLabel}>FEATURE REQUEST</Text>
                  </Pressable>
                </View>

                <Text style={styles.sectionHeading}>Build / Update Info</Text>
                <BuildInfo />
              </ScrollView>
            </View>
          </View>
        </View>
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  gearWrap: {
    position: 'absolute',
    // Plain overlay glyph with no background or border - the user
    // wanted it to read as just an icon, not an icon-in-a-box.
    // Width / height kept generous so the press target stays
    // forgiving even though the visible art is just the glyph.
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearPressed: {
    opacity: 0.6,
  },
  gearGlyph: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: T.heading,
    lineHeight: 30,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 3,
  },
  ghRoot: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    // Wider (and shorter) than before so the two-column layout fits
    // a landscape phone without overflow. maxHeight cap leaves a
    // small breathing band at the top + bottom.
    width: '94%',
    maxWidth: 720,
    maxHeight: '94%',
    backgroundColor: '#1a1d24',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 74, 0.40)',
    padding: 18,
  },
  columns: {
    flexDirection: 'row',
    gap: 18,
    flexShrink: 1,
  },
  colLeft: {
    flex: 1,
    minWidth: 200,
  },
  colRight: {
    flex: 1.1,
    minWidth: 220,
  },
  // Scrollable content inside the right column so the About section
  // doesn't fall off the bottom on shorter screens.
  colRightContent: {
    paddingBottom: 12,
  },
  title: {
    color: ui.gold,
    fontSize: 22,
    fontFamily: fonts.display,
    letterSpacing: 2,
    marginBottom: 12,
    textAlign: 'center',
  },
  bigBtn: {
    // Tighter than before so all four buttons fit in the column
    // alongside the right-hand Settings + About without overflow.
    marginVertical: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  btnResume: {
    backgroundColor: 'rgba(80, 200, 120, 0.25)',
    borderColor: 'rgba(120, 240, 160, 0.65)',
  },
  btnRestart: {
    backgroundColor: 'rgba(120, 200, 255, 0.20)',
    borderColor: 'rgba(140, 220, 255, 0.65)',
  },
  btnLoad: {
    backgroundColor: 'rgba(180, 140, 255, 0.20)',
    borderColor: 'rgba(200, 170, 255, 0.65)',
  },
  btnMain: {
    backgroundColor: 'rgba(255, 209, 74, 0.20)',
    borderColor: 'rgba(255, 209, 74, 0.55)',
  },
  btnPressed: {
    opacity: 0.7,
  },
  bigLabel: {
    color: '#fff',
    fontSize: T.label,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  sectionHeading: {
    color: ui.textMuted,
    fontSize: T.caption,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 6,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  settingLabel: {
    color: '#fff',
    fontSize: T.small,
    fontWeight: '700',
  },
  subLabel: {
    color: ui.textMuted,
    fontSize: T.caption,
    marginTop: 2,
  },
  toggleLabelWrap: {
    flexShrink: 1,
    marginRight: 12,
  },
  // Boss-arena code entry: a row of four cycler buttons + UNLOCK.
  // Each cycler taps through 0..9 wrap-around; UNLOCK checks the
  // joined string against BOSS_UNLOCK_CODE.
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 6,
  },
  codeDigit: {
    width: 32,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    backgroundColor: 'rgba(40, 46, 58, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeDigitPressed: {
    opacity: 0.7,
  },
  codeDigitText: {
    color: ui.gold,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  codeUnlockBtn: {
    marginLeft: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 209, 74, 0.55)',
    backgroundColor: 'rgba(255, 209, 74, 0.20)',
  },
  codeUnlockLabel: {
    color: ui.gold,
    fontSize: T.caption,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  // Feedback row: two narrow buttons side-by-side opening the
  // pre-filled mailto: links from util/support. Sit above About so
  // a returning player can tap them without scrolling past anything.
  feedbackRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  feedbackBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(120, 200, 255, 0.55)',
    backgroundColor: 'rgba(120, 200, 255, 0.18)',
    alignItems: 'center',
  },
  feedbackLabel: {
    color: '#dff4ff',
    fontSize: T.caption,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  // Slider
  sliderHit: {
    width: SLIDER_TRACK_W,
    height: 36,
    justifyContent: 'center',
  },
  sliderTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(120, 200, 255, 0.85)',
  },
  sliderKnob: {
    position: 'absolute',
    top: 36 / 2 - SLIDER_KNOB_R,
    width: SLIDER_KNOB_R * 2,
    height: SLIDER_KNOB_R * 2,
    borderRadius: SLIDER_KNOB_R,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(120, 200, 255, 0.85)',
  },
  // Toggle
  toggleTrack: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackOn: {
    backgroundColor: 'rgba(80, 200, 120, 0.45)',
    borderColor: 'rgba(120, 240, 160, 0.85)',
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#cccccc',
  },
  toggleKnobOn: {
    backgroundColor: '#ffffff',
    transform: [{ translateX: 22 }],
  },
});
