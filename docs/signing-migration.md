# Moving installs to a production signing key

Today every APK (Build 13 and earlier) is signed with the public Expo
template debug keystore (apk-build.yml; F-7 in the build review). Anyone
can build an APK with our package name that installs over a tester's
copy. A production key (EAS-managed, see `docs/native-batch.md`) fixes
that, but it changes the signature of the app, and that has a cost.

## What happens to existing installs

- Android refuses to update an installed package with an APK signed by a
  different key (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`). The owner must
  **uninstall** Build 13, then install the new APK.
- Uninstalling deletes the app's private data, which includes
  AsyncStorage: `endless-escaspe:saves:v1` (+ `.bak`, `.unreadable`) and
  `endless-escaspe:settings:v1`. **All characters, stages, coins and
  outfits are lost** unless exported first.
- The package name `com.verbal76.endlessescaspe` does not change in this
  plan and must not (a new package is a second app, with the same
  loss and no update path). `versionCode`: the new line must stay above
  the highest installed `versionCode` (`build-N` run number, N >= 13) or
  Android reports `INSTALL_FAILED_VERSION_DOWNGRADE`; see
  `docs/native-batch.md` for `eas build:version:set`.
- OTA is unaffected by the key itself: updates are matched on runtime
  version and channel, not on the signature.

## Does Android Auto Backup save us?

Short answer: do not rely on it.

- `android:allowBackup="true"`: this is the Expo default
  (`@expo/config-plugins` `AllowBackup.js`: `config.android?.allowBackup ?? true`)
  and the prebuilt manifest shows it. `app.json` does not override it.
  Auto Backup therefore is on for the app's data (cache and no-backup dirs
  are excluded), up to 25 MB per user.
- Documented behaviour (developer.android.com/identity/data/autobackup):
  backups run only when the user has backup enabled, at least 24 hours
  since the last one, the device is idle and on Wi-Fi; data is restored
  when the app is installed, "whether from the Play Store, during device
  setup, or by running adb install".
- So a restore after the reinstall is possible, but only if (a) the
  tester has Google backup on, (b) a backup of the app had run within the
  recent past (the most recent saves may be a day old or older), and (c)
  the installer path triggers a restore (documented for `adb install`;
  not verified for a file-manager sideload). It cannot be tested from CI.
  Treat it as a bonus, never the plan. Not verified: whether a restore is
  attempted when the signing certificate differs from the one that made
  the backup; the documentation does not say.
- Caution: if a restore does happen it can restore an OLDER roster than
  the one exported. The import merge policy below never replaces newer
  data with older, so importing after a restore is safe.

## Practical strategy: export before, import after

1. **Ship export / import as an OTA to the current runtime (0.2.1)**,
   before anything signed with the new key reaches a tester. Build 13
   follows channel `preview` / runtime 0.2.1, so an OTA from the live
   branch reaches it with no new APK. This must happen BEFORE
   `app.json` `version` is bumped on the live branch (see the ordering
   warning in `docs/native-batch.md`: after the bump the live branch can
   only publish for the new runtime).
2. In the OTA: Settings gets "Export saves" (builds the text with
   `buildExport`, hands it to the share sheet via React Native `Share`
   as plain text, so the person can send it to themselves: Notes, email,
   Drive) and "Import saves" (paste into a text field, show the summary
   from `parseExport`, then `mergeImported`, then write).
3. Announce: "Export your saves, uninstall, install the new APK, import."
4. The new APK also contains the import screen (same code), so import
   works on the first launch of the new install. A save text exported
   from Build 13 + OTA must import into the new line: format 1 carries the
   raw saves file, and the game's own parser migrates old shapes at load.
5. Keep the old APK build available until every tester has migrated.

Why text through the share sheet and not a file: no new native module (no
file-system or document-picker package), so the whole feature is OTA-safe
on runtime 0.2.1. A roster is a few KB.

## The prototype logic (this branch)

`src/util/saveExport.ts` (pure, no I/O, no UI) with
`tests/saveExport.test.ts`:

- Envelope `{ app: "endless-escaspe", format: 1, exportedAt, saves,
  settings, checksum }`. `saves` is the stored saves file verbatim (so
  entries this build cannot read survive); `settings` is a whitelist of
  the known settings, type-checked and clamped; `checksum` is a 53-bit
  cyrb53 over the canonical (sorted-key) JSON of the other fields.
  The checksum catches truncated or mangled copy-paste; it is not tamper
  protection (the text is editable and re-validated on import anyway).
- `parseExport` is strict: size cap, JSON, app name, integer format
  (newer format is refused with its own message), required fields,
  checksum, then `parseSavesFull` from `storage.ts` (the same parser the
  game uses at load), at least one entry. Error codes:
  `too-large`, `not-json`, `not-an-export`, `wrong-app`, `newer-format`,
  `bad-format`, `bad-fields`, `bad-checksum`, `bad-saves`, `no-saves`.
- `mergeImported` policy: never deletes anything local; a character on
  both sides keeps the higher `stage` (the stage is a high-water mark),
  then the newer `updatedAt`, a full tie keeps local; whole entries are
  chosen, never mixed field by field (coins are spendable, so combining
  would mint coins or double-pay star rewards); characters only in the
  export are added (keys compared with `saveKeyFromName`, as the game
  does); an imported unreadable entry is added only when its key is free;
  local unreadable entries are never replaced. Importing the same text
  twice is a no-op. Settings: local values win, only the sticky
  `tutorialSeen` / `bossModeUnlocked` flags are OR-ed, and a device with
  no settings takes the imported ones.
- Deliberate deviation from the brief: `serializeSave` in `storage.ts`
  is module-private (it needs the loaded roster's carry state), so it is
  not reused. Export writes the stored file as-is; the merge returns
  parsed `Save` objects (which `parseSavesFull` builds with unknown
  fields spread through) for `writeSaves`.

## Not done here (post-playtest task, must ship by OTA before the key switch)

- UI: the two buttons, the paste field, the confirmation summary
  ("3 characters; 1 will replace yours because it is further along"),
  the share call, error display.
- Wiring: read raw values (`AsyncStorage.getItem` of the two keys),
  call `mergeImported`, persist via `writeSaves(result.saves)` and
  `saveSettings`. Imported unreadable entries (`result.passthrough`) can
  only be persisted through `storage.ts`'s carry state, which has no
  public setter: either accept that those rare entries are dropped on
  import, or add a small exported helper to `storage.ts` in that change
  (this task was not allowed to touch it).
- A real-device test of the full cycle: export on Build 13 + OTA,
  uninstall, install the new APK, import, compare.

## Deadline logic

The export feature has to be live on every tester's phone before they
uninstall: publish the OTA, wait for it to be applied (the app applies an
update on the launch after it downloads), confirm in Settings -> Build /
Update Info that the OTA number is the export build, only then distribute
the new APK.
