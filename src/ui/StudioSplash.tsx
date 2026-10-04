import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STUDIO_SPLASH_BACKGROUND, splashPlan } from '../util/studioSplash';

// Opening studio card: the canonical logo centred and fitted ("contain":
// whole artwork, original aspect ratio, never cropped or distorted) on the
// app's boot background (the PNG's transparency shows it), with a short
// fade in / hold / fade out (~2.5 s), silent. Calls onDone exactly once -
// when the fade-out ends, on a safety timer, or at once if the image can't
// be shown - so it can never hold up the app.
export function StudioSplash({ source, onDone }: { source: ImageSourcePropType; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };
  useEffect(() => {
    const plan = splashPlan(source);
    const anim = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: plan.fadeMs, useNativeDriver: true }),
      Animated.delay(plan.holdMs),
      Animated.timing(opacity, { toValue: 0, duration: plan.fadeMs, useNativeDriver: true }),
    ]);
    anim.start(finish);
    // Backstop: if the animation never reports back, still move on.
    const t = setTimeout(finish, plan.durationMs + 800);
    return () => {
      anim.stop();
      clearTimeout(t);
    };
    // finish is stable for the component's lifetime (refs only).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pad = 24;
  return (
    <View
      style={[styles.root, { paddingTop: insets.top + pad, paddingBottom: insets.bottom + pad, paddingLeft: insets.left + pad, paddingRight: insets.right + pad }]}
      accessible
      accessibilityLabel="Hot Attic Games"
    >
      <Animated.View style={[styles.fill, { opacity }]}>
        <Image source={source} style={styles.logo} resizeMode="contain" onError={finish} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: STUDIO_SPLASH_BACKGROUND },
  fill: { flex: 1 },
  logo: { width: '100%', height: '100%' },
});
