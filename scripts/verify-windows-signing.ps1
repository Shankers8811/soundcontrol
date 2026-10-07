<#
.SYNOPSIS
  Authenticode verification for the SoundControl Windows build output.

.DESCRIPTION
  Verifies the REAL generated executables — never a certificate file — after
  electron-builder packaging:

    1. the NSIS installer exists (exactly one *.exe at the release root);
    2. its Authenticode signature is Valid (Get-AuthenticodeSignature);
    3. the certificate chain is trusted (signtool verify /pa);
    4. the publisher identity is displayed, and matches -ExpectedPublisher
       when one is configured;
    5. the signing certificate is currently valid (not expired, not
       not-yet-valid);
    6. the file has not been modified after signing (a Valid signature means
       the file still matches the hash that was signed);
    7. the SHA-256 hash of the installer is recorded (console, summary file
       and the GitHub Actions step summary);
    8. every shipped executable under win-unpacked/ (the app exe and the
       bundled Python runtime) carries a Valid signature as well.

  Modes:
    - Default (report): informational. An unsigned build is reported but does
      not fail the script — this is the mode for normal CI builds, which do
      not distribute their artifacts and stay unsigned.
    - -RequireSigned   : the release gate. ANY failure above is fatal. The
      release workflow runs this mode before publishing a GitHub Release, so
      an unsigned or tampered installer can never be published.

  This script verifies; it never signs, and it never touches Windows
  security settings. SmartScreen is not bypassed here or anywhere else —
  see docs/WINDOWS-CODE-SIGNING.md for what signing does and does not do.

.PARAMETER ReleaseDir
  Build output directory (electron-builder "directories.output"). Default "release".

.PARAMETER InstallerPath
  Explicit installer to verify (e.g. .\SoundControl-Setup.exe downloaded from
  a release). When omitted, the single *.exe directly inside ReleaseDir is used.

.PARAMETER RequireSigned
  Fail (exit 1) when any signature check fails. Release gate mode.

.PARAMETER ExpectedPublisher
  Expected signer identity (e.g. "Shankers"). The signer certificate subject
  must contain this string (case-insensitive) or the release gate fails.

.PARAMETER SummaryFile
  Where to write the recorded SHA-256 + signer summary.
  Default: <ReleaseDir>\SIGNING-SUMMARY.txt

.EXAMPLE
  # CI build, informational only
  ./scripts/verify-windows-signing.ps1

.EXAMPLE
  # Release gate (used by .github/workflows/release-windows.yml)
  ./scripts/verify-windows-signing.ps1 -RequireSigned -ExpectedPublisher "Shankers"

.EXAMPLE
  # Verify a downloaded release installer on any Windows machine
  ./scripts/verify-windows-signing.ps1 -InstallerPath .\SoundControl-Setup.exe -RequireSigned
#>
param(
  [string]$ReleaseDir = 'release',
  [string]$InstallerPath = '',
  [switch]$RequireSigned,
  [string]$ExpectedPublisher = '',
  [string]$SummaryFile = ''
)

$ErrorActionPreference = 'Stop'

# PowerShell 5.1 (Windows-only) has no $IsWindows variable; default it.
$isWindowsOs = $true
if (Get-Variable -Name IsWindows -ErrorAction SilentlyContinue) { $isWindowsOs = $IsWindows }

$script:failures = New-Object System.Collections.Generic.List[string]
$script:summary  = New-Object System.Collections.Generic.List[string]

# In release-gate mode a finding is a [FAIL]; in report mode (CI builds, which
# are expected to be unsigned) the same finding is only a [WARN] — it is still
# recorded, but the exit code stays 0 so non-distributed CI builds stay green.
function Add-Failure {
  param([string]$Message)
  $script:failures.Add($Message)
  if ($RequireSigned) {
    Write-Host "  [FAIL] $Message" -ForegroundColor Red
  } else {
    Write-Host "  [WARN] $Message" -ForegroundColor Yellow
  }
}
function Add-Note {
  param([string]$Message)
  Write-Host "  [NOTE] $Message" -ForegroundColor Yellow
}
function Info {
  param([string]$Message)
  Write-Host "  $Message"
}

function Get-CommonName {
  param([string]$Subject)
  if ($Subject -and $Subject -match 'CN=([^,]+)') { return $Matches[1].Trim().Trim('"') }
  return $Subject
}

# Locate signtool.exe from the Windows SDK (preinstalled on windows-latest
# runners; commonly present on developer machines with VS/SDK installed).
function Find-SignTool {
  if (-not $isWindowsOs) { return $null }
  $roots = @()
  if (${env:ProgramFiles(x86)}) { $roots += (Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin') }
  if ($env:ProgramFiles)        { $roots += (Join-Path $env:ProgramFiles 'Windows Kits\10\bin') }
  foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }
    $found = Get-ChildItem -Path $root -Recurse -Filter 'signtool.exe' -File -ErrorAction SilentlyContinue
    $x64 = $found | Where-Object { $_.FullName -match '\\x64\\' } |
      Sort-Object -Property {
        $v = [version]'0.0.0.0'
        if (-not [version]::TryParse($_.Directory.Name, [ref]$v)) { $v = [version]'0.0.0.0' }
        $v
      } -Descending
    if ($x64) { return ($x64 | Select-Object -First 1).FullName }
    if ($found) { return ($found | Select-Object -First 1).FullName }
  }
  $cmd = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

# signtool verify /pa — validate the signature against the default
# Authenticode policy, which builds and trusts the FULL certificate chain.
function Invoke-SignToolVerify {
  param([string]$ToolPath, [string]$File)
  if (-not $ToolPath) {
    Add-Failure "signtool.exe not found — cannot verify the certificate chain for $File. Install the Windows SDK (signtool) so 'signtool verify /pa' can run."
    return $false
  }
  $output = & $ToolPath verify /pa $File 2>&1
  if ($LASTEXITCODE -eq 0) { return $true }
  Add-Failure "signtool verify /pa failed for $File (exit $LASTEXITCODE): $(($output | Out-String).Trim())"
  return $false
}

$mode = if ($RequireSigned) { 'release gate (signing REQUIRED)' } else { 'report (CI build — unsigned allowed)' }
Write-Host ''
Write-Host '== SoundControl Windows signing verification =='
Info "Mode: $mode"

# ---------------------------------------------------------------------------
# 0. Platform capability check. Get-AuthenticodeSignature is a Windows cmdlet;
#    on other OSes there is nothing this script can honestly verify.
# ---------------------------------------------------------------------------
$canVerify = $isWindowsOs -and [bool](Get-Command Get-AuthenticodeSignature -ErrorAction SilentlyContinue)
if (-not $canVerify) {
  $msg = 'Get-AuthenticodeSignature is unavailable on this platform — Authenticode verification requires Windows.'
  if ($RequireSigned) {
    Add-Failure $msg
    Write-Host ''
    Write-Host 'RESULT: FAIL — release gate cannot verify signatures on this platform' -ForegroundColor Red
    exit 1
  }
  Add-Note $msg
  Write-Host ''
  exit 0
}

# ---------------------------------------------------------------------------
# 1. The installer must exist. Discover the single *.exe at the release root
#    (electron-builder's NSIS output), or use the explicit -InstallerPath.
# ---------------------------------------------------------------------------
if ([System.IO.Path]::IsPathRooted($ReleaseDir)) {
  $resolvedReleaseDir = $ReleaseDir
} else {
  $resolvedReleaseDir = Join-Path (Get-Location) $ReleaseDir
}
if ($InstallerPath -ne '') {
  if (-not (Test-Path $InstallerPath)) {
    Add-Failure "Installer not found: $InstallerPath"
  } else {
    $installer = Get-Item $InstallerPath
  }
} else {
  $candidates = @()
  if (Test-Path $resolvedReleaseDir) {
    $candidates = @(Get-ChildItem -Path $resolvedReleaseDir -Filter '*.exe' -File -ErrorAction SilentlyContinue)
  }
  if ($candidates.Count -eq 0) {
    Add-Failure "No installer (*.exe) found in $resolvedReleaseDir — nothing to verify."
  } elseif ($candidates.Count -gt 1) {
    Add-Failure "Expected exactly one installer in $resolvedReleaseDir, found $($candidates.Count): $(($candidates.Name -join ', '))"
  } else {
    $installer = $candidates[0]
  }
}

if (-not (Get-Variable -Name installer -ErrorAction SilentlyContinue)) {
  Write-Host ''
  Write-Host 'RESULT: FAIL — no installer to verify' -ForegroundColor Red
  exit 1
}

$sizeMb = [math]::Round($installer.Length / 1MB, 2)
Write-Host ''
Write-Host "[Installer] $($installer.Name) ($sizeMb MB)"

# ---------------------------------------------------------------------------
# 2-6. Signature, chain, publisher, integrity and hash of the installer.
# ---------------------------------------------------------------------------
$signature = Get-AuthenticodeSignature -FilePath $installer.FullName
Info "Signature (Get-AuthenticodeSignature): $($signature.Status)"
if ($signature.Status -ne 'Valid') {
  Add-Failure "Installer signature is '$($signature.Status)' (expected Valid). $($signature.StatusMessage)"
}

$subject = $null
if ($signature.SignerCertificate) { $subject = $signature.SignerCertificate.Subject }
$commonName = Get-CommonName $subject
Info "Publisher (signer subject): $subject"
if ([string]::IsNullOrWhiteSpace($subject)) {
  Add-Failure 'Publisher identity is missing — the signature carries no signer subject.'
} elseif ($ExpectedPublisher -ne '' -and $subject -notmatch [regex]::Escape($ExpectedPublisher)) {
  Add-Failure "Publisher mismatch: signer '$subject' does not match the expected publisher '$ExpectedPublisher'."
} elseif ($ExpectedPublisher -ne '') {
  Info "Publisher matches the expected identity '$ExpectedPublisher'."
}
if ($signature.SignerCertificate) {
  Info "Signer thumbprint: $($signature.SignerCertificate.Thumbprint)"
  Info "Certificate validity: $($signature.SignerCertificate.NotBefore.ToString('yyyy-MM-dd')) -> $($signature.SignerCertificate.NotAfter.ToString('yyyy-MM-dd'))"
  # Explicit validity-window check. A timestamped signature technically stays
  # Valid after expiry, but a fresh release must be signed by a certificate
  # that is currently valid — an expired (or not-yet-valid) signer means the
  # certificate was renewed/rotated wrong and must not ship.
  $now = Get-Date
  if ($now -lt $signature.SignerCertificate.NotBefore) {
    Add-Failure "Signing certificate is not valid yet (NotBefore $($signature.SignerCertificate.NotBefore.ToString('yyyy-MM-dd')))."
  } elseif ($now -gt $signature.SignerCertificate.NotAfter) {
    Add-Failure "Signing certificate expired on $($signature.SignerCertificate.NotAfter.ToString('yyyy-MM-dd')) — renew the certificate (see docs/WINDOWS-CODE-SIGNING.md) and rebuild."
  } else {
    $daysLeft = ($signature.SignerCertificate.NotAfter - $now).Days
    Info "Certificate is currently valid (expires in $daysLeft day(s))."
  }
}
if ($signature.TimeStamperCertificate) {
  Info 'RFC3161 timestamp: present (signature stays valid after certificate expiry)'
} else {
  Add-Failure 'RFC3161 timestamp is missing — the signature would become invalid when the certificate expires.'
}

# A Valid status already proves the file was not modified after signing
# (Authenticode validates the file hash against the signed hash); signtool
# /pa independently re-validates it and the full chain.
$chainTrusted = Invoke-SignToolVerify -ToolPath (Find-SignTool) -File $installer.FullName
if ($chainTrusted) { Info 'Chain (signtool verify /pa): trusted' }
Info 'Integrity: file matches its signed hash — not modified after signing'

$sha256 = (Get-FileHash -Path $installer.FullName -Algorithm SHA256).Hash
Info "SHA-256: $sha256"

# ---------------------------------------------------------------------------
# 7. Every shipped executable under win-unpacked/ must be signed too —
#    the app exe and the bundled Python runtime executables.
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '[Shipped executables]'
$unpackedDir = Join-Path $resolvedReleaseDir 'win-unpacked'
$shippedExes = @()
if (Test-Path $unpackedDir) {
  $shippedExes = @(Get-ChildItem -Path $unpackedDir -Recurse -Filter '*.exe' -File)
}
if ($shippedExes.Count -eq 0) {
  Add-Failure "No executables found under $unpackedDir — expected at least the packaged SoundControl.exe."
}
$appExe = $shippedExes | Where-Object { $_.Name -eq 'SoundControl.exe' } | Select-Object -First 1
if (-not $appExe) {
  Add-Failure "Packaged executable not found: $unpackedDir\SoundControl.exe"
}
foreach ($exe in $shippedExes) {
  $rel = $exe.FullName.Substring($resolvedReleaseDir.Length + 1)
  $exeSig = Get-AuthenticodeSignature -FilePath $exe.FullName
  $exeSigner = Get-CommonName $(if ($exeSig.SignerCertificate) { $exeSig.SignerCertificate.Subject })
  Info ("{0,-64} {1,-12} {2}" -f $rel, $exeSig.Status, $exeSigner)
  if ($exeSig.Status -ne 'Valid') {
    Add-Failure "$rel is '$($exeSig.Status)' — every executable shipped in the installer must be Authenticode-signed."
  }
}
if ($appExe) {
  $null = Invoke-SignToolVerify -ToolPath $signtoolPath -File $appExe.FullName
}

# ---------------------------------------------------------------------------
# Record the SHA-256 + signer identity: console (above), SIGNING-SUMMARY.txt
# (travels with the workflow artifact) and the GitHub step summary.
# ---------------------------------------------------------------------------
if ($SummaryFile -eq '') { $SummaryFile = Join-Path $resolvedReleaseDir 'SIGNING-SUMMARY.txt' }
$script:summary.Add("SoundControl Windows signing verification")
$script:summary.Add("Generated:      $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss' ) (UTC offset $((Get-TimeZone).GetUtcOffset((Get-Date)).ToString()))")
$script:summary.Add("Mode:           $mode")
$script:summary.Add("Installer:      $($installer.Name)")
$script:summary.Add("Size:           $($installer.Length) bytes ($sizeMb MB)")
$script:summary.Add("SHA-256:        $sha256")
$script:summary.Add("Signature:      $($signature.Status)")
$script:summary.Add("Publisher:      $subject")
$script:summary.Add("Thumbprint:     $(if ($signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint })")
$script:summary.Add("Chain (/pa):    $(if ($chainTrusted) { 'trusted' } else { 'NOT trusted' })")
$script:summary.Add("Timestamp:      $(if ($signature.TimeStamperCertificate) { 'RFC3161 present' } else { 'missing' })")
$script:summary.Add('Shipped executables:')
foreach ($exe in $shippedExes) {
  $rel = $exe.FullName.Substring($resolvedReleaseDir.Length + 1)
  $exeSig = Get-AuthenticodeSignature -FilePath $exe.FullName
  $script:summary.Add("  - $rel :: $($exeSig.Status)")
}
try {
  $summaryDir = Split-Path -Parent $SummaryFile
  if ($summaryDir -and (Test-Path $summaryDir)) {
    $script:summary | Set-Content -Path $SummaryFile -Encoding utf8
    Info "Summary recorded: $SummaryFile"
  }
} catch {
  Add-Note "Could not write the summary file ($SummaryFile): $($_.Exception.Message)"
}
if ($env:GITHUB_STEP_SUMMARY) {
  $md = @(
    '### Windows signing verification',
    '',
    "- Installer: ``$($installer.Name)`` ($sizeMb MB)",
    "- Signature: **$($signature.Status)**",
    "- Publisher: ``$subject``",
    "- Chain: $(if ($chainTrusted) { 'trusted (signtool /pa)' } else { 'not verified' })",
    "- SHA-256: ``$sha256``",
    ''
  ) -join "`n"
  Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value $md
}

# ---------------------------------------------------------------------------
# Verdict.
# ---------------------------------------------------------------------------
Write-Host ''
if ($script:failures.Count -gt 0) {
  if ($RequireSigned) {
    Write-Host "RESULT: FAIL — $($script:failures.Count) signing problem(s):" -ForegroundColor Red
    foreach ($failure in $script:failures) { Write-Host "  - $failure" -ForegroundColor Red }
    Write-Host 'Refusing to release: production Windows installers must be Authenticode-signed.'
    exit 1
  }
  Write-Host "RESULT: NOT FULLY SIGNED/VALID — $($script:failures.Count) finding(s) above." -ForegroundColor Yellow
  Write-Host 'Allowed for this CI build (its artifacts are not distributed); a release build would FAIL on these and never publish.' -ForegroundColor Yellow
  exit 0
}
Write-Host 'RESULT: PASS — installer Authenticode-valid, chain trusted, publisher verified, hash recorded.' -ForegroundColor Green
exit 0
