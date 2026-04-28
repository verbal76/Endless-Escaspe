import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_SETTINGS = 'endless-escaspe:settings:v1';
const KEY_SAVES = 'endless-escaspe:saves:v1';

// User settings persisted globally. Volume + weather are not tied to
// any specific character; the active prisoner skin and the per-stage
// star high scores live on the per-character save file (see Save
// below) and are no longer carried here.

export type Settings = {
  masterVolume: number;
  weatherEnabled: boolean;
  // True once the player has seen (or skipped) the intro tutorial,
  // so we don't replay it every cold launch. The "How to play"
  // entry on the start screen still re-shows it on demand.
  tutorialSeen: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.7,
  weatherEnabled: true,
  tutorialSeen: false,
};

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY_SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        masterVolume:
          typeof parsed.masterVolume === 'number'
            ? Math.max(0, Math.min(1, parsed.masterVolume))
            : DEFAULT_SETTINGS.masterVolume,
        weatherEnabled:
          typeof parsed.weatherEnabled === 'boolean'
            ? parsed.weatherEnabled
            : DEFAULT_SETTINGS.weatherEnabled,
        tutorialSeen:
          typeof parsed.tutorialSeen === 'boolean'
            ? parsed.tutorialSeen
            : DEFAULT_SETTINGS.tutorialSeen,
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

// Persist a settings patch. Reads the existing file first so callers
// only need to specify the fields they're changing - SettingsScreen
// doesn't have to know about flags it never edits (e.g. tutorialSeen).
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  try {
    const existing = await loadSettings();
    const next: Settings = { ...existing, ...patch };
    await AsyncStorage.setItem(KEY_SETTINGS, JSON.stringify(next));
  } catch {
    // ignore
  }
}

// Per-character save file. Created when the player picks a prisoner
// figure and types a name on the start screen. The display name is
// the identity; saves are keyed in storage by the trimmed lowercase
// form of that name so case/whitespace differences don't create
// duplicates. `stage` advances on segment win and is mirrored back
// here so "Continue" picks up where the run left off.

export type PlayerSkin = 'beige' | 'brown';

export type Save = {
  name: string;
  skin: PlayerSkin;
  // Highest stage the player can resume into. Acts as a high-water
  // mark: replaying a lower stage doesn't roll this back.
  stage: number;
  // Best stars achieved per cleared stage. Stage keys are numeric; a
  // missing key means the stage hasn't been cleared with this
  // character yet.
  bestStars: Record<number, number>;
  updatedAt: number;
};

export type SavesMap = Record<string, Save>;

export function saveKeyFromName(name: string): string {
  return name.trim().toLowerCase();
}

export async function loadSaves(): Promise<SavesMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY_SAVES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: SavesMap = {};
    for (const k of Object.keys(parsed)) {
      const v = (parsed as Record<string, unknown>)[k] as Partial<Save> | null;
      if (
        v &&
        typeof v.name === 'string' &&
        (v.skin === 'beige' || v.skin === 'brown') &&
        typeof v.stage === 'number'
      ) {
        const cleanedStars: Record<number, number> = {};
        const rawStars = (v as { bestStars?: unknown }).bestStars;
        if (rawStars && typeof rawStars === 'object') {
          for (const sk of Object.keys(rawStars as Record<string, unknown>)) {
            const sv = (rawStars as Record<string, unknown>)[sk];
            const n = Number(sk);
            if (Number.isFinite(n) && typeof sv === 'number') {
              cleanedStars[n] = Math.max(0, Math.min(3, sv | 0));
            }
          }
        }
        out[saveKeyFromName(v.name)] = {
          name: v.name,
          skin: v.skin,
          stage: Math.max(1, v.stage | 0),
          bestStars: cleanedStars,
          updatedAt:
            typeof v.updatedAt === 'number' ? v.updatedAt : Date.now(),
        };
      }
    }
    return out;
  } catch {
    // ignore
  }
  return {};
}

export async function writeSaves(saves: SavesMap): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_SAVES, JSON.stringify(saves));
  } catch {
    // ignore
  }
}
