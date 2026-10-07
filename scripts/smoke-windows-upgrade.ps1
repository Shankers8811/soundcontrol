$ErrorActionPreference = 'Stop'

function Stop-SoundControl {
  Get-Process -Name 'SoundControl' -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
}

function Invoke-Installer {
  param(
    [Parameter(Mandatory = $true)] [string] $Path,
    [Parameter(Mandatory = $true)] [string[]] $Arguments
  )

  $process = Start-Process -FilePath $Path -ArgumentList $Arguments -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Installer exited with code $($process.ExitCode): $Path $($Arguments -join ' ')"
  }
}

function Get-SoundControlUninstallEntries {
  $roots = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
  )

  foreach ($root in $roots) {
    if (-not (Test-Path $root)) {
      continue
    }

    Get-ChildItem -Path $root -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        $entry = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction Stop
        if ($entry.DisplayName -like 'SoundControl*') {
          $entry
        }
      } catch {
        # Some uninstall keys cannot be read from both registry views.
      }
    }
  }
}

$installer = @(Get-ChildItem -Path (Join-Path $PWD 'release') -Filter '*.exe' -File)
if ($installer.Count -ne 1) {
  throw "Expected exactly one root-level Windows installer, found $($installer.Count)."
}
$installerPath = $installer[0].FullName
$installDir = Join-Path $env:RUNNER_TEMP 'SoundControl-upgrade-install'
$sentinel = Join-Path $installDir 'upgrade-sentinel.txt'
$installedExe = Join-Path $installDir 'SoundControl.exe'
$expectedVersion = (Get-Content (Join-Path $PWD 'package.json') -Raw | ConvertFrom-Json).version

Stop-SoundControl
Remove-Item -LiteralPath $installDir -Recurse -Force -ErrorAction SilentlyContinue

try {
  # Install once into a known per-user location to represent the existing app.
  # /D= must be the final NSIS argument.
  Invoke-Installer -Path $installerPath -Arguments @('/S', '/currentuser', "/D=$installDir")
  Stop-SoundControl

  if (-not (Test-Path $installedExe)) {
    throw "Initial installation did not create $installedExe"
  }

  # Make the installed copy look older without building a second package. The
  # second installer must detect this existing appId/install record and reuse
  # its location rather than creating a side-by-side installation.
  Set-Content -LiteralPath $sentinel -Value 'existing older SoundControl install' -NoNewline
  $oldEntries = @(Get-SoundControlUninstallEntries)
  if ($oldEntries.Count -ne 1) {
    throw "Expected one existing SoundControl uninstall entry, found $($oldEntries.Count)."
  }
  Set-ItemProperty -LiteralPath $oldEntries[0].PSPath -Name DisplayVersion -Value '1.0.3'

  # Do not pass /D here: an upgrade must reuse the previous installation path.
  Invoke-Installer -Path $installerPath -Arguments @('/S')
  Stop-SoundControl

  if (Test-Path $sentinel) {
    throw 'The old installation directory was not upgraded in place.'
  }
  if (-not (Test-Path $installedExe)) {
    throw "The upgraded installation is missing $installedExe"
  }

  $updatedEntries = @(Get-SoundControlUninstallEntries)
  if ($updatedEntries.Count -ne 1) {
    throw "Expected one SoundControl uninstall entry after upgrade, found $($updatedEntries.Count)."
  }
  if ($updatedEntries[0].DisplayVersion -ne $expectedVersion) {
    throw "Upgrade registry version is '$($updatedEntries[0].DisplayVersion)', expected '$expectedVersion'."
  }

  Write-Host "Windows installer upgrade smoke test passed: existing 1.0.3 install updated in place to $expectedVersion."
} finally {
  Stop-SoundControl
  Remove-Item -LiteralPath $installDir -Recurse -Force -ErrorAction SilentlyContinue
}
