import React from 'react';
import { Pressable as RNPressable, type PressableProps } from 'react-native';
import { playUiSfx } from '../scenes/Sfx';

// Menu / dialog Pressable: plays the shared UI tap on every press
// (throttled and volume-scaled in Sfx; silent before Game mounts).
// Gameplay controls keep the react-native Pressable - they have their
// own action sounds.
export function Pressable({ onPress, ...rest }: PressableProps) {
  return (
    <RNPressable
      {...rest}
      onPress={
        onPress
          ? (e) => {
              playUiSfx();
              onPress(e);
            }
          : undefined
      }
    />
  );
}
