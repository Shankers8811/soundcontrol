# SoundControl — PC Soundcore App Requirements Audit

This is the repo's honest answer to the community/forum requirements list for a
PC companion app for Soundcore hardware. It is a **checklist, not marketing**:
every item below is mapped to the code that really exists, a documented
protocol limitation, or a product-policy decision.

Status legend:

| Status | Meaning |
|---|---|
| ✅ **Implemented** | Real code path; deterministic tests pass. |
| 🟡 **Partial** | Some of the request works; the missing part is named. |
| ❌ **Not implemented** | Feasible client-side work; no protocol blocker identified. |
| 🚫 **Protocol-blocked** | No documented frame/capture exists. SoundControl refuses to invent one. |
| ⛔ **Deliberately excluded** | Product policy (no tray/background/autostart/telemetry/AI). |

**Truth rule:** a feature is only marked ✅ when the app sends a documented
frame or displays a device-reported value. Anything else is marked 🟡/❌/🚫,
even if it is popular. The evidence commands at the bottom are the checks.

Hardware note: ANC level/scene behavior, Windows volume and single-bud use are
implemented and auto-tested, but **physical validation on the R50i NC / Q30 is
still pending**. See [HARDWARE-VALIDATION.md](HARDWARE-VALIDATION.md).

---

## Scoreboard

| Area | ✅ | 🟡 | ❌ | 🚫 | ⛔ |
|---|---:|---:|---:|---:|---:|
| Must-haves (1–11) | 6 | 0 | 2 | 3 | 0 |
| Single-earbud use (12–15) | 1 | 2 | 0 | 1 | 0 |
| Connection & multipoint (16–21) | 4 | 2 | 0 | 0 | 0 |
| Windows-specific (22–32) | 5 | 2 | 3 | 0 | 1 |
| Polish & compatibility (33–38) | 5 | 1 | 0 | 0 | 0 |
| Lower-priority extras (39–41) | 0 | 0 | 2 | 0 | 1 |
| **Total** | **21** | **7** | **7** | **4** | **2** |

Counts are per numbered requirement below; a combined requirement is counted
once, with its split explained in the row. The anti-complaints (audio quality,
small/fast, no ads/account, no telemetry, no consent) are all ✅ and are
counted inside Windows-specific items 27–31, not as a separate row.

---

## 1. Must-haves

### 1. ANC, Transparency and Normal with adjustable ANC levels — and the true state

**Status: ✅ Implemented (hardware validation pending).**

- All three modes are real `06:81` frames for models with a documented
  sound-mode layout (`src/protocol/packets.ts`, `src/protocol/devices.ts`).
- Manual ANC levels 1–5 are sent in the manual sub-mode. Adaptive and
  multi-scene are separate sub-modes, not a guessed level.
- The A3959 (P30i / R50i NC) fix in this branch sends the correct automation
  byte (`0x00` manual, `0x01` adaptive, `0x02` multi-scene), echoes the
  firmware-owned adaptive strength/sensitivity instead of zeroing them, and
  matches OpenSCQ30's manual vector `06:81 00 25 00 00 01 FF 01`.
- The UI only moves ANC state when a valid `06:01` device report arrives
  (`parseSoundModes` rejects malformed/short frames). Switching Transparency →
  ANC re-sends the last **device-confirmed** scene, so the Q30 "reopens in
  Outdoor" bug cannot be produced by the UI guessing.
- Unsupported models (A3949/A3948) show the honest "noise control is not
  available" note instead of fake buttons.

Evidence: `src/protocol/packets.ts`, `src/state/derive.ts`,
`src/state/store.tsx`, `scripts/verify-protocol.mjs`,
`scripts/test_ui_state.mjs`, `HARDWARE-VALIDATION.md` §5.

### 2. Full EQ: presets, custom EQ, named saved presets, import/export

**Status: ✅ Implemented.**

- ✅ All 22 factory presets are real `02:81` / `02:83` frames, byte-identical
  to published captures.
- ✅ The 8-band custom curve is sent as the real `FE FE` preset.
- ✅ Named user presets are stored in a local library (`sc.eq.presets`) and
  applied through the same documented custom-EQ frame.
- ✅ Import/export is a plain JSON file (`soundcontrol-eq-presets.json`), with
  every band validated and clamped to the protocol range.

The device protocol has no "user preset name" storage, so the library is
explicitly local: the UI says so, and a preset is only shown as active on the
device after the device reports that EQ state back.

Evidence: `src/protocol/presets.ts`, `src/protocol/packets.ts`,
`src/state/localData.ts`, `src/pages/EqualizerPage.tsx`,
`scripts/test_ui_state.mjs` (preset round-trip), `scripts/verify-protocol.mjs`
(22 EQ captures).

### 3. Separate EQ per mode (Normal vs ANC), remembered by the app

**Status: ✅ Implemented (opt-in, local memory).**

The device exposes one EQ state. With **EQ per noise mode** enabled in
Settings, the app remembers one curve per bucket (ANC/Adaptive, Normal,
Transparency) in `sc.eq.modes` and re-sends the same documented EQ frame when
the noise mode changes. It is off by default because an automatic write should
be an explicit choice, and a model without a documented EQ command is never
sent a guessed frame.

Evidence: `src/state/localData.ts` (`sanitizeEqModeProfiles`),
`src/state/derive.ts` (`eqBucketForMode`), `src/state/store.tsx`
(`applyEqMemory`), `src/pages/EqualizerPage.tsx`.

### 4. Preamp / gain control after the equalizer

**Status: ❌ Not implemented; no device preamp byte.**

No public Soundcore RFCOMM capture documents a preamp/gain command. The EQ
frames carry only the 8 band values. A client-side preamp would require DSP in
the audio path, which this app deliberately does not insert (see item 27).

Evidence: `src/protocol/packets.ts` EQ builders; `PROTOCOL.md` category `0x02`.

### 5. Left/right balance

**Status: ✅ Implemented as Windows output balance.**

The Volume card on Home has a balance slider wired to Core Audio's real
per-channel volume scalars (`IAudioEndpointVolume::SetChannelVolumeLevelScalar`).
It is labelled "Windows output balance" because no Soundcore RFCOMM balance
command exists — the earbuds' own hardware balance is untouched.

Evidence: `electron-main.cjs` (`GetBalance`/`SetBalance`), `preload.cjs`,
`src/components/VolumeControl.tsx`.

### 6. Tap/button remapping, including Mute; double-tap skip on Windows

**Status: 🚫 Protocol-blocked.**

Category `0x08` button mappings appear only in inbound state parses; no public
capture shows a write command. The app says so explicitly on the Noise Control
page instead of offering remaps that cannot reach the device. A Windows media
key could be synthesized, but it would not change the earbud's own tap action.

Evidence: `PROTOCOL.md` category `0x08`; `src/pages/ControlsPage.tsx`.

### 7. Battery for left, right and case, with exact percentages and last-known offline

**Status: ✅ Implemented where the model reports it.**

- ✅ TWS left/right percentages come from real `01:03` / `01:01` telemetry,
  with `0xFF` meaning "that side is not connected".
- ✅ Over-ear models show a single reported level.
- ✅ Case battery is shown when the model's documented layout carries the case
  byte (`01:01`); models without it show nothing rather than a guess.
- ✅ Recent devices keep a last-known snapshot (`left`/`right`/`case` plus a
  timestamp), shown as "Last known: … · 2 h ago" when offline.

Evidence: `src/state/derive.ts` (`mergeBatteryTelemetry`, `deriveEarbudState`),
`src/state/localData.ts` (`sanitizeLastKnownBattery`, `formatLastSeen`),
`src/pages/DashboardPage.tsx`, `src/components/EarbudStatusCard.tsx`,
`src/state/store.tsx` recent-device storage.

### 8. Firmware updates

**Status: ❌ Not implemented; OTA writes deliberately blocked.**

The app reads firmware over `01:05` and checks **its own** GitHub releases, but
it does not update earbud firmware. RFCOMM OTA/flash channels are treated as
read/handshake-only per public reverse-engineering notes; a wrong write can
brick hardware. No OTA frame is sent.

Evidence: `src/protocol/packets.ts` (`DEVICE_INFO`), `src/components/UpdatesSection.tsx`,
`ROADMAP.md` "Deliberately not doing".

### 9. HearID and a hearing profile

**Status: 🚫 Protocol-blocked.**

The `03:87` HearID EQ exists, but its per-model layout embeds a personalised
per-device curve and is not published byte-for-byte. A guessed payload could
overwrite a measured hearing profile, so EQ is disabled on HearID models with
an in-app explanation. No hearing test is offered.

Evidence: `PROTOCOL.md` category `0x03`; `src/pages/EqualizerPage.tsx`.

### 10. Find my earbuds

**Status: 🚫 Protocol-blocked.**

No RFCOMM locator/chirp command exists in any surveyed public capture. The app
does not invent `01:88` or similar frames.

Evidence: `PROTOCOL.md` "Find My Device — no capture".

### 11. Game/low-latency mode, 3D surround, wind-noise reduction

**Status: ✅ Implemented where the model documents it.**

- ✅ Game mode: `01:87` (or `10:85` on Liberty 4 NC / Liberty 5).
- ✅ 3D surround: `02:86` on models that document it.
- ✅ Wind-noise reduction: the TWS `06:81` wind byte where the layout carries it.
- Every control is capability-gated; unsupported models show a disabled state
  with the reason.

Evidence: `src/protocol/packets.ts`, `src/state/derive.ts`,
`src/pages/ControlsPage.tsx`, `scripts/verify-protocol.mjs`.

---

## 2. Single-earbud use

### 12. All settings usable with only one bud

**Status: 🟡 Partial (client-side yes; hardware validation pending).**

- The app does **not** show OpenSCQ30's "EQ only when both earbuds are
  connected" gate. ANC, EQ, game mode, surround and the other writes are gated
  only on `connected`, not on both-side presence.
- Battery and presence are per-side, so a missing bud is visible.
- Whether the **firmware** accepts every write with one bud in the case is a
  hardware question; it is not claimed as verified.

Evidence: `src/pages/EqualizerPage.tsx` (`disabled = !app.connected || busy`),
`src/state/derive.ts` per-side presence, `HARDWARE-VALIDATION.md` §4/§5.

### 13. Show a bud as "in case" or "not connected", never as a failure

**Status: 🟡 Partial.**

- ✅ Four-state model: `connected` / `disconnected` / `unknown` /
  `unavailable`; "unknown" is deliberately distinct from "disconnected".
- ✅ A side reported `0xFF` is shown as not connected, with no stale level.
- ❌ "In case" is not detected: the protocol reports presence, not case
  placement. The UI does not pretend to know.

Evidence: `src/state/derive.ts` (`deriveEarbudState`),
`src/components/EarbudStatusCard.tsx`.

### 14. Save settings and re-apply them when the second bud joins

**Status: ✅ Implemented (on by default, local intent only).**

When the device reports a presence transition from one side to both, the app
re-sends the current ANC intent through the documented `06:81` frame and, when
per-mode EQ is enabled, the remembered EQ curve. It only re-applies what the
user actually chose; it never invents settings for a fresh device. The toggle
lives in Settings → Connection & behavior.

Evidence: `src/state/store.tsx` presence-transition effect,
`src/pages/SettingsPage.tsx` (`reapplyOnSecondBud`).

### 15. Per-side tap actions

**Status: 🚫 Protocol-blocked** — same missing `0x08` write command as item 6.

---

## 3. Connection and multipoint

### 16. Auto-reconnect and a fast first connection

**Status: ✅ Implemented (auto-reconnect is opt-in).**

- ✅ Fast discovery: `/scan` now uses WinRT `BluetoothDevice.ConnectionStatus`
  (~0.5 s) with a paired-registry fallback, instead of the old PnP loop that
  could exceed the helper timeout.
- ✅ One-tap reconnect from the local Recent list (keyed by MAC).
- ✅ Optional reconnect to the most recent device on launch (Settings →
  Connection & behavior, off by default). It uses the same bridge session as a
  manual connect and never runs in the background.

Evidence: `soundcore_bridge.py` (`_windows_paired_devices`),
`src/pages/DevicesPage.tsx` Recent card, `src/state/store.tsx` auto-reconnect
effect.

### 17. Dual-connection control; automatic vs manual switching; active device

**Status: 🟡 Partial.**

- ✅ The `0B:84` dual-connection toggle is real and capability-gated.
- ❌ No automatic/manual switching mode selector.
- ❌ No "which device is active now" display. No documented frame exposes the
  active host in the public captures surveyed.

Evidence: `src/protocol/packets.ts` (`DUAL`), `src/pages/ControlsPage.tsx`.

### 18. "Re-claim audio on this PC" after a phone call

**Status: ✅ Implemented as a control-link re-claim.**

A **Re-claim audio** button on Home and Devices re-opens SoundControl's RFCOMM
session and says plainly that Windows still owns the A2DP route — if Windows
keeps routing audio to the phone, the user must pick the earbuds as the output
device. The button does not pretend to steal an OS-owned audio route.

Evidence: `src/state/store.tsx` (`reclaimAudio`), `src/pages/DashboardPage.tsx`,
`src/pages/DevicesPage.tsx`.

### 19. Rename devices; support two identical devices

**Status: ✅ Implemented (local display name).**

- ✅ Two identical devices are distinct because recents and scan rows are keyed
  by MAC, not by name.
- ✅ A local display name can be set per recent device; it survives reconnects
  and is shown above the reported device name.
- The device's own Bluetooth name is not written by the app (no rename frame),
  and the UI says the label is local-only.

Evidence: `src/state/localData.ts` (`renameRecentDevice`),
`src/state/store.tsx`, `src/pages/DevicesPage.tsx`.

### 20. Prompts and sounds: turn off the voice prompt; beep/silence; no audio mute

**Status: 🟡 Partial.**

- ✅ The app's own interface sounds are a persisted toggle (`sc.prompts`) and
  are short Web Audio beeps; no audio stream is muted on mode changes.
- 🚫 The **device's** voice prompt ("Noise cancelling on") has no documented
  RFCOMM write command, so it cannot be toggled from the app. Use the phone app
  or the earbud buttons.

Evidence: `src/state/store.tsx` prompts persistence, `src/lib/feedback.ts`.

### 21. Low-battery and "case needs charging" notifications

**Status: ✅ Implemented.**

- ✅ One low-battery nudge per connection (under 20% of the known scale),
  written to the in-app activity log.
- ✅ Optional native Windows toast (Settings → Low-battery notifications, on by
  default) using Electron's `Notification`.
- ✅ The same nudge covers the charging case on models that report a case level.
- The nudge stays silent for an unidentified model, because without a proven
  battery scale the "20%" threshold itself would be a guess.

Evidence: `src/state/store.tsx` `lowBatteryWarned` block,
`electron-main.cjs` (`soundcontrol:notify`), `preload.cjs`.

---

## 4. Windows-specific expectations

### 22. System tray icon with battery, ANC mode and EQ quick-switch

**Status: ⛔ Deliberately excluded.**

SoundControl is a normal desktop app: closing the window exits completely, no
tray icon, no background helper, no autostart. This is a documented product
policy, enforced at startup and covered by the lifecycle tests.

Evidence: `README.md` lifecycle section, `autostart.cjs`,
`scripts/test_main_lifecycle.mjs`.

### 23. Global hotkeys, autostart and start-minimized

**Status: 🟡 Split by policy.**

- ✅ Optional app-wide hotkeys (off by default): `Ctrl+Alt+N` cycles Noise
  Cancellation → Normal → Transparency, and `Ctrl+Alt+E` cycles the factory EQ
  presets. They are registered only while the app runs, released on quit, and
  mapped to the same documented frames a click sends.
- ⛔ Autostart and start-minimized are deliberately excluded: every launch
  enforces `openAtLogin: false`, and closing exits.

Evidence: `electron-main.cjs` (`globalShortcut`), `preload.cjs`,
`src/state/store.tsx` hotkey effect, `autostart.cjs`,
`scripts/test_main_lifecycle.mjs`.

### 24. Per-app or per-game profiles

**Status: ❌ Not implemented.** No app-level profile engine exists.

### 25. Media keys and button actions that work in Windows

**Status: ❌ Not implemented by the app.**

Windows itself handles AVRCP play/pause/skip from the earbuds. The app does not
synthesize media keys or remap buttons (see item 6).

### 26. Volume boost or loudness option

**Status: ❌ Not implemented.**

The Home → Volume card now controls the **Windows default output volume** (Core
Audio `IAudioEndpointVolume`) because no Soundcore RFCOMM volume command
exists. There is no loudness boost/compressor; tools like FxSound remain the
honest option for that.

Evidence: `electron-main.cjs`, `preload.cjs`,
`src/components/VolumeControl.tsx`, `src/vite-env.d.ts`.

### 27. Don't change Windows audio quality while the app is running

**Status: ✅ By design.**

The app never installs an APO, never changes the audio format, and never
inserts a DSP. The volume control only reads/writes the endpoint's master
scalar. The renderer has no audio capture/playback path except short interface
beeps.

Evidence: `electron-main.cjs` volume interop, `src/lib/feedback.ts`.

### 28. Small and fast

**Status: ✅ Implemented and gated.**

- The packaged app ships a Vite-bundled renderer (no runtime node_modules), a
  bundled Python runtime, and a hard CI size gate at 500 MB for the installer
  and `win-unpacked`.
- Discovery is now ~0.5 s on a normal Windows machine instead of a multi-second
  PnP scan.
- No ads, no account, no background updater.

Evidence: `scripts/check-package-files.mjs`, `.github/workflows/*`,
`soundcore_bridge.py`.

### 29. No ads, no coin promos, no required account

**Status: ✅ Implemented.** There is no account system, no ads, no promo/coin
code, and no network requirement for core features.

### 30. No AI features, no telemetry; works offline

**Status: ✅ Implemented.**

- No analytics/telemetry SDK or endpoint exists in the renderer, main process
  or bridge.
- The only network call is the **manual** "Check for updates" against the
  official GitHub Releases API; it is user-initiated and downloads nothing.
- Core control, EQ, ANC and diagnostics work offline.

Evidence: `package.json` dependencies, `src/lib/reporting.ts`,
`src/components/UpdatesSection.tsx`.

### 31. No forced data-sharing consent

**Status: ✅ Implemented.** There is no consent gate and no data collection.
The "Report a problem" flow prepares local text for the user to copy/download;
it does not upload.

Evidence: `src/components/ReportSection.tsx`, `src/lib/reporting.ts`.

### 32. Settings stay where you put them; no reset after restart or mode changes

**Status: 🟡 Partial, with an intentional exception.**

- ✅ Theme (`sc.theme`), interface sounds (`sc.prompts`) and recent devices are
  persisted and survive restarts.
- ✅ ANC mode/level/scene survive mode switches **when the device confirms
  them** via `06:01`.
- 🟡 Device state is deliberately cleared on disconnect/device switch so a
  stale battery/ANC/EQ value can never be shown as current. This is the truth
  policy, not a forgotten setting.
- ✅ Named EQ curves are saved locally and survive a restart; applying one
  sends the documented custom-EQ frame. The active curve still follows the
  device's own report after reconnect, never a local guess.

Evidence: `src/state/store.tsx` `save`/`load`, `clearDeviceState`,
`src/state/localData.ts`, `src/state/derive.ts`.

### 33. Hide or label features a model or firmware doesn't support

**Status: ✅ Implemented.**

- ✅ Every page is capability-gated per profile; unsupported controls render
  disabled with the protocol reason.
- ✅ A3949/A3948 show "no noise control"; HearID models show the `03:87`
  explanation; unknown models gate EQ.
- ✅ Firmware-version gating is implemented: the A3959 gaming command is hidden
  below the documented `01.60` minimum, with the reported firmware shown in
  Settings and on the Noise Control page. An unparseable firmware string never
  hides a model capability.

Evidence: `src/state/derive.ts` (`deriveCapabilities`, `firmwareAtLeast`),
`src/pages/DevicesPage.tsx`, `src/pages/ControlsPage.tsx`,
`src/pages/SettingsPage.tsx`, `scripts/test_ui_state.mjs` (firmware gating).

### 34. Add a device by model name or code

**Status: ✅ Implemented.**

- ✅ The Devices page has a model-profile picker listing every supported
  profile with its SKU; selecting one changes the real protocol profile.
- ✅ Connect-by-MAC is available when Windows cannot name a device.
- ✅ A free-text search filters by model name, SKU or internal id (e.g.
  `a3959`, `R50i NC`); a no-match result explains that unknown models stay on
  the honest generic profile.

Evidence: `src/pages/DevicesPage.tsx` profile picker/search,
`src/protocol/devices.ts` (`DEVICES`).

### 35. Light, dark and system theme

**Status: ✅ Implemented.** System/Dark/Light, persisted (`sc.theme`), applied
live via `data-theme` and `matchMedia`.

Evidence: `src/components/ThemeSection.tsx`, `src/pages/SettingsPage.tsx`.

### 36. CLI and logs view for debugging connection problems

**Status: ✅ Implemented.**

- The Python helper is a CLI (`--host`, `--port`) with `/health` and `/scan`.
- The app has an activity log, a hex TX/RX console, a BLE→RFCOMM capture
  decoder, log export (JSON/CSV), and a "copy report" path.
- Helper lifecycle is logged to `%AppData%\soundcontrol\main.log`.

Evidence: `soundcore_bridge.py`, `src/components/HexConsole.tsx`,
`src/lib/reporting.ts`, `TROUBLESHOOTING.md`.

### 37. Backup/restore of all settings, plus reset to defaults

**Status: ✅ Implemented (local settings; device state excluded by design).**

- ✅ The device factory reset command is capability-gated (`01:85`, only for
  models where it is documented) and never sent speculatively.
- ✅ Settings → Backup & restore exports one JSON file with theme, behaviour
  preferences, saved EQ curves, per-mode EQ memory and the recent list.
- ✅ Restore rejects foreign/corrupt files and sanitizes each section.
- ✅ Reset returns every local setting to its default without touching the
  device; the confirmation text says so.

Evidence: `src/state/localData.ts` (`buildSettingsBackup`,
`parseSettingsBackup`), `src/state/store.tsx`, `src/pages/SettingsPage.tsx`,
`scripts/test_ui_state.mjs` (backup round-trip).

### 38. Wide model coverage

**Status: 🟡 Partial.**

- ✅ 10 profile families with real per-model protocol layouts, including the
  A3959 (P30i / R50i NC) and A3949 (P20i / P25i / R50i).
- ✅ Unverified profiles are labelled `UNVERIFIED` in the picker.
- 🟡 Coverage is intentionally limited to profiles with published evidence;
  Liberty 5 / P40i / R60i NC exist upstream but have no public RFCOMM capture
  here, so they are not claimed.

Evidence: `src/protocol/devices.ts`, `PROTOCOL.md` model table,
`ROADMAP.md` "Open questions".

---

## 5. Lower-priority extras

### 39. Sleep features (alarms, auto-switch when asleep)

**Status: ❌ Not implemented; no documented protocol.** The earlier Sleep claim
was removed rather than faked.

### 40. In-app player or streaming integration

**Status: ❌ Not implemented; out of scope for a control companion.**

### 41. Translation or AI assistant

**Status: ⛔ Deliberately excluded.** No AI features, no cloud dependency, no
translation layer.

---

## What SoundControl will not fake

These are the anti-complaints, enforced in code and tests:

- **No invented opcodes.** No `02:82` BassUp, no `01:88` find-my-device, no
  guessed `03:87` HearID payload, no XOR-framed "write" frames.
- **No fake UI.** A control either sends a documented frame or renders disabled
  with the reason. A battery/ANC/EQ value only appears after device telemetry.
- **No telemetry, account, ads or consent wall.**
- **No tray, background helper, autostart or start-minimized.** Closing the app
  exits and releases port 8765.
- **No audio-quality changes.** No APO, no DSP, no format changes.
- **No cloud sync.** Settings that exist are local (`localStorage`), and the
  app works offline.

---

## Verification commands

Run these to check the claims above:

```bash
npx tsc --noEmit                 # type-check the real app
npm run build                    # protocol verify + type-check + Vite build + package gate
npm test                         # package + UI state/render + bridge + e2e + lifecycle
npm run verify:protocol          # 490 frame/device checks, incl. the A3959 vector
python scripts/test_bridge_probe.py   # 75 bridge/auth/scan checks
node scripts/test_ui_state.mjs   # 292 state-derivation checks
node scripts/test_ui_render.mjs  # 114 server-render checks
```

Physical hardware is still required to promote the ANC/volume/single-bud flows
from "implemented and auto-tested" to "physically verified" — see
[HARDWARE-VALIDATION.md](HARDWARE-VALIDATION.md).

---

## Suggested next supported work (no protocol guesses)

The feasible client-side batch from the previous audit is now implemented:
named EQ presets and import/export, per-mode EQ memory, last-known/case
battery, model search, settings backup/restore/reset, Windows output balance,
low-battery toasts, optional auto-reconnect, second-bud re-apply, firmware-aware
gaming gating, re-claim audio, local rename and optional global hotkeys.

What remains is either protocol-blocked or needs hardware:

1. **Physical validation on R50i NC / Q30** for ANC levels/scenes, Windows
   volume/balance and single-bud writes (see `HARDWARE-VALIDATION.md`).
2. **Per-app profiles** (item 24) would need an OS-level foreground-app watcher;
   no device frame is required, but it is a larger product decision than the
   current local settings.
3. **Device voice-prompt toggle** (item 20) and **tap remapping** (items 6/15)
   remain blocked until a labelled `0x08` write capture exists.
4. **Active multipoint host** (item 17) remains blocked: no documented frame
   reports it.
5. **Firmware OTA** (item 8), **HearID** (item 9) and **find-my** (item 10)
   remain deliberately blocked.

Protocol-blocked requests (HearID, find-my, tap remapping, device firmware
updates, device preamp) stay blocked until a labelled capture exists.
