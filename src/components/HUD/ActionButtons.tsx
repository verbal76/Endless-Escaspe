import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { input } from '../../systems/InputSystem';

type Btn = { label: string; field: 'run' | 'crouch' | 'hide' };

const BUTTONS: Btn[] = [
  { label: 'RUN', field: 'run' },
  { label: 'CROUCH', field: 'crouch' },
  { label: 'HIDE', field: 'hide' },
];

export function ActionButtons() {
  return (
    <View style={styles.row}>
      {BUTTONS.map((b) => (
        <Pressable
          key={b.field}
          onPressIn={() => {
            input[b.field] = true;
          }}
          onPressOut={() => {
            input[b.field] = false;
          }}
          style={({ pressed }) => [styles.btn, pressed && styles.btnDown]}
        >
          <Text style={styles.label}>{b.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    right: 24,
    bottom: 40,
    flexDirection: 'column',
    gap: 12,
  },
  btn: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDown: {
    backgroundColor: 'rgba(255,210,90,0.35)',
  },
  label: {
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '700',
    letterSpacing: 0.5,
    fontSize: 13,
  },
});
