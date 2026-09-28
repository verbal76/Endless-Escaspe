import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDetailRows } from '../../util/releaseInfo';
import { checkForNewUpdate, getReleaseInfo, reloadIntoUpdate } from '../../util/releaseRuntime';
import { getTextureStatus } from '../../util/textures';
import { formatTextureRow } from '../../util/textureSource';
import { formatFontRow, getFontStatus } from '../../ui/fonts';
import { formatAuditRows, getRenderAudit } from '../../util/renderAudit';
import { color as ui, type as T } from '../../ui/theme';

// Build / Update Info: everything needed to tell exactly which code
// is running. Tap a row with a shortened value (update ID, commit) to
// show it in full.
export function BuildInfo() {
  const info = getReleaseInfo();
  const rows = [
    ...formatDetailRows(info),
    formatTextureRow(getTextureStatus()),
    formatFontRow(getFontStatus()),
    ...formatAuditRows(getRenderAudit()),
  ];
  const [expanded, setExpanded] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const onCheck = async () => {
    if (ready) {
      setStatus('Restarting into the new update...');
      await reloadIntoUpdate();
      return;
    }
    setStatus('Checking...');
    const r = await checkForNewUpdate();
    if (r.kind === 'disabled') setStatus('Updates are disabled in this build.');
    else if (r.kind === 'none') setStatus('You are on the latest update for this build.');
    else if (r.kind === 'error') setStatus(`Update check failed: ${r.message}`);
    else {
      setReady(true);
      setStatus('New update downloaded. Tap again to restart into it.');
    }
  };

  return (
    <View style={styles.block}>
      {rows.map((row) => {
        const canExpand = !!row.full && row.full !== row.value;
        const showFull = canExpand && expanded === row.label;
        return (
          <Pressable
            key={row.label}
            disabled={!canExpand}
            onPress={() => setExpanded(showFull ? null : row.label)}
            style={styles.row}
          >
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.value} selectable>
              {showFull ? row.full : row.value}
              {canExpand && !showFull ? '  ›' : ''}
            </Text>
          </Pressable>
        );
      })}
      {info.source !== 'disabled' ? (
        <Pressable
          onPress={onCheck}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        >
          <Text style={styles.btnLabel}>{ready ? 'RESTART INTO UPDATE' : 'CHECK FOR UPDATE'}</Text>
        </Pressable>
      ) : null}
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingTop: 4 },
  row: { paddingVertical: 3 },
  label: {
    color: ui.textMuted,
    fontSize: T.caption,
    fontWeight: '700',
    letterSpacing: 1,
  },
  value: {
    color: '#fff',
    fontSize: T.small,
    fontFamily: 'monospace',
    marginTop: 1,
    flexWrap: 'wrap',
  },
  btn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(120,200,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(140,220,255,0.7)',
  },
  btnPressed: { opacity: 0.7 },
  btnLabel: { color: '#dff4ff', fontSize: T.caption, fontWeight: '900', letterSpacing: 1 },
  status: { color: 'rgba(255,255,255,0.85)', fontSize: T.caption, marginTop: 6 },
});
