# SoundControl device profiles

This folder is the **manual download source** for SoundControl device profiles.
The app never downloads anything itself.

## Install a profile

1. Download the `.json` file for your device from this folder on GitHub.
2. Open `%AppData%\soundcontrol\device_profiles` in Explorer. (The app's
   Settings → About section will also provide an **Open folder** button.)
3. Drop the `.json` file into that folder.
4. Return to SoundControl. The folder is watched, so the profile appears
   without restarting the app.

If the folder is empty, the Devices page shows the same instructions instead of
a broken control panel.

## Rules

- One JSON object per file, `schemaVersion: 1`.
- The app validates every file before using it. Invalid files are listed with
  the exact field and reason; they are never partially applied.
- Profile content is **data only**. The app never executes it.
- You may edit a profile. The app respects changed EQ band counts, EQ curves,
  ANC level limits and adaptive-sensitivity limits, but it will reject a field
  that has no documented wire layout (for example a made-up `anc.layout`).
- Unknown keys are rejected so a typo cannot silently look like a working
  profile.
- The built-in `generic_unknown.json` is always available as a last-resort
  fallback for firmware, serial and presence reads. It does not enable ANC,
  EQ, gaming, LDAC or multipoint.

## Schema

The authoritative contract is
[`shared/device-profile.schema.json`](../shared/device-profile.schema.json).
The executable validator is
[`shared/device-profile-validate.cjs`](../shared/device-profile-validate.cjs).

`$schema` in a profile is only an editor hint. The app never fetches it, so
profiles work fully offline.
