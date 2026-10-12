// Controller-prompt glyphs from the studio-provided Hot Attic Games glyph library (Source.zip). Every file
// named here exists in the archive (see docs/GLYPH-LIBRARY.md); only these are imported
// (scripts/desktop/import-glyphs.mjs). Game actions never depend on the artwork: this table only chooses
// which picture to show for an action.

export type Family = 'xbox' | 'playstation' | 'switch' | 'keyboard';
export type GlyphKey = 'confirm' | 'back' | 'run' | 'stance' | 'crowbar' | 'smoke' | 'rock' | 'move' | 'look' | 'navigate' | 'pause';

// Folder inside Source.zip and folder under assets/glyphs/ for each family.
export const FAMILY_DIRS: Record<Family, { zipDir: string; dir: string }> = {
  xbox: { zipDir: 'Source/XGamepad/Default', dir: 'xbox' },
  playstation: { zipDir: 'Source/P5Gamepad/Default', dir: 'playstation' },
  switch: { zipDir: 'Source/SGamepad/Default', dir: 'switch' },
  keyboard: { zipDir: 'Source/Keyboard_Mouse/Dark', dir: 'keyboard' },
};

// Glyph files per action (several = shown side by side, e.g. W A S D). Position-based mapping: confirm is the
// south face button, back the east one (so on a Switch controller confirm shows B and back shows A, as printed
// on the hardware).
export const GLYPHS: Record<Family, Partial<Record<GlyphKey, string[]>>> = {
  xbox: {
    confirm: ['T_X_A_Color.png'],
    back: ['T_X_B_Color.png'],
    run: ['T_X_A_Color.png'],
    stance: ['T_X_B_Color.png'],
    crowbar: ['T_X_X_Color.png'],
    smoke: ['T_X_Y_Color.png'],
    rock: ['T_X_RT.png'],
    move: ['T_X_L.png'],
    look: ['T_X_R.png'],
    navigate: ['T_X_Dpad.png'],
    // The archive has no stand-alone Menu / View glyph for Xbox: a text chip is used (CHIPS below).
  },
  playstation: {
    confirm: ['T_P5_Cross_Color.png'],
    back: ['T_P5_Circle_Color.png'],
    run: ['T_P5_Cross_Color.png'],
    stance: ['T_P5_Circle_Color.png'],
    crowbar: ['T_P5_Square_Color.png'],
    smoke: ['T_P5_Triangle_Color.png'],
    rock: ['T_P5_R2.png'],
    move: ['T_P5_L.png'],
    look: ['T_P5_R.png'],
    navigate: ['T_P5_Dpad.png'],
    pause: ['T_P5_Options.png'],
  },
  switch: {
    confirm: ['T_S_B.png'],
    back: ['T_S_A.png'],
    run: ['T_S_B.png'],
    stance: ['T_S_A.png'],
    crowbar: ['T_S_Y.png'],
    smoke: ['T_S_X.png'],
    rock: ['T_S_RT.png'],
    move: ['T_S_L.png'],
    look: ['T_S_R.png'],
    navigate: ['T_S_Dpad.png'],
    pause: ['T_S_Plus.png'],
  },
  keyboard: {
    confirm: ['T_Enter_Key_Dark.png'],
    back: ['T_Esc_Key_Dark.png'],
    run: ['T_Shift_Key_Dark.png'],
    stance: ['T_C_Key_Dark.png'],
    crowbar: ['T_1_Key_Dark.png'],
    smoke: ['T_2_Key_Dark.png'],
    rock: ['T_3_Key_Dark.png'],
    move: ['T_W_Key_Dark.png', 'T_A_Key_Dark.png', 'T_S_Key_Dark.png', 'T_D_Key_Dark.png'],
    look: ['T_Q_Key_Dark.png', 'T_E_Key_Dark.png'],
    navigate: ['T_Up_Key_Dark.png', 'T_Down_Key_Dark.png', 'T_Left_Key_Dark.png', 'T_Right_Key_Dark.png'],
    pause: ['T_Esc_Key_Dark.png'],
  },
};

// Text chips for buttons the archive has no glyph for.
export const CHIPS: Record<Family, Partial<Record<GlyphKey, string>>> = {
  xbox: { pause: 'MENU' },
  playstation: {},
  switch: {},
  keyboard: {},
};
