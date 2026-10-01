# Model capability matrix — what each supported model may receive

Generated from `src/protocol/devices.ts` + `src/state/derive.ts` and pinned by
`npm run test:capability`. One row per model that exposes a sound-mode or
equalizer control; every cell is a documented property of that model's own
firmware description (OpenSCQ30 device module), never a property of a shared
command byte.

## ANC / sound modes (`06:81`)

| SKU | Model | Layout | Frame | Manual levels 1–5 | Adaptive | Scenes | Scene values | Transparency mode | Vocal/Talk | Wind | Surround |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A3968 | Sport X20 | `tws-a3968` | 16 B | yes | yes | — | — | yes | yes | yes | yes |
| D1202 | P31i / R60i NC | `tws-d1202` | 18 B | yes | yes | yes | `00` Transport · `01` Outdoor · `02` Indoor (selector 02) | yes | yes | yes | — |
| A3959 | P30i / R50i NC | `tws-p30i` | 17 B | yes | yes | yes | `00` Transport · `01` Outdoor · `02` Indoor (selector 02) | — | — | yes | yes |
| A3947 | Liberty 4 NC | `tws-l4nc` | 17 B | yes | yes | — | `00` Transportation (selector 02) | yes | yes | yes | yes |
| A3952 | Liberty 3 Pro | `tws-l3pro` | 16 B | yes | yes | — | — | yes | yes | yes | — |
| A3936 | Space A40 | `tws-a3936` | 16 B | yes | yes | — | — | yes | yes | yes | — |
| A3954 | Liberty 4 Pro | `tws-l4pro` | 14 B | yes | — | — | — | yes | — | yes | — |
| A3955 | P40i | `tws-p40i` | 17 B | yes | yes | yes | `00` Transport · `01` Outdoor · `02` Indoor (selector 02) | yes | yes | yes | — |
| A3957 | Liberty 5 | `tws-l5` | 17 B | yes | yes | — | `00` Transportation (selector 02, no UI control) | yes | yes | yes | — |
| A3062 | Space One Pro | `tws-a3062` | 16 B | yes | yes | — | — | yes | — | yes | — |
| A3004 | Q20i | `classic` | 14 B | — | — | — | `00` Transport · `01` Outdoor · `02` Indoor | yes | — | — | — |
| A3035 | Space One | `classic-a3035` | 16 B | yes | yes | — | — | yes | — | yes | — |
| A3040 | Space Q45 | `classic-a3040` | 16 B | yes | yes | — | — | yes | yes | yes | — |
| A3027 | Life Q35 | `classic` | 14 B | — | — | yes | `00` Transport · `01` Outdoor · `02` Indoor | yes | — | — | — |
| A3028 | Life Q30 | `classic` | 14 B | — | — | yes | `00` Transport · `01` Outdoor · `02` Indoor | yes | — | — | — |
| A3029 | Life Tune | `classic` | 14 B | — | — | yes | `00` Transport · `01` Outdoor · `02` Indoor | yes | — | — | — |
| A3030 | Life Tune Pro | `classic` | 14 B | — | — | yes | `00` Transport · `01` Outdoor · `02` Indoor | yes | — | — | — |

Selector byte where the model defines one: **Manual = `0x00` · Adaptive = `0x01` ·
Multi-scene = `0x02`**. Asserted per layout in the capability suite: a manual level
tap always writes the Manual selector, a scene tap the Multi-scene selector, the
adaptive toggle the Adaptive selector — no stale selector can remain. For the
`tws-l4nc`/`tws-l5` layouts, value `0x02` means *Transportation*, not a
Multi-scene selector, so those models keep their own mapping.

## Equalizer

| SKU | Model | EQ command | Preset table | Factory presets | Custom EQ (0xFEFE) | DRC bytes |
| --- | --- | --- | --- | --- | --- | --- |
| A3330 | C30i | `02:83-single` | c30i | 1 | yes | no |
| A3388 | AeroClip | `02:83-dual` | type2 | 22 | yes | no — 2nd block is the right channel |
| A3876 | V20i | `02:83-single` | v20i | 22 | yes | no |
| D1101 | C50i | `02:81-dual` | c50i | 6 | yes | no |
| D1202 | P31i / R60i NC | `03:87` | type2 | 22 | — | no |
| A3959 | P30i / R50i NC | `02:83` | type2 | 22 | yes | yes (10 B) |
| A3949 | P20i / P25i / R50i | `02:83` | type2 | 22 | — | yes (10 B) |
| A3948 | A20i | `02:83` | type2 | 22 | yes | yes (10 B) |
| A3004 | Q20i | `02:83` | standard | 22 | yes | yes (10 B) |
| A3005 | Q11i | `02:83` | standard | 22 | yes | yes (10 B) |
| A3027 | Life Q35 | `02:81` | standard | 22 | yes | no |
| A3028 | Life Q30 | `02:81` | standard | 22 | yes | no |
| A3029 | Life Tune | `02:81` | standard | 22 | yes | no |
| A3030 | Life Tune Pro | `02:81` | standard | 22 | yes | no |

Models with no `eqCommand` receive **no** equalizer frame at all. Their state report
may still expose EQ bytes (for example the `03:87` HearID layouts), but no write
command is implemented for them: A3945, A3947, A3952, A3936, A3954, A3955, A3957,
A3062, A3035, A3040, D1301, … — see `PROTOCOL.md` for the per-layout state offsets.

## Gates that live on the wire path, not in the UI

| Feature | Gate |
| --- | --- |
| Sound-mode frame | Frame length must equal the layout's documented length; 4/6/7/8-byte payloads never cross. |
| Transparency (`06:81` ambient `0x01`) | Only for profiles with `ambientTransparency: true`. A3959 is the one documented exception; its frame is refused by the gate even if it somehow reaches the transport. |
| Manual levels | Only layouts with a level field; non-integer or out-of-range 1..5 returns `null` — no frame is built. |
| Scenes | Only values in the layout's documented scene map; unknown scenes return `null`. |
| EQ command | Must equal the profile's own `eqCommand` CAT:TYPE. |
| EQ preset id | Must be one of the ids in that model's own factory table. |
| Custom EQ | Only where the model documents it (`0xFEFE`). |
| Surround `02:86` | Only `profile.surround`. |
| Gaming / LDAC / dual connection | Only `profile.gaming` / `profile.ldac` / `profile.dual`. |
| Factory reset `01:85` | Refused for every headphone/earbud profile (documented for the Motion+ speaker only). |

## Evidence level

No row in this table is hardware-verified. Every capability above is
**PROTOCOL VERIFIED** (message layout and value map confirmed in the upstream
device module) or **SIMULATOR VERIFIED** (round-trips through the builder, gate,
state parser and simulator). Exactly one model — **R50i NC / A3959** — has a
hardware capture, and that capture is what exposed the mode-selector defect.
See `docs/R50I-NC-HARDWARE-VALIDATION.md` for the physical checklist that turns
DEVICE STATE VERIFIED / PHYSICAL AUDIO EFFECT VERIFIED rows into evidence.

