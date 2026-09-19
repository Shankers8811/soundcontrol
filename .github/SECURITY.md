# Security Policy

SoundControl writes raw bytes to hardware you wear in your ears, and it reads which
Bluetooth devices Windows has paired. The Windows-only desktop app and its local helper
are the threat model this page covers.

## Reporting a vulnerability

Please report privately rather than opening a public issue. Anything that lets an
unselected device be controlled, paired-device data be exposed, or firmware be corrupted
should be fixed before it is written up.

1. If **Privately report a security vulnerability** is switched on for this repository
   (Settings → General → Security), use the **Report a vulnerability** button under the
   **Security** tab.
2. Otherwise, open a normal issue titled just `security contact` and nothing else; the
   maintainer will reply with a private channel and delete the issue.

There is no bug bounty. Expect a first response within a week; a fix and a patch release
are the reward.

## What is in scope

- Anything that lets a caller reach the local helper without the user's intent.
- Anything where a malformed RX frame from a device crashes or escapes the parser
  (`src/protocol/codec.ts`, `packets.ts`) or the renderer.
- Anything that lets an attacker write to a device the user did not select
  (`connect` by MAC, `tx` frames, factory reset, firmware paths).
- Path traversal or command execution in the desktop helper: `soundcore_bridge.py`,
  `electron-main.cjs`, `preload.cjs`.
- A malicious dependency, or a release asset differing from what the tag builds.

## What is out of scope

- **Physical/device outcomes.** Sending Soundcore opcodes can reset a device or raise
  its volume; that is what the app is for. Report a missing confirmation if you find one,
  but not the capability itself.
- Attacks that already require code execution on the user's machine.
- Unsigned-installer SmartScreen warnings (documented in the README), and the fact that
  this project is not affiliated with Anker.
- Devices, firmware, or the official soundcore app.

## Trust model, as of v1.0.4

- The RFCOMM helper binds to `127.0.0.1` only. The packaged Electron renderer sends a
  per-session secret on every request: `Authorization: Bearer <token>` on HTTP and
  `?token=` on the WebSocket handshake. The secret is minted fresh by Electron on every
  launch, passed to the helper through its environment, and exposed to the renderer over
  isolated IPC. Requests without the secret receive `401`.
- Requests with a foreign origin are rejected. Local development and the packaged
  Electron renderer are the only supported callers. Any process already running as the
  Windows user can still use the loopback helper; the token protects against accidental
  callers, not local code execution.
- Do not run the helper with `--host` pointing at a network interface. The helper logs a
  warning if asked to do so, but loopback is the supported configuration.
- **Demo Mode** synthesises everything and never opens a Bluetooth socket — safe to run
  in CI and while reviewing the renderer.
- Releases are built by `.github/workflows/release-windows.yml` from the tag with `npm ci`
  against the committed lockfile. Release builds are gated on Authenticode signing: without
  the `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` secrets the build fails, and the generated
  installer is signature-verified before the GitHub Release is published. CI/test artifacts
  (not distributed) may be unsigned.

## Hardening already applied

| Release | Change |
|---|---|
| 1.0.3 | Bridge validates its local caller origin, refuses unknown origins, logs rejections, warns when bound off-loopback, and keeps dependencies audited. |
| 1.0.4 | Per-session bridge secret: Electron mints 256 bits per launch, passes it via environment and IPC, and the helper enforces it (`401` without it). |
