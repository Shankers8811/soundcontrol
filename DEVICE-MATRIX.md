# SoundControl — Community Device Matrix

Community-reported compatibility results. Every row is a real device tested by
a real user. Results marked **pending** have no community report yet.

**How to contribute:** Open a [device report issue](https://github.com/Shankers8811/soundcontrol/issues/new?template=device-report.yml) with your model,
firmware, and what worked. Reports with a hex console capture become pinned
verifier checks.

**Legend:**
- ✅ Works — confirmed by community or protocol evidence
- ⚠️ Partial — some features work, some don't
- ❌ Does not work — confirmed broken
- ❓ Unknown — no report yet
- 🔒 Read-only — protocol evidence exists but write commands not validated

---

## TWS / In-Ear Earbuds

| Model | SKU | Firmware | Platform | Battery | ANC | EQ | Custom EQ | Gaming | LDAC | Dual | Source |
|-------|-----|----------|----------|---------|-----|----|-----------|----|------|------|--------|
| Liberty 5 | A3957 | — | — | ❓ | ✅ (tws-l5) | 🔒 (HearID) | ❌ | ✅ | ❓ | ❓ | Protocol: OpenSCQ30 + APK verification |
| Liberty 4 Pro | A3954 | — | — | ❓ | ✅ (tws-l4pro) | 🔒 (HearID) | ❌ | ❓ | ❓ | ❓ | Protocol: OpenSCQ30 + APK verification |
| Liberty 4 NC | A3947 | — | — | ❓ | ✅ (tws-l4nc) | 🔒 (HearID) | ❌ | ✅ | ❌ | ❌ | Protocol: OpenSCQ30 + APK verification |
| Liberty 3 Pro | A3952 | — | — | ❓ | ✅ (tws-l3pro) | 🔒 (HearID) | ❌ | ❓ | ✅ | ❌ | Protocol: OpenSCQ30 + APK verification |
| P40i | A3955 | — | — | ❓ | ✅ (tws-p40i) | 🔒 (HearID) | ❌ | ❌ | ❓ | ✅ | Protocol: OpenSCQ30 |
| Space A40 | A3936 | — | — | ❓ | ✅ (tws-a3936) | 🔒 (HearID) | ❌ | ❓ | ❓ | ❓ | Protocol: OpenSCQ30 |
| Sport X20 | A3968 | — | — | ❓ | ✅ (tws-a3968) | 🔒 (HearID) | ❌ | ❓ | ❓ | ✅ | Protocol: OpenSCQ30 |
| R50i NC / P30i | A3959 | — | — | ❓ | ✅ (tws-p30i) | ✅ (02:83) | ✅ | ✅ | ❌ | ✅ | Protocol: OpenSCQ30 + APK verification |
| R50i / P20i / P25i | A3949 | — | — | ❓ | ❌ | ✅ (02:83) | ❌ | ✅ | ❌ | ❌ | Protocol: OpenSCQ30 |
| P31i / R60i NC | D1202 | — | — | ❓ | ✅ (tws-d1202) | 🔒 (03:87) | ❌ | ❓ | ✅ | ✅ | Protocol: OpenSCQ30 |
| Space One Pro | A3062 | — | — | ❓ | ✅ (tws-a3062) | 🔒 (HearID) | ❌ | ❓ | ❓ | ❓ | Protocol: OpenSCQ30 |
| Space One | A3035 | — | — | ❓ | ✅ (classic-a3035) | 🔒 (HearID) | ❌ | ❓ | ✅ | ❓ | Protocol: OpenSCQ30 |
| Space Q45 | A3040 | — | — | ❓ | ✅ (classic-a3040) | 🔒 (HearID) | ❌ | ❓ | ✅ | ✅ | Protocol: OpenSCQ30 |
| C30i | A3330 | — | — | ❓ | ❌ | ✅ (02:83) | ✅ | ❌ | ❌ | ✅ | Protocol: OpenSCQ30 |
| C50i | D1101 | — | — | ❓ | ❌ | ✅ (02:81) | ✅ | ❌ | ✅ | ✅ | Protocol: OpenSCQ30 |
| V20i | A3876 | — | — | ❓ | ❌ | ✅ (02:83) | ✅ | ✅ | ❌ | ✅ | Protocol: OpenSCQ30 |
| AeroClip | A3388 | — | — | ❓ | ❌ | ✅ (02:83) | ✅ | ❌ | ❌ | ✅ | Protocol: OpenSCQ30 |
| Life Note 3S | A3945 | — | — | ❓ | ❌ | 🔒 (Read-only) | ❌ | 🔒 | ❌ | ❌ | Protocol: OpenSCQ30 |

## Over-Ear Headphones

| Model | SKU | Firmware | Platform | Battery | ANC | EQ | Custom EQ | Gaming | Source |
|-------|-----|----------|----------|---------|-----|----|-----------|--------|--------|
| Space One | A3035 | — | — | ❓ | ❓ | ❓ | ❓ | ❓ | Protocol: OpenSCQ30 |
| Q30 | A3027 | — | — | ❓ | ❓ | ❓ | ❓ | ❓ | Pending capture |
| Q35 | A3027 | — | — | ❓ | ❓ | ❓ | ❓ | ❓ | Pending capture |

---

## How to Add Your Device

1. [Open a device report](https://github.com/Shankers8811/soundcontrol/issues/new?template=device-report.yml)
2. Fill in the template — model, firmware, what worked
3. Attach a hex console capture from Settings > Diagnostics if you can
4. Your report will be reviewed and added to this table

---

## Protocol Evidence Key

All protocol implementations in SoundControl are based on:
- **[OpenSCQ30](https://github.com/Oppzippy/OpenSCQ30)** — the authoritative per-model reference
- **soundcorebridge** — community RFCOMM captures
- **Noiseclapper-GNOME** — additional community captures
- **SoundcoreDesktop** — Windows-side cross-checks

No feature is shipped in SoundControl without a public, labelled capture or
evidence source. Guessed or invented opcodes are explicitly excluded —
see [ROADMAP.md](ROADMAP.md).
