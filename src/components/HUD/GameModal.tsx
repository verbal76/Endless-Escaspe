import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useStore } from '../../state/store';
import { buttonFill, buttonLabel, buttonPressed, color as ui, type as T, fonts } from '../../ui/theme';

// Branded confirm / alert modal matching the dark UI of the rest of
// the game. Replaces every Alert.alert call so OS-style popup
// chrome (light / system colour, OS font) never appears in-game.
//
// Render a GameModal somewhere stable in the tree and feed it a
// `config` object when you want to show a popup; pass null to hide.
// Each ModalAction's onPress is the caller's handler - the GameModal
// itself never auto-dismisses; the caller is responsible for setting
// config to null inside their handler. Keeps the API explicit.

export type GameModalVariant = 'primary' | 'danger' | 'cancel';

export type GameModalAction = {
  label: string;
  variant?: GameModalVariant;
  onPress: () => void;
};

export type GameModalConfig = {
  title: string;
  body?: string;
  actions: GameModalAction[];
};

// Reads the active config from the store by default; pass an
// explicit prop to override (useful for previews / tests).
export function GameModal({ config: configProp }: { config?: GameModalConfig | null } = {}) {
  const storeConfig = useStore((s) => s.gameModal);
  const config = configProp !== undefined ? configProp : storeConfig;
  // Card entry: scale + fade in each time a new config arrives.
  // Re-runs whenever `config` flips from null to a value.
  const t = useSharedValue(0);
  useEffect(() => {
    if (config) {
      t.value = 0;
      t.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [config, t]);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ scale: 0.92 + 0.08 * t.value }],
  }));

  if (!config) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      // Android back = the dialog's cancel action (or its only action);
      // a dialog without one ignores back rather than closing silently.
      onRequestClose={() => {
        const back = config.actions.find((a) => a.variant === 'cancel') ?? (config.actions.length === 1 ? config.actions[0] : undefined);
        back?.onPress();
      }}
    >
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, cardStyle]}>
          <Text style={styles.title}>{config.title}</Text>
          {config.body ? (
            <Text style={styles.body}>{config.body}</Text>
          ) : null}
          <View
            style={[
              styles.actionRow,
              config.actions.length === 1 && styles.actionRowSingle,
            ]}
          >
            {config.actions.map((a, i) => (
              <Pressable
                key={i}
                onPress={a.onPress}
                style={({ pressed }) => [
                  styles.btn,
                  variantStyle(a.variant),
                  pressed && styles.btnPressed,
                ]}
              >
                <Text style={[styles.btnLabel, variantLabelStyle(a.variant)]}>
                  {a.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function variantStyle(v?: GameModalVariant) {
  if (v === 'danger') return styles.btnDanger;
  if (v === 'cancel') return styles.btnCancel;
  return styles.btnPrimary;
}

function variantLabelStyle(v?: GameModalVariant) {
  if (v === 'danger') return styles.btnLabelDanger;
  if (v === 'cancel') return styles.btnLabelCancel;
  return styles.btnLabelPrimary;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '92%',
    maxWidth: 460,
    backgroundColor: '#1a1d24',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 209, 74, 0.55)',
    paddingHorizontal: 22,
    paddingVertical: 22,
  },
  title: {
    color: ui.gold,
    fontSize: T.title,
    fontFamily: fonts.display,
    letterSpacing: 1.5,
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: T.body,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 18,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  actionRowSingle: {
    justifyContent: 'center',
  },
  btn: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  // Shared button system (theme.ts).
  btnPrimary: buttonFill('primary'),
  btnDanger: buttonFill('danger'),
  btnCancel: buttonFill('secondary'),
  btnPressed: buttonPressed,
  btnLabel: {
    fontWeight: '900',
    letterSpacing: 1.5,
    fontSize: T.small,
  },
  btnLabelPrimary: buttonLabel('primary'),
  btnLabelDanger: buttonLabel('danger'),
  btnLabelCancel: buttonLabel('secondary'),
});
