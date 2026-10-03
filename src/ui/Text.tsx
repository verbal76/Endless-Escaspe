import React from 'react';
import { Text as RNText } from 'react-native';

// OS "large text" handling (review D-7). The layouts are fixed dp, but
// RN Text follows Android's font scale (up to 2.0). `Text.defaultProps`
// can't set a global cap: React 19 ignores defaultProps on function
// components, and RN 0.81's Text is one. So every HUD file imports Text
// from here instead of 'react-native':
//   Text      - reading text (menus, cards, dialogs, tips): scales with
//               the OS setting, capped at READ_FONT_SCALE_MAX.
//   FixedText - icon-like labels inside fixed-size controls (stance,
//               RUN, pickups, keyboard keys, stage-board cells): never
//               scale, so they can't spill out of their pills.
// A caller can still override either prop explicitly.

export const READ_FONT_SCALE_MAX = 1.3;

type Props = React.ComponentProps<typeof RNText>;

export function Text(props: Props) {
  return <RNText maxFontSizeMultiplier={READ_FONT_SCALE_MAX} {...props} />;
}

export function FixedText(props: Props) {
  return <RNText allowFontScaling={false} {...props} />;
}
