// Where the Android back gesture goes on each start-screen step (review
// A-9 / D-5). It mirrors the on-screen BACK buttons; on the home menu it
// returns null so the system handles back (leaves the app) as players
// expect. The demo prompt goes home: the character already exists and
// can be continued from there.
export type StartMode = 'home' | 'name' | 'tutorialPrompt' | 'continue' | 'profile' | 'outfits';

export function startScreenBack(mode: StartMode): StartMode | null {
  switch (mode) {
    case 'home':
      return null;
    case 'outfits':
      return 'profile';
    case 'profile':
      return 'continue';
    case 'name':
    case 'tutorialPrompt':
    case 'continue':
      return 'home';
  }
}
