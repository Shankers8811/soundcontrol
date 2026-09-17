# Troubleshooting SoundControl

Everything below matches what the app **actually does** today (probe order,
messages, offsets). If a message you see is not covered here, export the log
(Diagnostics → **Export JSON**) and open an issue with it attached.

## Before anything else

1. **Pair the earbuds in Windows Settings → Bluetooth & devices and leave them
   connected** (audio may even be playing). "Pairing mode" is the wrong state —
   the bridge talks to *paired* hardware over RFCOMM.
2. **Close the Soundcore phone app.** The headset serves exactly one control
   client; while the phone holds the slot, new clients are accepted but stay
   silent.
3. Use the Windows desktop app (or the web app **plus** the bundled helper).
   Web Bluetooth alone cannot drive ANC reliably — that is a browser API
   limitation, not a bug.

## "The helper is not responding"

The desktop app starts the bundled Python helper automatically; the web app
expects it on the loopback port. If ConnectSheet shows
*Windows helper: not responding*:

- restart SoundControl;
- check `%AppData%\soundcontrol\main.log` (helper stderr is mirrored there);
- a manual run is `python3 soundcore_bridge.py` (Python 3.8+, no pip
  packages). If a token is configured, the renderer receives it from Electron
  automatically; manual `curl` needs `X-Bridge-Token`.

On a cold start the helper can take a few seconds to begin listening (Electron
gives the Python process a 12 s readiness budget, and first-run antivirus
scans are slow), so the renderer keeps retrying its WebSocket for **15 s**
before failing. If the helper dies mid-session (crash, antivirus kill), the
app restarts it automatically — up to 3 times, with a 1–3 s delay — so a
reconnect usually works without restarting SoundControl; `main.log` shows
`auto-restart n/3` lines when that happens. Connect errors now name the
situation instead of one generic message:

- *did not become ready within 15 seconds* — the helper is still starting or
  failed to start; retry in a moment, then check `main.log`;
- *rejected SoundControl's session token* — a helper from a previous session
  still owns port 8765; restart SoundControl (or end the stale process);
- *helper is running but its WebSocket connection keeps failing* — restart
  SoundControl.

## Connection takes long / fails

The bridge probes the DSP with the `01:01` handshake on channels
**4 → 12 → 15 → 10 → 30 → 1** and keeps the first channel that answers with a
valid `09 FF` frame. Worst case that probe takes ~24 s, inside the renderer's
30 s timeout — a slow first connect is normal, not hung.

The failure message lists **per-channel reasons**, e.g.
`ch4: [Errno 112] Host is down`. Common causes:

| Symptom | Meaning / fix |
|---|---|
| every channel `Host is down` | earbuds asleep or not connected in Windows settings; take them out of the case and retry |
| channels accept but *never answer* | another client holds the control slot (phone app) — close it and retry |
| `no Bluetooth socket` | the Windows Bluetooth stack is off or has no radio |

## "Connected, but battery and ANC stay empty"

You are on the **silent fallback**: a channel accepted the socket but never
answered the handshake. The bridge now says so out loud and keeps retrying the
read-only handshake every 8 s. When the slot frees up (phone app closed, buds
woke), you will see
`DSP answered on channel N after retry — battery and ANC are live now` and
telemetry starts flowing **without reconnecting**. If the message never comes,
the adopted channel is a non-DSP profile (hands-free/A2DP control); reconnect
after closing the phone app.

## Battery shows N/A or odd values

- Levels are **steps, not percent**: 0–10 on P30i/R50i NC, 0–5 on most others;
  the UI converts with the model's scale.
- `0xFF` for a side means *that earbud is not connected to the host* — the UI
  shows which bud is present ("Left earbud detected" etc.). That is real
  presence information; per-ear *wear* sensors are not exposed by this
  protocol on most models.
- Over-ears (Q30/Q35/Space One/Q45…) report **one** level; there is no L/R pair.
- There is deliberately **no case battery** anywhere in the UI: several models
  never report one (the official app hides it too) and over-ears have no case.
  The wire offsets remain documented in PROTOCOL.md for capture decoding.

## ANC / sound modes missing or reverting

- **P20i / P25i / R50i (A3949) and A20i have no sound-mode module at all** —
  the buttons are hidden on purpose; sending a guessed frame would just be
  discarded by the firmware.
- Liberty 4 NC / Space One / Space Q45 use different 6–7 byte layouts; wrong
  layout = silently wrong state, which is why the app keys layouts by SKU.
- Every change re-sends the whole `06:81` payload; if the earbuds were busy
  (audio streaming) you get "Earbuds busy — kept your setting, tap again".

## EQ missing on some models

Liberty 4 NC / Space One / Space Q45 take EQ only over `03:87` (HearID
block), whose layout differs per model and is not publicly captured.
SoundControl **disables** EQ there instead of risking overwriting your measured
hearing profile. Use the Soundcore app for those models' EQ.

## SmartScreen "Unknown publisher"

Only an Authenticode certificate removes it. Routes and the two repository
secrets are documented in README → *Code signing & SmartScreen*; the release
workflow now fails loudly if certificate secrets exist but the installer is
not signed valid.

## Reporting a bug

Diagnostics → **Export JSON** (or CSV) attaches exactly what the app saw.
Use this template:

```
Device: model + SKU (from the app header), firmware (About/diagnostics)
OS / app version:
Steps:
Expected / actual:
Log attachment: soundcontrol-log.json
Bridge stderr (if manual run):
```
