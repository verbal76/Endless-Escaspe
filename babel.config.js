// Build-trigger marker. Bumping this comment fires a fresh APK
// build via the apk-build.yml workflow without changing real
// behaviour - babel.config.js is in the path-trigger list and a
// touch here is the cheapest way to ask for a build on demand.
//   build #1 (2025-05-08) - GitHub-hosted Gradle smoke test
//
// No explicit 'react-native-worklets/plugin': babel-preset-expo
// (>= 54) adds it itself whenever react-native-worklets is installed
// (see babel-preset-expo/build/index.js), and listing it again ran the
// transform twice. It must stay LAST among plugins if one is ever
// added by hand again.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
