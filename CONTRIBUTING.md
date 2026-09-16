# Contributing

Thank you. SoundControl is unofficial — be kind, and do not claim it is an Anker
product. Everyone participating is covered by the
[Code of Conduct](.github/CODE_OF_CONDUCT.md).

## Before you write code

- **Node.js 20.19+ or 22.12+** is required (Vite 8 refuses older runtimes).
- `npm ci && npm run build` must pass. That command is the whole gate: it typechecks
  (`tsc --noEmit`) and builds the production site.
- `npm run dev` then open `http://localhost:5173`, or run **Try the demo** — the
  simulator needs no hardware and is a legitimate way to review UI work.
- `npm audit` should stay clean; dependency changes land in the same PR as the
  lockfile update.

## Reporting an issue

Use one of the two templates — **🎧 Device won't connect** or **✨ Feature request**.
They ask for the details that actually decide a fix: which build, which browser, what
state the earbuds were in when you tried to connect, and the hex console output. Search
open and closed issues first; connection reports without a transport and a log line are
usually closed as unreproducible.

Suspected security problems are different: read
[SECURITY.md](.github/SECURITY.md) and open a **private** report instead of an issue.

## Pull requests

1. Keep the UI close to the soundcore Android companion, **without Anker branding**
2. New opcodes belong in `src/protocol/` with a comment and a hex example from a real
   capture — do not guess a byte and ship it as a default button
3. Do not add analytics, accounts, or AI chat
4. One user-visible change per PR; the template's checklist is the review criteria
5. Keep `public/` light: icons pre-rendered at their exact manifest size, device art as
   WebP at 2× the largest size it is displayed at, nothing over ~150 KB per file

A PR that touches a release path (`package.json` version, `.github/workflows/`,
`electron-main.cjs`, `soundcore_bridge.py`) will be built and published by CI, so
expect the reviewer to ask "what did the Windows Build job do?" before "LGTM".

## Safety

Do not publish exploit payloads. Firmware writes you have not captured yourself should
stay behind a comment, not a default button. Anything touching `soundcore_bridge.py`,
`electron-main.cjs`, or `preload.cjs` changes what a local process may do to someone's
hardware: state in the PR description exactly which part you tested on a real device
and which part you could not, because untested code in those files ships to strangers'
ears.

## Cutting a release

Bump `version` in `package.json`, merge, then tag `main`. The **Release Windows**
workflow builds the installer and publishes it; `releases/latest/download/...` links in
the app and README resolve automatically, so no doc needs a version edit.

```bash
git tag vX.Y.Z main
git push origin vX.Y.Z
```
