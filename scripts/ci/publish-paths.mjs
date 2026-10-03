// Single source of truth (for scripts and tests) for "which changed files
// make eas-update.yml publish". GitHub's `paths-ignore` cannot read a
// file, so the list is duplicated in eas-update.yml's `on.push.paths-ignore`;
// tests/ciGate.test.ts fails if the two ever differ.
//
// GitHub semantics being mirrored: a push starts eas-update.yml unless
// EVERY changed file matches an ignored pattern.

export const NON_PUBLISHING = [
  'package.json',
  'package-lock.json',
  'app.json',
  'app.config.js',
  'eas.json',
  'babel.config.js',
  'metro.config.js',
  'android/**',
  'ios/**',
  'assets/icon.png',
  'assets/adaptive-icon.png',
  'assets/splash-icon.png',
  'assets/adaptive-icon-background.png',
  '.github/**',
  'scripts/**',
  'tests/**',
  'docs/**',
  '**/*.md',
  '.gitignore',
];

// GitHub glob subset used above: `**/` = any directories (or none),
// `**` = anything, `*` = anything except `/`.
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; ) {
    if (glob.startsWith('**/', i)) { re += '(?:.*/)?'; i += 3; }
    else if (glob.startsWith('**', i)) { re += '.*'; i += 2; }
    else if (glob[i] === '*') { re += '[^/]*'; i += 1; }
    else { re += glob[i].replace(/[.+?^${}()|[\]\\]/g, '\\$&'); i += 1; }
  }
  return new RegExp(`^${re}$`);
}

const COMPILED = NON_PUBLISHING.map(globToRegExp);

export function isNonPublishing(file) {
  return COMPILED.some((re) => re.test(file));
}

/** Changed files that, on their own, make a push start the OTA workflow. */
export function publishingFiles(files) {
  return files.filter((f) => !isNonPublishing(f));
}

export function touchesPublishedPaths(files) {
  return publishingFiles(files).length > 0;
}
