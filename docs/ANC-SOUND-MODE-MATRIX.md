# ANC / sound-mode (`06:81`) protocol matrix

This document is the explicit, model-by-model answer to four questions that a
feature list cannot answer on its own:

1. which `06:81` **layout** a SKU uses (packet builder, exact frame length);
2. which **modes and values** that layout can carry (discrete modes, manual
   level 1..5, adaptive strength, scene, transparency sub-mode, wind);
3. what the **model-specific UI is allowed to expose** for that SKU;
4. which **invalid values are rejected** before anything reaches the
   Bluetooth transport.

It is pinned by `npm run test:matrix`
([`scripts/test_feature_matrix.mjs`](../scripts/test_feature_matrix.mjs)):
every claim below has a matching assertion there, and the model gate in
`src/protocol/modelRegistry.ts` refuses any `06:81` frame whose length does not
match the connected profile's layout.

**No physical validation.** Only the R50i (A3949) and R50i NC (A3959) hardware
exists in this workspace and no results have been recorded. Every row is
`PHYSICAL VALIDATION PENDING`; "supported" below always means "supported by
protocol evidence".

## 1. Layouts (packet builders)

`total = 10 + payload` (five-byte `08 EE 00 00 00` header, `cat:type = 06:81`,
two-byte little-endian length including the checksum, payload, checksum byte).
"Rejected" means `buildAnc()` returns `null` and the store sends nothing.

| Layout | Builder | Length | Payload fields | Modes | Manual level | Adaptive | Scene | Transparency sub-mode | Wind | Invalid input |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `classic` | `buildClassicAnc` | 14 | `[mode, scene, transparency_mode, custom_nc=0]` | NC / Transparency / Normal | none (no level byte — a level value is ignored) | no | Transport / Outdoor / Indoor | full vs vocal | no | unknown mode/scene → rejected |
| `classic-a3035` | `buildSpaceOneAnc` | 16 | `[ambient, manual<<4\|adaptive, ambient, adaptive, wind, 0x05/0x01]` | NC / Transparency / Normal + adaptive | 1..5 | yes | no | no (fixed custom transparency) | yes | level ∉ 1..5 → rejected |
| `classic-a3040` | `buildSpaceQ45Anc` | 16 | `[ambient, manual<<4\|adaptive, transVocal, adaptive, wind, 0x05/0x01]` | NC / Transparency / Normal + adaptive | 1..5 | yes | no | full vs Talk/Manual | yes | level ∉ 1..5 → rejected |
| `tws-p30i` | `buildP30iAnc` | 17 | `[ambient, manual<<4\|adaptive, ambient, automation, wind, sensitivity, scene]` | NC / Transparency / Normal + adaptive + multi-scene | 1..5 | yes | Transport / Outdoor / Indoor | **none** (documented: R50i NC has no transparency modes) | yes | level ∉ 1..5 → rejected |
| `tws-l4nc` | `buildLiberty4NcAnc` | 17 | `[ambient, manual<<4\|adaptive, transVocal, automation, wind, 0x00, transportation]` | NC / Transparency / Normal + adaptive | 1..5 | yes | — (transportation byte written from the internal scene; no UI control) | full vs vocal | yes | level ∉ 1..5 → rejected |
| `tws-l3pro` | `buildLiberty3ProAnc` | 16 | `[ambient, manual<<4\|adaptive, transVocal, adaptive, wind, 0x00]` | NC / Transparency / Normal + adaptive | 1..5 | yes | no | full vs vocal | yes | level ∉ 1..5 → rejected |
| `tws-a3062` | `buildSpaceOneProAnc` | 16 | `[ambient, manual<<4\|adaptive, 0x01, adaptive, wind, 0x05/0x01]` | NC / Transparency / Normal + adaptive | 1..5 | yes | no | no (custom transparency only) | yes | level ∉ 1..5 → rejected |
| `tws-a3936` | `buildSpaceA40Anc` | 16 | `[ambient, manual<<4\|adaptive, transVocal, adaptive, wind, adaptive_sensitivity]` | NC / Transparency / Normal + adaptive | 1..5 | yes | no | full vs vocal | yes | level ∉ 1..5 → rejected |
| `tws-l4pro` | `buildLiberty4ProAnc` | 14 | `[ambient, slider, 0, wind]` | NC / Transparency / Normal | slider: ANC `6−level`, transparency `6+level` (1..5 → 1..5 / 7..11) | no (nibble design has no adaptive field) | no | no | yes | level ∉ 1..5 → rejected |
| `tws-p40i` | `buildP40iAnc` | 17 | `[ambient, manual<<4\|adaptive, transVocal, automation, wind, adaptive_sensitivity, scene]` | NC / Transparency / Normal + adaptive + multi-scene | 1..5 | yes | Transport / Outdoor / Indoor | full vs vocal | yes | level ∉ 1..5 → rejected |
| `tws-l5` | `buildLiberty5Anc` | 17 | `[ambient, manual<<4\|adaptive, transVocal, automation, wind, adaptive_sensitivity, scene]` | NC / Transparency / Normal + adaptive | 1..5 | yes | — (scene byte written; no UI control) | full vs vocal | yes | level ∉ 1..5 → rejected |
| `tws-a3968` | `buildSportX20Anc` | 16 | `[ambient, manual<<4\|adaptive, transVocal, adaptive, wind, 0xFF]` | NC / Transparency / Normal + adaptive | 1..5 | yes | no | full vs vocal | yes | level ∉ 1..5 → rejected |
| `tws-d1202` | `buildD1202Anc` | 18 | `[ambient, manual<<4\|adaptive, transVocal, adaptive, wind, 0x00, scene, 0x00]` | NC / Transparency / Normal + adaptive + multi-scene | 1..5 | yes | Transport / Outdoor / Indoor | full vs vocal | yes | level ∉ 1..5 → rejected |

Shared rules (asserted in the matrix test):

* payload byte 0 is `0x00` for ANC/adaptive, `0x01` for Transparency and
  `0x02` for Normal on every layout;
* requesting `adaptive` on a layout without an adaptive field (`classic`,
  `tws-l4pro`) degrades to the plain ANC frame — an unsupported numeric level
  is never invented for it;
* a `classic` frame is byte-identical for levels 1..5 (there is no level byte,
  so a "0–4 level" cannot reach a discrete-mode model);
* the UI's level always lands in that layout's documented strength field, but
  each builder keeps its own documented composition: l4nc/l3pro/p40i/l5 encode
  `manual << 4 | adaptive` from the level, a3035/a3040/a3062/a3936/a3968 keep
  the documented manual baseline of 5 for Transparency/Normal frames, p30i
  sends the user's manual level plus the device's read-only adaptive nibble
  (automation byte `0x00` Manual / `0x01` Adaptive / `0x02` Multi-scene,
  sensitivity `0xFF` until the device reports one), and l4pro maps 1..5 to ANC
  bytes 1..5 and transparency bytes 7..11. Any level outside the integer range 1..5, `NaN` or
  `Infinity` makes `buildAnc()` return `null` (no frame).
* `layout: none` builds nothing at all.

## 2. Profiles (what each SKU's UI can expose)

`level` = manual 1..5 buttons, `adaptive` = adaptive toggle, `scenes` =
Transport/Outdoor/Indoor, `vocal` = transparency sub-mode switch, `wind` =
wind-noise suppression. These are the *intersection* of the layout bytes and
the profile's evidence flags (`src/state/derive.ts`), so a SKU never shows a
sub-option its own OpenSCQ30/upstream definition does not document.

| Model | SKU | Layout | Modes | Valid levels | level | adaptive | scenes | vocal | wind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P30i / R50i NC | A3959 | `tws-p30i` | NC / Transparency / Normal | 1..5 | ✔ | ✔ | ✔ | — | ✔ |
| Liberty 4 NC | A3947 | `tws-l4nc` | NC / Transparency / Normal | 1..5 | ✔ | ✔ | — (transportation byte only) | ✔ | ✔ |
| Liberty 3 Pro | A3952 | `tws-l3pro` | NC / Transparency / Normal | 1..5 | ✔ | ✔ | — | ✔ | ✔ |
| Space A40 | A3936 | `tws-a3936` | NC / Transparency / Normal | 1..5 | ✔ | ✔ | — | ✔ | ✔ |
| Liberty 4 Pro | A3954 | `tws-l4pro` | NC / Transparency / Normal | 1..5 (slider) | ✔ | — | — | — | ✔ |
| P40i | A3955 | `tws-p40i` | NC / Transparency / Normal | 1..5 | ✔ | ✔ | ✔ | ✔ | ✔ |
| Liberty 5 | A3957 | `tws-l5` | NC / Transparency / Normal | 1..5 | ✔ | ✔ | — | ✔ | ✔ |
| Space One Pro | A3062 | `tws-a3062` | NC / Transparency / Normal | 1..5 | ✔ | ✔ | — | — | ✔ |
| Sport X20 | A3968 | `tws-a3968` | NC / Transparency / Normal | 1..5 | ✔ | ✔ | — | ✔ | ✔ |
| P31i / R60i NC | D1202 | `tws-d1202` | NC / Transparency / Normal | 1..5 | ✔ | ✔ | ✔ | ✔ | ✔ |
| Space One | A3035 | `classic-a3035` | NC / Transparency / Normal | 1..5 | ✔ | ✔ | — | — | ✔ |
| Space Q45 | A3040 | `classic-a3040` | NC / Transparency / Normal | 1..5 | ✔ | ✔ | — | ✔ | ✔ |
| Q20i | A3004 | `classic` | NC / Transparency / Normal | — (no level byte) | — | — | — | — | — |
| Life Q35 | A3027 | `classic` | NC / Transparency / Normal | — | — | — | ✔ | ✔ | — |
| Life Q30 | A3028 | `classic` | NC / Transparency / Normal | — | — | — | ✔ | ✔ | — |
| Life Tune / Life Tune XR | A3029 | `classic` | NC / Transparency / Normal | — | — | — | ✔ | ✔ | — |
| Life Tune Pro | A3030 | `classic` | NC / Transparency / Normal | — | — | — | ✔ | ✔ | — |

Every other profile in `DEVICES` is `ancLayout: none`: Q11i (A3005 — official
product page and OpenSCQ30 both say no ANC module), R50i/P20i (A3949), A20i
(A3948), Life Note 3S (A3945), C30i, AeroClip, V20i, C50i, Sleep A30, Space 2
(D1402, read-only) and every catalog-only identity. Those models show the mode
buttons only as faded, disabled indicators and no `06:81` frame can pass the
model gate.

### Evidence

The per-SKU layout and flag provenance is the `source:` string in
[`src/protocol/devices.ts`](../src/protocol/devices.ts); the byte layouts come
from OpenSCQ30's per-model structures (`a3027`, `a3028`, `a3035`, `a3040`,
`a3062`, `a3936`, `a3947`, `a3952`, `a3954`, `a3955`, `a3957`, `a3959`,
`a3968`, `a3031`, `a3033`, `d1202`) and the live captures cited in
[`PROTOCOL.md`](../PROTOCOL.md). Marketing pages are never packet evidence: a
product advertising "ANC with 5 levels" does not by itself permit a level
write.

## 3. Protocols verified elsewhere but deliberately not implemented here

| Candidate | Evidence state | Why it is still read-only |
| --- | --- | --- |
| Space 2 (D1402) | A third-party implementation (`mervin008/soundcorebridge`) documents a channel-30 transport, an unlock handshake (`01:01` → `05:01` → `05:81` … → `18:85`), a 53-byte `03:87` HearID/EQ template and `06:81` payload `[mode, level, 02, 00, 00, 01]`, with live reproductions. | The unlock handshake is a *transport* change (channel 30) and the sources disagree on the unlock repeat count (×3 vs ×4 in the two documents reviewed). Until the transport exists and its packets are reproducible in this repository's tests, no write is sent: the profile stays `PARTIALLY VERIFIED (read-only)`. |
| Soundcore Vortex (A3031) | OpenSCQ30 has a dedicated `a3031` device module (sound modes with NC levels, dual battery, EQ, button status). | The packet layout has not been ported, length-validated and unit-tested in this repository, so only protocol-universal reads are enabled. |
| Life 2 Neo / Q10i (A3033) | OpenSCQ30 has an `a3033` module (EQ, wearing detection, single battery, **no sound modes**). | Same rule: catalog-only identity without a ported, tested layout. The Q10i regional name is an alias only. |
| Space NC (A3021), Life 2 NC (A3024) | Identity confirmed by Anker FCC registrations and manuals only. | No packet source exists at all, so these are identity/universal-read entries only. |

## 4. What is asserted automatically

`npm run test:matrix` (1046 checks) fails if any of the following changes
without new evidence:

* a profile's layout/flags/EQ/battery row in the pinned matrix;
* `deriveCapabilities()` exposing a sub-feature the layout or profile does not
  claim;
* a layout's frame length, header, checksum, mode byte or level encoding;
* a sub-feature byte changing a layout that does not document it;
* `buildAnc()` accepting an unknown mode/scene or a level outside 1..5 on a
  level-carrying layout;
* the model gate accepting a `06:81` frame whose length does not match the
  connected profile's layout;
* any profile claiming volume, gestures, a factory reset or physical
  validation;
* an equalizer frame changing length, CAT:TYPE, `total_len` or byte range under
  a short, long, non-finite or absurd band array, or a wrong-shape EQ frame
  (20-byte `02:81` on a two-channel profile, 32-byte `02:83` on D1202, a
  truncated `03:87`) being accepted by the model gate.
