// Layout for the start-screen panels (name entry, continue list,
// profile / stage board, outfits). The panel is a real container sized
// from the window and the safe-area insets - its content can never run
// past its edges or under the settings gear in the top-left corner
// (review D-3 / D-8: the panel used to be a decorative 88 % backdrop
// with the content centred independently over it).

export type Insets = { top: number; bottom: number; left: number; right: number };

// Settings gear (SettingsScreen.tsx): 36 dp square at
// left max(16, inset + 12), top max(24, inset + 12).
export const GEAR_SIZE = 36;
export function gearFrame(insets: Insets) {
  return { left: Math.max(16, insets.left + 12), top: Math.max(24, insets.top + 12), size: GEAR_SIZE };
}

// Below this window height the menus drop secondary lines (mode hints).
export const COMPACT_HEIGHT = 400;

export function menuPanelFrame(width: number, height: number, insets: Insets) {
  const gear = gearFrame(insets);
  // Clear the gear horizontally (it sits beside the panel, not on it),
  // keep at least 6 % of the width as margin on wide screens, and honour
  // a side inset on the right as well. Symmetric so the panel stays
  // centred.
  const side = Math.max(gear.left + gear.size + 12, Math.round(width * 0.06), insets.right + 12);
  const top = Math.max(10, insets.top + 4);
  const bottom = Math.max(10, insets.bottom + 4);
  return {
    left: side,
    right: side,
    top,
    bottom,
    width: Math.max(0, width - side * 2),
    height: Math.max(0, height - top - bottom),
    compact: height < COMPACT_HEIGHT,
  };
}

// "2 h ago" style recency for the continue list.
export function formatLastPlayed(updatedAt: number, now: number): string {
  const s = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  const mo = Math.floor(d / 30);
  return mo < 12 ? `${mo} mo ago` : `${Math.floor(d / 365)} y ago`;
}
