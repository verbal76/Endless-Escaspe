import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../../state/store';
import { BUILD_VERSION, OTA_VERSION } from '../../version';

export function SettingsScreen() {
  const [open, setOpen] = useState(false);
  const setPaused = useStore((s) => s.setPaused);
  const setRunState = useStore((s) => s.setRunState);
  const requestRestart = useStore((s) => s.requestRestart);

  const openPanel = () => {
    setOpen(true);
    setPaused(true);
  };
  const close = () => {
    setOpen(false);
    setPaused(false);
  };
  const onResume = close;
  const onRestart = () => {
    setOpen(false);
    requestRestart();
  };
  const onMainMenu = () => {
    setOpen(false);
    setPaused(false);
    setRunState('idle');
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

            <Text style={styles.sectionHeading}>About</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Build</Text>
              <Text style={styles.rowValue}>{BUILD_VERSION}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>OTA</Text>
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
    padding: 32,
  },
  card: {
    minWidth: 320,
    maxWidth: 420,
    backgroundColor: '#1a1d24',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 210, 90, 0.40)',
    padding: 22,
  },
  title: {
    color: '#ffd14a',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 14,
    textAlign: 'center',
  },
  bigBtn: {
    marginVertical: 6,
    paddingHorizontal: 18,
    paddingVertical: 14,
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
    marginTop: 18,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rowLabel: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    fontWeight: '600',
  },
  rowValue: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'monospace',
  },
});
