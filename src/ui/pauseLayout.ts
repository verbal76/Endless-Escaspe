// Pause-panel vertical budget. The panel is sized from the real window
// and safe-area insets (not a percentage of the modal, which on
// edge-to-edge Android can extend under the system bars), and each
// column scrolls inside that height, so nothing - Build / Update Info
// in particular - can end up below the bottom of the screen.
export const PANEL_MARGIN = 10;
export const CARD_PADDING = 14;
export const TITLE_BLOCK = 26 + 8; // title lineHeight + marginBottom
export const CARD_BORDER = 1;

export function pausePanelHeights(windowHeight: number, insetTop: number, insetBottom: number) {
  const card = Math.max(
    200,
    windowHeight - Math.max(insetTop, PANEL_MARGIN) - Math.max(insetBottom, PANEL_MARGIN) - PANEL_MARGIN * 2,
  );
  return { card, columns: card - CARD_PADDING * 2 - CARD_BORDER * 2 - TITLE_BLOCK };
}
