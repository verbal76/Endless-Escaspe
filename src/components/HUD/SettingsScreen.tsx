import React, { useState } from 'react';
import {
  GestureResponderEvent,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  // Use React Native's responder system rather than gesture-handler
  // so the slider works inside the Modal (gesture-handler gestures
  // need extra setup to fire from Modal contents on Android).
  const handle = (e: GestureResponderEvent) => {
    const x = Math.max(0, Math.min(SLIDER_TRACK_W, e.nativeEvent.locationX));
    onChange(x / SLIDER_TRACK_W);
  };

  const knobLeft = value * SLIDER_TRACK_W - SLIDER_KNOB_R;
  const fillW = value * SLIDER_TRACK_W;

  return (
    <View
      style={styles.sliderHit}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handle}
      onResponderMove={handle}
      onResponderRelease={handle}
    >
      <View style={styles.sliderTrack} />
      <View style={[styles.sliderFill, { width: fillW }]} />
      <View style={[styles.sliderKnob, { transform: [{ translateX: knobLeft }] }]} />
    </View>
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

// Unlock code that flips bossModeUnlocked. The settings panel
// surfaces a 4-digit cycler the player can dial to this value to
// reveal the test toggle. Kept inline rather than env-config so a
// QA build doesn't need a rebuild to use it.
const BOSS_UNLOCK_CODE = '5058';

export function SettingsScreen() {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const setPaused = useStore((s) => s.setPaused);
  const setRunState = useStore((s) => s.setRunState);
  const requestRestart = useStore((s) => s.requestRestart);
  const masterVolume = useStore((s) => s.masterVolume);
  const setMasterVolume = useStore((s) => s.setMasterVolume);
  const weatherEnabled = useStore((s) => s.weatherEnabled);
  const setWeatherEnabled = useStore((s) => s.setWeatherEnabled);
  const bossModeUnlocked = useStore((s) => s.bossModeUnlocked);
  const setBossModeUnlocked = useStore((s) => s.setBossModeUnlocked);
  const bossModeEnabled = useStore((s) => s.bossModeEnabled);
  const setBossModeEnabled = useStore((s) => s.setBossModeEnabled);

  // Per-digit code state. Each tap of a slot increments that digit
  // (0..9 wrap-around). Once the joined string equals
  // BOSS_UNLOCK_CODE we flip the unlock flag and the cycler is
  // replaced by the boss-mode toggle below.
  const [codeDigits, setCodeDigits] = useState<number[]>([0, 0, 0, 0]);
  const cycleDigit = (idx: number) => {
    setCodeDigits((prev) => {
      const next = prev.slice();
      next[idx] = (next[idx] + 1) % 10;
      return next;
    });
  };
  const tryUnlock = () => {
    if (codeDigits.join('') === BOSS_UNLOCK_CODE) {
      setBossModeUnlocked(true);
      saveSettings({ bossModeUnlocked: true });
    }
  };

  const persistSettings = () => {
    const st = useStore.getState();
    saveSettings({
      masterVolume: st.masterVolume,
      weatherEnabled: st.weatherEnabled,
      bossModeUnlocked: st.bossModeUnlocked,
      bossModeEnabled: st.bossModeEnabled,
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

              <View style={styles.colRight}>
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

                <Text style={styles.sectionHeading}>Test</Text>
                {bossModeUnlocked ? (
                  <View style={styles.settingRow}>
                    <View style={styles.toggleLabelWrap}>
                      <Text style={styles.settingLabel}>Boss arena</Text>
                      <Text style={styles.subLabel}>
                        {bossModeEnabled
                          ? 'Next stage = arena (survive timer)'
                          : 'Off (linear segments)'}
                      </Text>
                    </View>
                    <Toggle
                      value={bossModeEnabled}
                      onChange={setBossModeEnabled}
                    />
                  </View>
                ) : (
                  <View style={styles.codeRow}>
                    {codeDigits.map((d, i) => (
                      <Pressable
                        key={i}
                        onPress={() => cycleDigit(i)}
                        style={({ pressed }) => [
                          styles.codeDigit,
                          pressed && styles.codeDigitPressed,
                        ]}
                      >
                        <Text style={styles.codeDigitText}>{d}</Text>
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={tryUnlock}
                      style={({ pressed }) => [
                        styles.codeUnlockBtn,
                        pressed && styles.btnPressed,
                      ]}
                    >
                      <Text style={styles.codeUnlockLabel}>UNLOCK</Text>
                    </Pressable>
                  </View>
                )}

                <Text style={styles.sectionHeading}>About</Text>
                <View style={styles.aboutBlock}>
                  <Text style={styles.rowLabel}>Build</Text>
                  <Text style={styles.rowValue}>{BUILD_VERSION}</Text>
                  <Text style={[styles.rowLabel, styles.rowLabelTop]}>OTA</Text>
                  <Text style={styles.rowValue}>{OTA_VERSION}</Text>
                </View>
              </View>
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
    fontSize: 26,
    lineHeight: 30,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 3,
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
    borderColor: 'rgba(255, 210, 90, 0.40)',
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
  title: {
    color: '#ffd14a',
    fontSize: 22,
    fontWeight: '900',
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
    color: '#ffd14a',
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
    borderColor: 'rgba(255, 210, 90, 0.55)',
    backgroundColor: 'rgba(255, 210, 90, 0.20)',
  },
  codeUnlockLabel: {
    color: '#ffd14a',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
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
