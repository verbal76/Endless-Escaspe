import React, { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { Pressable } from '../../ui/Pressable';
import { Text } from '../../ui/Text';
import { checkForNewUpdate, getReleaseInfo, reloadIntoUpdate } from '../../util/releaseRuntime';
import { flushDebugLog } from '../../util/debug';
import { flushPendingSettings } from '../../util/settingsAutosave';
import { composeAboutText, technicalRows } from '../../util/support';
import { color as ui, type as T, touch } from '../../ui/theme';

// The "Technical" part of Settings > About: texture / font / render-audit
// diagnostics, a manual CHECK FOR UPDATE (diagnostics only - updates are
// discovered and applied automatically, see util/updateFlow.ts) and COPY
// DIAGNOSTICS, which hands the whole About report, as plain text, to the
// Android share sheet (Copy, or send it to any app).
export function BuildInfo() {
  const info = getReleaseInfo();
  const rows = technicalRows();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const onCheck = async () => {
    if (ready) {
      setStatus('Restarting into the new update...');
      try {
        // Persist pending settings and the crash trail first: the reload
        // ends this JS context.
        await flushPendingSettings();
        await flushDebugLog().catch(() => undefined);
        await reloadIntoUpdate();
      } catch (e) {
        setStatus(`Restart failed: ${e instanceof Error ? e.message : String(e)}. Close and reopen the app to apply it.`);
      }
      return;
    }
    setStatus('Checking...');
    const r = await checkForNewUpdate();
    if (r.kind === 'disabled') setStatus('Updates are disabled in this build.');
    else if (r.kind === 'none') setStatus('You are on the latest update for this build.');
    else if (r.kind === 'error') setStatus(`Update check failed: ${r.message}`);
    else {
      setReady(true);
      setStatus('New update downloaded. Tap again to restart into it (a run in progress ends).');
    }
  };

  const onShare = async () => {
    try {
      await Share.share({ message: composeAboutText(), title: 'Endless Escape - About / Diagnostics' });
    } catch (e) {
      setStatus(`Share failed: ${e instanceof Error ? e.message : String(e)}`);
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
      <View style={styles.btnRow}>
        {info.source !== 'disabled' ? (
          <Pressable
            onPress={onCheck}
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          >
            <Text style={styles.btnLabel}>{ready ? 'RESTART INTO UPDATE' : 'CHECK FOR UPDATE'}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="Copy diagnostics: share or copy the About report as text"
          onPress={onShare}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        >
          <Text style={styles.btnLabel}>COPY DIAGNOSTICS</Text>
        </Pressable>
      </View>
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
  // Wraps onto a second line when the column is too narrow for both.
  btnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 10,
  },
  btn: {
    marginTop: 10,
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
  btnPressed: { opacity: 0.7 },
  btnLabel: { color: '#dff4ff', fontSize: T.caption, fontWeight: '900', letterSpacing: 1 },
  status: { color: 'rgba(255,255,255,0.85)', fontSize: T.caption, marginTop: 6 },
});
