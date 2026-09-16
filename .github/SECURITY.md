# Security Policy

SoundControl writes raw bytes to hardware you wear in your ears, and it reads
which Bluetooth devices your computer has paired with. That is the threat model
this page is about — not a generic checklist.

## Reporting a vulnerability

Please report privately rather than opening a public issue — anything that lets a
website control a device, read paired devices, or corrupt firmware should be fixed
before it is written up.

1. If **Privately report a security vulnerability** is switched on for this repository
   (Settings → General → Security), use the **Report a vulnerability** button under the
   **Security** tab. That is the preferred route: it is private, and it can be promoted
   into a CVE-carrying advisory.
2. Otherwise, open a normal issue titled just `security contact` and nothing else; the
   maintainer will reply with a private channel and delete the issue.

There is no bug bounty. Expect a first response within a week; a fix and a patch
release are the reward.

## What is in scope

- Anything that lets a **web page** reach the local bridge (`127.0.0.1:8765`) or the
  Web Bluetooth session without the user's intent.
- Anything where a malformed RX frame from a device crashes or escapes the parser
  (`src/protocol/codec.ts`, `packets.ts`) or the renderer.
- Anything that lets an attacker write to a device the user did not select
  (`connect` by MAC, `tx` frames, factory reset, firmware paths).
- Path traversal or command execution in the desktop helper: `soundcore_bridge.py`,
  `electron-main.cjs`, `preload.cjs`.
- A malicious dependency, or a release asset differing from what the tag builds.

## What is out of scope

- **Physical/device outcomes.** Sending Soundcore opcodes can reset a device or raise
  its volume; that is what the app is for. Report a *missing confirmation* if you find
  one, but not the capability itself.
- Attacks that already require code execution on the user's machine.
- Unsigned-installer SmartScreen warnings (documented in the README), and the fact
  that this project is not affiliated with Anker.
- Devices, firmware, or the official soundcore app.

## Trust model, as of v1.0.3

- The RFCOMM bridge binds to `127.0.0.1` only, and answers browser requests solely from
  origins this project ships: the packaged desktop app (`file://`, identified by its
  Electron user agent), `http://localhost` / `http://127.0.0.1` dev servers, and
  `https://shankers8811.github.io`. Foreign origins get `403` and
  `null`-origin requests without that Electron marker (e.g. a sandboxed iframe) are
  refused too, so a random web page cannot read your paired devices or write to them.
- The bridge has **no authentication of its own**: any process already running as the
  user can use it, and it speaks plain HTTP/WebSocket on loopback. Do not run it with
  `--host` pointing at a network interface (the helper logs a warning if you do), and
  treat `--allow-origin '*'` as disabling this section.
- A per-session shared secret is the intended next step (tracked by the open
  "bridge trust model" hardening issue). Until then, "loopback + origin allowlist" is
  the boundary, not a strong access control — it stops drive-by web pages, not local
  processes.
- Browser builds use Web Bluetooth only, on a user gesture, and never touch the bridge;
  an https page cannot reach a loopback service, so the Pages deployment has no local
  attack surface.
- **Demo Mode** synthesises everything and never opens a Bluetooth socket — safe to
  run anywhere, including this repository's own CI.
- Releases are built by `.github/workflows/release-windows.yml` from the tag with
  `npm ci` against the committed lockfile. Installers are **unsigned**, which is why
  SmartScreen complains; signatures appear automatically once certificate secrets exist.

## Hardening already applied

| Release | Change |
|---|---|
| 1.0.3 | Bridge answers an allowlisted origin instead of `Access-Control-Allow-Origin: *`; refuses `null`-origin browser traffic that is not the desktop app; logs every rejection; warns when bound off-loopback. Dependencies updated so `npm audit` is clean (23 Electron advisories, 2 high). |
