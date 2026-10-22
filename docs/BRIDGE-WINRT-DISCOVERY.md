# Bridge: RFCOMM service discovery (Windows)

Status: **discovery only**. `connect()` is unchanged and still proves a channel
with the `01:01` handshake. This page explains what the new option does, how to
run it on real hardware, and what to send back.

## Why this exists

On Linux, BlueZ can tell you which RFCOMM channel a service lives on. Windows
offers that metadata only through WinRT — a raw `AF_BLUETOOTH` socket exposes
none — so `Bridge.connect` probes the documented DSP channels
(`4, 12, 15, 10, 30, 1`) and keeps whichever answers the handshake. That works,
but it is guess-and-check: up to six attempts, each with a 2.5 s connect
timeout.

WinRT can instead ask the device which RFCOMM services it advertises. Doing that
first turns channel selection into evidence instead of trial and error.

## What it does — and does not do

| | |
|---|---|
| Enumerates RFCOMM services for one paired device | ✅ |
| Returns service UUIDs as JSON | ✅ |
| Opens a socket, sends the handshake, pairs, or writes | ❌ never |
| Adds a hard dependency | ❌ `winrt` stays optional |

When the optional packages are missing, or the host is not Windows, the helper
reports `available: false` with a reason. Every existing path keeps working
exactly as before, so a packaged build without `winrt` degrades instead of
failing.

## Running it

Install the optional packages into the Python that runs the bridge:

```
pip install winrt-Windows.Devices.Bluetooth \
            winrt-Windows.Devices.Bluetooth.Rfcomm \
            winrt-Windows.Devices.Enumeration
```

Make sure the earbuds are **paired** (Windows Settings → Bluetooth), then:

```
python soundcore_bridge.py --list-services AA:BB:CC:DD:EE:FF
```

Success looks like:

```json
{
  "available": true,
  "reason": null,
  "services": [
    { "uuid": "0CF12D31-FAC3-4553-BD80-D6832E7B3958", "name": "0cf12d31-fac3-4553-bd80-d6832e7b3958" },
    { "uuid": "00001101-0000-1000-8000-00805F9B34FB", "name": "" }
  ]
}
```

Exit code is `0` when discovery succeeded (even with an empty list) and `1` when
it could not run, so it is safe to call from a script.

## What to send back

The JSON above, plus the model and firmware shown in the app. That is enough to
answer the open question:

**Which UUID is the Soundcore DSP?** Once one service is confirmed to carry the
`01:01` handshake, `connect()` can open that service directly on Windows instead
of probing, and the probe stays only as a fallback. Confirming which UUID is
which needs a run on real hardware — it cannot be established from source or
from the Android APK, whose protocol layer is packed (`docs/APK-6.4.0-INVENTORY.md`).

## Not yet claimed

- No Windows hardware has been tested with this option.
- No mapping from any UUID to the DSP channel is asserted. The field
  `connection_service_name` is reported verbatim; its relationship to the
  RFCOMM channel number is not verified.
- Pairing is still out of scope. `PairingSetMembersRequested` (see
  `docs/PARITY-RESEARCH.md`) remains the path for a real in-app pairing flow.

## Tests

```
npm run test:bridge:winrt
```

19 assertions covering the contract: invalid addresses and unknown devices are
reported rather than raised, a missing `winrt` install degrades with an
actionable reason, and GUIDs normalize consistently. The suite fakes WinRT, so
it needs neither Windows-only packages nor hardware.
