// Prompt-family selection (pure): which controller artwork to show, with automatic detection, a manual
// override, and hysteresis so mixed keyboard + controller use does not make the prompts flicker.

import { CHIPS, GLYPHS, type Family, type GlyphKey } from './glyphManifest';
import type { Mode } from './actions';

export type PromptStyle = 'auto' | Family;
export const PROMPT_STYLES: readonly PromptStyle[] = ['auto', 'xbox', 'playstation', 'switch', 'keyboard'];
export type Device = 'keyboard' | 'pad';

/**
 * Pad family from the Gamepad.id string. Steam Input and the Steam Deck present an Xbox-style layout, so the
 * Deck (Valve vendor 28de) shows Xbox ABXY prompts. Unknown pads default to Xbox, the most common layout.
 */
export function padFamily(id: string): { family: Exclude<Family, 'keyboard'>; deck: boolean } {
  const s = id.toLowerCase();
  if (/28de|steam deck|valve|steam controller|steam virtual/.test(s)) return { family: 'xbox', deck: true };
  if (/054c|dualsense|dualshock|playstation|wireless controller/.test(s) && !/045e|xbox/.test(s)) return { family: 'playstation', deck: false };
  if (/057e|nintendo|switch|joy-con|pro controller/.test(s)) return { family: 'switch', deck: false };
  return { family: 'xbox', deck: false };
}

export function resolveFamily(style: PromptStyle, lastDevice: Device | null, pad: Exclude<Family, 'keyboard'> | null): Family {
  if (style !== 'auto') return style;
  if (lastDevice === 'keyboard') return 'keyboard';
  if (lastDevice === 'pad' && pad) return pad;
  return pad ?? 'keyboard';
}

/** Switches the active device only on a deliberate input and not more often than `minGapMs` (no flicker). */
export class DeviceTracker {
  private device: Device | null = null;
  private changedAt = -Infinity;
  private readonly minGapMs: number;
  constructor(minGapMs = 1200) {
    this.minGapMs = minGapMs;
  }
  get current(): Device | null {
    return this.device;
  }
  note(device: Device, now: number): boolean {
    if (device === this.device) return false;
    if (this.device !== null && now - this.changedAt < this.minGapMs) return false;
    this.device = device;
    this.changedAt = now;
    return true;
  }
}

export type Prompt = { key: GlyphKey; label: string; files: string[]; chip: string | null };

const HINTS: Record<Mode, Array<{ key: GlyphKey; label: string }>> = {
  play: [
    { key: 'move', label: 'Move' },
    { key: 'look', label: 'Look' },
    { key: 'run', label: 'Run' },
    { key: 'stance', label: 'Crouch' },
    { key: 'crowbar', label: 'Crowbar' },
    { key: 'smoke', label: 'Smoke' },
    { key: 'rock', label: 'Throw' },
    { key: 'pause', label: 'Pause' },
  ],
  menu: [
    { key: 'navigate', label: 'Navigate' },
    { key: 'confirm', label: 'Select' },
    { key: 'back', label: 'Back' },
  ],
};

export function promptsFor(family: Family, mode: Mode): Prompt[] {
  return HINTS[mode].map(({ key, label }) => ({ key, label, files: GLYPHS[family][key] ?? [], chip: CHIPS[family][key] ?? null }));
}

export function nextStyle(s: PromptStyle): PromptStyle {
  return PROMPT_STYLES[(PROMPT_STYLES.indexOf(s) + 1) % PROMPT_STYLES.length]!;
}
