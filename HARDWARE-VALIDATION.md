# Physical Hardware Validation Checklist

**Status: physical Soundcore hardware validation remains unverified.**

Everything in this repository is tested deterministically without hardware —
unit tests, emulator-driven end-to-end runs, jsdom UI harnesses and Windows CI
smoke/launch workflows (see README → Testing). What no sandbox can do is talk
to a real earbud over RFCOMM. This checklist is the plan for whoever has a
Windows machine and physical Soundcore devices: run it top to bottom and record
the evidence column against each step.

Evidence to capture per step:

- `%AppData%\soundcontrol\main.log` (helper lifecycle, DSP channel adoption)
- the in-app Hex Console (TX/RX frames — every claim below maps to real frames)
- screenshots of the stated UI state

A step **fails** if the UI ever shows a value the device did not report:
a battery percentage without telemetry, a side “Connected” without a wire
byte, a firmware version before `01:05` answers, or an ANC state the device
never mirrored (`06:01`).

---

## Evidence legend — how to read every claim in this repository

Every capability sits at exactly one of five evidence levels. Nothing in this
repository is currently above level 4: level 5 needs physical Soundcore
hardware, which no sandbox has.

| Level | Meaning | Where it is proven |
|-------|---------|--------------------|
| 1 — implemented | The code exists and its wire formats cite published captures | `PROTOCOL.md`; the per-profile `source:` evidence in `src/protocol/devices.ts` |
| 2 — auto-tested | Deterministic unit/parser/state tests pass | `npm run test:ui` (state + render), `npm run test:bridge`, `scripts/verify-protocol.mjs` |
| 3 — emulator-tested | End-to-end runs against the scripted loopback bridge — no radio involved | `npm run test:e2e`, `npm run test:lifecycle`, jsdom UI harness segments |
| 4 — Windows-CI-tested | A real Windows runner installs, launches and smoke-tests the packaged app | GitHub Actions `tests` / `build-win` / `launch-win` workflows |
| 5 — physically verified | A real Soundcore device answered over RFCOMM and the UI matched the wire | **Nothing yet — this checklist is how a flow gets promoted to level 5** |

Levels stack (4 implies a healthy launch path; it does not imply any earbud
ever answered). When you record a result below, cite the step number and keep
the listed evidence: that is what promotes one specific flow from level 4 to
level 5. A claim of “works” without level-5 evidence must always be written
as “implemented and tested without hardware”.

---

## 1. Pairing

| # | Step | Expected |
|---|------|----------|
| 1.1 | Pair the earbuds/headset in Windows → Settings → Bluetooth & devices | Device listed as *Paired*; keep it **connected** (not in pairing mode) |
| 1.2 | Close the Soundcore mobile app on any nearby phone | The RFCOMM channel is not held by the phone |
| 1.3 | Launch SoundControl | Window appears; helper starts (log: `bridge started via …`); no tray icon, no autostart entry created (`openAtLogin=false` is enforced every launch) |

## 2. Discovery

| # | Step | Expected |
|---|------|----------|
| 2.1 | Devices page → **Scan devices** | Paired Soundcore device listed with its Windows-reported name, MAC and (when Windows knows it) an aggregate battery marked “Windows” |
| 2.2 | Compare the listed name against the device label | Name matches; the profile line shows the right model family (e.g. *Liberty 4 NC · A3947*) |
| 2.3 | If the name is missing/garbled, use **Connect by address** | The device connects under its MAC; if the app has never learned a name for that MAC it shows **Unknown model** and *Battery unavailable* — never a guessed percentage |

## 3. Connection

| # | Step | Expected |
|---|------|----------|
| 3.1 | Click **Connect** on the device row | Console shows the channel probe; log: `DSP answered on channel N` (N may be 4, 10, 12… — the first channel that answers the handshake is adopted) |
| 3.2 | Wait for identification | Status badge → **Connected**; header shows the device name; `Linked via … · profile … · DSP chN` in the console |
| 3.3 | Verify telemetry requests went out | Console TX: `01:01` state request, `01:05` serial+firmware, `01:03` battery query — and the device’s RX replies |

## 4. Battery

| # | Step | Expected |
|---|------|----------|
| 4.1 | Both buds in ears / lid open | Earbud Connection card: Left **Connected**, Right **Connected**, percentages matching the Soundcore mobile app (scale-5 models: raw 4 = 80%) |
| 4.2 | Remove/switch off the right bud | Within one poll (≤30 s): Right → **Disconnected**, right percentage gone; left unchanged — no stale value |
| 4.3 | Put it back | Right → **Connected** with a fresh percentage — only after real telemetry |
| 4.4 | Charging state (models that expose it) | Bolt icon matches the mobile app; a side reported absent (`0xFF`) never shows charging |
| 4.5 | Over-ear models (Space One/Q45/Q35/Q30…) | No L/R card at all; a single aggregate level; “Battery unavailable” until the device answers |
| 4.6 | Unknown model (2.3 path) | Sides may show presence (Connected/Disconnected per `0xFF`) but **Battery unavailable** — a raw level is never converted against a guessed scale |

## 5. Noise Control

| # | Step | Expected |
|---|------|----------|
| 5.1 | Open Noise Control (or the Home ANC card) | Mode buttons only for models with a documented `06:81` layout; A3949/A3948 show the honest “not available” note |
| 5.2 | Switch Normal → Transparency → Noise Cancellation | Each click sends one `06:81` frame (console TX); the device audibly changes; a `06:01` mirror confirms the state in the UI |
| 5.3 | Model-specific extras (manual level, wind noise, scenes on classic over-ears) | Only the toggles the model documents; state survives re-polls only when the device confirms |
| 5.4 | Change ANC from the **phone app** while SoundControl is connected | The `06:01` mirror updates the desktop UI — the device report is the only source of confirmed state |

## 6. Equalizer

| # | Step | Expected |
|---|------|----------|
| 6.1 | EQ-capable model (`02:81`/`02:83`) | 22 presets listed; applying one sends the real frame; the device’s EQ mirror updates the UI |
| 6.2 | HearID model (Liberty 4 NC, Liberty 3 Pro, Space One, Q45) | EQ page shows the capability gate explaining the `03:87` frame is not sent — no controls, no guessed payloads |
| 6.3 | Unknown model | EQ gated with the “model could not be identified” note — nothing is sent |

## 7. Disconnect

| # | Step | Expected |
|---|------|----------|
| 7.1 | Switch the earbuds off (or remove the Bluetooth connection in Windows) | The app leaves **Connected** out loud: link-down banner, header → *No device / Not connected* |
| 7.2 | Inspect every surface | Battery, L/R, firmware, serial, ANC and EQ state all cleared — nothing stale survives the dead link |
| 7.3 | Devices → **Disconnect** (manual) | Same cleared state; helper releases the RFCOMM link (log: `disconnected`) |

## 8. Reconnect

| # | Step | Expected |
|---|------|----------|
| 8.1 | Reconnect Bluetooth in Windows, then use the one-tap **Reconnect …** action | Fresh session: probe → DSP channel → identification → telemetry; percentages arrive only from new frames |
| 8.2 | Kill/restart the helper mid-session (advanced) | UI reports the drop honestly; connecting again works; no duplicate sessions, no runaway retry loop |

## 9. Multi-device

| # | Step | Expected |
|---|------|----------|
| 9.1 | Connect device A, note its state; connect device B (scan row or address field) | A’s session is torn down first; B starts from defaults — none of A’s name/battery/L-R/firmware/ANC/capabilities visible |
| 9.2 | Switch back to A | A re-identified (scan name or persisted recents), correct profile and battery scale, fresh telemetry |
| 9.3 | A → disconnect → B, and A → disconnect → reconnect A | Same guarantees through the explicit-disconnect path |

## 10. Shutdown

| # | Step | Expected |
|---|------|----------|
| 10.1 | Close the window (X) | App exits fully: no tray icon, no background helper, no hidden process (Task Manager: no `SoundControl.exe`, no bundled `python.exe`), port 8765 released |
| 10.2 | Reopen | Clean start; the helper is spawned again with a **new** per-session token |
| 10.3 | Reboot Windows without launching SoundControl | SoundControl does **not** start with Windows (no autostart by policy; any legacy registration is removed at launch) |

---

### Recording results

For each section note: device model + SKU, Windows build, SoundControl version,
`main.log` excerpt, and pass/fail per row. A row that shows a value the device
did not report is a defect — file it via Settings → **Report a problem** (the
generated report redacts token-shaped strings and never claims an upload).
