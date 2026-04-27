import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_BEST_STARS = 'endless-escaspe:bestStars:v1';
const KEY_SETTINGS = 'endless-escaspe:settings:v1';
const KEY_SAVES = 'endless-escaspe:saves:v1';

// Best stars per stage. Persisted to AsyncStorage so the player
// keeps their high scores across app restarts. Loading is async;
// on first boot it returns an empty map.

export type BestStars = Record<number, number>;

export async function loadBestStars(): Promise<BestStars> {
  try {
    const raw = await AsyncStorage.getItem(KEY_BEST_STARS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as BestStars;
  } catch {
    // Corrupt / missing - treat as empty.
  }
  return {};
}

export async function saveBestStars(b: BestStars): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_BEST_STARS, JSON.stringify(b));
  } catch {
    // Storage failures are non-fatal; the in-memory copy still works
    // for the current session.
  }
}

// User settings persisted alongside hi-scores. Volume + weather are
// global; the active prisoner skin lives on the per-character save
// file (see Save below) and is no longer carried here.

export type Settings = {
  masterVolume: number;
  weatherEnabled: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.7,
  weatherEnabled: true,
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
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

export async function saveSettings(s: Settings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
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
  stage: number;
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
        out[saveKeyFromName(v.name)] = {
          name: v.name,
          skin: v.skin,
          stage: Math.max(1, v.stage | 0),
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
