import React, { useState } from 'react';
import { Share, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '../../ui/Pressable';
import { Text } from '../../ui/Text';
import { color as ui, touch, type as T } from '../../ui/theme';
import { exportSavesText, importSavesText } from '../../util/saveBackup';

// Settings > Saves backup. EXPORT hands the whole roster, as text, to the
// Android share sheet (Copy, or send it to yourself); IMPORT takes that
// text back (paste) and merges it - it never deletes characters and never
// replaces newer progress with older. Use it before reinstalling the game
// or switching to a differently-signed / differently-named build, which
// start with empty data.
export function SaveBackup() {
  const [status, setStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    setBusy(true);
    try {
      const r = await exportSavesText();
      if (!r.ok) {
        setStatus(r.message);
        return;
      }
      await Share.share({ message: r.text, title: 'Endless Escape - saves backup' });
      setStatus(`Exported ${r.characters} character${r.characters === 1 ? '' : 's'}. Keep that text somewhere safe.`);
    } catch (e) {
      setStatus(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    setBusy(true);
    try {
      const r = await importSavesText(text);
      setStatus(r.message);
      if (r.ok) {
        setText('');
        setImporting(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.block}>
      <View style={styles.btnRow}>
        <Pressable
          accessibilityLabel="Export saves as text"
          disabled={busy}
          onPress={onExport}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        >
          <Text style={styles.btnLabel}>EXPORT SAVES</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Import saves from text"
          disabled={busy}
          onPress={() => setImporting((v) => !v)}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        >
          <Text style={styles.btnLabel}>{importing ? 'CANCEL IMPORT' : 'IMPORT SAVES'}</Text>
        </Pressable>
      </View>
      {importing ? (
        <View>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            multiline
            autoCorrect={false}
            autoCapitalize="none"
            placeholder="Paste the exported text here"
            placeholderTextColor="rgba(255,255,255,0.4)"
            maxFontSizeMultiplier={1.3}
            accessibilityLabel="Paste exported saves text"
          />
          <Pressable
            accessibilityLabel="Import the pasted text"
            disabled={busy || text.trim().length === 0}
            onPress={onImport}
            style={({ pressed }) => [styles.btn, (busy || text.trim().length === 0) && styles.btnOff, pressed && styles.btnPressed]}
          >
            <Text style={styles.btnLabel}>IMPORT</Text>
          </Pressable>
        </View>
      ) : null}
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingTop: 2 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
  btn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: touch.min,
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(120,200,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(140,220,255,0.7)',
  },
  btnOff: { opacity: 0.45 },
  btnPressed: { opacity: 0.7 },
  btnLabel: { color: '#dff4ff', fontSize: T.caption, fontWeight: '900', letterSpacing: 1 },
  input: {
    marginTop: 8,
    minHeight: 72,
    maxHeight: 140,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    color: '#fff',
    fontSize: T.small,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  status: { color: 'rgba(255,255,255,0.85)', fontSize: T.caption, marginTop: 6 },
});
