# Roadmap

Status legend: ✅ done · 🟡 partial · ⬜ open · 🚫 deliberately not doing.

## Shipped (v1.0.6, plus the `fix/1.0.6-anc-volume` corrections)

- ✅ **ANC true-state fix (A3959 / P30i / R50i NC)** — the `06:81` automation
  byte now follows the real sub-mode (`0x00` manual, `0x01` adaptive,
  `0x02` multi-scene) instead of always writing manual, the firmware-owned
  adaptive strength/sensitivity bytes are echoed rather than zeroed, and the
  `06:01` mirror parses the sub-mode so the UI can never show a guessed scene.
  The manual vector is pinned to OpenSCQ30's capture:
  `06:81 00 25 00 00 01 FF 01`. Transparency → ANC re-sends the last
  device-confirmed scene, fixing the Q30 "shows/reopens in Outdoor" class of bug.
- ✅ **Fast device discovery** — `/scan` uses WinRT
  `BluetoothDevice.ConnectionStatus` (~0.5 s on a normal machine) and falls
  back to the paired-device registry, replacing the multi-second PnP loop that
  could exceed the helper timeout. Live scan confirmed `soundcore R50i NC`
  (`18:9C:2C:E5:C8:56`) as `connected: true`.
- ✅ **Windows output volume** — Home → Volume now controls the Windows default
  output endpoint through Core Audio `IAudioEndpointVolume` (main-process IPC,
  preload bridge, live slider). No Soundcore RFCOMM volume command exists, so
  the UI labels it as Windows volume rather than a headset change. Interop
  verified `32 → 44 → 32`; physical loudness still needs hardware validation.
- ✅ **Requirements audit** — [REQUIREMENTS.md](REQUIREMENTS.md) maps all 41
  community requirements to ✅ implemented / 🟡 partial / ❌ not implemented /
  🚫 protocol-blocked / ⛔ deliberately excluded, with evidence and honest
  protocol limits. No feature was added just to turn a row green.

- ✅ **Final navigation IA (Pass 8)** — the sidebar is now exactly five
  destinations (Home, Devices, Equalizer, Noise Control, Settings); the
  former About page is a Settings section, the Controls page leads with the
  real ANC component under the name Noise Control, and Settings consolidates
  every secondary feature: Device info, Appearance (System/Dark/Light theme,
  persisted, applied live via `data-theme` + matchMedia), Updates (honest
  check against the official GitHub Releases API — no background updater),
  Feedback & rating and Report a problem (no backend exists, so both prepare
  real local text — token-redacted — for copy/download and link to the
  project's issue tracker instead of pretending to submit), the fixed
  Startup & exit policy, and the diagnostics console.
- ✅ **Release lifecycle policy** — closing the window now always exits
  SoundControl completely: the minimize-to-tray and launch-at-login settings
  were removed (tray, hide-on-close and the settings write IPC with them),
  `window-all-closed`/`before-quit` kill the helper and cancel restart timers,
  and every startup enforces `openAtLogin: false` through Electron's login-item
  API so registrations left by older installs are cleaned up. Legacy
  `settings.json` keys are migrated away at startup. Proven by
  `scripts/test_main_lifecycle.mjs` (real helper children, stubbed Electron)
  and, on Windows CI, by `scripts/smoke-windows-lifecycle.ps1` (packaged app,
  WM_CLOSE, process/port assertions) plus `scripts/verify-autostart.cjs`
  (seeded legacy Run-key entry removed).
- ✅ **Release size gate** — Windows CI measures the real NSIS installer and
  `win-unpacked` tree and fails the build at 500 MB; the package excludes
  source maps, legacy webp assets, test scripts and runtime node_modules
  (the renderer is fully bundled by Vite).
- ✅ **SC monogram app icon** — every shipped raster (window, exe, installer,
  taskbar, shortcut, tray, favicon) plus the in-app brand mark now render from
  one vector source, `assets/icon/sc-monogram.svg`: a waveform-S and an open
  signal-C with its source node on a deep-navy tile, electric-blue strokes,
  legible from 512 px down to the 16 px tray slot. `scripts/generate-icons.mjs`
  regenerates the committed PNG set; no runtime dependency added.
- ✅ **Spoken earbud state** — the earbud panels carry complete accessible
  names ("Left earbud connected, 80 percent", "Right earbud unknown, awaiting
  device telemetry", "… disconnected"), so connection state is never conveyed
  by colour or brightness alone.
- ✅ **DSP channel discovery** — handshake probe over 4/12/15/10/30/1, adopts
  the first channel answering a valid `09 FF`; silent-channel fallback for
  manual console use.
- ✅ **Silent-link watchdog** — names the fake-"Connected" state after 8 s and
  self-heals: background handshake retries until the control slot frees up,
  then announces "battery and ANC are live now".
- ✅ **Protocol correctness suite** — `scripts/verify-protocol.mjs` (490
  checks, runs inside `npm run build`) rebuilds every outbound frame and
  compares against published captures from OpenSCQ30, SoundcoreDesktop,
  Noiseclapper-GNOME, soundcorebridge and soundcore_anker_equalyzer;
  `scripts/test_bridge_probe.py` (75 checks) covers the probe, auth and scan.
- ✅ **Model table by SKU** — A3959 = P30i/R50i NC vs A3949 = R50i, four
  `06:81` sound-mode layouts, 22 preset curves verbatim, custom EQ `FE FE`,
  DRC second channel byte-identical to 22 live P20i captures.
- ✅ **Signing gate + guide** — release workflow reports Authenticode status
  and fails when certificate secrets exist but the signature is invalid;
  README/PUBLISH document SignPath Foundation (free), OV (~$75–200/yr) and
  EV (~$200–400/yr) routes.
- ✅ **UX hardening** — error boundary, recent-device one-tap reconnect
  (localStorage), activity log export (JSON/CSV), low-battery nudge, new
  loading art, bridge diagnostics surfaced in-app.
- ✅ **Desktop UI redesign** — dark-navy/electric-blue desktop layout
  (sidebar: Home, Devices, Equalizer, Noise Control, Settings),
  capability-gated everywhere: every control either sends a documented
  frame or renders disabled with the protocol reason (gestures, HearID EQ,
  factory reset, Sleep/Find-My claims removed). Per-side earbud
  status derives from real `0xFF` presence bytes with "unknown" kept
  distinct from "disconnected". Real persisted desktop settings
  (theme, interface sounds, recent devices) survive restarts.
- ✅ **UI truth test suites** — `npm run test:ui` (261 state-derivation
  checks + 114 server-side render-smoke checks over the real React tree) and
  e2e scenario 7 (per-side earbud telemetry through the real
  helper→WS→transport pipeline; `--earbud-state` on the emulator).
- ✅ **Live L/R correctness (Pass 4)** — battery telemetry merges through a
  single pure `mergeBatteryTelemetry`: a side whose current byte is `0xFF`,
  missing, or untrustworthy (>100) drops to `null` at the source — the old
  `?? previous` fallback that let a stale 90% survive a removed bud is gone.
  Explicit four-state side model (`connected` / `disconnected` / `unknown` /
  `unavailable`) with `supported` flag; unknown renders "Detecting earbuds…"
  and is never conflated with disconnected; disconnect and unexpected
  link-down clear ALL device state (name, battery, presence, charging,
  firmware, serial, ANC intent, feature toggles, EQ); device switch resets
  feature state to power-on defaults; `onRx` ignores checksum-invalid frames;
  malformed `06:01` mirrors can no longer move the confirmed ANC state
  (pure `parseSoundModes`); earbud product art dims per side independently
  from real telemetry. Emulator gains `--earbud-state unknown` and
  `--earbud-script both,left,both` live transitions (e2e scenario 8).
  Suites: 261 state + 114 render + 75 bridge + 96 e2e checks.

## Next (small, high value)

Requirements-audit follow-ups (all client-side; no invented frames — see
[REQUIREMENTS.md](REQUIREMENTS.md) "Suggested next supported work"):

- ⬜ **Named EQ preset library + import/export** — local JSON; the device still
  receives the real `02:81`/`02:83`/`FE FE` curve.
- ⬜ **Per-mode EQ memory** — keep Normal/ANC curves locally and re-apply on a
  device-confirmed `06:01` mode change.
- ⬜ **Last-known battery snapshot** per recent device, with a "last seen"
  timestamp when offline; case level only where the model reports it.
- ⬜ **Settings backup/restore + reset to defaults** (local file, no cloud).
- ⬜ **Model search by name/SKU** in the existing profile picker.
- ⬜ **Windows output balance** through the same Core Audio interop, labelled
  "Windows output balance" (not earbud hardware balance).
- ⬜ **Re-claim audio** reconnect action and local rename for recent devices.

Protocol/platform work:

- ⬜ **Wider device matrix** — community-reported rows (model, firmware,
  what works) collected via the bug-report template in TROUBLESHOOTING.md;
  each report with a capture becomes a pinned verifier check.
- ⬜ **macOS/Linux bridge parity** — RFCOMM via PyBlueZ/socket on Linux works
  today; macOS needs `rfcomm` tooling documented or a small wrapper.
- ⬜ **Firmware-version awareness** — `01:05` already returns firmware; gate
  features whose layout changed across firmware (e.g. A3959 gaming mode needs
  ≥ 01.60 per OpenSCQ30).
- ⬜ **E2E smoke on the simulator** per profile in CI (the simulator already
  drives per-profile offsets).

## Open questions (need hardware captures)

- ⬜ Over-ear state blobs beyond battery (Q30/Q35/Space One/Q45) are not
  published byte-for-byte; firmware/serial deliberately read over `01:05`.
- ⬜ Liberty 5 / P40i / R60i NC profiles exist in OpenSCQ30 but have no public
  RFCOMM capture — they stay unlisted until one appears.

## 🚫 Deliberately not doing

- 🚫 **`03:87` HearID EQ over the wire** — per-model layouts, no labelled
  capture; a guessed frame can overwrite measured hearing profiles. EQ stays
  disabled on those SKUs with an in-app explanation.
- 🚫 **Invented opcodes** — no `02:82` BassUp, no `01:88` find-my-device, no
  XOR-checksum "08…09" framing: none of it exists in any surveyed capture,
  and earlier builds that shipped such frames were wrong.
- 🚫 **Writes to OTA channels** (RFCOMM 12/13/16 on some families) — flash
  channels are read/handshake-only per soundcorebridge's operational notes.
- 🚫 **Cloud sync / mobile companion / telemetry** — out of scope for an
  unofficial, dependency-free desktop companion.
