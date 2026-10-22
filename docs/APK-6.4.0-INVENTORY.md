# Soundcore APK 6.4.0 — static inventory (REA)

Generated from the uploaded `Anker+soundcore_6.4.0-17_APKPure.zip`. This records what
is statically observable in the shipped artifact. It is not a behavioural claim: nothing
here was executed, and no earbuds were connected.

## Provenance

| Field | Value |
|---|---|
| APK sha256 | `b9107394df7b5d04b233f9d71c229a731db8cac45f524cf5edb207c0b6583ae2` |
| Size | 298,812,275 bytes (285 MB) |
| Package | `com.oceanwing.soundcore` |
| Application class | `com.oceanwing.soundcore.application.SoundCoreApplication` |
| Flutter AOT | `lib/arm64-v8a/libapp.so`, 10,224,560 bytes, snapshot `f71c76320d35b65f1164dbaa6d95fe09` |
| ZIP inventory | 8,618 nodes / 8,907 occurrences, 0 integrity contradictions |

## Layer status

| Layer | State | Evidence |
|---|---|---|
| Android/Java code | **packed (Ijiami)** | `classes.dex` 333,852 bytes = 163 framework/desugar classes, 0 app classes; `assets/ijiami.dat` 21.6 MB and `ijiami.ajm` 7.4 MB (`indl01` magic) carry no DEX header; `libexecmain.so` contains the string `ijiami` |
| Resources | readable | `resources.arsc` 10.4 MB, 109,208 printable strings |
| Flutter/Dart | readable | `libapp.so` sections located: kind 3 (Dart 2.14 FullAOT); >=1000 package URIs, >=207 dart: URIs, >=4000 class-like tokens (REA caps these as lower bounds) |
| Native libs | readable | `libscsecurity.so` 22,076 bytes; `libexec*.so` ELF |
| Assets | readable | 533 files; `assets/flutter_assets/**`, `assets/lottie/**` |

**Consequence:** static decompilation of the app logic is not available. JADX would
recover the loader stub only. The Dart layer and the resource strings are the
statically useful surfaces; behavioural recovery needs a rooted device (Frida).

## Per-SKU animation/flow map

25 SKU codes appear in `assets/lottie/` filenames. A code here means the
shipped UI contains a dedicated flow for that model — not that the model is
protocol-supported.

| SKU | Flows present |
|---|---|
| A3035 | calibration |
| A3330 | control_device_l, control_device_r |
| A3331 | control_device_l, control_device_r |
| A3388 | control_device_l, control_device_r, datacollection_doubleclick, datacollection_tripleclick |
| A3871 | control_device_l, control_device_r |
| A3872 | control_device_l, control_device_r |
| A3873 | control_device_l, control_device_r |
| A3874 | control_device_l, control_device_r |
| A3876 | control_device_l, control_device_r |
| A3878 | control_device_l, control_device_r |
| A3927 | control_device_l, control_device_r |
| A3937 | control_device_l, control_device_r |
| A3943 | control_device_l, control_device_r |
| A3944 | control_device_l, control_device_r |
| A3947 | control_device_l, control_device_r, enviroment |
| A3948 | control_device_l, control_device_r |
| A3949 | control_device_l, control_device_r |
| A3953 | calibrate, control_black_device_l, control_black_device_r, currenthb, posture_front_back, posture_left_right, spatial_audio_fixed, spatial_audio_head_tracking |
| A3955 | control_device_l, control_device_r |
| A3957 | control_device_l, control_device_r |
| A3958 | control_device_l, control_device_r |
| A3959 | control_device_l, control_device_r, control_ip_l, control_ip_r |
| A3968 | control_device_l, control_device_r |
| A3994 | control_device_l, control_device_r |
| A6611 | control_device_l, control_device_r, play, playbar_play |

## Feature copy observed in resources

Representative strings per area. These are the original UI's own words, so they are a
usable checklist for parity work.

### HearID / hearing test

- <<*Please read %s carefully before you start HearID Sound Test
- 22Add your favorite EQ preset to your HearID profile
- 99Are you satisfied with your hearID sound test experience?
- 00Are you sure you want to cancel the HearID test?
- WWAre you sure you want to restart the test? This will delete the current HearID profile.
- Your HearID Sound profile will be smoother and warmer.
- LLChoose your favorite genre of music and integrate it into your HearID curve.
- s hearid sound function!
- iiCreate your unique HearID Sound profile by testing your hearing sensitivity and music genres preferences.
- %%Creating your HearID Sound Profile...
- Custom HearID
- Enable HearID ANC

### Noise control / ANC

- ppA good fit ensures better sound quality and noise cancelling. Take the Fit Test to find the perfect fit for you!
- IIA good seal helps isolate noise for a better noise cancelling experience.
- ANC Level
- ANC On/Off
- ANC Personalized to Ear Canal
- Active Noise Cancellation
- 88Active noise cancellation will be automatically enabled.
- Adaptive ANC
- Adaptive Direction
- Adaptive Mode
- Adaptive Noise Cancelling
- ##Adaptive Sound Leakage Compensation

### Spatial / surround

- 360 Surround Sound
- 3D Surround Sound
- 3D Surround Sound On/Off
- ]]Automatically adjust the volume according to the noise levels of the surrounding environment.
- aaAutomatically adjusts to the most suitable noise cancelling mode for the surrounding noise level.
- QQCannot be enabled when Spatial Audio is turned on. Please switch to another mode.
- ``Choose an active noise cancellation mode to reduce ambient noise according to your surroundings.
- 88LDAC is enabled. Spatial audio is currently unavailable.
- Learn about Spatial Audio
- GGNote: 3D Surround Sound can not be used with LDAC, HearID, or EQ modes.
- OpenSurround
- Spatial Audio

### EQ / presets

- !!%1$s EQ from %2$s Shared by %3$s.
- %1$s shared %2$s EQ with you.
- 1. When Enhanced Volume is turned on, Privacy mode and EQ are unavailable.
- 22Add your favorite EQ preset to your HearID profile
- @@Are you satisfied with the EQ settings from the preference test?
- 77Are you sure you want to delete the current EQ profile?
- 55BassUp is not available when using custom EQ settings
- Choose a Custom EQ
- Choose your favorite equalizer
- GGClick the dots to expand the EQ band and drag them to customize the EQ.
- %%Click the dots to expand the EQ band.
- Create EQ profile

### Codecs / LDAC

- ))(Note: LDAC can be turned off in the app)
- ddAfter LDAC is turned on, the headset will no longer be able to connect two devices at the same time.
- Cannot be used with LDAC.
- ffCurrently using "Sound Priority" mode (LDAC), please switch to "Both Sound and Connection" mode first.
- NNDolby audio is not supported in LDAC mode. Please turn off LDAC and try again.
- Dual Connections
- Enable Dual Connections?
- Enable LDAC?
- Enabling Dual Connections...
- HD codec LDAC upgrade portal
- NNHi-Res Audio (LDAC) will be turned off if you want to enable Dual Connections.
- UULDAC can be upgraded and used by selecting Preferred audio quality Mode in Sound Mode

### Touch / controls

- G1. Long press on a blank space on your phone's home screen.
- Double Tap
- Double tap
- 77Enable to hear a prompt tone when using touch controls.
- ;;Failed to copy link. Long press the text and copy manually.
- How to Use Touch Controls
- Intuitive Touch Control
- Long Press
- Long press to power off.
- Long press to turn off
- Long press"+"or " -"
- 22Short press or long press to try different effects

### Sleep / white noise

- **1. Improved Bluetooth/Sleep Mode Switching
- 1. Play the selected sleep music on a loop for better sleep.
- JJ1. Sleep A10 can connect to Bluetooth to play third-party audio and video.
- 2. Select your favorite white noise in the soundcore app and set it as the built-in music.
- CC1. You can play white noise that's stored on the Sleep A10 earbuds.
- 2. Sleep A10 can play white noise in the soundcore app.
- ++2. Sleep A10 supports smart volume control.
- 11A consistent routine is the key to quality sleep.
- About Deep Sleep
- About Light Sleep
- About Sleep Efficiency
- About Sleep Midpoint

### Firmware

- res/oTA.png
- 66%1$s won't run unless you update Google Play services.
-  2. Fold up the left panel, then rotate the right panel to the position where you can see the soundcore logo.
- 3. You cannot exit the app while changing languages. Forcibly exiting the app may cause the update to fail.
- 332. Integrated Audio Library and Page Layout Updates
- 66A total of %s weekly targets were achieved this month.
- 33A total of 1 weekly target was achieved this month.
- About Total Sleep
- Automatic Update
- Charging Case Firmware Update
-  Checking for firmware updates
- ##Clash problem fixed, please update.

### Fit test / calibration

- ppA good fit ensures better sound quality and noise cancelling. Take the Fit Test to find the perfect fit for you!
- UUAs shown in the picture, you can calibrate Frames in the app for a better experience.
- Calibrate
- Calibrated.
-   Calibrating data, please wait...
- !!Calibrating... Please stay still.
- Calibrating
- Calibration
- %%Calibration failed, please try again.
- ((Calibration timed out, please try again.
- Fit Test
- llFor the best experience please complete the Wearing Calibration before using the Wearing Detection function.

## Security note

`assets/api_key.txt` (1,350 bytes) ships in plaintext and was **not** printed or copied
here. Treat it as a leaked credential belonging to Anker; do not add it to this repo.

## Next probes (not run)

- Rooted device + Frida: dump the unpacked DEX from the Ijiami loader (`libexec*.so`).
- `inspect_analysis_view` on the Dart snapshot: page the >=1000 package URIs for the app's own module names.
- HCI snoop on the same build to bind UI labels to real opcodes (the method `PROTOCOL.md` already uses).
