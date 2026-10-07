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
| Liberty 5 | A3957 | — | — | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | Protocol: OpenSCQ30 |
| Liberty 4 Pro | A3954 | — | — | ❓ | ❓ | 🔒 | ❌ | ❓ | ❓ | ❓ | Protocol: OpenSCQ30 |
| Liberty 4 NC | A3947 | — | — | ❓ | ❓ | 🔒 | ❌ | ❓ | ❓ | ❓ | Protocol: OpenSCQ30 |
| P40i | A3955 | — | — | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | Protocol: OpenSCQ30 |
| Space A40 | A3936 | — | — | ❓ | ❓ | 🔒 | ❌ | ❓ | ❓ | ❓ | Protocol: OpenSCQ30 |
| Sport X20 | A3968 | — | — | ❓ | ❓ | 🔒 | ❌ | ❓ | ❓ | ✅ | Protocol: OpenSCQ30 |
| R50i NC / P30i | A3959 | — | — | ❓ | ❓ | ❓ | ✅ | ✅ | ❌ | ✅ | Protocol: OpenSCQ30 |
| R50i / P20i / P25i | A3949 | — | — | ❓ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | Protocol: OpenSCQ30 |
| P31i / R60i NC | D1202 | — | — | ❓ | ❓ | 🔒 | ❓ | ❓ | ✅ | ✅ | Protocol: OpenSCQ30 |
| Space One A40 | A3035 | — | — | ❓ | ❓ | ❓ | ❓ | ❓ | ✅ | ❓ | Protocol: OpenSCQ30 |
| Q45 | A3040 | — | — | ❓ | ❓ | ❓ | ❓ | ❓ | ✅ | ✅ | Protocol: OpenSCQ30 |

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
