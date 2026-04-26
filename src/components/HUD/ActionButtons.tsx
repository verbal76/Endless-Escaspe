import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { input } from '../../systems/InputSystem';

// RUN is hold-to-activate (released = walk).
// CROUCH and HIDE are toggles: tap to turn on, tap again to turn off.
// HIDE = prone; the player can crawl while prone.
// Mutual exclusion between CROUCH and HIDE is enforced by the
// PlayerController so toggling one while the other is on works
// consistently regardless of which order the buttons were pressed.

export function ActionButtons() {
  const [crouched, setCrouched] = useState(false);
  const [prone, setProne] = useState(false);
  const [running, setRunning] = useState(false);

  const setRun = (v: boolean) => {
    input.run = v;
    setRunning(v);
  };

  const toggleCrouch = () => {
    const next = !crouched;
    input.crouch = next;
    setCrouched(next);
    // CROUCH and HIDE are mutually exclusive: turning CROUCH on
    // releases prone, and vice versa. The visual state on the
    // buttons stays in sync with the input flags.
    if (next && prone) {
      input.hide = false;
      setProne(false);
    }
  };

  const toggleProne = () => {
    const next = !prone;
    input.hide = next;
    setProne(next);
    if (next && crouched) {
      input.crouch = false;
      setCrouched(false);
    }
  };

  return (
    <View style={styles.row}>
      <Pressable
        onPressIn={() => setRun(true)}
        onPressOut={() => setRun(false)}
        style={[styles.btn, running && styles.btnActive]}
      >
        <Text style={styles.label}>RUN</Text>
      </Pressable>
      <Pressable
        onPress={toggleCrouch}
        style={[styles.btn, crouched && styles.btnActive]}
      >
        <Text style={styles.label}>CROUCH</Text>
      </Pressable>
      <Pressable
        onPress={toggleProne}
        style={[styles.btn, prone && styles.btnActive]}
      >
        <Text style={styles.label}>HIDE</Text>
      </Pressable>
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
  btnActive: {
    backgroundColor: 'rgba(255,210,90,0.45)',
    borderColor: 'rgba(255,210,90,0.85)',
  },
  label: {
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '700',
    letterSpacing: 0.5,
    fontSize: 13,
  },
});
