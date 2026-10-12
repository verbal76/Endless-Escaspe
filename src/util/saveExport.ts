// Pure logic for exporting / importing the local roster (PROTOTYPE, no UI
// and nothing here is wired into the app yet; see docs/signing-migration.md).
//
// Why: Android refuses to update an APK signed with a different key, so
// moving existing installs to a production key means uninstall ->
// install, which wipes AsyncStorage. Shipped as an OTA to the old
// runtime *before* the key switch, an "Export saves" (share-sheet text)
// and "Import saves" (paste) pair lets a player carry the roster across.
//
// Design rules:
// - No I/O and no React Native imports: callers pass the raw stored
//   strings in and get strings / plain data out, so it is unit tested
//   under Node (tests/saveExport.test.ts).
// - Reuses the storage module's own parser (parseSavesFull) for every
//   validation decision, so an import accepts exactly what the game
//   would accept at load. storage.ts is untouched.
// - Import NEVER deletes and never overwrites newer data (see
//   mergeImported).
// - The checksum is an integrity check against truncated / mangled
//   copy-paste, not tamper protection: the text is user-editable anyway
//   and everything in it is re-validated on import.
import { SAVES_META_KEY, hasOwn, parseSavesFull, saveKeyFromName, type Save, type SavesMap, type SavesParse } from './storage';

export const EXPORT_APP = 'endless-escaspe';
export const EXPORT_FORMAT = 1;
// A roster is a few KB; refuse absurd input before parsing it.
export const MAX_EXPORT_CHARS = 1_000_000;
export const MAX_EXPORT_ENTRIES = 500;

export type ExportEnvelope = {
  app: typeof EXPORT_APP;
  format: number;
  exportedAt: number;
  // The saves file exactly as stored (key -> entry, plus the ~meta entry),
  // so unreadable-by-this-build entries survive the round trip.
  saves: Record<string, unknown>;
  // Whitelisted, type-checked settings (may be empty).
  settings: Record<string, unknown>;
  checksum: string;
};

export type ExportError =
  | 'too-large'
  | 'not-json'
  | 'not-an-export'
  | 'wrong-app'
  | 'newer-format'
  | 'bad-format'
  | 'bad-fields'
  | 'bad-checksum'
  | 'bad-saves'
  | 'no-saves';

export type ParsedExport =
  | { ok: true; envelope: ExportEnvelope; parsed: SavesParse; settings: Record<string, boolean | number> }
  | { ok: false; error: ExportError; message: string };

const MESSAGES: Record<ExportError, string> = {
  'too-large': 'That text is too large to be a saves export.',
  'not-json': 'That is not valid export text (it may be cut off).',
  'not-an-export': 'That is not an Endless Escape saves export.',
  'wrong-app': 'That export is from a different app.',
  'newer-format': 'That export was made by a newer version of the game. Update the game and try again.',
  'bad-format': 'That export has an unknown format version.',
  'bad-fields': 'That export is missing information.',
  'bad-checksum': 'That export is damaged or was edited (checksum mismatch). Copy it again in full.',
  'bad-saves': 'The saves inside that export could not be read.',
  'no-saves': 'That export contains no characters.',
};
const fail = (error: ExportError): ParsedExport => ({ ok: false, error, message: MESSAGES[error] });

// ---- checksum ---------------------------------------------------------

// JSON with object keys sorted, so the checksum does not depend on key
// order (which a re-serialisation may change).
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of Object.keys(o).sort()) {
    if (o[k] === undefined) continue;
    parts.push(`${JSON.stringify(k)}:${canonicalJson(o[k])}`);
  }
  return `{${parts.join(',')}}`;
}

// cyrb53: small, dependency-free 53-bit string hash (Hermes has no
// crypto.subtle). 14 hex digits.
export function checksumOf(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

const bodyChecksum = (e: Omit<ExportEnvelope, 'checksum'>) =>
  checksumOf(canonicalJson({ app: e.app, format: e.format, exportedAt: e.exportedAt, saves: e.saves, settings: e.settings }));

// ---- settings whitelist -----------------------------------------------

// Mirrors storage.Settings (kept here, not imported, because storage
// does not export its defaults). Anything else is dropped on import.
const SETTING_KINDS: Record<string, 'bool' | 'unit'> = {
  masterVolume: 'unit',
  musicVolume: 'unit',
  weatherEnabled: 'bool',
  hapticsEnabled: 'bool',
  tutorialSeen: 'bool',
  bossModeUnlocked: 'bool',
  bossModeEnabled: 'bool',
};
// Sticky flags: once true on either side, stay true after a merge.
const STICKY = ['tutorialSeen', 'bossModeUnlocked'];

export function cleanSettings(raw: unknown): Record<string, boolean | number> {
  const out: Record<string, boolean | number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(SETTING_KINDS)) {
    if (!hasOwn(o, k)) continue;
    const v = o[k];
    if (SETTING_KINDS[k] === 'bool' && typeof v === 'boolean') out[k] = v;
    else if (SETTING_KINDS[k] === 'unit' && typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0, Math.min(1, v));
  }
  return out;
}

// ---- export -----------------------------------------------------------

export type BuildExportInput = {
  // Raw stored strings (AsyncStorage values); null when absent.
  savesRaw: string | null;
  settingsRaw: string | null;
  now: number;
};

// Returns the share text, or null when there is nothing exportable
// (no readable saves file or no characters in it).
export function buildExport({ savesRaw, settingsRaw, now }: BuildExportInput): string | null {
  const parsed = parseSavesFull(savesRaw);
  if (!parsed || Object.keys(parsed.saves).length + Object.keys(parsed.passthrough).length === 0) return null;
  let saves: unknown;
  try {
    saves = JSON.parse(savesRaw as string);
  } catch {
    return null;
  }
  let settings: Record<string, boolean | number> = {};
  if (settingsRaw) {
    try {
      settings = cleanSettings(JSON.parse(settingsRaw));
    } catch {
      settings = {};
    }
  }
  const body = { app: EXPORT_APP, format: EXPORT_FORMAT, exportedAt: Math.floor(now), saves: saves as Record<string, unknown>, settings } as const;
  const envelope: ExportEnvelope = { ...body, checksum: bodyChecksum(body) };
  return JSON.stringify(envelope);
}

export function exportFileName(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `endless-escape-saves-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}.json`;
}

// ---- strict import validation -----------------------------------------

export function parseExport(text: string): ParsedExport {
  if (typeof text !== 'string') return fail('not-json');
  // Pasted text often has stray whitespace or a BOM.
  const t = text.replace(/^﻿/, '').trim();
  if (t.length > MAX_EXPORT_CHARS) return fail('too-large');
  let v: unknown;
  try {
    v = JSON.parse(t);
  } catch {
    return fail('not-json');
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail('not-an-export');
  const o = v as Record<string, unknown>;
  if (o.app !== EXPORT_APP) return fail(typeof o.app === 'string' ? 'wrong-app' : 'not-an-export');
  if (typeof o.format !== 'number' || !Number.isInteger(o.format) || o.format < 1) return fail('bad-format');
  if (o.format > EXPORT_FORMAT) return fail('newer-format');
  if (
    typeof o.exportedAt !== 'number' ||
    !Number.isFinite(o.exportedAt) ||
    !o.saves ||
    typeof o.saves !== 'object' ||
    Array.isArray(o.saves) ||
    !o.settings ||
    typeof o.settings !== 'object' ||
    Array.isArray(o.settings) ||
    typeof o.checksum !== 'string'
  ) {
    return fail('bad-fields');
  }
  const body = { app: EXPORT_APP, format: o.format, exportedAt: o.exportedAt, saves: o.saves as Record<string, unknown>, settings: o.settings as Record<string, unknown> } as const;
  if (bodyChecksum(body) !== o.checksum) return fail('bad-checksum');
  if (Object.keys(body.saves).length > MAX_EXPORT_ENTRIES) return fail('too-large');
  const parsed = parseSavesFull(JSON.stringify(body.saves));
  if (!parsed) return fail('bad-saves');
  if (Object.keys(parsed.saves).length + Object.keys(parsed.passthrough).length === 0) return fail('no-saves');
  return {
    ok: true,
    envelope: { ...body, checksum: o.checksum },
    parsed,
    settings: cleanSettings(body.settings),
  };
}

// ---- merge policy -----------------------------------------------------

export type MergeDecision = {
  key: string;
  // What happened to this character.
  action: 'added' | 'kept-local' | 'took-imported';
  reason: 'new' | 'local-higher-stage' | 'imported-higher-stage' | 'local-newer' | 'imported-newer' | 'tie-kept-local';
};

export type MergeResult = {
  // Playable characters after the merge (feed to storage.writeSaves).
  saves: SavesMap;
  // Entries this build keeps verbatim (kept local ones win key clashes).
  passthrough: Record<string, unknown>;
  decisions: MergeDecision[];
  settings: Record<string, boolean | number>;
};

// Which of two saves for the same character survives. The stage is a
// high-water mark and the only field with a safe order, so the higher
// stage wins; equal stages fall back to the newer updatedAt; a full tie
// keeps the local one. Whole entries are chosen, never mixed field by
// field (coins are spendable: summing or max-ing them would mint coins
// or double pay star rewards).
export function pickSave(local: Save, incoming: Save): { winner: 'local' | 'incoming'; reason: MergeDecision['reason'] } {
  if (incoming.stage > local.stage) return { winner: 'incoming', reason: 'imported-higher-stage' };
  if (incoming.stage < local.stage) return { winner: 'local', reason: 'local-higher-stage' };
  if (incoming.updatedAt > local.updatedAt) return { winner: 'incoming', reason: 'imported-newer' };
  if (incoming.updatedAt < local.updatedAt) return { winner: 'local', reason: 'local-newer' };
  return { winner: 'local', reason: 'tie-kept-local' };
}

// Settings have no timestamps, so the local values win (the person is
// holding this device); only the sticky "seen / unlocked" flags are
// OR-ed, and a device with no stored settings takes the imported ones.
export function mergeSettings(local: Record<string, boolean | number> | null, imported: Record<string, boolean | number>): Record<string, boolean | number> {
  if (!local || Object.keys(local).length === 0) return { ...imported };
  const out = { ...local };
  for (const k of Object.keys(imported)) if (!hasOwn(out, k)) out[k] = imported[k];
  for (const k of STICKY) if (imported[k] === true) out[k] = true;
  return out;
}

// Merge an import into the local roster. Guarantees (tested):
//  - no local character or unreadable entry is ever removed;
//  - a character present on both sides keeps the higher stage, then
//    the newer updatedAt (pickSave), so older data never replaces newer;
//  - characters only in the import are added; keys are compared via
//    saveKeyFromName, as the game does;
//  - an imported unreadable entry is added only when its key is free.
export function mergeImported(local: SavesParse | null, incoming: SavesParse, localSettings: Record<string, boolean | number> | null, importedSettings: Record<string, boolean | number>): MergeResult {
  const saves: SavesMap = Object.create(null);
  const passthrough: Record<string, unknown> = Object.create(null);
  const decisions: MergeDecision[] = [];
  if (local) {
    for (const k of Object.keys(local.saves)) saves[k] = local.saves[k];
    for (const k of Object.keys(local.passthrough)) passthrough[k] = local.passthrough[k];
  }
  for (const k of Object.keys(incoming.saves)) {
    const inc = incoming.saves[k];
    const key = saveKeyFromName(inc.name) || k;
    if (!hasOwn(saves, key)) {
      if (hasOwn(passthrough, key)) {
        // A local unreadable entry holds this name; never replace it.
        continue;
      }
      saves[key] = inc;
      decisions.push({ key, action: 'added', reason: 'new' });
      continue;
    }
    const { winner, reason } = pickSave(saves[key], inc);
    if (winner === 'incoming') {
      saves[key] = inc;
      decisions.push({ key, action: 'took-imported', reason });
    } else {
      decisions.push({ key, action: 'kept-local', reason });
    }
  }
  for (const k of Object.keys(incoming.passthrough)) {
    if (!hasOwn(passthrough, k) && !hasOwn(saves, k)) passthrough[k] = incoming.passthrough[k];
  }
  return { saves, passthrough, decisions, settings: mergeSettings(localSettings, importedSettings) };
}

// Exposed so a caller can show "N characters" without re-parsing.
export function summarizeSaves(p: SavesParse): { characters: number; unreadable: number } {
  return { characters: Object.keys(p.saves).length, unreadable: Object.keys(p.passthrough).length };
}

// Re-exported so wiring code has one import for the meta key it must
// not treat as a character.
export { SAVES_META_KEY };
