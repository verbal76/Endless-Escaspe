import React, { useEffect, useRef } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { splashPlan } from '../util/studioSplash';

// Opening studio card: solid black, the canonical logo centred and fitted
// ("contain": whole artwork, original aspect ratio, never cropped or
// distorted), ~1.5 s, silent. Calls onDone once - on the timer, or at
// once if the image can't be shown - so it can never hold up the app.
export function StudioSplash({ source, onDone }: { source: ImageSourcePropType; onDone: () => void }) {
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };
  useEffect(() => {
    const t = setTimeout(finish, splashPlan(source).durationMs);
    return () => clearTimeout(t);
    // finish is stable for the component's lifetime (refs only).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.root} accessible accessibilityLabel="Hot Attic Games">
      <Image source={source} style={styles.logo} resizeMode="contain" onError={finish} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  logo: { width: '100%', height: '100%' },
});
