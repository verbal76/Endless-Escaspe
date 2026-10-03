import * as Font from 'expo-font';

export type FontStatus = { state: 'pending' | 'loaded' | 'failed'; error?: string };
let STATUS: FontStatus = { state: 'pending' };

// Snapshot for Settings > Build / Update Info, bug reports and the
// [font] log line the Android render check asserts on.
export function getFontStatus(): FontStatus {
  return { ...STATUS };
}

// Load the display font before the HUD mounts. Never throws: on any
// failure the game renders with the system font, and the reason is
// kept (a broken native asset module made this fail silently on
// device before build 13).
export async function loadDisplayFont(): Promise<boolean> {
  try {
    await Font.loadAsync({
      BlackOpsOne: require('../../assets/fonts/BlackOpsOne-Regular.ttf'),
    });
    STATUS = { state: Font.isLoaded('BlackOpsOne') ? 'loaded' : 'failed' };
    if (STATUS.state === 'failed') STATUS.error = 'loadAsync resolved but the font is not registered';
  } catch (e) {
    STATUS = { state: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
  return STATUS.state === 'loaded';
}

export function formatFontRow(s: FontStatus): { label: string; value: string; full?: string } {
  if (s.state === 'loaded') return { label: 'Display font', value: 'Black Ops One loaded' };
  if (s.state === 'pending') return { label: 'Display font', value: 'Not loaded yet' };
  return { label: 'Display font', value: 'FAILED - using the system font', full: s.error };
}
