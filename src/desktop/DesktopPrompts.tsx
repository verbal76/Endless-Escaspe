import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { GLYPH_ASSETS } from './glyphAssets';
import { promptsFor, PROMPT_STYLES } from './prompts';
import type { RuntimeState } from './runtime';

// Controller / keyboard prompt bar (desktop only). Never intercepts touches except its own style chip, and
// stays out of the way: the gameplay HUD is untouched.
export function DesktopPrompts({ state, onCycleStyle }: { state: RuntimeState; onCycleStyle: () => void }) {
  if (!state.visible) return null;
  const prompts = promptsFor(state.family, state.mode);
  const label = state.style === 'auto' ? `Auto: ${state.deck ? 'Steam Deck' : state.family}` : state.style;
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={styles.bar} pointerEvents="none">
        {prompts.map((p) => (
          <View key={p.key} style={styles.item}>
            {p.files.length > 0 ? (
              p.files.map((f) => <Image key={f} source={GLYPH_ASSETS[state.family]?.[f]} style={styles.glyph} resizeMode="contain" />)
            ) : p.chip ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{p.chip}</Text>
              </View>
            ) : null}
            <Text style={styles.label}>{p.label}</Text>
          </View>
        ))}
      </View>
      {state.mode === 'menu' ? (
        <Pressable accessibilityLabel="Change controller prompt style" onPress={onCycleStyle} style={styles.styleChip}>
          <Text style={styles.styleText}>Prompts: {label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export { PROMPT_STYLES };

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 6, alignItems: 'center', gap: 4 },
  bar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, backgroundColor: 'rgba(11,13,18,0.72)', borderRadius: 14, paddingVertical: 4, paddingHorizontal: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  glyph: { width: 26, height: 26 },
  label: { color: '#f2ead3', fontSize: 12, fontWeight: '700' },
  chip: { minWidth: 26, height: 22, borderRadius: 11, paddingHorizontal: 6, borderWidth: 1.5, borderColor: '#f2ead3', alignItems: 'center', justifyContent: 'center' },
  chipText: { color: '#f2ead3', fontSize: 9, fontWeight: '900' },
  styleChip: { backgroundColor: 'rgba(11,13,18,0.72)', borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(242,234,211,0.35)' },
  styleText: { color: '#f2ead3', fontSize: 11, fontWeight: '700' },
});
