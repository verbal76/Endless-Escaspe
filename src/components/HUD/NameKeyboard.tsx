import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FixedText as Text } from '../../ui/Text';
import { color as ui, type as T, touch } from '../../ui/theme';

// Compact in-app keyboard for name entry. Replaces the system soft
// keyboard, which on landscape Android phones takes ~half the
// screen and ships in light theme even when the rest of the app is
// dark. This component is laid out inline in the start screen so
// the BACK / START buttons sit just above it without being pushed
// off-screen by the OS keyboard.
//
// Letters only (uppercase first letter / lowercase rest is handled
// by the caller before appending). Single space, backspace, done.
// No SHIFT toggle - keeps the layout compact and the API simple.

const ROW_1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
const ROW_2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'];
const ROW_3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];

type Props = {
  onKey: (char: string) => void;
  onBackspace: () => void;
  onDone: () => void;
  doneEnabled?: boolean;
};

function Key({
  label,
  onPress,
  flex = 1,
  variant = 'normal',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  flex?: number;
  variant?: 'normal' | 'control' | 'primary';
  disabled?: boolean;
}) {
  const variantStyle = useMemo(() => {
    if (variant === 'primary') return styles.keyPrimary;
    if (variant === 'control') return styles.keyControl;
    return styles.keyNormal;
  }, [variant]);
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        { flex },
        variantStyle,
        pressed && !disabled && styles.keyPressed,
        disabled && styles.keyDisabled,
      ]}
    >
      <Text
        style={[
          styles.keyLabel,
          variant === 'primary' && styles.keyLabelPrimary,
          variant === 'control' && styles.keyLabelControl,
          disabled && styles.keyLabelDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function NameKeyboard({ onKey, onBackspace, onDone, doneEnabled = true }: Props) {
  return (
    <View style={styles.kb}>
      <View style={styles.row}>
        {ROW_1.map((c) => (
          <Key key={c} label={c} onPress={() => onKey(c)} />
        ))}
      </View>
      <View style={styles.row}>
        {/* Half-key gutters on row 2 for the QWERTY stagger. */}
        <View style={styles.halfGutter} />
        {ROW_2.map((c) => (
          <Key key={c} label={c} onPress={() => onKey(c)} />
        ))}
        <View style={styles.halfGutter} />
      </View>
      <View style={styles.row}>
        {ROW_3.map((c) => (
          <Key key={c} label={c} onPress={() => onKey(c)} />
        ))}
        <Key
          label="⌫"
          onPress={onBackspace}
          flex={1.6}
          variant="control"
        />
      </View>
      <View style={styles.row}>
        <Key
          label="SPACE"
          onPress={() => onKey(' ')}
          flex={5}
          variant="control"
        />
        <Key
          label="DONE"
          onPress={onDone}
          flex={2.5}
          variant="primary"
          disabled={!doneEnabled}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kb: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  halfGutter: {
    flex: 0.5,
  },
  key: {
    // Full touch-target height; the name screen budgets 4 rows of
    // this on a 360 dp-tall phone.
    height: touch.min,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyNormal: {
    backgroundColor: 'rgba(40, 46, 58, 0.95)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  keyControl: {
    backgroundColor: 'rgba(60, 68, 84, 0.95)',
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  keyPrimary: {
    backgroundColor: 'rgba(255, 209, 74, 0.92)',
    borderColor: 'rgba(255, 230, 140, 1)',
  },
  keyPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.85,
  },
  keyDisabled: {
    opacity: 0.4,
  },
  keyLabel: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  keyLabelControl: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: T.caption,
    letterSpacing: 1,
  },
  keyLabelPrimary: {
    color: ui.onGold,
    fontWeight: '900',
    letterSpacing: 1.2,
    fontSize: T.caption,
  },
  keyLabelDisabled: {
    color: ui.textMuted,
  },
});
