import React, { useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '../../ui/Pressable';
import { Text } from '../../ui/Text';
import { useStore } from '../../state/store';
import { color as ui, fonts, radius, touch, type as T } from '../../ui/theme';
import { buildAbout } from '../../util/aboutInfo';
import { getAboutSources } from '../../util/releaseRuntime';
import { BuildInfo, CopyDiagnosticsButton } from './BuildInfo';

// Settings > About: what exactly is installed and running (app, package,
// native build, OTA, Google Play readiness, device) plus COPY DIAGNOSTICS.
// Rendered inside the settings panel's modal, like the pause-panel rules
// reference. Values come from real build / update metadata
// (util/aboutInfo.ts); anything unreadable is labelled Unavailable.
export function AboutPanel() {
  const open = useStore((s) => s.aboutOpen);
  const phase = useStore((s) => s.updatePhase);
  const setAboutOpen = useStore((s) => s.setAboutOpen);
  const insets = useSafeAreaInsets();
  const [showTech, setShowTech] = useState(false);

  // Android back closes the About view first (the settings modal's own
  // onRequestClose also handles it; this covers non-modal hosts).
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setAboutOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [open, setAboutOpen]);

  if (!open) return null;
  const sections = buildAbout(getAboutSources(phase));

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
          <Text style={styles.title}>ABOUT</Text>
          <Pressable
            accessibilityLabel="Close About"
            onPress={() => setAboutOpen(false)}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.btnDown]}
          >
            <Text style={styles.closeLabel}>CLOSE</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} testID="about-scroll">
          {sections.map((sec) => (
            <View key={sec.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{sec.title.toUpperCase()}</Text>
              {sec.rows.map((row) => (
                <View key={row.label} style={styles.row}>
                  <Text style={styles.label}>{row.label}</Text>
                  <Text style={styles.value} selectable>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          ))}
          <CopyDiagnosticsButton />
          <View style={styles.section}>
            <Pressable accessibilityRole="button" onPress={() => setShowTech((v) => !v)} style={styles.techToggle}>
              <Text style={styles.sectionTitle}>{showTech ? 'TECHNICAL  \u25BE' : 'TECHNICAL  \u25B8'}</Text>
            </Pressable>
            {showTech ? <BuildInfo hideShare /> : null}
          </View>
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
  title: { color: ui.gold, fontFamily: fonts.display, fontSize: T.title, letterSpacing: 1.5 },
  closeBtn: {
    minHeight: touch.min,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.gold,
    borderColor: ui.goldLight,
  },
  closeLabel: { color: ui.onGold, fontWeight: '900', letterSpacing: 1.2, fontSize: T.small },
  btnDown: { opacity: 0.75, transform: [{ scale: 0.97 }] },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingVertical: 12, gap: 14 },
  section: { gap: 3 },
  sectionTitle: { color: ui.gold, fontSize: T.small, fontWeight: '900', letterSpacing: 1.4, marginBottom: 2 },
  row: { paddingVertical: 2 },
  techToggle: { minHeight: touch.min, justifyContent: 'center' },
  label: { color: ui.textMuted, fontSize: T.caption, fontWeight: '700', letterSpacing: 1 },
  value: { color: '#fff', fontSize: T.small, fontFamily: 'monospace', marginTop: 1, flexWrap: 'wrap' },
});
