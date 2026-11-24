# SoundControl device profiles

This folder is the **manual download source** for SoundControl device profiles. Nothing here is
downloaded by the app: you download a file, put it in a folder, and the app validates it before
any control is enabled.

A profile is one small JSON file that tells SoundControl how *your exact model* lays out its
ANC, EQ and battery bytes. It is data only — the app never executes it.

- **Looking for a profile?** → [Install a profile](#install-a-profile-windows)
- **Want to tweak your EQ or ANC?** → [Fine-tune a profile in Notepad](#fine-tune-a-profile-in-notepad)
- **Your model is missing and you want it supported?** → [Contribute a profile](#contribute-a-profile)

> **One profile per SKU, not per marketing name.** The same name can hide different hardware
> (A3959 is sold as both **P30i** and **R50i NC**). The SKU is printed on the box and shown in
> the official Soundcore app under the device's settings.

---

## Install a profile (Windows)

1. Open this folder on GitHub and click the `.json` for your model (for example
   [`soundcore-r50i-nc.json`](soundcore-r50i-nc.json)).
2. Click **Download raw file**. (Or right-click **Raw** → **Save link as…**.)
3. Open the profiles folder:
   - In SoundControl: **Settings → Device profiles → Open profiles folder**.
   - In Explorer, paste this into the address bar:
     ```
     %AppData%\soundcontrol\device_profiles
     ```
     (`%AppData%` is `C:\Users\<you>\AppData\Roaming`; the folder is created on the app's first
     launch.)
4. Move the downloaded `.json` into that folder. Keep the `.json` extension.
5. Return to SoundControl. The folder is watched, so the profile applies **without a restart**.
   **Noise Control**, **Equalizer** and the battery readouts now show what your model really
   supports.

If nothing changes, check **Settings → Device profiles**: it lists every file it found, and any
file that failed validation is shown with the exact field and reason. A rejected file is never
partially applied.

`generic_unknown.json` is the built-in last-resort fallback: it reads firmware, serial and
connection state, but deliberately enables no ANC/EQ/toggle controls.

---

## Fine-tune a profile in Notepad

Profiles are ordinary JSON, so you can personalise them without writing any code.

1. Right-click the `.json` → **Open with → Notepad** (or any plain-text editor).
2. Change the values you care about, then save.

Useful fields:

| Field | What it does |
|---|---|
| `features.eq.defaultBands` | The starting custom curve in dB, one value per band. Most models accept `-6`…`+6`; the schema allows `-12`…`+12` where the firmware does. Length must equal `features.eq.bands`. |
| `features.eq.bands` | Must match the command: `02:81` → 8 bands, `02:83` → 10 bands, `03:87` → 10 bands (HearID — SoundControl leaves that EQ read-only). |
| `features.anc.levels` | The manual ANC range to expose. Hardware documents `1`…`5`. |
| `features.anc.adaptiveSensitivity` | Adaptive noise sensitivity range. Hardware documents `0`…`10`. |

Save the file and the app reloads it immediately. If you made a typo, **Settings → Device
profiles** shows the field path (for example `features.eq.defaultBands`) and the reason — fix it
and it becomes usable again. To keep both your tuning and the original, copy the file to a
second name such as `soundcore-r50i-nc-mine.json` and edit the copy. (The `id` inside the file
must stay unique.)

> The app never phones home for a profile. Copying a profile between machines is just copying
> the file.

---

## Contribute a profile

A profile comes from **watching what the official app sends**, not from guessing. The workflow
is: capture Bluetooth traffic → decode it in Wireshark → describe the frames as one JSON file →
open a pull request.

You need:

- the earbuds/headphones and the **official Soundcore app** on a phone,
- an Android phone **or** an iPhone/iPad plus a Mac,
- [Wireshark](https://www.wireshark.org/) on your PC.

> **Privacy first:** Bluetooth captures can contain MAC addresses of nearby devices, your
> phone's name and your device serial. Scrub or redact those before attaching a capture to an
> issue or PR. Never upload the Soundcore APK or any proprietary app binary.

### Capture on Android

1. **Unlock Developer options:** **Settings → About phone** → tap **Build number** seven times.
2. **Enable HCI logging:** **Settings → System → Developer options** → turn on **Enable Bluetooth
   HCI snoop log**. Some manufacturers call it **Bluetooth HCI snoop log** and ask for a reboot;
   reboot if prompted.
3. Connect the earbuds to the phone and open the official **Soundcore** app.
4. **Change one setting at a time** — ANC level, transparency, one EQ band/preset, gaming mode,
   LDAC, dual connection, surround — and wait about two seconds between changes. Write down the
   order; you will need it to match frames to settings.
5. Capture the log using any one of these:
   - **Bug report (no root, easiest):** **Developer options → Take bug report → Full report**,
     wait for it to finish, then copy the ZIP to your PC. Inside the ZIP, search for
     `btsnoop_hci.log` (usually under `FS/data/misc/bluetooth/logs/`).
   - **adb:** with USB debugging on, run `adb bugreport soundcore-capture.zip` and unzip it.
   - **Rooted phone:** copy `/data/misc/bluetooth/logs/btsnoop_hci.log` directly.
6. Unzip and keep `btsnoop_hci.log`.

### Capture on iOS or iPadOS

iOS does not expose the Bluetooth log without Apple's logging profile. You need a **Mac** (for
Xcode/PacketLogger) and a cable.

1. Install **Xcode** from the Mac App Store, then install **Additional Tools for Xcode** from
   Apple's developer downloads. Open **Xcode → Open Developer Tool → PacketLogger**.
2. Install Apple's **Bluetooth logging profile** on the iPhone/iPad: download it from Apple's
   *Bug Reporting Profiles* page in the developer portal, then on the device open **Settings →
   Profile Downloaded → Install**.
3. Connect the iPhone to the Mac by USB and trust the computer.
4. In **PacketLogger**, select the connected iPhone as the capture source and press **Record**.
5. On the phone, connect the earbuds, open the official **Soundcore** app, and change one setting
   at a time, waiting about two seconds between changes. Note the order.
6. Stop recording and save the session as **File → Save As…** with a `.pklg` extension.
7. Copy the `.pklg` to your PC (USB drive, iCloud, or a file share). Wireshark opens it directly.

If your iOS version does not offer a live PacketLogger capture, an alternative is: install the
Bluetooth logging profile, reproduce the steps, then create a **sysdiagnose** (press volume up,
press volume down, then hold the side button until the screen flashes), AirDrop the archive to
the Mac, and look for the Bluetooth HCI log inside it. PacketLogger can open that log too.

### Decode the capture in Wireshark

1. Open Wireshark and load `btsnoop_hci.log` or the `.pklg` file.
2. Narrow the view:
   - Android BLE (most earbuds): filter `btatt`
   - Bluetooth Classic / SPP (several over-ears): filter `btrfcomm`
   - Writes only: `btatt.opcode == 0x12 || btatt.opcode == 0x52`
3. SoundControl speaks the same frame format the official app uses:

   ```
   offset  bytes      meaning
   0       08         host → device (device → host starts with 09)
   1       EE         host magic   (device magic is FF)
   2–4     00 00 00
   5       cat        command family
   6       type       command
   7–8     len        total frame length, u16 little-endian (= 10 + payload length)
   9…      payload
   last    Σ          additive checksum: sum of every preceding byte, mod 256
   ```

   The pair `cat:type` is what SoundControl calls a command, such as `01:03` (battery), `06:81`
   (ANC), `02:81`/`02:83` (EQ), `01:87` (gaming), `01:7F`/`01:FF` (LDAC), `0B:84` (dual
   connection) and `02:86` (surround). [PROTOCOL.md](../PROTOCOL.md) documents what is already
   verified.
4. Match each write to the setting you changed. The payload position of the value and the number
   of EQ gain bytes are exactly what the profile needs.
5. Also capture the device's **state reply** (the `09 FF` frame the app receives after
   `01 01`/`01 03`). The repeated settings bytes in that reply give you the `state` offsets.

Keep the capture file (or an unzipped `btsnoop_hci.log`) with your notes; reviewers need it to
reproduce your result.

### Write the profile JSON

Start from the closest existing file — for a 10-band TWS model,
[`soundcore-r50i-nc.json`](soundcore-r50i-nc.json) is a good template — and edit it in Notepad.
The authoritative contract is
[`shared/device-profile.schema.json`](../shared/device-profile.schema.json).

| Field | What to put there |
|---|---|
| `schemaVersion` | Always `1`. |
| `id` | Stable lowercase id, e.g. `soundcore-a3959`. File name should match. |
| `name`, `sku` | Human name and the Soundcore SKU printed on the box (`A3959`). |
| `kind`, `family` | `earbuds`/`overear` and `tws`/`classic`. |
| `match.names` | Names your device advertises in Windows plus the SKU. Matching is case-insensitive after removing a leading “Soundcore” and all punctuation. |
| `features.anc.layout` | `classic`, `tws-p30i`, `tws-l4nc`, `tws-l3pro`, or `none` — only a layout the capture proves. |
| `features.anc.*` | `levels`, `adaptiveSensitivity`, `scenes`, `transparency`, `wind`, `adaptive`. A layout may be narrowed, never extended beyond the bytes it has. |
| `features.eq.command` + `bands` | `02:81` → 8 bands, `02:83` → 10 bands, `03:87` → 10 bands (HearID, read-only in the app). |
| `features.battery.scale` | Raw scale of the battery byte: `5`, `10` or `100`. `case: true` only if the case level is reported. |
| `features.dualConnection`, `ldac`, `surround`, `gaming`, `multipoint`, `factoryReset` | `true` only when the capture shows the command. `gamingMinFirmware` takes the form `01.60`. |
| `state.*` | 0-based byte offsets into the `01:01` state payload: battery left/right/charging/case, `firmware` and `serial` spans, `eqPresetId`, `eqBands`, `soundModes`. Use `null` for anything the model does not report. |
| `provenance.source` | Where the values came from: capture file, firmware version, PROTOCOL.md section. |
| `provenance.verified` | `true` only after you saw the frames on real hardware and reproduced the setting. |

Validate before opening a PR by dropping the file into
`%AppData%\soundcontrol\device_profiles` and checking **Settings → Device profiles**. In a
checkout that includes the profile pipeline, `npm run verify:profiles` and
`npm run test:profiles` run the same validator over every file in this folder.

### Open the pull request

1. **Fork** the repository: <https://github.com/Shankers8811/soundcontrol/fork>.
2. Clone your fork and create a branch:

   ```bash
   git clone https://github.com/<your-user>/soundcontrol.git
   cd soundcontrol
   git checkout -b profile/<model-id>
   ```

3. Add exactly one file to `profiles/`, named after the `id`:

   ```bash
   cp /path/to/soundcore-<model>.json profiles/
   git add profiles/soundcore-<model>.json
   git commit -m "feat(profiles): add <Model name> (<SKU>)"
   git push -u origin profile/<model-id>
   ```

4. Open a **Pull Request into `main`**:
   `https://github.com/Shankers8811/soundcontrol/compare/main...<your-user>:profile/<model-id>`
5. In the description include:
   - the SKU, marketing name and **firmware version**,
   - the settings you changed and in what order,
   - the capture file (redacted) or a link to it,
   - whether you verified it on real hardware (and which app/platform made the capture).

A profile is merged when a reviewer can reproduce the frames. If you cannot capture, open an
issue with the model, SKU, firmware and the controls that are missing — someone else may be able
to capture it.

---

## Validation rules

- One JSON object per file, `schemaVersion: 1`.
- The app validates every file before using it. Invalid files are listed with the exact field and
  reason; they are never partially applied.
- Profile content is **data only**. The app never executes it.
- You may edit a profile. The app respects changed EQ band counts, EQ curves, ANC level limits
  and adaptive-sensitivity limits, but it rejects a field that has no documented wire layout (for
  example a made-up `anc.layout`).
- Unknown keys are rejected so a typo cannot silently look like a working profile.
- The built-in `generic_unknown.json` is always available as a last-resort fallback for firmware,
  serial and presence reads. It does not enable ANC, EQ, gaming, LDAC or multipoint.

## Schema

The authoritative contract is
[`shared/device-profile.schema.json`](../shared/device-profile.schema.json). The executable
validator is [`shared/device-profile-validate.cjs`](../shared/device-profile-validate.cjs).

`$schema` in a profile is only an editor hint. The app never fetches it, so profiles work fully
offline.
