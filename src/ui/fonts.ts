import * as Font from 'expo-font';

// Load the display font before the HUD mounts. Never throws: on any
// failure the game renders with the system font.
export async function loadDisplayFont(): Promise<boolean> {
  try {
    await Font.loadAsync({
      BlackOpsOne: require('../../assets/fonts/BlackOpsOne-Regular.ttf'),
    });
    return true;
  } catch {
    return false;
  }
}
