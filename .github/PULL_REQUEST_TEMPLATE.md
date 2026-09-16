## What changes

One or two sentences on the user-visible effect. Closes # (issue number, if any).

## Why

Link the parity gap, bug, or advisory this addresses. For protocol work, name the
category/command from [PROTOCOL.md](../PROTOCOL.md).

## Verification

- [ ] `npm run build` passes (typecheck + production build)
- [ ] Windows desktop path exercised (`npm run electron`) or Demo Mode
- [ ] Paired-device discovery and the bundled helper checked if the change touches
      `electron-main.cjs`, `soundcore_bridge.py`, or `src/transports/bridge.ts`
- [ ] `npm audit` reports no new vulnerabilities

## Notes for the reviewer

Hardware behaviour you could **not** verify, and anything that ships a new opcode
(a wrong write can change a device setting the official app cannot restore).

## Housekeeping

- [ ] `version` in `package.json` bumped **only** if this PR is meant to ship a Release
- [ ] Assets keep the current budget: app icons pre-rendered at their exact sizes,
      device art as WebP — nothing over ~150 KB in `public/`
- [ ] No analytics, accounts, or remote calls added
