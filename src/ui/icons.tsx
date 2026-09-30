import React from 'react';
import { View } from 'react-native';

// Small drawn icons built from Views: they look the same on every
// phone, unlike emoji (whose art differs per manufacturer) or font
// symbols. Same family as the drawn pickup / handcuff icons.

// Skull: rounded cranium with two eye sockets, a nose notch and a
// jaw with teeth gaps. `size` is the overall width.
export function SkullIcon({ size, color = '#ffffff', ink = '#1a1d24' }: { size: number; color?: string; ink?: string }) {
  const head = size;
  const eye = size * 0.24;
  const jawW = size * 0.56;
  const jawH = size * 0.26;
  const gap = Math.max(1.5, size * 0.05);
  return (
    <View style={{ width: size, height: size * 1.12 }}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: head,
          height: head * 0.86,
          borderRadius: head / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: (size - jawW) / 2,
          top: head * 0.72,
          width: jawW,
          height: jawH,
          borderBottomLeftRadius: size * 0.1,
          borderBottomRightRadius: size * 0.1,
          backgroundColor: color,
        }}
      />
      {[-1, 1].map((side) => (
        <View
          key={side}
          style={{
            position: 'absolute',
            left: size / 2 + side * size * 0.19 - eye / 2,
            top: head * 0.34,
            width: eye,
            height: eye * 1.05,
            borderRadius: eye / 2,
            backgroundColor: ink,
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          left: size / 2 - size * 0.05,
          top: head * 0.6,
          width: size * 0.1,
          height: size * 0.1,
          backgroundColor: ink,
          transform: [{ rotate: '45deg' }],
        }}
      />
      {[-1, 0, 1].map((k) => (
        <View
          key={k}
          style={{
            position: 'absolute',
            left: size / 2 + k * jawW * 0.24 - gap / 2,
            top: head * 0.8,
            width: gap,
            height: jawH * 0.75,
            backgroundColor: ink,
          }}
        />
      ))}
    </View>
  );
}
