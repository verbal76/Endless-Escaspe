import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useStore } from '../../state/store';

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
    <Modal visible transparent animationType="fade">
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
    borderColor: 'rgba(255, 210, 90, 0.55)',
    paddingHorizontal: 22,
    paddingVertical: 22,
  },
  title: {
    color: '#ffd14a',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 14,
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
  btnPrimary: {
    backgroundColor: 'rgba(255, 210, 90, 0.92)',
    borderColor: 'rgba(255, 230, 140, 1)',
  },
  btnDanger: {
    backgroundColor: 'rgba(255, 70, 70, 0.85)',
    borderColor: 'rgba(255, 110, 110, 0.9)',
  },
  btnCancel: {
    backgroundColor: 'rgba(80, 90, 110, 0.55)',
    borderColor: 'rgba(160, 170, 190, 0.55)',
  },
  btnPressed: {
    opacity: 0.7,
  },
  btnLabel: {
    fontWeight: '900',
    letterSpacing: 1.5,
    fontSize: 13,
  },
  btnLabelPrimary: {
    color: '#1b1206',
  },
  btnLabelDanger: {
    color: '#fff',
  },
  btnLabelCancel: {
    color: 'rgba(255,255,255,0.85)',
  },
});
