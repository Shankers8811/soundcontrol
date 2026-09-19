<#
.SYNOPSIS
  Validate an Authenticode code-signing certificate before it is used for a release.

.DESCRIPTION
  Loads a .pfx/.p12 with the secret password (read from the WIN_CSC_KEY_PASSWORD
  environment variable — never a parameter, never printed) and hard-fails
  (exit 1) unless the certificate is suitable for production Authenticode
  signing:

    - loads with the given password (wrong password => constructor throws);
    - has a private key (a public-cert-only .p12 cannot sign);
    - Enhanced Key Usage includes Code Signing (1.3.6.1.5.5.7.3.3);
    - Key Usage includes Digital Signature (when the extension is present);
    - is inside its validity window (not expired, not yet valid);
    - builds a chain to a trusted root under the code-signing application
      policy with online revocation (self-signed / untrusted => FAIL);
    - has a publisher identity (subject), which must match
      -ExpectedPublisher when one is configured. The expected value is never
      modified to make the check pass.

  Only PUBLIC certificate metadata is printed (subject, thumbprint, EKU OIDs,
  validity dates). No secret values, passwords, keys or certificate bytes are
  ever output.

  Used by:
    - .github/workflows/release-windows.yml  (after staging, before the build)
    - .github/workflows/build-windows.yml    (CI validation when credentials
      are configured — validates WITHOUT signing or publishing anything, so a
      maintainer can confirm the certificate before preparing a release)

.EXAMPLE
  $env:WIN_CSC_KEY_PASSWORD = '...'   # from a secret, never a literal in logs
  ./scripts/validate-signing-certificate.ps1 -CertPath .\cert.p12

.EXAMPLE
  ./scripts/validate-signing-certificate.ps1 -CertPath .\cert.p12 -ExpectedPublisher "Contoso"
#>
param(
  [Parameter(Mandatory = $true)][string]$CertPath,
  [string]$ExpectedPublisher = ''
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $CertPath)) {
  Write-Host "[FAIL] Certificate not found at '$CertPath'." -ForegroundColor Red
  exit 1
}

try {
  # Wrong password => the X509Certificate2 constructor throws.
  $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
    (Resolve-Path -LiteralPath $CertPath).Path, $env:WIN_CSC_KEY_PASSWORD)
} catch {
  Write-Host "[FAIL] Certificate could not be loaded with the provided password: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Host "Certificate loaded."
Write-Host "Publisher (subject): $($cert.Subject)"
Write-Host "Thumbprint:          $($cert.Thumbprint)"

if (-not $cert.HasPrivateKey) {
  Write-Host '[FAIL] Certificate has no private key — it cannot sign. Export the .p12 with the private key.' -ForegroundColor Red
  exit 1
}

$eku = $cert.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' }
if (-not $eku) {
  Write-Host '[FAIL] Certificate has no Enhanced Key Usage extension — not suitable for Authenticode code signing.' -ForegroundColor Red
  exit 1
}
$purposes = @($eku.EnhancedKeyUsages | ForEach-Object { $_.Value })
Write-Host "Enhanced Key Usage:  $($purposes -join ', ')"
if ($purposes -notcontains '1.3.6.1.5.5.7.3.3') {
  Write-Host '[FAIL] Certificate is not intended for code signing — EKU does not include Code Signing (1.3.6.1.5.5.7.3.3).' -ForegroundColor Red
  exit 1
}

$ku = $cert.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.15' }
if ($ku -and -not $ku.KeyUsages.HasFlag([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature)) {
  Write-Host '[FAIL] Certificate key usage does not include Digital Signature.' -ForegroundColor Red
  exit 1
}

$now = Get-Date
if ($now -lt $cert.NotBefore) {
  Write-Host "[FAIL] Certificate is not valid yet (NotBefore $($cert.NotBefore.ToString('yyyy-MM-dd')))." -ForegroundColor Red
  exit 1
}
if ($now -gt $cert.NotAfter) {
  Write-Host "[FAIL] Certificate expired on $($cert.NotAfter.ToString('yyyy-MM-dd')) — renew it before releasing." -ForegroundColor Red
  exit 1
}
Write-Host ("Validity:            {0} -> {1} ({2} day(s) left)" -f $cert.NotBefore.ToString('yyyy-MM-dd'), $cert.NotAfter.ToString('yyyy-MM-dd'), ($cert.NotAfter - $now).Days)

$chain = [System.Security.Cryptography.X509Certificates.X509Chain]::new()
$chain.ChainPolicy.ApplicationPolicy.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3'))
$chain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::Online
if (-not $chain.Build($cert)) {
  $status = ($chain.ChainStatus | ForEach-Object { "$($_.Status): $($_.StatusInformation.Trim())" }) -join ' | '
  Write-Host "[FAIL] Certificate chain is not trusted under the code-signing policy: $status" -ForegroundColor Red
  exit 1
}
Write-Host 'Chain:               trusted (code-signing policy, online revocation).'

if ([string]::IsNullOrWhiteSpace($cert.Subject)) {
  Write-Host '[FAIL] Certificate has no publisher identity (empty subject).' -ForegroundColor Red
  exit 1
}

if ($ExpectedPublisher -ne '') {
  if ($cert.Subject -notmatch [regex]::Escape($ExpectedPublisher)) {
    Write-Host "[FAIL] Publisher mismatch: certificate subject '$($cert.Subject)' does not match the expected publisher '$ExpectedPublisher'. The expected value is not modified to make this pass — fix the certificate or the WINDOWS_EXPECTED_PUBLISHER variable." -ForegroundColor Red
    exit 1
  }
  Write-Host "Publisher matches the expected identity '$ExpectedPublisher'."
} else {
  Write-Host 'NOTE: no expected publisher was given — the publisher identity is not pinned (set the WINDOWS_EXPECTED_PUBLISHER variable to pin it).' -ForegroundColor Yellow
}

Write-Host 'CERTIFICATE VALIDATION PASSED — the certificate is suitable for production Authenticode signing.' -ForegroundColor Green
exit 0
