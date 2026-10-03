// Saves backup: EXPORT the roster as share-sheet text and IMPORT it again
// (paste), so a player can carry characters across an app reinstall -
// notably a package-ID or signing-key change, which gives the new app a
// fresh data sandbox. The pure logic (envelope, checksum, strict
// validation, merge that never deletes or overwrites newer data) is
// util/saveExport.ts; this file is the thin storage / store glue.
import { useStore } from '../state/store';
import { parseSavesFull, readRawForBackup, saveSettings, writeSaves, type Settings } from './storage';
import { buildExport, cleanSettings, mergeImported, parseExport, summarizeSaves } from './saveExport';

export type ExportResult = { ok: true; text: string; characters: number } | { ok: false; message: string };

export async function exportSavesText(now: number = Date.now()): Promise<ExportResult> {
  const { savesRaw, settingsRaw } = await readRawForBackup();
  const text = buildExport({ savesRaw, settingsRaw, now });
  if (text === null) return { ok: false, message: 'There are no saved characters to export yet.' };
  const parsed = parseSavesFull(savesRaw);
  return { ok: true, text, characters: parsed ? summarizeSaves(parsed).characters : 0 };
}

export type ImportResult =
  | { ok: true; added: number; replaced: number; kept: number; message: string }
  | { ok: false; message: string };

export async function importSavesText(text: string): Promise<ImportResult> {
  const incoming = parseExport(text);
  if (!incoming.ok) return { ok: false, message: incoming.message };
  const { savesRaw, settingsRaw } = await readRawForBackup();
  const local = parseSavesFull(savesRaw);
  let localSettings: Record<string, boolean | number> | null = null;
  try {
    localSettings = settingsRaw ? cleanSettings(JSON.parse(settingsRaw)) : null;
  } catch {
    localSettings = null;
  }
  const merged = mergeImported(local, incoming.parsed, localSettings, incoming.settings);
  // Nothing is removed: every local character is in `merged.saves`.
  const ok = await writeSaves(merged.saves);
  if (!ok) return { ok: false, message: 'Could not write the saves to storage. Nothing was changed.' };
  const st = useStore.getState();
  st.setSaves(merged.saves);
  const s = merged.settings;
  if (typeof s.masterVolume === 'number') st.setMasterVolume(s.masterVolume);
  if (typeof s.musicVolume === 'number') st.setMusicVolume(s.musicVolume);
  if (typeof s.weatherEnabled === 'boolean') st.setWeatherEnabled(s.weatherEnabled);
  if (typeof s.hapticsEnabled === 'boolean') st.setHapticsEnabled(s.hapticsEnabled);
  if (typeof s.tutorialSeen === 'boolean') st.setTutorialSeen(s.tutorialSeen);
  if (typeof s.bossModeUnlocked === 'boolean') st.setBossModeUnlocked(s.bossModeUnlocked);
  if (typeof s.bossModeEnabled === 'boolean') st.setBossModeEnabled(s.bossModeEnabled);
  await saveSettings(s as Partial<Settings>);
  const added = merged.decisions.filter((d) => d.action === 'added').length;
  const replaced = merged.decisions.filter((d) => d.action === 'took-imported').length;
  const kept = merged.decisions.filter((d) => d.action === 'kept-local').length;
  const bits = [`${added} added`, `${replaced} updated to the imported progress`, `${kept} kept as they were`];
  return { ok: true, added, replaced, kept, message: `Import done: ${bits.join(', ')}.` };
}
