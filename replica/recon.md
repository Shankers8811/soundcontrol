# Recon: Soundcore mobile app vs SoundControl

Date: 2026-10-12. Scope: the Soundcore companion app's earbud/headphone controls, compared with the existing SoundControl desktop app.

## Sources read (public pages only)

| Source | URL | Notes |
|---|---|---|
| Google Play listing | https://play.google.com/store/apps/details?id=com.oceanwing.soundcore&hl=en-US | Version 5.0, 4.1 stars, 10M+ downloads, per-device feature set |
| Google Play search page (the URL you gave) | https://play.google.com/store/search?q=anker%20soundcore&c=apps&hl=en-US | Could not be fetched (robots disallow); the main app listing above was used instead |
| App Store listing | https://apps.apple.com/us/app/soundcore/id1331876603 | v5.0.21 notes: new UI, Anka assistant, Insight page, Discover, Community |
| Help center, P42i app functions | https://service.soundcore.com/de/article-description/soundcore-P42i-App-Funktionen-und-Einstellungen | HearID, dual connection, LDAC, custom EQ, spatial audio, gaming mode, hearing health, and the rules about which of them conflict |
| HearID page | https://www.soundcore.com/hearid | HearID tunes sound to the listener; 22 EQ presets to start from |

Not done: no APK teardown, no network capture, no logged-in screens. Screen inventory below is therefore feature-level, not pixel-level.

## What the original does (feature level)

- Per-device pages that show only what the connected model supports.
- Noise control, EQ (22 presets, saved custom presets), HearID test, spatial audio, gaming mode, LDAC, dual connection, Find my earbud, hearing health report, firmware updates.
- Newer cloud layer in v5.0: Anka AI assistant, Insight page, Discover/Content, Community.

## What SoundControl already has

A mature, model-gated Windows/Linux app (about 30 SKU profiles, 479 protocol checks, simulator, e2e tests). Pages: Home, Devices, Equalizer, Noise Control, Settings. See `features.csv` for the line-by-line status.

## What cannot be cloned (skip)

- Anka, Insight, Discover, Community, account sync: cloud services and owned content.
- PowerConf, VR, smart glasses: different product classes with no protocol evidence in the repo.

## Hard parts

1. HearID test and personalised EQ: the project deliberately blocks `03:87` writes because a wrong frame can overwrite a measured hearing profile.
2. Touch remapping, safe volume, spatial modes: writes exist in public references but have no validated read-back lifecycle.
3. Find my earbud and speaker support: no verified opcodes. The roadmap forbids invented ones.

## Size

M for the software-only gaps (preset library, conflict rules, firmware gating). L or blocked for anything needing real-device captures.
