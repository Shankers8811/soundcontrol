# PHASE 17 — FINAL REPORT
## Strict Earbud-Only Control Boundary + Windows PC Protection

**Date:** 2026-09-19 · **Branch:** `arena/01a0b5cc-soundcontrol` · **Commit:** `c834012` + the report commit · **PR:** [#27](https://github.com/Shankers8811/soundcontrol/pull/27)

> ## SOUND CONTROL = EAR BUD / HEADPHONE DEVICE CONTROL — NEVER WINDOWS AUDIO
>
> The full control path was audited end to end (Task 1), explicit
> `earbud`/`windows-host` target semantics were introduced (Task 2), and the
> boundary is now **enforced at the protocol layer, twice** — in the renderer
> at the single transport choke point, and independently in the Windows
> helper before the RFCOMM socket (Task 3). No code path anywhere modifies
> Windows PC audio configuration, and a permanent test now fails the build if
> a host-audio API ever appears.

**Note on scope:** the phase text received covers Tasks 1–3 (it appears
truncated after Task 3's "REJECT"). This report therefore closes Tasks 1–3
plus this repository's standing convention (tests, CI verification, final
report). No signing/release work was touched: signing remains
**PRODUCTION AUTHENTICODE SIGNING PENDING** exactly as reported in Phase 16,
version stays **1.0.6**, and the v1.0.6 tag/release remain untouched.

---

## Task 1 — Audit of the entire control path

### The path

```
UI (Controls / Equalizer / Dashboard / HexConsole / Settings pages)
  ↓ React actions (src/state/store.tsx)
write() funnel + attach() handshake writes
  ↓ frames built by src/protocol/packets.ts
transport.write(data)
  ├─ bridge: WebSocket {type:'tx'} → soundcore_bridge.py → BRIDGE.send()
  │          → AF_BLUETOOTH RFCOMM socket → EARBUD (paired MAC, DSP channel)
  ├─ simulator: in-memory demo device (never leaves the process)
  └─ (no other transport exists)
```

**Single install point:** every transport enters through `attach()`
(store.tsx), which is where the Phase 17 boundary wrapper now sits. Every
other write — the `write()` funnel, the connect handshake (`INIT`,
`DEVICE_INFO`, battery, LDAC query), the 30-second battery poll, HexConsole
injection — flows through that installed (wrapped) transport.

### Every command and its target (all EARBUD)

| UI control | Store action | Frame(s) | Command id | Target |
|---|---|---|---|---|
| ANC mode / level / scene | `setAnc`/`sendAnc` | `06:81` | `sound-modes.set` | EARBUD |
| Transparency + vocal mode | `setTransVocal` | `06:81` | `sound-modes.set` | EARBUD |
| Wind-noise suppression | `setWindNoise` | `06:81` | `sound-modes.set` | EARBUD |
| Gaming / low-latency | `setGaming` | `01:87` / `10:85` | `game-mode.set` (−a3947) | EARBUD |
| LDAC codec toggle | `setLdac` | `01:FF` (query `01:7F`) | `ldac.set` / `ldac.query` | EARBUD |
| Dual audio | `setDual` | `0B:84` | `dual-audio.set` | EARBUD |
| 3D Surround | `setSurroundSound` | `02:86` | `surround.set` | EARBUD |
| EQ presets / custom bands | `applyPreset`/`applyBands`/`commitEq` | `02:81` / `02:83` | `equalizer.set`(−drc) | EARBUD |
| Factory reset | `resetDevice` | `01:85` | `device.factory-reset` | EARBUD |
| Diagnostics console | `inject` | registry frames only (now) | *(validated)* | EARBUD |
| Connect handshake / polls | `attach` / interval | `01:01`,`01:03`,`01:05`,`01:7F` | queries | EARBUD |

**Device-side volume:** absent by protocol fact — no published Soundcore
RFCOMM capture contains a volume command. The Volume card is an honestly
disabled control that tells the user to use the Windows mixer or the
earbuds' own buttons; it sends nothing. (Guidance text is not a control.)

### Every Windows touchpoint (infrastructure only — none modify audio)

| Touchpoint | Nature |
|---|---|
| `scan_devices()` / `_windows_paired_devices()` | **Read-only** PnP/registry enumeration of already-paired Bluetooth devices (discovery) |
| RFCOMM socket (`AF_BLUETOOTH`) | Transport to the earbud MAC only |
| `/health`, per-session token, origin allowlist | Helper infrastructure |
| `electron-main.cjs` | App lifecycle: window, tray, log folder, helper spawn |
| `autostart.cjs` | Actively *removes* any legacy autostart registration (product policy) |
| `preload.cjs` | Exactly 3 IPC channels: bridge token, app version, open log folder — **no settings-write, no audio channel, by design** |

**Audit conclusion:** no command anywhere in the codebase targeted the
Windows host for audio control — and, critically, no *capability* to do so
existed either (no audio API referenced anywhere). Phase 17's risk was
therefore prospective: nothing marked the boundary, nothing rejected unknown
frames, and nothing prevented one from being added. Tasks 2–3 close exactly
that.

## Task 2 — Explicit target semantics (`src/protocol/targets.ts`, new)

- `CommandTarget = 'earbud' | 'windows-host'` — the two possible targets,
  explicit in code.
- `EARBUD_COMMANDS` — the registry of all 14 supported Soundcore commands,
  each carrying `{ id, label, target: 'earbud', frames }`. The registry's
  type admits **only** `'earbud'` targets: a host-targeted command cannot be
  registered, only rejected.
- `WINDOWS_HOST_AUDIO_COMMANDS` — an intentionally **empty** list;
  `WindowsHostAudioCommand = never` — an uninhabited type. There is no
  user-facing host-audio command, and the empty registry + tests keep it
  that way.
- `commandForFrameKey()` resolves any `CAT:TYPE` to its registered command.
- No `setWindowsVolume()`-style function exists anywhere; none was removed
  because none ever existed (verified by the audit and the new static scan).

## Task 3 — Protocol-level protection (two independent gates)

**Gate 1 — renderer (`withEarbudOnlyBoundary` + `validateOutboundFrame`).**
`attach()` wraps **every** transport before installation, so every write in
the app passes validation first: structurally valid Soundcore frame (header
`08 EE 00 00 00`, coherent length field, Σ mod 256 checksum) **and** a
registered `CAT:TYPE` **and** resolved target `earbud`. Anything else throws
and is logged (`Earbud-only boundary: frame NOT sent — …`), never
transmitted. A UI bug cannot smuggle an unknown frame past this — the UI is
not trusted.

**Gate 2 — Windows helper (`validate_tx_frame` + `TX_ALLOWED_FRAMES` in
`soundcore_bridge.py`).** Every `tx` WebSocket message is re-validated
against the same 14-command contract **before** `BRIDGE.send()` puts bytes on
the RFCOMM socket. Rejected frames get a clear
`rejected: <reason>` error reply (never a silent drop). Even a compromised
renderer cannot make the helper transmit anything but recognized earbud
commands — and the helper contains no Windows audio APIs at all.

**UI honesty (HexConsole).** The diagnostics console now shows which
registered command a draft resolves to (`sound-modes.set → earbud`) and
disables Send for unrecognized frames, with copy stating the boundary.

**Cross-layer contract.** Both gates enforce the identical 14-frame set;
`scripts/test_command_targets.mjs` and `scripts/test_bridge_probe.py`
cross-check their sides against the same expected list, so the two can never
drift apart silently.

## Test evidence (local + CI, nothing weakened)

| Suite | Checks | Result |
|---|---|---|
| `test:targets` (**new**) — registry integrity, empty host-audio list, 62 legitimate builder frames accepted, 9 malformed/unknown frames rejected, transport choke point (rejected frame never reaches the wire, recognized passes), static host-audio API scan over 58 application files | 20 | ✅ |
| `test:bridge` — +43 checks: all 14 registry frames accepted; empty/truncated/bad-header/length-lie/checksum/unknown-CAT/unknown-TYPE/fantasy-volume frames rejected; handler-level proof a rejected frame **never reaches `BRIDGE.send`** while a recognized frame does | 94 total | ✅ |
| `test:e2e` — strengthened: empty tx → rejected by the frame validator; **new** valid-frame-no-link case preserves "Not connected" coverage; **new** unrecognized-frame case proves rejection before transmission | 98 total | ✅ |
| `test:package`, `test:ui` (state 258 + render 113), `test:lifecycle` | — | ✅ |
| `npm run build` (verify:protocol byte-for-byte captures + `tsc --noEmit` + vite + packaging whitelist) | — | ✅ |

**CI on `c834012`:** Tests ✅ (new step *"Earbud-only control boundary"* green)
· Windows Build ✅ (packaged installer built with the gated helper) · Windows
Smoke ✅ (install/launch/helper/port-lifecycle/uninstall on a real Windows
runner with the new bridge) · Release correctly skipped.

**Static scan detail:** the permanent test asserts zero references to
pycaw, sounddevice, winsound, winmm, CoreAudio, IAudioEndpointVolume,
ISimpleAudioVolume, IAudioClient, IMMDeviceEnumerator, IPolicyConfig,
nircmd, VK_VOLUME, APPCOMMAND_VOLUME, SendInput, keybd_event,
SetMasterVolume, SetDefaultAudioEndpoint, set-audiodevice,
AudioDeviceCmdlets across all application code (renderer, main, preload,
autostart, helper, scripts, bat files). Help text that *tells the user* to
adjust volume in the Windows mixer themselves is guidance, not a control,
and is not a violation.

## Release-safety status (unchanged from Phase 16)

- Signing: **PRODUCTION AUTHENTICODE SIGNING PENDING** (probe annotation on
  the `c834012` build run: `SIGNING_CREDENTIALS not configured`).
- Version: **1.0.6** — no bump, no tag, no release in this phase.
- v1.0.6 preservation: verified — latest release still `v1.0.6`, asset
  `SoundControl-Setup.exe` unchanged since 2026-09-18T18:21:31Z, tags
  v1.0.2–v1.0.6 only.

## Deliverables

| File | Change |
|---|---|
| `src/protocol/targets.ts` | **New** — target semantics, 14-command earbud registry, empty host-audio list, `validateOutboundFrame`, `withEarbudOnlyBoundary` |
| `src/state/store.tsx` | `attach()` wraps every transport in the boundary before installation |
| `soundcore_bridge.py` | Helper-side gate: `validate_tx_frame` + `TX_ALLOWED_FRAMES`, wired into `tx` before `BRIDGE.send` |
| `src/components/HexConsole.tsx` | Command-recognition display; Send gated on recognized frames; boundary copy |
| `preload.cjs` | Documented invariant: no host-audio IPC channel exists or may be added |
| `scripts/test_command_targets.mjs` | **New** — 20-check boundary test incl. static host-audio scan |
| `scripts/test_bridge_probe.py` | +43 helper-side gate checks (94 total) |
| `scripts/test_startup_e2e.mjs` | Strengthened e2e boundary cases (98 total) |
| `package.json`, `.github/workflows/tests.yml` | `test:targets` wired into `npm test` and CI |
| `PROTOCOL.md` | "Command targets and the host boundary" section with the registry table |

**Phase 17 stops here.** Tasks 1–3 are closed: every command provably targets
the connected earbud, unknown commands are rejected at two independent
protocol layers before transmission, and the absence of any Windows-audio
API is now a build-breaking test rather than an assumption.
