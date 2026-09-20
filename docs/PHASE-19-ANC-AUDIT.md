# Phase 19 — A3959 ANC failure audit

Date: 2026-09-19. Device: **R50i NC / P30i, A3959 only**.

> **Phase 20 addendum:** this audit's byte-level reasoning was re-checked against
> a *recorded real A3959 `01:01` response* (91-byte payload, firmware `01.64`,
> read-only sensitivity byte = `0xFF`). Two of its own conclusions were wrong and
> are corrected in [`PHASE-20-FINAL-REPORT.md`](../PHASE-20-FINAL-REPORT.md) §2:
> the validator rejected that real device, and the trailing offsets were one byte
> early (gaming is at payload **78**, not 77). The nibble order used here
> (`manual << 4 | adaptive`) is confirmed correct. PR: [#28](https://github.com/Shankers8811/soundcontrol/pull/28).

**The user's hardware report is authoritative:** Android Soundcore changes ANC audibly; the desktop UI changes but physical ANC does not, even during continuous playback. Phase 18 status B is retained; its description “protocol support complete” is not evidence of physical correctness. No earbuds, Windows Bluetooth adapter, user firmware version, or Android HCI recording are available in this checkout/session. No new physical test was performed here.

## 1. Exact desktop path, before this change

1. `src/components/NoiseControl.tsx`: mode buttons call `app.setAnc(mode)`; level buttons pass a level; scene buttons pass a scene. Adaptive calls `setAnc('adaptive')`; wind calls `setWindNoise`.
2. `src/state/store.tsx`: `setAnc` immediately called `setAncMode`, `setAncLevel`, `setAncScene`. `ancIntent` combined the selected mode with local level/scene/wind/transparency fields. These were not necessarily device state.
3. `sendAnc` → `buildAnc(profile.ancLayout, intent)` → `buildP30iAnc` → complete `06:81` frame. No fresh state read, transition planning, firmware response wait, or post-write state read.
4. `write` logged a TX row **before** writing. It also swallowed transport-busy exceptions while keeping the optimistic setting.
5. `withDeviceBoundary` → earbud frame/checksum registry + model gate → `transport.write` (`src/transports/bridge.ts`). The model gate selected P30i, not A3949/classic.
6. `transport.write` called `ws.send({type:'tx',hex})` and immediately resolved. It did not await Python's `sent`, and asynchronous bridge errors could not reject that write promise. Consequently UI success proved only local WebSocket queuing.
7. Python `Handler._handle` decoded hex and independently validated length/checksum/registered CAT:TYPE. `Bridge.send` used a local socket and `tx_lock` around **`sock.sendall(data)`**. Only here did OS RFCOMM transmission occur. `sent` meant socket completion, not firmware acceptance.
8. `_reader` reassembled a byte stream by header/length/checksum, then broadcast RX frames. The renderer verified `09 FF` and checksum. `06:01` parsed the first bytes but ignored A3959 automation/scene and accepted truncated payloads. The full `01:01` state handler **never called `syncSoundModes` at offset 64**, despite documentation claiming it did.
9. A `06:81` acknowledgement was not interpreted as a mode report (correct), but there was no waiter for it either. No evidence at the device/acoustic end of this path was collected in the reported failure.

**Reproduced in code, not on ears:** false-success path at steps 2/6; missing sound-mode state extraction at step 8; source/implementation differences below. It is not possible to identify which caused this user's acoustic failure from the UI observation alone.

## 2. Exact Phase 18 constructed frames

These are deterministic reconstructions of the previous builder, **NOT actual hardware TX captures**. Assumptions: scene=outdoor, wind=off except Wind on, current manual level=5 for Normal/Transparency/Adaptive/wind. Other retained UI levels/scenes change the bytes. Manual rows explicitly select each level.

All: header `08 EE 00 00 00`; CAT=`06`; TYPE=`81`; total length=`11 00` (17 bytes); checksum=sum of preceding bytes modulo 256.

| Action | Complete constructed frame | Payload | Checksum |
|---|---|---|---|
| Manual 1 | `08 EE 00 00 00 06 81 11 00 00 10 00 00 00 00 01 9F` | `00 10 00 00 00 00 01` | `9F` |
| Manual 2 | `08 EE 00 00 00 06 81 11 00 00 20 00 00 00 00 01 AF` | `00 20 00 00 00 00 01` | `AF` |
| Manual 3 | `08 EE 00 00 00 06 81 11 00 00 30 00 00 00 00 01 BF` | `00 30 00 00 00 00 01` | `BF` |
| Manual 4 | `08 EE 00 00 00 06 81 11 00 00 40 00 00 00 00 01 CF` | `00 40 00 00 00 00 01` | `CF` |
| Manual 5 | `08 EE 00 00 00 06 81 11 00 00 50 00 00 00 00 01 DF` | `00 50 00 00 00 00 01` | `DF` |
| Transparency | `08 EE 00 00 00 06 81 11 00 01 50 01 00 00 00 01 E1` | `01 50 01 00 00 00 01` | `E1` |
| Normal | `08 EE 00 00 00 06 81 11 00 02 50 02 00 00 00 01 E3` | `02 50 02 00 00 00 01` | `E3` |
| Adaptive (L5) | `08 EE 00 00 00 06 81 11 00 00 53 00 01 00 03 01 E6` | `00 53 00 01 00 03 01` | `E6` |
| Wind on (manual 5) | `08 EE 00 00 00 06 81 11 00 00 50 00 00 01 00 01 E0` | `00 50 00 00 01 00 01` | `E0` |
| Wind off (manual 5) | `08 EE 00 00 00 06 81 11 00 00 50 00 00 00 00 01 DF` | `00 50 00 00 00 00 01` | `DF` |

**For EVERY row:** actual TX=UNAVAILABLE; actual RX=UNAVAILABLE; actual RFCOMM channel=UNKNOWN; connection/session=UNAVAILABLE; firmware=UNKNOWN. Source-expected response: command-matched `06:81` reply (payload meaning unknown), potentially unsolicited `06:01` sound-mode report, and `01:01` state after an explicit query. No exact real response frame/checksum may be filled in without a capture. None of these responses proves an acoustic effect.

The fixture `tests/fixtures/a3959-anc.json` also records these legacy frames separately from the new synthetic source-derived vectors. `test_anc.mjs` pins 13 complete frames for Normal, Transparency, manual 1–5, Adaptive, wind on/off and all three scenes. Those vectors use an **explicit synthetic observed state**; production frames necessarily depend on actual readback, so there is no single constant “new ANC frame.”

## 3. Independent seven-byte audit

Pinned primary source: [OpenSCQ30 c0c5dd57bc49e6a5558d55c6965ad6cbf91b5dfa](https://github.com/Oppzippy/OpenSCQ30/tree/c0c5dd57bc49e6a5558d55c6965ad6cbf91b5dfa/lib/src/devices/soundcore).

Paths below are relative to `lib/src/devices/soundcore/` at that revision. This is third-party source evidence, not an Android trace and not a hardware observation from this session.

| Byte | Independent evidence | Previous SoundControl | Phase 19 / remaining uncertainty |
|---|---|---|---|
| 0 | `a3959/structures/sound_modes.rs` uses common AmbientSoundMode: NC=0, Transparency=1, Normal=2 | agrees | Retained. Firmware on user's unit still needs capture confirmation. |
| 1 high | `common/structures/manual_adaptive_noise_canceling.rs`: manual number clamped 1..5; A3959 setting handler exposes manual range | high nibble selected level | Retained; no proven acoustic strength ordering from this source. Do not label L1 weakest/L5 strongest without Android/hardware comparison. |
| 1 low | A3959 setting handler exposes adaptive strength as **Information / ReadOnly**; common wrapper clamps 1..5 | derived 1/2/3 from slider in Adaptive, otherwise zeroed | **Discrepancy.** Runtime preserves observed nibble, never derives it from manual level. Raw zero remains preservable for investigation; source's clamping is not proof that firmware accepts or requires zero. |
| 2 | A3959 serializer repeats ambient; inbound parser independently reads an ambient enum and discards the second value | repeats ambient | Retained outbound. Inbound does **not** require equality to byte 0; no inferred outbound=RX identity. |
| 3 | A3959's own enum: Manual=0, Adaptive=1, MultiScene=2 | only 0/1; scene selection never selected MultiScene | Explicit scene selects 2; manual slider selects 0; adaptive selects 1. Normal/Transparency/wind preserve unrelated automation. Parser exposes automation and Adaptive correctly. |
| 4 | `common/structures/wind_noise.rs`: bit0 suppression, bit1 detected. A3959 handler marks detection ReadOnly | writes bit0 only | Preserved safety: never write bit1. Model gate rejects raw A3959 detected-bit writes too. Upstream serializer echoes the detection bit; **we deliberately do not copy that**. Whether firmware requires it is unknown, not license to write a read-only bit. |
| 5 | A3959 handler exposes independent sensitivity **0..10** | set to derived adaptive 1/2/3 or zero | **Discrepancy.** Preserve observed sensitivity; no new sensitivity UI or guessed value. |
| 6 | A3959 handler explicitly offers common scene Transport=0/Outdoor=1/Indoor=2; A3959 struct requires MultiScene for changing it | same enum values, but always Manual/Adaptive selector | Scene mappings have A3959-specific source evidence, not just shared enum names. Scene changes now use MultiScene transitions; manual actions preserve the scene byte. Acoustic meanings still need comparison. |

`buildP30iAnc` still accepts construction-only intents without observed state for protocol tools/tests (zero placeholders). **The real A3959 ANC action refuses to send until a fresh, valid 90-byte `01:01` state yields its seven-byte sound-mode block.** Missing/invalid state is a timeout, never guessed defaults.

### Inbound evidence, independent of the builder

`a3959/modules/sound_modes.rs` registers `add_partial_sound_modes_v2_with_migration`. `common/modules/sound_modes_v2/packet_handler.rs` explicitly registers **`06:01`** and parses A3959 `SoundModes::take`. `a3959/packets/inbound/state_update.rs` parses the same structure after the first 64 payload bytes of the 90-byte state.

The new parser requires seven bytes and validates ambient enums, manual/adaptive nibbles, automation, wind bitmask, sensitivity and scene bounds. It rejects truncated/unknown shapes instead of silently calling them “ANC.” This is a source-derived conservative parser; unusual real firmware bytes must be captured and audited rather than silently coerced.

## 4. Channel, socket and stream audit

**Android's A3959 control channel is UNKNOWN.** No A3959 SDP/HCI trace exists in the repository references examined. Generic channel claims for Q30/P20i/Space 2 do not identify this user's A3959 channel.

Before Phase 19, the candidates were `(4,12,15,10,30,1)` despite a comment claiming 12/13/16 were excluded. Phase 19 enforces the already-documented safety exclusion: candidates **`(4,15,10,30,1)`**, and explicit requests for **12/13/16 are refused** before socket creation; writes also reject these channels. This fixes an unsafe comment/code mismatch, **not evidence that channel 4, 10, or 15 is right for A3959**. No channel is hardcoded as the fix.

Probe: read-only `01:01`, connect timeout 2.5 s, reply budget 1.5 s. A checksum-valid `09 FF` frame demonstrates Soundcore traffic, not ANC controllability, and need not be the expected full state. Silent fallback remains explicitly unverified. No special write is used to discover control channels. A read-only watchdog retries at 8 s; it now says telemetry arrived, not “ANC is live.”

Probe bytes used to be consumed and discarded. They are now handed into the adopted reader for logging/reassembly. The reader carries an immutable socket/session/channel; stale readers cannot read/clear a replacement connection or attribute old RX to the new session. Each adoption gets a random anonymous session id, not a MAC/name. The store now
checks the session guard on link-down, not object identity with the original
transport (which differed from the boundary-wrapped transport and previously
suppressed link-down handling). RFCOMM close also cancels pending writes/state
waits, not just WebSocket close. A control WebSocket owns writes/disconnects; a second client cannot interleave commands without explicitly creating a new device session. Socket writes and close are synchronized; reconnect is serialized.

RFCOMM is a stream: `sendall` sends the exact complete validated byte array, but a receiver may split/coalesce it. There is no evidence that Bluetooth packet boundaries equal Soundcore frames or that adding a delimiter is appropriate. No delimiter/padding is added. `split_frame` retains partial frames, splits multiple frames, checks lengths/checksums and resynchronizes. Tests cover fragments, coalescing, garbage and false-length input. Do not change framing based on `recv` chunk boundaries.


A further reproducible framing defect was found: the old `split_frame` fallback
accepted **any checksum-valid prefix** even when the indicated frame was still
incomplete. A deliberately checksum-colliding fragment could truncate a valid
RX frame. Phase 19 requires coherent length **and** checksum, and tests every
split point of that counterexample. A lying length is no longer “repaired” by
inventing a boundary. The renderer also checks the length before parsing. This
can affect responses/confirmation, but is **not proven to cause this user's
physical ANC failure**. No A3959 trace justifies the removed legacy fallback.

**Telemetry-only channel hypothesis remains open.** We have neither a captured device response from the failing session nor evidence that its selected channel rejects ANC while accepting telemetry. New logs record the selected channel for comparison with Android; connection alone never establishes correctness.

## 5. Sequence discrepancy and implemented candidate

OpenSCQ30 A3959 specifically opts into **migration**, with the comment that some devices dislike state transitions the Soundcore app does not perform. Its A3959 field dependencies are:

- automation can change in ambient NC;
- manual level can change in Manual NC;
- multi-scene can change in MultiScene NC;
- wind can change in NC or Transparency;
- adaptive strength is read-only to the user;
- sensitivity is independent.

`common/modules/sound_modes_v2/migration_state_modifier.rs` sends a `06:81` for each one-field step and **awaits `send_with_response`** before the next. `common/packet/packet_io_controller.rs` correlates replies by the same CAT:TYPE; upstream retries with 500/1000/1500 ms waits. SoundControl previously did none of this and also changed unrelated fields.

Phase 19 implements dependency-respecting one-field paths in `planP30iAnc`, preserving actual adaptive strength/sensitivity and all unrelated user settings. The runtime performs:

```
01:01 read → validated current A3959 state
for each source-derived transition:
    ANC_ACTION with exact frame/session/channel
    transport.write → correlated TX_ACCEPTED → TX_SENT
    wait for 06:81 reply (not a mode report)
01:01 read → independently parsed device state → match/mismatch
```

The per-reply deadline is **2500 ms, a diagnostic budget, not a discovered firmware requirement**. No automatic ANC retry, arbitrary delay, invented initialization command, new firmware gate, or BLE-to-RFCOMM translation. Timeout stops the sequence; Read state remains available to determine what was actually applied. A timeout can occur even after a successful write; its error does not claim the frame never reached the device. A late acknowledgement cannot establish physical effect or substitute for final state readback.

This is a **candidate correction derived from A3959 source, not an exact replay of Android**. Equivalent dependency paths need not have Android's exact ordering. The third-party code does not prove this particular firmware requires the path or that it fixes this user's failure. Capture Android before asserting a required preceding command, initialization, delay or session condition. No working A3959 ANC trace was found to replay exactly.

The app serializes ANC actions through read/write/reply/read completion, rejects competing app writes, pauses battery polling during them and cancels waits on session changes. Other UI actions cannot silently write over the transaction. At the bridge, correlated `sent` completes the renderer write only after `sendall`, and errors/timeouts reject it. An old helper without correlated results fails honestly rather than reporting success.

## 6. Evidence survey (A3959 only)

All repositories were inspected at the following pinned revisions; searches covered A3959/P30i/R50i identifiers and the repository's cited frame tables.

| Implementation | Revision | A3959 command/frame/payload/transport evidence |
|---|---|---|
| [OpenSCQ30](https://github.com/Oppzippy/OpenSCQ30/tree/c0c5dd57bc49e6a5558d55c6965ad6cbf91b5dfa) | `c0c5dd57bc49e6a5558d55c6965ad6cbf91b5dfa` | A3959-specific `06:81`, 7-byte structure, inbound `06:01`/state, stateful migrations and same-command reply waits. Generic Soundcore packet encoder over its connection abstraction; no captured Android A3959 channel/full sequence identified. **Source**, not physical validation. |
| [SoundcoreDesktop](https://github.com/DamienStaebler/SoundcoreDesktop/tree/afbcb0c1585dd132e20c5410030c30ef5b3047b1) | `afbcb0c1585dd132e20c5410030c30ef5b3047b1` | No A3959/P30i/R50i match found. A3959 command/frame/payload/channel **UNKNOWN**. Classic-model frame tables excluded. |
| [Noiseclapper-GNOME](https://github.com/JordanViknar/Noiseclapper-GNOME/tree/0a683ceee878e22485d9b5b04e5af8c9d17b706d) | `0a683ceee878e22485d9b5b04e5af8c9d17b706d` | No target-model match found. A3959 command/frame/payload/channel **UNKNOWN**. Q30 captures excluded. |
| [soundcorebridge](https://github.com/mervin008/soundcorebridge/tree/3a631b9440eb341b8956c78cf80ab5e76336aa2d) | `3a631b9440eb341b8956c78cf80ab5e76336aa2d` | No target-model match found. A3959 command/frame/payload/channel **UNKNOWN**. Space-2 captures do not establish A3959 semantics. |
| [soundcore_anker_equalyzer](https://github.com/victor-oliveira1/soundcore_anker_equalyzer/tree/1b91e2f0174a82402b85004062a645d1e8bd96f2) | `1b91e2f0174a82402b85004062a645d1e8bd96f2` | No target-model match found. P20i EQ/channel 10 evidence is **A3949**, not A3959 ANC. No applicable ANC frame. |

Repository `PROTOCOL.md`, `docs/R50I-PROTOCOL.md`, builders, parsers, registry, test vectors and bridge tests were audited. Existing ANC live vectors were classic Q30; existing live TWS EQ vectors were P20i. Existing E2E RFCOMM captures were **emulated**, not this hardware. Generic BLE appendix/command-map examples are not model-specific evidence and must not be used to invent an A3959 Android sequence.

## 7. Firmware and validation boundary

`01:05` (`08 EE 00 00 00 01 05 0A 00 06`) requests firmware/serial. The app still reads it on connect and firmware is logged with user observations. Real user firmware: **UNAVAILABLE**. **FIRMWARE COMPATIBILITY UNKNOWN** for ANC, adaptive support and state reporting. No minimum ANC version is documented by the inspected A3959 source. The existing 01.60 gaming gate is not an ANC rule and is not applied to ANC.

Evidence ladder:

A. Packet constructed — deterministic tests available.
B. Packet transmitted — only `TX_SENT` establishes OS socket completion; not firmware delivery.
C. Device responded — real `RX_FRAME` from the matching session, not emulator.
D. Device reported requested mode — valid `06:01`/queried `01:01` with matching writable settings. Logged as **DEVICE REPORT CONFIRMED** only after readback; a differing report wins.
E. User physically felt a change — **PHYSICAL ACOUSTIC EFFECT CONFIRMED BY USER**, recorded separately per transition. Only E establishes the requested real-world result.

If D succeeds and E fails, the investigation moves to firmware command semantics/acoustic behavior, not UI or transport success. A match is not proof of causality: unsolicited reports and acknowledgements have no transaction nonce. Keep Android disconnected, serialize tests, compare timestamps and repeat transitions.

Diagnostics omit MACs/tokens and redact serial bytes in `01:01`/`01:05` log/export frames as `XX`. Other frame bytes and the original checksum remain unchanged; validation happens before redaction. Complete `06:81`/`06:01` frames remain intact. Retain private raw HCI captures locally; never upload bugreports containing unrelated Bluetooth traffic or personal identifiers. The log ring holds 2000 entries; export after each test block.
