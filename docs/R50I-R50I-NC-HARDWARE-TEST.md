# R50i / R50i NC hardware validation procedure

**Status: PHYSICAL VALIDATION PENDING — this checklist has not been executed
for Phase 19 yet. The user has already reported a real desktop ANC failure,
including during playback; Android works on the same earbuds.** Every "SUPPORTED" in `docs/R50I-PROTOCOL.md` means *supported by
protocol evidence* (OpenSCQ30 device definitions + cited captures). Nothing
is physically verified until this procedure runs on real hardware and the
results are recorded below. A simulated/emulated pass is **not** physical
verification.

Repeat this whole procedure **once per model** — R50i (A3949) and R50i NC
(A3959) are different hardware and must be validated separately. Do not copy
results between them.

## What you need

- A Windows 10/11 PC with Bluetooth.
- The earbuds, **paired in Windows** (Settings → Bluetooth & devices) and
  connected — not in pairing mode.
- The Soundcore mobile app closed on any nearby phone (it holds the one
  control slot).
- A SoundControl build installed from the CI artifact (or `npm run build:win`
  locally).
- Evidence capture: `%AppData%\soundcontrol\main.log`, the in-app Hex Console
  (TX/RX frames), and screenshots.

## Windows-audio regression harness (run it around EVERY section)

SoundControl must never touch Windows audio. The read-only harness proves it:

```powershell
# before connecting / before each feature section:
./scripts/capture-windows-audio-state.ps1 -OutFile audio-before.txt
# after the section:
./scripts/capture-windows-audio-state.ps1 -Baseline audio-before.txt
```

Exit `0` + "UNCHANGED" = pass. Exit `1` (state changed: default device,
master volume, mute, per-app sessions) = **REGRESSION — stop and record
FAIL**. The harness only reads (its read-only property is itself
machine-checked in CI); it never changes audio state. Note: Windows itself
or other apps may legitimately change volume while you test — if a
comparison fails, check what else was running, re-run the comparison after a
quiet minute, and record the observation honestly.

## A. Connect + identify (both models)

| # | Step | Expected |
|---|---|---|
| A1 | Capture audio state (harness) | UNCHANGED baseline recorded |
| A2 | Devices page → Scan devices | Device listed with its Windows name + MAC |
| A3 | Click Connect | Console: channel probe, then `DSP answered on channel N`; log `Linked via … · profile …` |
| A4 | **Identification** | R50i → profile line `P20i / P25i / R50i · A3949`; R50i NC → `P30i / R50i NC · A3959` — plus `protocol-verified · physical validation pending`. If the model shows as **Unknown model**, record it: do NOT force a profile |
| A5 | Telemetry | Console shows `01:01` state, `01:05` serial+firmware, `01:03` battery TX and the device's RX replies; firmware + serial appear in the UI; battery matches the Soundcore app (R50i scale 0–5, R50i NC scale 0–10) |
| A6 | Audio harness compare | UNCHANGED |

## B. R50i (A3949) feature tests

| # | Feature | Expected |
|---|---|---|
| B1 | ANC / Transparency controls | **Must not appear at all** — the Noise Control page shows "not available on this model". Record if any ANC control is visible (FAIL) |
| B2 | EQ factory preset (e.g. Bass Booster) | Frame `02:83` TX in the console; preset id `02 00` on the wire; the device's state mirror updates the UI |
| B3 | EQ custom curve | **Must be refused**: "Custom curves are not supported by … — factory presets only". No `FE FE` frame in the console |
| B4 | Gaming mode toggle | Frame `01:87` TX; state mirror byte 65 confirms on/off in the next `01:01` reply |
| B5 | Attempted unsupported features | Surround / dual / LDAC toggles **not shown** (Controls page explains why); injecting a `06:81` or `0B:84` frame in the Hex Console is refused with a model-gate message |
| B6 | Audio harness compare after B2–B5 | UNCHANGED |

## C. R50i NC (A3959) feature tests

| # | Feature | Expected |
|---|---|---|
| C1 | ANC on (level 3) | Frame `06:81` TX, byte0 `00`, manual high nibble `3`, low nibble (read-only adaptive strength) preserved from the device's own state — never synthesized from the level; device mirrors sound modes (`06:01`/state) and the UI shows the confirmed mode |
| C2 | Transparency | byte0 `01`; no vocal sub-mode control is offered (not supported on this model) |
| C3 | Normal | byte0 `02` |
| C4 | Wind-noise toggle | byte4 bit0 follows the toggle in the `06:81` payload |
| C5 | EQ factory preset + **custom curve** | `02:83` factory preset; custom drag commits a `FE FE` frame (this model supports custom presets per OpenSCQ30 — VERIFY on hardware) |
| C6 | Gaming mode | `01:87`; state byte **78** confirms — **only when both buds report firmware ≥ 01.60** (record the firmware shown; below 01.60 the app correctly says confirmation unavailable). Phase 20: the byte is 78, not 77 — the corrected 91-byte A3959 layout is verified against a recorded real state response |
| C7 | Dual connection | `0B:84`; state byte 73 confirms |
| C8 | 3D Surround | `02:86`; state byte 74 confirms |
| C9 | LDAC / factory reset | LDAC toggle **not shown** (no LDAC on this model); Factory reset shows the honest "not offered" note |
| C10 | Audio harness compare after C1–C9 | UNCHANGED |

## D. Disconnect / reconnect / session isolation (both models)

| # | Step | Expected |
|---|---|---|
| D1 | Disconnect | State clears (no stale battery/mode); "Disconnected" badge |
| D2 | Connect the OTHER model (or any device) | Profile re-derived from the new device; **no capability from the previous session survives** (e.g. after R50i NC → R50i, ANC controls must be gone) |
| D3 | Rapid disconnect→reconnect | No error; telemetry belongs to the new session only |
| D4 | Audio harness compare | UNCHANGED |

## E. Record results — one row per test above

Copy this table per model and fill it in. A feature is promoted to
**PHYSICALLY VERIFIED** only with a completed row and the evidence attached.

| MODEL | FIRMWARE | DEVICE NAME | DATE | FEATURE | COMMAND | EXPECTED RESULT | ACTUAL RESULT | PASS/FAIL | WINDOWS AUDIO CHANGED? | NOTES |
|---|---|---|---|---|---|---|---|---|---|---|
| A3949 | | | | | | | | | YES/NO | |
| A3949 | | | | | | | | | YES/NO | |
| A3959 | | | | | | | | | YES/NO | |
| A3959 | | | | | | | | | YES/NO | |

## Promotion rules

- "PASS" rows with attached evidence (log + console frames + screenshot)
  promote the corresponding `SUPPORTED` in `docs/R50I-PROTOCOL.md` to
  **PHYSICALLY VERIFIED** — update that document and the model registry's
  `physicalValidation` field (`src/protocol/modelRegistry.ts`).
- Any FAIL on a safety row (B1, B3, B5, C9, D2, any audio comparison) is a
  release blocker: record it and file it — do not adjust the test to pass.
- "WINDOWS AUDIO CHANGED = YES" is always a blocker, whatever the cause;
  diagnose before continuing.

## R50i NC ANC — Known-Good Android Comparison

**Use the same physical A3959 earbuds for both comparisons.** A3949/P20i,
Q30, another A3959 pair, emulator results and UI screenshots cannot substitute.
The current user report is a failure, not a pending success. New code is a
source-derived candidate correction, not a claimed hardware fix.

### Preparation and continuous-playback comparison

1. Connect the **R50i NC / A3959** to the Android **Soundcore** app. Record model/SKU,
   Android/app versions, left/right earbud presence and whether multipoint is in use.
   Do not publish MAC addresses or serial numbers.
2. Verify physically that Android Normal → Transparency → Manual ANC changes what
   you hear. Use a safe, steady background noise such as a fan; do not introduce
   dangerously loud noise. Record exactly which transitions you feel. If Android
   does not work now, stop: the known-good reference is not established.
3. Record the actual firmware shown by Android (both sides if available), before
   changing anything. **Do not update firmware as part of this comparison.**
   No minimum ANC firmware rule is known; 01.60 in the app concerns gaming only.
4. Disconnect Android Bluetooth/control when necessary; merely closing the app
   may leave a control connection active. Record the action. Avoid simultaneous
   controllers during measurement. Do not unpair/change Windows audio endpoints.
5. Connect **the same earbuds** in SoundControl. Confirm A3959 / profile `p30i`.
   Record app commit/build, `SESSION`, selected `RFCOMM_CHANNEL`, handshake outcome
   and firmware from the `01:05` response. A socket or telemetry response is not
   proof of a usable ANC control channel. If no valid state is returned, stop
   writes and export the timeout; do not try random channels.
6. Start audio playback yourself in your usual player, at a safe, fixed level.
   Keep it playing continuously through all transitions. SoundControl must not
   start/stop audio, change volume/mute, select endpoints, EQ Windows, change
   spatial audio/enhancements, or manipulate the mixer. Playback is only a test
   signal. Take the read-only Windows audio baseline **after** playback starts.
7. Open Noise Control → **A3959 hardware diagnostics**. To know what *should* appear
   for your earbuds' current reported state, run `npm run anc:frames` on the
   computer (read-only tool) — it prints the exact `06:81` frame for every action
   against a stated baseline block, including the recorded-evidence default. Also open Settings →
   Diagnostics / Hex Console when needed. Save the log for this session. Capture
   `ANC_ACTION`, `TX_ACCEPTED`, `TX_SENT`, `RX_RECEIVED`, `RX_FRAME`,
   `RX_SOUND_MODE_MIRROR`, `DEVICE_STATE_CHANGED`, timeouts/errors and the final
   device-report match/mismatch. TX intent alone is not transmission evidence.
8. Click **Read state (A)**, then **Normal (B)**, then **Read state (C)**.
   The action also performs a pre-read and a post-read. Listen while audio keeps
   playing. If a step times out, manually Read state before doing anything else.
9. Click **Transparency (D)**, then **Read state (E)**. Record the physical result.
10. Click **Manual 1 (F)** → **Read state (G)**, then **Manual 5 (H)** →
    **Read state (I)**. Also test manual levels **2, 3, 4** using the numbered
    controls, reading state after each. Do not assume L1 is weakest or L5
    strongest: compare their labels/settings and acoustic effect with Android.
    Repeat Normal → Transparency → L1 → L5 **at least three complete cycles**
    without stopping playback. Wait for each result and listen for a few seconds
    before the next action; this listening interval is not a protocol delay.
11. Compare with Android's physical behavior on this same pair. Record each
    transition using **I felt a change / No physical change / Unsure**. These
    buttons log **user observations** only; they do not certify a build or convert
    device-report confirmation into acoustic confirmation. Then, separately,
    test Adaptive, wind on/off and each scene if Android offers them. Wind needs
    an appropriate *safe* environmental stimulus; a state change alone is not a
    physical wind-suppression test. Export JSON/CSV after each block (2000-row ring).
12. Compare Windows audio state with the baseline and record whether anything
    changed. A difference is a stop condition; document other apps/OS changes,
    do not compensate by changing Windows audio. If endpoints/state cannot be
    captured, record **`AUDIO_STATE_CAPTURE=UNAVAILABLE`**, **NOT PERFORMED**,
    never PASS. Hosted CI's lack of audio endpoints does not prove preservation
    on this physical Windows machine.

### Required observation sheet (one row per transition, including repetitions)

| Session / channel / firmware | Mode requested / level / scene / wind | Complete TX frame(s), ordered + timestamps | Complete 06:81 / 06:01 RX; state excerpt and parsed device report | Device report matches? | Physical effect observed (yes/no/unsure, description) | Windows audio changed? |
|---|---|---|---|---|---|---|
| TO BE RECORDED | Normal | TO BE CAPTURED | TO BE CAPTURED | UNKNOWN | UNKNOWN | UNKNOWN |
| same session | Transparency | TO BE CAPTURED | TO BE CAPTURED | UNKNOWN | UNKNOWN | UNKNOWN |
| same session | Manual 1–5, each separately | TO BE CAPTURED | TO BE CAPTURED | UNKNOWN | UNKNOWN | UNKNOWN |
| same session | Adaptive | TO BE CAPTURED | TO BE CAPTURED | UNKNOWN | UNKNOWN | UNKNOWN |
| same session | Wind off/on | TO BE CAPTURED | TO BE CAPTURED | UNKNOWN | UNKNOWN | UNKNOWN |
| same session | Transport / Outdoor / Indoor, separately | TO BE CAPTURED | TO BE CAPTURED | UNKNOWN | UNKNOWN | UNKNOWN |

**Device report confirmation:** valid matching readback permits the label
**DEVICE REPORT CONFIRMED**, not “ANC works.” A `06:81` reply alone is only
**DEVICE RESPONDED**; reply payload success/error meanings remain unknown.
Only a user's observation permits **PHYSICAL ACOUSTIC EFFECT CONFIRMED BY USER**
for that tested transition. If reports match but you still cannot hear a change,
record both facts; this moves the investigation to firmware command semantics.
A mismatching device report always wins over the requested state in the UI.

### Capture Android's actual working sequence if desktop still fails

Do not invent missing commands or guess an RFCOMM channel.

1. On your own Android phone, enable Bluetooth HCI snoop logging in Developer
   options (availability/export method varies by Android vendor). Start a fresh
   capture **before** reconnecting the earbuds/opening Soundcore so discovery,
   service selection and initialization are included. Record phone/app/firmware
   versions and a local timeline. Do not reset earbuds or modify firmware.
2. With the same earbuds, record baseline state, Normal, Transparency, manual
   levels 1–5, Adaptive, scene selections and wind off/on where offered, noting
   physical effect and click times. Perform one action at a time with stable
   playback. Repeat transitions so spontaneous telemetry can be separated from
   command responses. Also record a reconnect + first ANC change.
3. Export the HCI log locally using Android's supported snoop-log/bugreport
   method. **A full bugreport/HCI log can contain private data from unrelated
   devices and apps. Never commit or upload it wholesale.** Work on a local copy.
4. In Wireshark identify only the earbud connection using local private knowledge.
   Inspect SDP service discovery, L2CAP and RFCOMM setup (DLCI/server-channel
   direction mapping) rather than assuming a channel from an app label. If the
   app actually uses GATT on this firmware, record the service/characteristic,
   write type and notifications; do **not** translate a generic BLE appendix
   into an imagined RFCOMM sequence.
5. Reassemble protocol byte streams across ACL/L2CAP/RFCOMM fragments. Extract
   timestamps/direction and exact framed bytes for the time before, during and
   after each ANC action, including `01:01`, `01:05`, `06:81`, `06:01`, and any
   unknown commands. Keep unknown bytes uninterpreted. Capture preceding command,
   acknowledgement, state query, follow-up, ordering, channel and elapsed times.
6. Compare Android and SoundControl from the same initial device-reported state.
   Compare **every byte**, not just CAT:TYPE. Determine which independent fields
   Android preserves; whether it uses one-field transitions; whether 06:81 is
   acknowledged before the next write; and whether an initialization/session
   command is required. A recurring delay is a measurement, not automatically
   a requirement. Propose no new write/channel until this comparison supports it.
7. Produce a minimal sanitized evidence table: model/firmware/app version,
   anonymous connection id, actual channel or GATT endpoint, relative timestamps,
   complete ANC frames, serial-redacted state frames and physical observations.
   Remove MACs, names, serials, tokens and unrelated Bluetooth packets. Retain the
   original privately so checksums can be checked before redaction. Only then
   update deterministic fixtures with a clearly labeled **real A3959 capture**.

No hardware captures were available when this procedure was written. All blank
results remain UNKNOWN. The Linux/emulated tests cannot fill them in.
