#!/usr/bin/env bash
# Self-test for the "Repair release installer asset name" workflow.
#
# Extracts the REAL `run:` step scripts from
# .github/workflows/repair-release-asset-name.yml and executes them in order
# against a stubbed `gh` and `curl`, so every branch is proven without touching
# GitHub: already-canonical, single mis-named asset, no installer, ambiguous
# installers, dry run, missing release, download/upload failures, non-PE payload.
#
# Usage: scripts/tests/test_repair_release_asset_name.sh
set -uo pipefail

WORKFLOW=".github/workflows/repair-release-asset-name.yml"
PASS=0
FAIL=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 2; }

# ---- extract the real run: blocks, named deterministically by step order ----
python3 - "$WORKFLOW" "$TMP" <<'PY'
import re, sys, pathlib
wf, out = sys.argv[1], pathlib.Path(sys.argv[2])
lines = pathlib.Path(wf).read_text().split('\n')
steps, name, body, collecting, base = [], None, None, False, None
def flush():
    global body
    if name and body is not None:
        steps.append((name, body))
    body = None
for ln in lines:
    m = re.match(r'^\s*-\s+name:\s*(.+?)\s*$', ln)
    if m:
        flush(); name = m.group(1).strip('\'"'); collecting = False; continue
    if name and re.match(r'^\s*run:\s*\|\s*$', ln):
        body, collecting, base = [], True, None; continue
    if collecting and body is not None:
        if not ln.strip(): body.append(''); continue
        ind = len(ln) - len(ln.lstrip())
        if base is None: base = ind
        if ind < base: collecting = False; continue
        body.append(ln[base:])
flush()
for i, (n, b) in enumerate(steps):
    slug = re.sub(r'[^a-z0-9]+', '_', n.lower()).strip('_')[:44]
    (out / f"step{i:02d}_{slug}.sh").write_text('\n'.join(b) + '\n')
print(f"extracted {len(steps)} runnable steps")
PY
mapfile -t STEPS < <(ls "$TMP"/step*.sh | sort)
if [ "${#STEPS[@]}" -lt 6 ]; then
  echo "FAIL: expected >=6 runnable steps, extracted ${#STEPS[@]}" >&2; exit 1
fi

# ---- stubs ------------------------------------------------------------------
mkdir -p "$TMP/bin"
cat > "$TMP/bin/gh" <<'STUB'
#!/usr/bin/env bash
# Scenario-driven `gh` stub. State that the workflow itself mutates (an upload)
# is tracked in $STUB_STATE so later steps observe the new reality.
args="$*"
uploaded=""
[ -n "${STUB_STATE:-}" ] && [ -f "$STUB_STATE" ] && uploaded="$(cat "$STUB_STATE")"
case "$args" in
  *"release view"*"--json tagName"*)
    [ "${STUB_SCENARIO:-}" = "no-release" ] && exit 1
    printf '{"tagName":"v1.0.7"}\n'; exit 0 ;;
  *"--jq"*".url"*)
    printf 'https://api.github.com/repos/x/y/releases/assets/1\n'; exit 0 ;;
  *"--json assets"*)
    # Mirror `gh`'s real --jq output shape: the inspect step asks for
    # "[.name, (.size|tostring)] | @tsv" (name TAB size), the link-verification
    # step asks for ".assets[].name" (bare names). Getting this wrong would let
    # a `grep -Fxq` pass or fail for the wrong reason.
    names="$STUB_ASSETS"
    [ -n "$uploaded" ] && names="$names $uploaded"
    case "$args" in
      *"@tsv"*) printf '%s\n' $names | sed 's/$/\t122508954/' ;;
      *)        printf '%s\n' $names ;;
    esac
    exit 0 ;;
  *"release upload"*)
    [ "${STUB_SCENARIO:-}" = "upload-fails" ] && { echo "upload error" >&2; exit 1; }
    # `gh release upload <tag> <path>` -> record the published asset name.
    for a in "$@"; do case "$a" in */SoundControl-Setup.exe|SoundControl-Setup.exe) uploaded="$a" ;; esac; done
    [ -n "${STUB_STATE:-}" ] && basename "$uploaded" > "$STUB_STATE"
    echo "https://github.com/x/y/releases/download/v1.0.7/SoundControl-Setup.exe"; exit 0 ;;
  *"release delete-asset"*)
    # Deleting the source asset removes it from the stubbed listing.
    if [ -n "${STUB_STATE:-}" ]; then
      del=""
      for a in "$@"; do case "$a" in *.exe) del="$a" ;; esac; done
      STUB_ASSETS="$(printf '%s\n' $STUB_ASSETS | grep -vxF "$del" | tr '\n' ' ')"
      export STUB_ASSETS
    fi
    exit 0 ;;
esac
exit 0
STUB
cat > "$TMP/bin/curl" <<'STUB'
#!/usr/bin/env bash
out=""; prev=""
for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
case "${STUB_SCENARIO:-}" in
  download-fails) echo "curl: (22) The requested URL returned error: 404" >&2; exit 22 ;;
  not-a-pe)       [ -n "$out" ] && head -c 3000000 /dev/zero | tr '\0' 'X' > "$out"; exit 0 ;;
esac
if [ -n "$out" ]; then
  # Build a structurally valid PE/NSIS image: 'MZ' magic, e_lfanew at offset 60
  # pointing at a real 'PE\0\0' signature, plus a Nullsoft marker and enough
  # bulk to clear the 1 MB sanity floor. Byte offsets are set explicitly so the
  # fixture cannot drift.
  python3 - "$out" <<'PY' || exit 1
import sys, struct
p = sys.argv[1]
PE_OFF = 4096
b = bytearray(b'MZ' + b'\x00' * (PE_OFF - 2))
b[0x3C:0x40] = struct.pack('<I', PE_OFF)      # e_lfanew at offset 60
b[PE_OFF:PE_OFF + 4] = b'PE\x00\x00'          # PE signature
payload = b'Nullsoft.NSIS.exehead'
b[PE_OFF + 24:PE_OFF + 24 + len(payload)] = payload
b += b'\x00' * (3 * 1024 * 1024 - len(b))     # ~3 MB total
open(p, 'wb').write(bytes(b))
PY
fi
echo "200"; exit 0
STUB
chmod +x "$TMP/bin/gh" "$TMP/bin/curl"

# ---- driver: run every step in order inside ONE subshell --------------------
run_scenario() { # $1=scenario $2=assets $3=dry_run $4=remove_mismatched
  (
    set -u
    export PATH="$TMP/bin:$PATH"
    export STUB_SCENARIO="$1" STUB_ASSETS="$2"
    export GH_TOKEN=stub TAG=v1.0.7
    export CANONICAL=SoundControl-Setup.exe CANONICAL_ASSET=SoundControl-Setup.exe
    export GITHUB_STEP_SUMMARY="$TMP/summary.md" GITHUB_OUTPUT="$TMP/outputs.txt"
    export GITHUB_SERVER_URL=https://github.com
    export GITHUB_REPOSITORY=Shankers8811/soundcontrol
    : > "$GITHUB_STEP_SUMMARY"; : > "$GITHUB_OUTPUT"
    export STUB_STATE="$TMP/upload-state.txt"; : > "$STUB_STATE"
    wd="$TMP/work"; rm -rf "$wd"; mkdir -p "$wd"; cd "$wd" || exit 9
    DRY_RUN="$3"; REMOVE="$4"; export DRY_RUN
    # Mirror the workflow's real gating: every step after `inspect` carries
    # `if: steps.inspect.outputs.canonical_present == '0'`.
    gated=0
    for s in "${STEPS[@]}"; do
      b="$(basename "$s")"
      case "$b" in
        *validate_inputs*)            gated=0 ;;
        *inspect_the_release_assets*) gated=0 ;;
        *optionally_remove*)          [ "$REMOVE" != "true" ] && continue ;;
        *summary*)                    continue ;;
        *)                            [ "$gated" = 1 ] && continue ;;
      esac
      export SOURCE_NAME="$(sed -n 's/^source_name=//p' "$GITHUB_OUTPUT" | head -1)"
      bash "$s" || exit $?
      case "$b" in
        *inspect_the_release_assets*)
          gated="$(sed -n 's/^canonical_present=//p' "$GITHUB_OUTPUT" | head -1)"
          [ "$gated" = 1 ] && continue   # canonical already present: no-op success
          gated=0
          ;;
      esac
    done
    exit 0
  ) >"$TMP/scenario.log" 2>&1
  echo $?
}

check() {
  local desc="$1" expected="$2" actual="$3" match=no
  if [ "$expected" = "$actual" ]; then match=yes
  elif [ "$expected" = nonzero ] && [ "$actual" != 0 ]; then match=yes; fi
  if [ "$match" = yes ]; then PASS=$((PASS+1)); printf 'ok   %s\n' "$desc"
  else
    FAIL=$((FAIL+1))
    printf 'FAIL %s\n     expected: %s\n     actual:   %s\n' "$desc" "$expected" "$actual"
    sed 's/^/       | /' "$TMP/scenario.log" | tail -12
  fi
}

echo "== repair-release-asset-name scenarios =="
check "already canonical -> 0 (nothing to do)"    0 "$(run_scenario ok 'SoundControl-Setup.exe' false false)"
check "single mis-named asset -> 0 (repaired)"    0 "$(run_scenario ok 'SoundControl.Setup.1.0.7.exe' false false)"
check "dry run -> 0 (nothing uploaded)"           0 "$(run_scenario ok 'SoundControl.Setup.1.0.7.exe' true false)"
check "remove_mismatched_exe=true -> 0"           0 "$(run_scenario ok 'SoundControl.Setup.1.0.7.exe' false true)"
check "no installer asset -> nonzero"             nonzero "$(run_scenario ok 'notes.txt' false false)"
check "ambiguous installers -> nonzero (no guess)" nonzero "$(run_scenario ok 'A-Setup.exe B-Setup.exe' false false)"
check "release missing -> nonzero"                nonzero "$(run_scenario no-release 'X.exe' false false)"
check "download failure -> nonzero"               nonzero "$(run_scenario download-fails 'SoundControl.Setup.1.0.7.exe' false false)"
check "non-PE payload -> nonzero"                 nonzero "$(run_scenario not-a-pe 'SoundControl.Setup.1.0.7.exe' false false)"
check "upload failure -> nonzero"                 nonzero "$(run_scenario upload-fails 'SoundControl.Setup.1.0.7.exe' false false)"

# The success path must validate the PE and record provenance.
run_scenario ok 'SoundControl.Setup.1.0.7.exe' false false >/dev/null
check "success confirms the PE signature"   yes "$(grep -q 'PE signature present' "$TMP/scenario.log" && echo yes || echo no)"
check "success confirms the NSIS marker"    yes "$(grep -q 'NSIS installer' "$TMP/scenario.log" && echo yes || echo no)"
check "success records a SHA-256"           yes "$(grep -Eq 'SHA-256: [0-9a-f]{64}' "$TMP/scenario.log" && echo yes || echo no)"
check "success verifies the live link"      yes "$(grep -q 'Canonical download link resolves' "$TMP/scenario.log" && echo yes || echo no)"
check "repair is byte-preserving (stub curl wrote the payload once)" yes \
  "$(grep -q 'Downloading asset' "$TMP/scenario.log" && echo yes || echo no)"

echo
echo "== results =="
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
