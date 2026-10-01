# Soundcore headset model coverage

This document is the headset-side companion to
[`docs/MARKET-COMPATIBILITY.md`](MARKET-COMPATIBILITY.md). It covers the
over-ear / on-ear, neckband and gaming headphones discovered in this review,
what SoundControl can honestly do with each one, and which gaps are deliberate.

* Review date: **2026-10-01** (repository state: `main` @ `3a57326` plus this
  change set).
* Machine-readable sources: [`src/protocol/devices.ts`](../src/protocol/devices.ts)
  (exact SKU profiles) and [`src/protocol/marketCatalog.ts`](../src/protocol/marketCatalog.ts)
  (market inventory). Where this document and the code disagree, the code wins.
* Scope: headsets only. True-wireless, open-ear/clip and sleep earbuds are
  tracked in [`docs/MARKET-COMPATIBILITY.md`](MARKET-COMPATIBILITY.md).

## 1. How claims are classified

### Evidence classes

| Class | Meaning | May justify protocol behavior? |
| --- | --- | --- |
| A | Official soundcore documentation (storefront, support article, user manual, DoC) | Identity and advertised features only |
| B | Packet captures (live TX/RX logs) | Yes |
| C | Existing implementation with published packet/state definitions (e.g. OpenSCQ30 device modules) | Yes |
| D | Simulator / unit-test fixture inside this repository | Yes, for the parser path it exercises |
| E | Reliable independent research (teardowns, protocol write-ups, retail SKU confirmations) | Identity and feature context; protocol only with packet detail |
| F | Soundcore Android app / web UI observation | **Documentation only.** Never turned into packets |
| G | Inference from a similar name or sibling product | **Never implemented** |

Only classes A–E justify behavior in this repository, and a packet is only
implemented when the command bytes, field layout, valid values and length are
all known. App-only features are recorded as **UNKNOWN / NOT
PROTOCOL-VERIFIED** and are never written over Bluetooth.

### Status vocabulary

| Status | Meaning |
| --- | --- |
| **PROTOCOL VERIFIED** | Exact packet/state layout is public (class B/C) and implemented in this repository with tests. |
| **PARTIALLY VERIFIED** | Some exact reads/writes are implemented; other operations for the same SKU are deliberately withheld. |
| **CATALOG ONLY** | Exact identity (name + SKU) is confirmed and the SKU resolves to a read-only catalog profile; no model-specific packet is implemented. |
| **NOT PROTOCOL VERIFIED** | No packet source exists in the reviewed evidence, so no model-specific behavior is claimed at all. |
| **PHYSICALLY VALIDATED** | A real unit of this SKU was connected and the documented evidence checklist was completed. |
| **PHYSICAL VALIDATION PENDING** | Everything above is desktop evidence only; no real unit has been exercised in this workspace. |
| **NOT SUPPORTED** | The product cannot be controlled over Bluetooth by this app, or a feature has no implemented command. |
| **NOT APPLICABLE** | The model/feature is outside the Bluetooth packet scope (e.g. wired-only gaming headsets). |

## 2. Coverage summary

Headset-related inventory after the 2026-10-01 additions:

| Metric | Count | Notes |
| --- | --- | --- |
| Over-ear / on-ear profiles in `DEVICES` | 19 | 10 `verified: true` profiles + 9 `catalogOnly` read-only profiles |
| Over-ear / on-ear rows in `MARKET_CATALOG` | 19 | includes legacy SKUs confirmed by official support pages |
| Protocol-verified over-ear profiles (writes implemented) | 9 | A3004, A3005, A3027, A3028, A3029, A3030, A3035, A3040, A3062 |
| Partially verified / read-only over-ear profiles | 1 | D1402 Space 2 (reads only, unlock sequence not ported) |
| Catalog-only over-ear identities | 9 | D1404, D1406, A3012, A3023, A3025, A3031, A3032, A3033, A3045 |
| Neckband identities | 3 | A3201, A3212, A3213 — all catalog-only |
| Gaming headsets with a Bluetooth protocol path | 0 | Wired / USB-dongle products; see §7 |
| Physically validated headsets | **0** | Every row is `physicalValidation: 'pending'` |
| Market catalog total (all categories) | 49 | was 41 before 2026-10-01 |

> SoundControl does not claim support for every Soundcore headset. The
> implemented set is exactly the nine write-capable profiles above plus
> read-only Space 2; everything else is an honest identity match with
> protocol-universal reads only.

## 3. Over-ear and on-ear coverage matrix

`Writes` describes what this repository actually sends; it never repeats a
marketing claim. `ANC`/`Transparency` etc. in the feature columns mean the
profile implements the **write**, not that the product advertises the feature.

| SKU | Product | SoundControl status | Sound modes (`06:81`) | EQ | LDAC | Dual | Battery read | Physical |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A3035 | Space One | PROTOCOL VERIFIED | six-byte: manual + adaptive ANC level, wind | read-only (`03:87`, withheld) | `01:7F`/`01:FF` | `0B:84` | scale 5 | PENDING |
| A3040 | Space Q45 | PROTOCOL VERIFIED | six-byte: manual ANC level, wind, Talk/Manual transparency | read-only | `01:7F`/`01:FF` | `0B:84` | scale 5 | PENDING |
| A3062 | Space One Pro | PROTOCOL VERIFIED | six-byte: ANC level, wind, custom transparency level | read-only (EQ/HearID not guessed) | `01:7F`/`01:FF` | `0B:84` | scale 10, offset 1 | PENDING |
| A3004 | Q20i **and Q21i NC** (same SKU) | PROTOCOL VERIFIED | four-byte ambient only: ANC / Transparency / Normal | `02:83` + custom `FE FE` | not implemented | not implemented | scale 5 | PENDING |
| A3005 | Q11i | PROTOCOL VERIFIED (no ANC module) | **none — not exposed** | `02:83` + custom `FE FE` | not implemented | `0B:84` | scale 10, offset 1 | PENDING |
| A3027 | Life Q35 | PROTOCOL VERIFIED | classic four-byte: ANC / Transparency / Normal + Transport/Outdoor/Indoor scene + vocal transparency | `02:81` + custom `FE FE` | not implemented | not implemented | scale 5 | PENDING |
| A3028 | Life Q30 | PROTOCOL VERIFIED | classic four-byte, as A3027 | `02:81` + custom `FE FE` | not implemented | not implemented | scale 5 | PENDING |
| A3029 | Life Tune / Life Tune XR | PROTOCOL VERIFIED | classic four-byte, as A3028 (upstream routes A3029 → A3028) | `02:81` + custom `FE FE` | not implemented | not implemented | scale 5 | PENDING |
| A3030 | Life Tune Pro | PROTOCOL VERIFIED | classic four-byte, as A3027 (upstream routes A3030 → A3027) | `02:81` + custom `FE FE` | not implemented | not implemented | scale 5 | PENDING |
| D1402 | Space 2 | PARTIALLY VERIFIED (read-only) | **NOT SUPPORTED** until the published unlock handshake is ported | NOT SUPPORTED | state/LDAC reads only | NOT SUPPORTED | scale 10, offset 1, read-only | PENDING |
| D1406 | Space 2 Pro | CATALOG ONLY | NOT PROTOCOL VERIFIED | — | — | — | universal presence only | PENDING |
| D1404 | Q31i | CATALOG ONLY | NOT PROTOCOL VERIFIED | — | — | — | universal presence only | PENDING |
| A3012 | H30i (on-ear) | CATALOG ONLY | NOT PROTOCOL VERIFIED | — | — | — | universal presence only | PENDING |
| A3025 | Life Q20 | CATALOG ONLY | NOT PROTOCOL VERIFIED | — | — | — | universal presence only | PENDING |
| A3023 | Life 2 | CATALOG ONLY | NOT PROTOCOL VERIFIED | — | — | — | universal presence only | PENDING |
| A3032 | Life Q10 | CATALOG ONLY | NOT PROTOCOL VERIFIED | — | — | — | universal presence only | PENDING |
| A3045 | Life Q20+ | CATALOG ONLY | NOT PROTOCOL VERIFIED | — | — | — | universal presence only | PENDING |
| A3031 | Soundcore Vortex | CATALOG ONLY | upstream layout exists, **not ported** | — | — | — | universal presence only | PENDING |
| A3033 | Life 2 Neo | CATALOG ONLY | upstream EQ layout exists, **not ported** | — | — | — | universal presence only | PENDING |

Catalog-only rows still receive exact identity plus the protocol-universal
`01:01` state request and `01:03`/`01:05` presence reads. They never receive a
guessed battery scale, ANC byte, EQ band or codec write.

## 4. Per-model notes

### 4.1 Space series

* **Space One (A3035)** — identification verified, ANC verified, ambient
  (Transparency/Normal) verified, wind-noise reduction verified, LDAC verified,
  dual connection verified. EQ is **read-only**: the published model-specific
  `03:87` HearID template is not implemented, so the UI reports it instead of
  offering a write. Physical validation **pending**.
* **Space Q45 (A3040)** — six-byte sound modes including Talk/Manual
  transparency and wind; LDAC and dual connection verified; EQ read-only;
  physical validation pending.
* **Space One Pro (A3062)** — six-byte sound modes with a custom transparency
  level; LDAC and dual connection verified; EQ/HearID deliberately not guessed;
  physical validation pending.
* **Space 2 (D1402)** — read-only profile. The published channel-30 transport,
  unlock handshake and 53-byte `03:87` template are documented in
  [`PROTOCOL.md`](../PROTOCOL.md) but are not implemented; only state/battery
  reads are parsed.
* **Space 2 Pro (D1406)** — catalog identity only. No public packet layout in
  the reviewed sources; no writes.

### 4.2 Life and Q series

* **Q20i (A3004)** — four-byte ambient sound modes (ANC / Transparency /
  Normal; no level or scene byte), `02:83` DRC EQ with custom curves, battery
  scale 5. **Q21i NC is a regional marketing name for the same A3004 SKU**
  (Anker EU/UK Declaration of Conformity lists both names on A3004), so it
  resolves to this profile and no second SKU row is created.
* **Q11i (A3005)** — no sound-mode module at all, so the app exposes no ANC
  controls for this SKU even though the product is sold with noise cancelling
  marketing; the profile only implements `02:83` DRC EQ, dual connection and
  battery/state reads.
* **Life Q35 (A3027)** — classic four-byte sound modes with scene selection and
  vocal transparency; `02:81` EQ with custom curves; battery scale 5. LDAC is
  advertised for the product but has **no implemented command in SoundControl**,
  so it is reported as not available rather than guessed.
* **Life Q30 (A3028)** — same classic layout as the Q35 in this app's profile.
* **Life Tune / Life Tune XR (A3029)** — official serial-number guide confirms
  both names on A3029; OpenSCQ30 routes A3029 through the A3028 (Q30)
  implementation, and the profile reuses that exact documented layout.
* **Life Tune Pro (A3030)** — added 2026-10-01 as a verified profile:
  OpenSCQ30's `device_model.rs` routes A3030 through the A3027 (Q35)
  implementation (`Self::SoundcoreA3027 | Self::SoundcoreA3030`), so the
  profile reuses the classic four-byte layout and `02:81` EQ. Physical
  validation pending.
* **Life Q20 (A3025)**, **Life Q10 (A3032)**, **Life 2 (A3023)**,
  **Life Q20+ (A3045)** — exact identities confirmed by the official
  serial-number guide and service pages, but no public packet layout exists in
  the reviewed sources (no OpenSCQ30 implementation for A3023/A3025/A3032/
  A3045). They are catalog-only with protocol-universal reads only.
* **Life Q10 SKU correction** — the previously circulating claim that Life Q10
  is A3016 is not supported by any official source found; the official
  serial-number guide and soundcore product page identify it as **A3032**.
  A3016 is not in the catalog.
* **Life 2 Neo (A3033)** and **Soundcore Vortex (A3031)** — identities are
  official; OpenSCQ30 contains dedicated `a3031` (sound modes with NC levels,
  dual battery, EQ, button status, auto power-off, touch tone) and `a3033`
  (equalizer, wearing detection, single battery) implementations, but those
  packet layouts have **not been ported or validated** in SoundControl, so both
  SKUs are catalog-only here. Porting them is tracked as a documented gap, not
  as support.

### 4.3 Features that stay unknown on purpose

For every catalog-only row: ANC behaviour, transparency sub-modes, wind-noise
reduction, EQ/custom-EQ, LDAC, multipoint, gaming mode, surround/spatial and
battery telemetry are **UNKNOWN / NOT PROTOCOL-VERIFIED**. Marketing copy for
these models is not packet evidence; the app therefore shows identity and
generic telemetry only.

## 5. Neckband headphones

| SKU | Product | Status | Evidence |
| --- | --- | --- | --- |
| A3213 | R500 / Life U2i | CATALOG ONLY | Official serial-number guide; no public packet layout |
| A3212 | Life U2 | CATALOG ONLY | Official serial-number guide; no public packet layout |
| A3201 | Life NC | CATALOG ONLY | Official serial-number guide; no public packet layout |

## 6. Protocol families discovered

1. **Classic four-byte sound modes** (`[mode, nc_scene, transparency,
   custom_nc]` at state offset 35) with per-SKU offsets — used by A3027, A3028,
   A3029 (routed to A3028) and A3030 (routed to A3027).
2. **Classic four-byte with `02:81` vs `02:83` EQ split** — A3004 uses `02:83`
   DRC EQ; A3027/A3028/A3029/A3030 use `02:81`. The EQ command and state
   offsets are stored per profile, so these four rows must stay separate even
   though the sound-mode frame is identical.
3. **Space six-byte sound modes** — A3035 (`classic-a3035`), A3040
   (`classic-a3040`) and A3062 (`tws-a3062`) each carry a different byte
   layout, so they remain three separate layouts. No borrowing between them.
4. **Unlock-gated Space 2 transport (D1402)** — reads implemented, writes
   deliberately absent until the unlock handshake is ported.
5. **Upstream-only families not ported** — OpenSCQ30 `a3031` (Vortex) and
   `a3033` (Life 2 Neo) document packet families that have no equivalent in
   this repository yet.
6. **Wired gaming headsets (A3830 and siblings)** — not a Bluetooth protocol
   family at all; see §7.

### Safe to share vs must stay separate

* **Safe to share (with routing evidence, not name similarity):** A3030 may
  reuse the A3027 classic layout, and A3029 already reuses the A3028 layout,
  because the upstream implementation explicitly routes those SKUs to the same
  device module (`device_model.rs` match arms).
* **Must stay separate:** A3035 / A3040 / A3062 (three different six-byte
  layouts); A3004 vs A3027/A3028/A3029/A3030 (different EQ command and state
  offsets); everything catalog-only (no layout proof at all); A3023 Life 2 vs
  A3033 Life 2 Neo (similar names, different hardware and no shared-layout
  evidence).

## 7. Gaming headsets

The Soundcore gaming lineup uses wired USB-A (Strike 3 = A3830, with the
Windows-only Soundcore Gaming app) or 3.5 mm connections; there is no
Bluetooth packet path and no OpenSCQ30 implementation for any gaming model.
SoundControl therefore does **not** add a gaming category or catalog row:

| Product | Evidence | Status |
| --- | --- | --- |
| Strike 3 (A3830) | Official manual + retail listings: wired USB-A, Soundcore Gaming app | NOT APPLICABLE — no Bluetooth control path |
| Strike 1 | Retail listing: wired 3.5 mm, no SKU confirmed in this review | NOT APPLICABLE; not catalogued (SKU unconfirmed) |
| Strike 2 (A3829) | SKU claim could not be confirmed | Deliberately not catalogued |

Adding a gaming entry would imply Bluetooth control that does not exist, so
the honest outcome is documentation only.

## 8. Deliberately not implemented

| Model / feature | Why |
| --- | --- |
| Vortex A3031, Life 2 Neo A3033 | Upstream packet families exist but were not ported, length/field-validated and unit-tested here; catalog-only instead. |
| Life 2 A3023, Life Q10 A3032, Life Q20+ A3045, Life Q20 A3025, H30i A3012, Q31i D1404, Space 2 Pro D1406 | No public packet layout in the evidence classes A–E reviewed. |
| Space 2 D1402 writes | Published unlock handshake/specialized template not implemented; read-only profile kept. |
| LDAC on A3004/A3005/A3027/A3028/A3029/A3030 | Marketing mentions it for some models, but no model-specific LDAC command is implemented for these SKUs, so it is not offered. |
| Gaming headsets (Strike family) | Wired-only; not a Bluetooth protocol target. |
| H20i, Strike 2, Life Q10 as "A3016" | Identity could not be confirmed from an official source, so no catalog row was created. |
| Firmware flashing/update, factory reset, Find My Device | Outside this project's documented safe scope; never added. |

## 9. Physical validation status

No Soundcore headset has been physically validated in this workspace, and this
document does not claim otherwise. Every headset row in
`marketCatalog.ts` carries `physicalValidation: 'pending'`. The only physical
hardware referenced anywhere in the repository is the user's R50i (A3949) and
R50i NC (A3959) earbuds, whose test checklist in
[HARDWARE-VALIDATION.md](../HARDWARE-VALIDATION.md) is also unexecuted.

Any future "physically validated" claim requires the full evidence record:
app version, Git SHA, model, firmware, timestamp, Windows version, Bluetooth
adapter, exact UI action, expected vs actual result, diagnostics, TX/RX frames,
logs and a screenshot.

## 10. Sources reviewed

* Official soundcore serial-number guide (model ↔ product-name table for
  A3035, A3040, A3012, A3004, A3023, A3032, A3025, A3027, A3028, A3029,
  A3030, A3031 and the neckband SKUs).
* Official soundcore service pages: A3045 Life Q20+ manual / quick-start guide /
  DoC; beta.soundcore.com product page for A3032.
* Official soundcore US storefront and EU product pages for the current Space /
  Life / Q lineup.
* Anker EU/UK Declaration of Conformity for A3004 covering "Q20i and Q21i NC".
* [OpenSCQ30](https://github.com/Oppzippy/OpenSCQ30): `device_model.rs`
  routing table, per-model device/state/packet modules for a3027, a3028, a3031,
  a3033, a3035, a3040, a3062, a3004, a3005, and the supported-model README
  table.
* This repository's own protocol modules, tests and documentation (classes C
  and D).

Retail listings were used only to confirm SKUs (class E); they are never
protocol evidence.
