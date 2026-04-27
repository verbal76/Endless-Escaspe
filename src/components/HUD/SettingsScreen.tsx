import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useStore } from '../../state/store';
import { saveSettings } from '../../util/storage';
import { BUILD_VERSION, OTA_VERSION } from '../../version';

const SLIDER_TRACK_W = 220;
const SLIDER_KNOB_R = 13;

function VolumeSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  // Track the live position via a shared value driven by Pan; commit
  // back to the store onChange so the siren module sees updates.
  const x = useSharedValue(value * SLIDER_TRACK_W);
  const startX = useSharedValue(0);

  const pan = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      startX.value = x.value;
    })
    .onUpdate((e) => {
      'worklet';
      const next = Math.max(0, Math.min(SLIDER_TRACK_W, startX.value + e.translationX));
      x.value = next;
      runOnJS(onChange)(next / SLIDER_TRACK_W);
    });

  // Allow tap-to-set as well: when user taps the track without
  // dragging, jump to that x position.
  const tap = Gesture.Tap()
    .onEnd((e) => {
      'worklet';
      const localX = Math.max(0, Math.min(SLIDER_TRACK_W, e.x));
      x.value = localX;
      runOnJS(onChange)(localX / SLIDER_TRACK_W);
    });

  const composed = Gesture.Race(pan, tap);

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value - SLIDER_KNOB_R }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    width: x.value,
  }));

  return (
    <GestureDetector gesture={composed}>
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
  const setPaused = useStore((s) => s.setPaused);
  const setRunState = useStore((s) => s.setRunState);
  const requestRestart = useStore((s) => s.requestRestart);
  const masterVolume = useStore((s) => s.masterVolume);
  const setMasterVolume = useStore((s) => s.setMasterVolume);
  const weatherEnabled = useStore((s) => s.weatherEnabled);
  const setWeatherEnabled = useStore((s) => s.setWeatherEnabled);

  const persistSettings = () => {
    const st = useStore.getState();
    saveSettings({
      masterVolume: st.masterVolume,
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

  return (
    <>
      <Pressable
        accessibilityLabel="Settings"
        style={({ pressed }) => [styles.gearWrap, pressed && styles.gearPressed]}
        onPress={openPanel}
        hitSlop={10}
      >
        <Text style={styles.gearGlyph}>⚙</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>GAME PAUSED</Text>

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
              style={({ pressed }) => [styles.bigBtn, styles.btnMain, pressed && styles.btnPressed]}
              onPress={onMainMenu}
            >
              <Text style={styles.bigLabel}>MAIN MENU</Text>
            </Pressable>

            <Text style={styles.sectionHeading}>Settings</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Volume</Text>
              <VolumeSlider value={masterVolume} onChange={setMasterVolume} />
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

            <Text style={styles.sectionHeading}>About</Text>
            <View style={styles.aboutBlock}>
              <Text style={styles.rowLabel}>Build</Text>
              <Text style={styles.rowValue}>{BUILD_VERSION}</Text>
              <Text style={[styles.rowLabel, styles.rowLabelTop]}>OTA</Text>
              <Text style={styles.rowValue}>{OTA_VERSION}</Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  gearWrap: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearPressed: {
    backgroundColor: 'rgba(255, 210, 90, 0.30)',
  },
  gearGlyph: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 22,
    lineHeight: 24,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '92%',
    maxWidth: 460,
    backgroundColor: '#1a1d24',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 210, 90, 0.40)',
    padding: 20,
  },
  title: {
    color: '#ffd14a',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 12,
    textAlign: 'center',
  },
  bigBtn: {
    marginVertical: 5,
    paddingHorizontal: 18,
    paddingVertical: 12,
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
  btnMain: {
    backgroundColor: 'rgba(255, 210, 90, 0.20)',
    borderColor: 'rgba(255, 210, 90, 0.55)',
  },
  btnPressed: {
    opacity: 0.7,
  },
  bigLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  sectionHeading: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 14,
    marginBottom: 8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  settingLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  subLabel: {
    color: 'rgba(255, 255, 255, 0.50)',
    fontSize: 11,
    marginTop: 2,
  },
  toggleLabelWrap: {
    flexShrink: 1,
    marginRight: 12,
  },
  // About: stack label above value vertically so long OTA strings
  // wrap without overlapping the label.
  aboutBlock: {
    paddingTop: 4,
  },
  rowLabel: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  rowLabelTop: {
    marginTop: 8,
  },
  rowValue: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 2,
    flexWrap: 'wrap',
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
