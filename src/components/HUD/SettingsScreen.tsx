import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BUILD_VERSION, OTA_VERSION } from '../../version';

export function SettingsScreen() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityLabel="Settings"
        style={({ pressed }) => [styles.gearWrap, pressed && styles.gearPressed]}
        onPress={() => setOpen(true)}
        hitSlop={10}
      >
        <Text style={styles.gearGlyph}>⚙</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>Settings</Text>

            <Text style={styles.sectionHeading}>About</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Build</Text>
              <Text style={styles.rowValue}>{BUILD_VERSION}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>OTA</Text>
              <Text style={styles.rowValue}>{OTA_VERSION}</Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
              onPress={() => setOpen(false)}
            >
              <Text style={styles.closeLabel}>CLOSE</Text>
            </Pressable>
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
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    minWidth: 320,
    maxWidth: 420,
    backgroundColor: '#161a22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    padding: 22,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  sectionHeading: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rowLabel: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    fontWeight: '600',
  },
  rowValue: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  closeBtn: {
    marginTop: 18,
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 210, 90, 0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255, 210, 90, 0.50)',
  },
  closeBtnPressed: {
    backgroundColor: 'rgba(255, 210, 90, 0.45)',
  },
  closeLabel: {
    color: '#ffd14a',
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: 12,
  },
});
