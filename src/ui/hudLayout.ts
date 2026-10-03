// Shared in-run HUD layout map (review D-6). Every HUD piece used to
// place itself with its own magic numbers, so a tip could land on the
// hearts or the pickup buttons, and the pickup column climbed to y = 10
// on 360 dp-tall phones. Positions are in dp from the screen edges.

export type Insets = { top: number; bottom: number; left: number; right: number };
export type Rect = { x: number; y: number; w: number; h: number };

// ---- Right-hand control cluster (bottom-right, from the right edge) ----
export const CLUSTER_RIGHT = 63; // stance + pickup column right edge
export const BTN_W = 78;
export const BTN_H = 56;
export const BTN_GAP = 8;
// Column to the left of the stance / pickup column.
export const COL2_RIGHT = CLUSTER_RIGHT + BTN_W + 10; // 151
export const STANCE_BOTTOM = 100; // two stance buttons, 100..220
export const RUN = { right: CLUSTER_RIGHT + BTN_W + 14, bottom: 125, size: 70 };
export const LOOK = { bottom: 30, size: 50 };
export const PICKUP_BOTTOM = 230; // first pickup row, above the stance column
// Nothing in the cluster goes higher than this (status bar / notch /
// the top-right corner of a curved display).
export const PICKUP_MIN_TOP = 56;

export type SlotPos = { right: number; bottom: number };

// The crowbar sits above SMOKE when the window is tall enough; on
// shorter phones (< 406 dp) it moves into the row beside THROW instead
// of climbing to the top edge.
export function crowbarInRow(height: number): boolean {
  return height - (PICKUP_BOTTOM + BTN_H + BTN_GAP + BTN_H) < PICKUP_MIN_TOP;
}

export function pickupLayout(height: number): { crowbar: SlotPos; smoke: SlotPos; rock: SlotPos; row: boolean } {
  const row = crowbarInRow(height);
  return {
    smoke: { right: CLUSTER_RIGHT, bottom: PICKUP_BOTTOM },
    rock: { right: COL2_RIGHT, bottom: PICKUP_BOTTOM },
    crowbar: row
      ? { right: COL2_RIGHT + BTN_W + 10, bottom: PICKUP_BOTTOM }
      : { right: CLUSTER_RIGHT, bottom: PICKUP_BOTTOM + BTN_H + BTN_GAP },
    row,
  };
}

// ---- Top-left: settings gear, then the heart row ----
export const HEART_ROW_H = 36;
export const HEART_SLOT_W = 40;
export const HEART_GAP = 6;
export const PERK_TAG_H = 18; // 2 dp margin + 12 dp caption line

export function heartsFrame(insets: Insets) {
  return { top: Math.max(64, insets.top + 52), left: Math.max(16, insets.left + 12) };
}

export function heartsRect(insets: Insets, slots: number, perkTag: boolean): Rect {
  const { top, left } = heartsFrame(insets);
  const rowW = slots * HEART_SLOT_W + Math.max(0, slots - 1) * HEART_GAP;
  // "BOSS PERK · 10" is about 120 dp wide.
  return { x: left, y: top, w: perkTag ? Math.max(rowW, 124) : rowW, h: HEART_ROW_H + (perkTag ? PERK_TAG_H : 0) };
}

// ---- Toast (tips and notices) ----
// Below this width (or when the crowbar shares the THROW row) the toast
// leaves the top centre and sits in the band under the hearts, left of
// the right-hand cluster.
export const TOAST_WIDE_MIN = 820;
const TOAST_SIDE_RESERVE = 245; // centred mode: clear of hearts and cluster
const TOAST_GAP = 12;

export type ToastState = {
  bossTimer: boolean;
  endless: boolean;
  perkTag: boolean;
  crowbar: boolean; // crowbar button showing
};

export type ToastFrame =
  | { mode: 'centre'; top: number; maxWidth: number }
  | { mode: 'band'; top: number; left: number; right: number };

export function toastFrame(width: number, height: number, insets: Insets, s: ToastState): ToastFrame {
  // Other top-centre HUD: boss SURVIVE timer (y 64-120); in Endless /
  // Daily the distance readout plus the camera-alarm bar (y 10-92).
  const base = s.bossTimer ? 126 : s.endless ? 98 : 64;
  const clearTopCentre = Math.max(base, insets.top + base - 12);
  const row = crowbarInRow(height);
  if (width >= TOAST_WIDE_MIN && !(row && s.crowbar)) {
    return {
      mode: 'centre',
      top: clearTopCentre,
      maxWidth: Math.max(200, Math.min(Math.round(width * 0.6), width - 2 * (TOAST_SIDE_RESERVE + Math.max(insets.left, insets.right)))),
    };
  }
  const hearts = heartsFrame(insets);
  const heartsBottom = hearts.top + HEART_ROW_H + (s.perkTag ? PERK_TAG_H : 0);
  // Leftmost cluster element that reaches up into the band: the crowbar
  // when it sits in the THROW row, otherwise THROW / RUN.
  const clusterLeft = row && s.crowbar ? pickupLayout(height).crowbar.right + BTN_W : Math.max(COL2_RIGHT + BTN_W, RUN.right + RUN.size);
  return {
    mode: 'band',
    top: Math.max(heartsBottom + 8, s.bossTimer || s.endless ? clearTopCentre : 0),
    left: hearts.left,
    right: Math.max(clusterLeft + TOAST_GAP, insets.right + 16),
  };
}
