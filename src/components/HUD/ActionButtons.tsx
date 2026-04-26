import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { input } from '../../systems/InputSystem';

// All three buttons are now tap-to-toggle. Hold-to-press conflicted
// with the joystick gesture handler on multi-touch (the joystick claims
// the responder and the button's onPressOut never fires), so RUN
// effectively did nothing while moving. Toggles avoid the responder
// fight entirely.
//
// Stance interactions:
// - Toggling RUN on releases CROUCH and PRONE (you stand up to run).
// - Toggling CROUCH on releases PRONE (and vice versa).
// - PlayerController gates p.isRunning on (!crouched && !prone), so
//   the visual button state is always consistent with what the player
//   model is doing.

export function ActionButtons() {
  const [crouched, setCrouched] = useState(false);
  const [prone, setProne] = useState(false);
  const [running, setRunning] = useState(false);

  const toggleRun = () => {
    const next = !running;
    input.run = next;
    setRunning(next);
    if (next) {
      // Standing up to run: drop both stances.
      if (crouched) { input.crouch = false; setCrouched(false); }
      if (prone)    { input.hide = false;   setProne(false); }
    }
  };

  const toggleCrouch = () => {
    const next = !crouched;
    input.crouch = next;
    setCrouched(next);
    if (next && prone) { input.hide = false; setProne(false); }
  };

  const toggleProne = () => {
    const next = !prone;
    input.hide = next;
    setProne(next);
    if (next && crouched) { input.crouch = false; setCrouched(false); }
  };

  return (
    <View style={styles.row}>
      <Pressable onPress={toggleRun} style={[styles.btn, running && styles.btnActive]}>
        <Text style={styles.label}>RUN</Text>
      </Pressable>
      <Pressable onPress={toggleCrouch} style={[styles.btn, crouched && styles.btnActive]}>
        <Text style={styles.label}>CROUCH</Text>
      </Pressable>
      <Pressable onPress={toggleProne} style={[styles.btn, prone && styles.btnActive]}>
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
