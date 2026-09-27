// Shared HUD design tokens. Every HUD surface pulls colours, type
// sizes and the display font from here so screens stay consistent
// (previously ~4 golds, 5 reds, several panel bases and ~20 font sizes
// were scattered across components).

const rgba = (r: number, g: number, b: number) => (a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;

// Brand gold (#ffd14a) at any opacity.
export const gold = rgba(255, 209, 74);
// Panel base (#141820) at any opacity.
export const panel = rgba(20, 24, 32);
export const white = rgba(255, 255, 255);
export const danger = rgba(255, 90, 90);
export const info = rgba(120, 200, 255);
export const success = rgba(110, 220, 140);

export const color = {
  gold: '#ffd14a',
  goldLight: '#ffe68c',
  // Dark ink used on gold buttons.
  onGold: '#1b1206',
  danger: '#ff5a5a',
  dangerDeep: '#c93636',
  info: '#8fd3ff',
  infoInk: '#dff4ff',
  success: '#6edc8c',
  text: '#ffffff',
  // Body copy on dark panels.
  textBody: 'rgba(255, 255, 255, 0.9)',
  // Secondary / caption text. 0.72 is the floor for anything the
  // player needs to read (>= 4.5:1 on the panel colour).
  textMuted: 'rgba(255, 255, 255, 0.72)',
  // Disabled controls only.
  textDisabled: 'rgba(255, 255, 255, 0.55)',
  panel: 'rgba(20, 24, 32, 0.92)',
  panelSoft: 'rgba(20, 24, 32, 0.78)',
  panelSolid: '#1a1d24',
  scrim: 'rgba(8, 10, 14, 0.85)',
  control: 'rgba(255, 255, 255, 0.12)',
  controlBorder: 'rgba(255, 255, 255, 0.28)',
  shadow: 'rgba(0, 0, 0, 0.75)',
} as const;

// Type scale (dp). Nothing the player must read goes below `caption`.
export const type = {
  caption: 12,
  small: 13,
  body: 14,
  label: 16,
  title: 20,
  heading: 26,
  display: 40,
  hero: 62,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

// Display face for titles and primary buttons (Black Ops One, OFL).
// If the font failed to load, Android/iOS silently fall back to the
// system face, so this is always safe to reference.
export const fonts = {
  display: 'BlackOpsOne',
} as const;
