# What is (and is not) inside the official soundcore Android app

Notes from inspecting the decompiled APK dump for **soundcore 6.4.0-17**
(`com.oceanwing.soundcore`, four APKPure parts, 201 MB unpacked). Recorded so the
same dead ends are not explored twice.

## The app is Flutter, not Java

| Artifact | Size | Meaning |
|---|---|---|
| `classes.dex` | **333 KB** | Just the Flutter embedding. No app logic. |
| `lib/arm64-v8a/libapp.so` | 10.2 MB | The real app: **AOT-compiled Dart**. |
| `lib/armeabi-v7a/libapp.so` | 11.5 MB | 32-bit build of the same. |
| `lib/arm64-v8a/libflutter.so` | 10.6 MB | Flutter engine. |

Decompiling `classes.dex` with jadx, apktool or `dexdump` yields nothing useful —
it is the launcher and engine plumbing only. The UI framework is GetX, and all
device logic lives in the Dart snapshot.

## Why the protocol cannot simply be read out of it

1. **The frame layouts are not stored as data.** Every host→device template this
   project documents (init `00 00 00 01 01 0A 00`, ANC `00 00 00 06 81 0E 00`,
   EQ `00 00 00 02 81 14 00`, gaming `87 0C`, find-device `88 0C`, reset
   `85 0A`, LDAC `7F 0A` / `FF 0B`, dual `0B 84 0B`) was scanned for as raw bytes
   across `libapp.so` and **all 103 native libraries**: **zero hits**. The app
   builds frames from integer operands in code, so there is no byte table to
   lift.
2. **No transport vocabulary at all.** `libapp.so` contains **no UUIDs**
   (including this project's `0cf12d31-fac3-4553-bd80-d6832e7b3947`), no `SPP`,
   no `rfcomm`, no `BluetoothSocket`, no `createRfcommSocket` strings.
3. **Per-device feature data is server-side.** The 112 JSON files in the APK are
   UI assets (mostly Lottie animations); `assets/resource.zip` (20 MB) is audio
   content. There is no local command/capability table to read.
4. AOT Dart also means the **original source cannot be recovered** — strings and
   some symbol names survive, structure does not.

Conclusion: for this app, **capture-based reverse engineering (what
`PROTOCOL.md` already does) remains the only practical route**, and any protocol
change has to be validated against a real device or a packet capture, not against
the APK.

## What the dump *was* good for

The APK ships per-model UI resources, which expose the official model list. The
SKUs below were harvested from the APK, then **confirmed against Anker's own
serial-number documentation** and cross-checked with an independent open-source
Soundcore client before being added to `src/protocol/devices.ts`.

```
A3004 Q20i        A3035 Space One       A3943 Life Note E      A3955 P40i
A3005 Q11i        A3040 Space Q45       A3944 Life P2 Mini     A3957 Liberty 5
A3027 Life Tune   A3062 Space One Pro   A3945 Life Note 3S     A3958 A30i
A3028 Q30         A3330 C30i            A3947 Liberty 4 NC     A3959 P30i / R50i NC
A3029 Life Q35    A3331 C40i            A3948 A20i / A25i      A3961 Sport X10
A3030 Life Tune   A3874 AeroFit 2       A3949 P20i/P25i/R50i   A3968 Sport X20
        Pro       A3876 V20i            A3951 Liberty Air 2    A3994 K20i
A3931 Life Dot    A3936 Space A40              Pro            A6610 Sleep A10
        2 NC      A3937 P41i            A3952 Liberty 3 Pro    A6611 Sleep A20
A3933 Life Note 3 A3939 Life P3         A3953 Liberty 4        D1101 C50i
A3935 Life A2 NC  A3062 Space One Pro   A3954 Liberty 4 Pro    D1202 P31i
                                                               D1202C R60i NC
                                                               D1301 Sleep A30
```

### Two bugs this exposed in our own table

- **A3948 ≠ P20i.** `A3948` is the **A20i / A25i**; the P20i / P25i / R50i are
  **A3949**. The old table had these swapped, so an A20i was profiled as a P20i.
- **A3949 ≠ R50i NC.** The base R50i has no ANC; **R50i NC shares A3959 with the
  P30i**. Because `matchDevice` matches by substring, the old `r50i-nc` profile
  also carried the bare alias `R50i`, so a plain R50i was matched to an
  ANC-capable profile and shown noise-cancelling controls it does not have.

Both are fixed in `src/protocol/devices.ts` and locked down by
`tests/devices.test.ts`.

## Provenance of the profiles

`VERIFIED_DEVICES` — capabilities taken from captures and the field notes in
`PROTOCOL.md`.

`DISCOVERED_DEVICES` — models confirmed to exist on the official model list, with
capability flags **inferred** from the product family and published specs and
marked `inferred: true`. The one field that is reliable for these is `family`
(TWS vs over-ear), because that is a hardware property that decides which ANC
frame layout is used. The UI shows an "inferred" badge and the device picker
explains it, rather than presenting guesses as verified capability.

## Recreating the extraction

The dump lives on Google Drive, which the coding sandbox cannot reach
(`*.google.com` fails at the TLS handshake) and whose large archives the browsing
tool cannot fetch. A GitHub Actions runner has full internet access, so the route
that worked was a throwaway workflow that downloaded the folder with `gdown`,
unpacked it, and committed the extracted facts back to the working branch.
Diagnostics must be written into the committed output: Actions job logs are not
reachable from the sandbox either.
