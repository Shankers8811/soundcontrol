# Roadmap

Status legend: ✅ done · 🟡 partial · ⬜ open · 🚫 deliberately not doing.

## Shipped (v1.0.5 + current branch)

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
- ✅ **Protocol correctness suite** — `scripts/verify-protocol.mjs` (479
  checks, runs inside `npm run build`) rebuilds every outbound frame and
  compares against published captures from OpenSCQ30, SoundcoreDesktop,
  Noiseclapper-GNOME, soundcorebridge and soundcore_anker_equalyzer;
  `scripts/test_bridge_probe.py` (51 checks) covers the probe.
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
  (sidebar: Dashboard, Devices, Equalizer, Controls, Settings, About),
  capability-gated everywhere: every control either sends a documented
  frame or renders disabled with the protocol reason (volume, gestures,
  HearID EQ, factory reset, Sleep/Find-My claims removed). Per-side earbud
  status derives from real `0xFF` presence bytes with "unknown" kept
  distinct from "disconnected". Real persisted desktop settings
  (launch-at-login, minimize-to-tray) via Electron IPC.
- ✅ **UI truth test suites** — `npm run test:ui` (pure state-derivation
  checks + server-side render-smoke checks over the real React tree) and
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
  Suites: 170 state + 69 render + 51 bridge + 96 e2e checks.

## Next (small, high value)

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
