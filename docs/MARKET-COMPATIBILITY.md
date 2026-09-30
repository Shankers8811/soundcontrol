# Soundcore market and compatibility matrix

Snapshot: **2026-09-29**. The inventory is reconciled from the official
[soundcore US true-wireless collection](https://www.soundcore.com/collections/true-wireless-earbuds),
[US open-ear collection](https://www.soundcore.com/collections/open-ear-headphones),
[US headphone collection](https://www.soundcore.com/collections/headphones), and the
corresponding EU product/catalog pages. Product cards for colors, bundles,
refurbished units, recommendations, and the AeroFit 2 AI feature listing are
not counted as new protocol families.

The machine-readable source is [`src/protocol/marketCatalog.ts`](../src/protocol/marketCatalog.ts).
The canonical SKU/profile table is [`src/protocol/devices.ts`](../src/protocol/devices.ts).

## Status vocabulary

| Column | Meaning |
| --- | --- |
| Market | `US`/`EU` catalog presence in this snapshot; regional rows are not separate hardware by themselves. |
| Protocol | `implemented` means an exact packet/state layout is in the app; `read-only` means exact reads exist but one or more writes are intentionally withheld; `unknown` means catalog identity only. |
| Simulator | Local simulator/offset path available, not physical hardware. It is not evidence that a packet works on a real unit. |
| Unit tests | Protocol/capability assertions exist for the profile. |

## Deduplicated current inventory

### Traditional TWS earbuds

| SKU / aliases | Product | Market | Protocol | Simulator | Unit tests |
| --- | --- | --- | --- | --- | --- |
| D1206 | Liberty Buds 2 | US | unknown | — | — |
| D1204 | Liberty 5 Pro Max | US | unknown | — | — |
| D1203 | Liberty 5 Pro | US | unknown | — | — |
| D1205 | P42i | US | unknown | — | — |
| D1202 / D1202C | P31i / R60i NC | EU | implemented; factory EQ via 03:87, HearID curves read-only | yes | yes |
| D1200 | Liberty Buds | EU | unknown | — | — |
| A3957 | Liberty 5 | US/EU | implemented; EQ/HearID read-only | yes | yes |
| A3954 | Liberty 4 Pro | US/EU | implemented; EQ/HearID read-only | yes | yes |
| A3947 / A3947C | Liberty 4 NC | US/EU | implemented; EQ/HearID read-only | yes | yes |
| A3955 | P40i | EU | implemented; EQ/HearID read-only | yes | yes |
| A3936 | Space A40 | US/EU | implemented; HearID EQ read-only | yes | yes |
| A3968 | Sport X20 | US/EU | implemented; HearID EQ read-only | yes | yes |
| A3949 | P20i / P25i / R50i | EU | implemented; factory EQ only | yes | yes |
| A3994 | K20i | EU | unknown | — | — |

### Sleep earbuds

| SKU | Product | Market | Protocol | Simulator | Unit tests |
| --- | --- | --- | --- | --- | --- |
| D1301 | Sleep A30 | US/EU | read-only; sleep-specific writes withheld | yes | yes |
| A6611 | Sleep A20 | US/EU | unknown | — | — |

### Open-ear and clip-on earbuds

| SKU | Product | Market | Protocol | Simulator | Unit tests |
| --- | --- | --- | --- | --- | --- |
| D1105 | AeroClip 2 | US | unknown | — | — |
| A3388 | AeroClip | US/EU | implemented; dual-channel outbound EQ; surround state read-only | yes | yes |
| A3874 / A3874X | AeroFit 2 / AI Assistant alias | US/EU | unknown | — | — |
| A3875 | AeroFit 2 Pro | US/EU | unknown | — | — |
| A3871 | AeroFit Pro | US/EU | unknown | — | — |
| A3872 | AeroFit | EU | unknown | — | — |
| A3331 | C40i | US/EU | unknown | — | — |
| A3330 | C30i | EU | implemented; no sound-mode control | yes | yes |
| D1101 | C50i | US/EU | implemented; 02:81 dual-channel EQ | yes | yes |
| A3873 | V30i | US | unknown | — | — |
| A3878 | V40i | US | unknown | — | — |

### Neckband earphones

| SKU / aliases | Product | Market | Protocol | Simulator | Unit tests |
| --- | --- | --- | --- | --- | --- |
| A3213 | R500 / Life U2i | US/EU | unknown; exact identity only | — | — |
| A3212 | Life U2 | US/EU | unknown; exact identity only | — | — |
| A3201 | Life NC | US/EU | unknown; exact identity only | — | — |

The neckband classifications are SKU-confirmed rather than inferred from a
marketing name: the official [Soundcore serial-number guide](https://service.soundcore.com/article-description/Guide-to-Locating-the-Serial-Number-SN-of-Your-soundcore-Headphones)
maps A3213 to R500/Life U2i, A3212 to Life U2, and A3201 to Life NC. The
[AeroFit Pro A3871](https://www.soundcore.com/products/aerofit-pro-a3871011)
remains in the open-ear category because its detachable neckband is an
accessory, not a separately identified Bluetooth neckband device.

### Over-ear and on-ear headphones

| SKU | Product | Market | Protocol | Simulator | Unit tests |
| --- | --- | --- | --- | --- | --- |
| D1406 | Space 2 Pro | US | unknown | — | — |
| D1402 | Space 2 | US/EU | read-only; unlock/write template withheld | yes | yes |
| A3062 | Space One Pro | US/EU | implemented; EQ/HearID read-only | yes | yes |
| A3035 | Space One | US/EU | implemented; EQ/HearID read-only | yes | yes |
| D1404 | Q31i | US/EU | unknown | — | — |
| A3040 | Space Q45 | EU | implemented; EQ/HearID read-only | yes | yes |
| A3028 | Life Q30 | US/EU | implemented | yes | yes |
| A3004 | Q20i | US/EU | implemented | yes | yes |
| A3005 / A3005Z21 / A3005ZA1 | Q11i | US | implemented | yes | yes |
| A3012 | H30i | EU | unknown | — | — |
| A3025 | Life Q20 | EU | unknown | — | — |

## What “unknown” does safely

A catalog-only row is still an exact identity match. SoundControl can issue the
protocol-universal identity and battery/presence reads, but it keeps the raw
battery scale unknown and does not send guessed ANC, EQ, gaming, codec, or
state-offset writes. This is deliberate: catalog presence is not protocol
evidence.

The implemented rows originate from packet/state definitions and tests in
[OpenSCQ30](https://github.com/Oppzippy/OpenSCQ30), with additional
cross-checks against the protocol work in
[SoundcoreDesktop](https://github.com/DamienStaebler/SoundcoreDesktop),
[Noiseclapper-GNOME](https://github.com/JordanViknar/Noiseclapper-GNOME),
and [soundcorebridge](https://github.com/mervin008/soundcorebridge). Exact
identity, protocol implementation, and automated coverage remain separate claims.

## Validation and testing evidence

Market identity and reference packet layouts are not physical-device tests.
Simulator and unit-test columns describe SoundControl's automated validation,
not results from a Bluetooth-connected Soundcore device. Physical-device
validation has not been performed in this workspace; see
[HARDWARE-VALIDATION.md](../HARDWARE-VALIDATION.md) for the evidence checklist.
That status applies to the inventory as a whole and does not diminish the
implemented protocol-backed controls listed above.
