// Shared HUD design tokens. Every HUD surface pulls colours, type
// sizes and the display font from here so screens stay consistent
// (previously ~4 golds, 5 reds, several panel bases and ~20 font sizes
// were scattered across components).

const rgba = (r: number, g: number, b: number) => (a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;

// Brand gold (#ffd14a) at any opacity.
export const gold = rgba(255, 209, 74);
// Panel base (#141820) at any opacity.
export const panel = rgba(20, 24, 32);
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

// On-screen gameplay controls (stance, RUN, pickups, look arrows).
// They sit over the 3D world, so each gets its own small dark backing
// and a light rim: readable over snow, sky or night alike, without a
// panel behind the whole cluster. Colour only marks state / item.
export const hud = {
  fill: 'rgba(12, 16, 22, 0.55)',
  ring: 'rgba(255, 255, 255, 0.38)',
  ringWidth: 1.5,
  label: '#ffffff',
  // Text / icon shadow so labels hold up on bright backgrounds.
  textShadow: {
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  goldFill: 'rgba(120, 92, 20, 0.72)',
  goldRing: '#ffd14a',
  cyanFill: 'rgba(24, 84, 120, 0.72)',
  cyanRing: '#8fd3ff',
} as const;

// One button system for menus, cards and dialogs. Screens keep their
// own sizes; these set fill, rim and label so every button of a kind
// looks the same everywhere:
//   primary   - the one main action (gold, dark ink, display font)
//   secondary - other actions (solid dark, light-blue rim, white)
//   danger    - leaving / destructive (solid red, white)
//   ghost     - low-emphasis (outline only)
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export const button: Record<ButtonVariant, { fill: string; rim: string; label: string }> = {
  primary: { fill: '#ffd14a', rim: '#ffe68c', label: '#1b1206' },
  secondary: { fill: '#1f2733', rim: '#8fd3ff', label: '#ffffff' },
  danger: { fill: '#c93636', rim: '#ff5a5a', label: '#ffffff' },
  ghost: { fill: 'rgba(20, 24, 32, 0.4)', rim: 'rgba(255, 255, 255, 0.45)', label: '#ffffff' },
};

export function buttonFill(v: ButtonVariant) {
  return { backgroundColor: button[v].fill, borderColor: button[v].rim };
}

export function buttonLabel(v: ButtonVariant) {
  return v === 'primary'
    ? { color: button[v].label, fontFamily: 'BlackOpsOne', fontWeight: 'normal' as const }
    : { color: button[v].label };
}

// Shared pressed feedback.
export const buttonPressed = { opacity: 0.85, transform: [{ scale: 0.97 }] };

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
