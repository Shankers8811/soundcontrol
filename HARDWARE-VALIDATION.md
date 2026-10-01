# Windows + Soundcore hardware validation record

> **Physical Soundcore validation: NOT YET PERFORMED.**
>
> This is an **unexecuted test plan and blank result record**, not a certificate,
> release approval, or claim that any Soundcore unit has been connected. Do not
> change this status based on reference captures, a simulator, a green CI badge,
> or a Windows runner with no Bluetooth device/audio endpoints.

**Evidence separation:** Protocol/reference evidence documented; automated tests validated when run; simulator validated where applicable; Windows CI validated only for exact successful SHA; **Physical Soundcore-device validation: NOT YET PERFORMED.**

| Evidence category | What it can establish | What it cannot establish |
| --- | --- | --- |
| Protocol/reference | Per-model packet layouts and upstream observations ([PROTOCOL.md](PROTOCOL.md), [Android feature audit](docs/ANDROID-PARITY-INVESTIGATION.md)); these are not SoundControl sessions. | That a write, ACK, readback or persistent change worked on this unit. |
| Automated tests | Parser, capability, session, UI and helper behavior against test inputs; attach command, date, SHA and results. | Real Bluetooth, firmware compatibility, audio or battery accuracy. |
| Simulator | Local fixture and transport behavior for documented profiles. | A physical Soundcore response. |
| Windows CI | Exact-commit `tests`, `build-win` and `launch-win` checks, if those check runs actually conclude successfully. Smoke tests exercise a packaged desktop app, not Soundcore hardware; audio comparison may be `UNAVAILABLE` on a runner. | A signed public release, a real device connection, Windows audio safety on hardware, or all future commits. |
| Real Windows + physical device | Only dated, device/firmware-specific observations with attached evidence collected by a tester on a Windows PC. | Universal support for untested SKUs/firmware, acoustic ANC performance, microphone quality or battery/case accuracy without separate measurements. |

## Scope and setup (fill in before a run)

Test the actual desktop app on Windows 10/11 with a paired, connected device and
an available Bluetooth adapter. Use an identifiable build from an exact commit;
record whether it is a local/CI **unsigned test build**, not a signed release.
The existing Windows workflows build and launch/smoke the app but do not attach
a physical device. On a Windows test PC, a source build can be prepared with
`npm ci` and `npm run build:win -- --publish never` (do not run a release or
signing workflow for this test). Before testing, verify the packaged
`release/win-unpacked/resources/python/python.exe` exists; the CI build sets
`SOUNDCONTROL_PYTHON_REQUIRED=1` to make a missing bundled helper runtime a
hard failure. Follow the existing installer safety policy; do not bypass
Windows signing gates or present an unsigned build as trusted.
Record the actual installed app version (About), not just `package.json`.

| Environment field | Tester entry (leave blank until observed) |
| --- | --- |
| Tester, date/time and timezone | |
| Windows edition/build and architecture | |
| PC identifier (non-sensitive) and Bluetooth adapter model/driver/firmware | |
| SoundControl Git commit SHA / app version / build or installer artifact ID | |
| Artifact origin; locally built / CI test artifact / signed release; signer if present | |
| CI workflow run URLs, exact SHA, conclusions and audio-endpoint availability (if consulted) | |
| Test location, nearby Bluetooth devices/interference and phone-app state | |
| Windows default audio endpoint, baseline capture path and whether audio endpoints exist | |
| Evidence folder / issue ID; data retention and redaction owner | |

Before each device row, record the **printed SKU/model code** (not just its
marketing alias), firmware of each bud/side if available, and a non-public
identifier for the physical unit. Pair in Windows Settings and close the
Soundcore mobile app before connecting so it does not occupy the control
channel. Do not infer model identity from a similar product name or use the
manual fallback to conceal failed automatic identification. Repeat the
identity check after a restart and after switching devices.

## Per-device execution matrix

Copy a row **per physical unit + firmware + app build + test session**. Do not
pre-fill results from source code, reference implementations or the simulator.
`NOT TESTED` is the initial value of every check, including audio. `NOT
APPLICABLE` means the check does not apply to that form factor/session; `NOT
SUPPORTED` means the exact model is deliberately gated (verify the control is
absent and no write is sent); `OBSERVED ONLY` means a read-only on-device value
was seen but has not met the independent confirmation criteria below. `PASS`
requires recorded on-device evidence for that **specific** check; `FAIL` needs
a failure record; `BLOCKED` needs a reason (e.g. unavailable hardware/endpoint,
missing firmware, or a prerequisite failure). Leave overall result `NOT
TESTED` until the session is actually run; a partial session is `BLOCKED` or
`FAIL` with the outstanding checks identified, not a blanket pass. Track
separate audio, microphone and acoustic/accuracy experiments elsewhere; they
are not implied by a feature's UI result.

| Device/unit ID | Model code | Firmware | PC | Bluetooth adapter | Auto identification | Manual verified-model fallback | Connect | Disconnect | Reconnect | Firmware/serial telemetry | L/R battery | Case battery | ANC | Transparency | EQ presets | Custom EQ | Game Mode | LDAC | Dual connection | Spatial state | Safe Volume state | BassUp state | Other model-specific read-only features | Diagnostics | Overall result | Evidence/log reference | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |  |  |

**Initial candidate units, not tested/approved hardware:** Select only devices
actually available, and add other exact SKUs from
[`src/protocol/devices.ts`](src/protocol/devices.ts). A named alias is not a
substitute for reading the unit's model code.

| Exact SKU | Candidate profile | Reason to prioritize (not an expected outcome) |
| --- | --- | --- |
| A3949 | P20i / P25i / R50i | Factory EQ and Game Mode; ANC/custom EQ must remain gated. Follow [R50i procedure](docs/R50I-R50I-NC-HARDWARE-TEST.md). |
| A3959 | P30i / R50i NC | ANC, transparency, EQ and firmware-dependent Game Mode; same targeted procedure. |
| A3947 | Liberty 4 NC | Case telemetry plus ANC/other model-specific controls. |
| A3040 | Space Q45 | Over-ear battery, noise modes, LDAC/dual connection; double-press BassUp assignment is **read-only**. |
| A3035 | Space One | **Physical validation: PENDING.** Existing OpenSCQ30 A3035 protocol evidence; simulator and automated model/protocol test coverage (not hardware confirmation). Single over-ear battery is read-only/testable. ANC manual/adaptive, wind, LDAC and Dual Connection are hardware-pending. EQ/HearID `03:87` writes: **NOT SUPPORTED / withheld**; firmware flashing: **NOT SUPPORTED**; factory reset: **NOT TESTED / withheld**. Find My Device/acoustic locator is outside desktop scope. Do not claim a write PASS without a validated response, fresh state readback and reconnect confirmation. |
| A3954 | Liberty 4 Pro | Case telemetry and read-only safe-volume/spatial observations; test supported controls separately. |
| A3945 | Life Note 3S | Case telemetry; BassUp and button assignments are **read-only**, not EQ Bass Booster or gesture editing. |
| D1301 | Sleep A30 | Sleep/after-sleep observation is **read-only**; do not send timer/alarm/mixer commands. |
| D1202 / D1202C | P31i / R60i NC | Exact identity/alias and read-only safe-volume/spatial fields; only supported EQ controls. |

Additional implemented over-ear profiles are also candidates under the same
rules — A3004 (Q20i / Q21i NC), A3005 (Q11i), A3027 (Life Q35), A3028 (Life
Q30), A3029 (Life Tune / Life Tune XR), A3030 (Life Tune Pro) and A3062
(Space One Pro). None has been physically validated; each one's write/read
status is pinned in [docs/HEADSET-MODEL-COVERAGE.md](docs/HEADSET-MODEL-COVERAGE.md)
and in `npm run test:matrix`.

The **11** profiles with case-battery layout evidence are A3945, A3330,
A3388, A3968, D1202, A3947, A3952, A3936, A3954, A3955 and A3957.
This means an implemented parser/eligible read, **not** measured accuracy on
any case. The case value is parsed from validated full `01:01` state for the
exact profile, not inferred from `01:03`, a generic scale or stale telemetry.
If the case is absent or a fresh read does not contain its value, record
unavailable rather than synthesizing a percentage.

## Run sequence and feature-level evidence rules

1. **Startup and discovery:** record app/helper startup, paired-device listing
   (Devices scans automatically and has a **Scan devices** refresh button),
   helper health, and any diagnostic error. Identify from the device reply;
   log automatic match, unknown identity or the reason for a deliberate,
   documented **verified-model** manual fallback separately. An unknown or
   catalog-only identity is universal read-only, not permission to try a
   neighboring model's controls.
2. **Connection and telemetry:** record connection/disconnection and reconnect
   on the same unit, then a different unit if available. Capture fresh
   `01:01` state, `01:05` firmware/serial and battery/presence reads where
   received; check missing, malformed or stale values remain unavailable.
   Check side/case values only when the correct exact-SKU field is reported.
3. **Feature check, one row per feature/action:** record the model/profile,
   firmware, UI before/after, capability gate, fresh device read, frame
   direction and checksum validity (if exposed), and whether a setting
   survives reconnect. A *read-only* observation requires a valid same-session
   reply for that exact model and a displayed value that agrees with the
   parsed field; record `OBSERVED ONLY` if not independently corroborated.
   A **write PASS** additionally requires a supported model-specific query,
   parsed current state, allowed TX, validated response/ACK body, fresh
   post-write re-read/state change and reconnect confirmation. A TX frame, a
   matching command ID, a simulated ACK or a click animation alone is not a
   device-confirmed change. If any confirmation is missing, mark `BLOCKED`,
   `OBSERVED ONLY` or `FAIL` with the missing evidence, not `PASS`.
4. **Audio baseline (separate result):** where actual Windows audio endpoints
   exist, run `scripts/capture-windows-audio-state.ps1` before/after a quiet
   test segment and record files, exit codes and diff. If endpoints are
   unavailable, mark the comparison `NOT TESTED`/`BLOCKED`, never unchanged.
   A changed endpoint/volume/mute/session requires investigation, not a claim
   of audio regression or safety from UI behavior alone. This read-only host
   comparison does not prove acoustic ANC, microphone or battery accuracy.
5. **Diagnostics and teardown:** Settings → Diagnostics → **Open console** →
   **Export JSON** or **Export CSV** captures timestamped TX/RX and checksum
   validity; Settings exposes the Windows log folder containing
   `%AppData%\soundcontrol\main.log` (helper lifecycle/errors). Also save
   screenshots, Windows/adapter identifiers, app build/SHA, firmware, expected
   vs actual, reproduction steps, session timeline and redacted relevant
   logs. Note absent replies explicitly. Disconnect/reconnect and close the
   app; record any failure to restore normal Windows audio state.

Do not use the console's manual injection for this plan. **No undocumented,
unsupported or cross-model writes** to probe an unknown SKU. Do not force a
model profile to make a toggle appear, bypass the independent helper gate,
spoof an ACK, send invalid frames to live hardware, flash firmware, factory
reset, or alter a device's saved gestures. Obtain owner permission and a
recovery plan before even considering disruptive tests. Firmware update
requires a complete safe lifecycle and is **not a test step** here. HearID
editing, touch editing, A3116 device-volume/reset writes and other withheld
operations are not implemented tests. Find My Device is intentionally outside
desktop scope; do not treat its absence as a defect or test target. A3945
BassUp is a distinct read-only state, not the Bass Booster EQ preset; Q45
double-press, safe-volume, spatial and D1301 after-sleep are observations,
not editable controls. Mobile/cloud features are not on-device tests.

## Failure evidence checklist and classification

For every `FAIL`/`BLOCKED`, capture: **(1)** row/feature and expected versus
observed outcome; **(2)** exact SKU, reported identity, firmware, app version,
commit, Windows/adapter information; **(3)** chronological actions,
connection/session boundary and time; **(4)** relevant redacted screenshot,
JSON/CSV TX/RX excerpt including response length/checksum and correlation to
that session (or a clear note that no response arrived); **(5)** redacted
`main.log` and error/timeout; **(6)** fresh reread/reconnect result (or why it
could not be attempted); **(7)** whether Windows audio baseline existed and
comparison result. Keep raw serials, MACs, tokens and private logs out of
public issues; never invent frames or attach another device's session.
Classify the **first verified failure**; link multiple classes if needed.

| Code | Failure class | Examples / next check |
| --- | --- | --- |
| A | Setup / environment | No supported Windows/adapter, endpoint or reproducible build; document blockers. |
| B | Helper launch / health | Helper fails to start/respond; collect `main.log` and health state. |
| C | Discovery / pairing | Host cannot find a paired device; check Windows pairing and refresh. |
| D | Identification / profile gate | Unexpected SKU, ambiguous identity or unsupported control offered; stop writes. |
| E | Connection / transport / session | Probe/channel timeout, stale session, disconnect/reconnect identity leak. |
| F | Framing / parser / telemetry | Bad length/checksum, missing state, wrong scale, stale or fabricated battery/firmware. |
| G | Read-only observation | Display disagrees with fresh exact-SKU field; missing evidence must remain unavailable. |
| H | Supported write / confirmation | TX denied, invalid ACK, failed reread or no reconnect persistence; do not count click as success. |
| I | Diagnostics / evidence | Export missing/corrupt, timestamps uncorrelatable, redaction/logging gap. |
| J | Windows host/audio or other safety | Changed audio state, unsafe operation, installer/signing concern; stop and investigate separately. |

**Exit criterion:** Nothing is physically verified by this document alone.
Only dated per-device rows with evidence and reviewed PASS/FAIL/BLOCKED outcomes
can support a *specific model + firmware + feature* claim. Do not extrapolate
to other SKUs or silently update code/release status. See
[TROUBLESHOOTING.md](TROUBLESHOOTING.md),
[market compatibility](docs/MARKET-COMPATIBILITY.md), and the
[R50i-specific unexecuted procedure](docs/R50I-R50I-NC-HARDWARE-TEST.md).
