#!/usr/bin/env bash
# Self-test for the CI bash logic in the release workflows.
#
# It extracts the REAL `run:` script for a named step out of a workflow file and
# executes it against synthetic environments, so the credential gate and the
# asset-name verifier are proven to branch correctly without spending a Windows
# runner. No secret value is ever needed: only presence/absence matters.
#
# Usage: scripts/tests/test_release_ci_gates.sh
set -uo pipefail

WORKFLOW=".github/workflows/release-windows.yml"
PASS=0
FAIL=0

# --- tiny YAML step extractor (no deps) -------------------------------------
# Prints the literal `run: |` block belonging to the step whose `name:` matches.
extract_step() {
  local file="$1" want="$2"
  awk -v want="$want" '
    /^[[:space:]]*-[[:space:]]*name:[[:space:]]*/ {
      line=$0; sub(/^[[:space:]]*-[[:space:]]*name:[[:space:]]*/,"",line)
      gsub(/^["'"'"']|["'"'"']$/,"",line)
      instep = (line == want)
      next
    }
    instep && /^[[:space:]]*run:[[:space:]]*\|[[:space:]]*$/ { inrun=1; base=-1; next }
    inrun {
      # first content line establishes the block indent
      match($0, /^[[:space:]]*/)
      ind = RLENGTH
      if ($0 ~ /^[[:space:]]*$/) { print ""; next }
      if (base < 0) base = ind
      if (ind < base) { inrun=0; instep=0; next }
      print substr($0, base+1)
    }
  ' "$file"
}

check() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS+1)); printf 'ok   %s\n' "$desc"
  else
    FAIL=$((FAIL+1)); printf 'FAIL %s\n     expected: %s\n     actual:   %s\n' "$desc" "$expected" "$actual"
  fi
}

# --- build the harness ------------------------------------------------------
GATE="$(extract_step "$WORKFLOW" "Require Authenticode signing credentials")"
VERIFY="$(extract_step "$WORKFLOW" "Verify the canonical installer asset name")"

if [ -z "$GATE" ]; then
  echo "FAIL could not extract the credentials gate step from $WORKFLOW" >&2
  exit 1
fi
if [ -z "$VERIFY" ]; then
  echo "FAIL could not extract the canonical-name step from $WORKFLOW" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# run_gate LINK_CANON LINK_LEGACY PASS_CANON PASS_LEGACY [PUBLISHER] -> exit code
run_gate() {
  local env_file="$TMP/gate.env" sum_file="$TMP/gate.summary"
  : > "$sum_file"
  cat > "$env_file" <<EOF
SC_CANONICAL_LINK=$1
SC_LEGACY_LINK=$2
SC_CANONICAL_PASSWORD=$3
SC_LEGACY_PASSWORD=$4
SC_EXPECTED_PUBLISHER=${5:-}
GITHUB_STEP_SUMMARY=$sum_file
GITHUB_SERVER_URL=https://github.com
GITHUB_REPOSITORY=Shankers8811/soundcontrol
GITHUB_SHA=deadbeef
EOF
  ( set -a; . "$env_file"; set +a
    bash -c "$GATE" >"$TMP/gate.out" 2>&1 )
  echo $?
}

gate_out() { cat "$TMP/gate.out"; }
gate_summary() { cat "$TMP/gate.summary"; }

echo "== Require Authenticode signing credentials =="

check "both canonical secrets set -> pass" 0 "$(run_gate CANONLINK '' CANONPASS '')"
check "canonical link only -> fail" 1 "$(run_gate CANONLINK '' '' '')"
check "canonical password only -> fail" 1 "$(run_gate '' '' CANONPASS '')"
check "nothing set -> fail" 1 "$(run_gate '' '' '' '')"
check "legacy alias pair set -> pass" 0 "$(run_gate '' LEGACYLINK '' LEGACYPASS)"
check "canonical link + legacy password -> pass (mixed pair allowed)" 0 "$(run_gate CANONLINK '' '' LEGACYPASS)"

# Diagnostics quality: the failure must name the exact missing secret.
run_gate '' '' CANONPASS '' >/dev/null
check "failure names WIN_CSC_LINK as missing" yes \
  "$(gate_out | grep -q 'Missing secret(s): WIN_CSC_LINK' && echo yes || echo no)"
check "failure does not blame the password that IS set" yes \
  "$(gate_out | grep -q 'Missing secret(s): WIN_CSC_LINK WIN_CSC_KEY_PASSWORD' && echo no || echo yes)"

run_gate '' '' '' '' >/dev/null
check "failure names BOTH secrets when both missing" yes \
  "$(gate_out | grep -q 'Missing secret(s): WIN_CSC_LINK WIN_CSC_KEY_PASSWORD' && echo yes || echo no)"

# Fork / read-only-token hint must be present on the failure path.
check "failure explains the fork/read-only-secret case" yes \
  "$(gate_out | grep -qi 'fork' && echo yes || echo no)"

# Step summary must be written and must not leak any value.
check "failure writes a job summary" yes \
  "$([ -s "$TMP/gate.summary" ] && echo yes || echo no)"
check "summary marks the secret MISSING" yes \
  "$(gate_summary | grep -q 'MISSING' && echo yes || echo no)"
check "summary links the signing doc" yes \
  "$(gate_summary | grep -q 'docs/WINDOWS-CODE-SIGNING.md' && echo yes || echo no)"
check "summary contains no secret value" yes \
  "$(gate_summary | grep -q 'CANONPASS\|CANONLINK\|LEGACYPASS' && echo no || echo yes)"

# Success path must not write a scary summary and must report which names won.
run_gate CANONLINK '' CANONPASS '' >/dev/null
check "success reports the canonical names used" yes \
  "$(gate_out | grep -q 'WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD' && echo yes || echo no)"
run_gate '' LEGACYLINK '' LEGACYPASS >/dev/null
check "success reports legacy alias usage" yes \
  "$(gate_out | grep -q 'legacy alias' && echo yes || echo no)"

echo
echo "== Verify the canonical installer asset name =="

# The verifier shells out to `gh`; stub it so the branch logic is testable.
run_verify() { # $1 = newline-separated asset names
  local bin="$TMP/bin"
  mkdir -p "$bin"
  cat > "$bin/gh" <<EOF
#!/usr/bin/env bash
printf '%s\n' '$1'
EOF
  chmod +x "$bin/gh"
  ( export PATH="$bin:$PATH" RELEASE_TAG=v1.0.7 CANONICAL_ASSET=SoundControl-Setup.exe
    bash -c "$VERIFY" >"$TMP/verify.out" 2>&1 )
  echo $?
}

check "canonical asset present -> pass" 0 "$(run_verify 'SoundControl-Setup.exe')"
check "mis-named asset only -> fail" 1 "$(run_verify 'SoundControl.Setup.1.0.7.exe')"
check "canonical + extra exe -> pass with warning" 0 "$(run_verify 'SoundControl-Setup.exe
SoundControl.Setup.1.0.7.exe')"
check "no assets -> fail" 1 "$(run_verify '')"

run_verify 'SoundControl.Setup.1.0.7.exe' >/dev/null
check "failure points at the repair workflow" yes \
  "$(grep -qi 'Repair release installer asset name' "$TMP/verify.out" && echo yes || echo no)"
check "failure states the link would 404" yes \
  "$(grep -q '404' "$TMP/verify.out" && echo yes || echo no)"

echo
echo "== results =="
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
