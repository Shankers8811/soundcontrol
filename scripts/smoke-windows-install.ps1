# Windows CI release test: clean install -> launch the INSTALLED copy twice
# -> graceful close each time -> silent uninstall -> nothing left behind.
#
# The other Windows jobs cover win-unpacked; this one proves the artifact a
# user actually gets:
#   * the NSIS installer works from scratch (not only as an upgrade),
#   * the installed copy launches with its own bundled runtime,
#   * closing it (WM_CLOSE, exactly what X sends) leaves no process, no
#     helper and no port 8765 listener,
#   * a second launch works afterwards,
#   * the shipped uninstaller removes the installation and its registry
#     entry, and
#   * no SoundControl startup registration exists at any point.
$ErrorActionPreference = 'Stop'

function Stop-SoundControl {
  Get-Process -Name 'SoundControl' -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
}

function Get-Helper {
  Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*soundcore_bridge.py*' }
}

function Get-SoundControlUninstallEntries {
  $roots = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
  )
  foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }
    Get-ChildItem -Path $root -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        $entry = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction Stop
        if ($entry.DisplayName -like 'SoundControl*') { $entry }
      } catch {
        # Some uninstall keys cannot be read from both registry views.
      }
    }
  }
}

function Wait-ForExit {
  param([Parameter(Mandatory = $true)] [System.Diagnostics.Process] $Process, [int] $Seconds = 20)
  $deadline = (Get-Date).AddSeconds($Seconds)
  while (-not $Process.HasExited -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
  return $Process.HasExited
}

function Start-InstalledAppAndClose {
  param([Parameter(Mandatory = $true)] [string] $Exe, [Parameter(Mandatory = $true)] [string] $Dir, [int] $Label)

  $app = Start-Process -FilePath $Exe -WorkingDirectory $Dir -PassThru
  # The installed copy must boot its bundled helper and serve 8765.
  $deadline = (Get-Date).AddSeconds(30)
  $helper = $null
  while ((Get-Date) -lt $deadline) {
    $helper = Get-Helper | Select-Object -First 1
    if ($helper) { break }
    if ($app.HasExited) { throw "run ${Label}: installed app exited during startup (code $($app.ExitCode))" }
    Start-Sleep -Milliseconds 500
  }
  if (-not $helper) { throw "run ${Label}: installed app did not start its bundled helper within 30s" }
  $port = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
  if (-not $port) { throw "run ${Label}: helper is running but nothing listens on port 8765" }

  if (-not $app.CloseMainWindow()) { throw "run ${Label}: the app had no main window to close" }
  if (-not (Wait-ForExit -Process $app -Seconds 20)) { throw "run ${Label}: SoundControl did not exit within 20s of the window close" }

  # Nothing may survive a graceful close - not in this run, not from a restart.
  Start-Sleep -Seconds 4
  $leftApp = Get-Process -Name SoundControl -ErrorAction SilentlyContinue
  $leftHelper = Get-Helper
  $leftPort = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
  if ($leftApp) { throw "run ${Label}: SoundControl.exe still running after close: $($leftApp.Id -join ',')" }
  if ($leftHelper) { throw "run ${Label}: Python helper survived the app exit: pid $($leftHelper.ProcessId)" }
  if ($leftPort) { throw "run ${Label}: port 8765 still owned after exit by pid $($leftPort.OwningProcess)" }
  Write-Host "INSTALL_RUN_OK run=$Label clean start (helper pid $($helper.ProcessId), port 8765) and clean exit"
}

$installer = @(Get-ChildItem -Path (Join-Path $PWD 'release') -Filter '*.exe' -File)
if ($installer.Count -ne 1) { throw "Expected exactly one root-level Windows installer, found $($installer.Count)." }
$installerPath = $installer[0].FullName
$installDir = Join-Path $env:RUNNER_TEMP 'SoundControl-clean-install'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$legacyName = 'com.soundcontrol.desktop'

Stop-SoundControl
Remove-Item -LiteralPath $installDir -Recurse -Force -ErrorAction SilentlyContinue
# Earlier steps in this job (the upgrade smoke) may leave their own uninstall
# record behind, so count against that baseline instead of assuming zero.
$baseline = @(Get-SoundControlUninstallEntries).Count

try {
  # --- install from scratch -------------------------------------------------
  $install = Start-Process -FilePath $installerPath -ArgumentList @('/S', '/currentuser', "/D=$installDir") -Wait -PassThru
  if ($install.ExitCode -ne 0) { throw "installer exited with code $($install.ExitCode)" }
  $exe = Join-Path $installDir 'SoundControl.exe'
  if (-not (Test-Path $exe)) { throw "clean install did not create $exe" }
  $python = Join-Path $installDir 'resources\python\python.exe'
  if (-not (Test-Path $python)) { throw "clean install is missing its bundled runtime at $python" }
  $entry = @(Get-SoundControlUninstallEntries)
  if ($entry.Count -ne ($baseline + 1)) { throw "expected $($baseline + 1) uninstall entries after the clean install, found $($entry.Count)" }
  $mine = $entry | Where-Object { $_.InstallLocation -like "$installDir*" } | Select-Object -First 1
  if (-not $mine) { throw "the clean install recorded no uninstall entry pointing at $installDir" }
  Write-Host "INSTALL_OK clean install created $exe (bundled runtime present, uninstall entry recorded, version $($mine.DisplayVersion))"

  $leftRunKey = $null
  if (Test-Path $runKey) { $leftRunKey = (Get-ItemProperty -Path $runKey -Name $legacyName -ErrorAction SilentlyContinue) }
  if ($leftRunKey) { throw 'the installer created a SoundControl startup registration' }

  # --- first launch, graceful close ----------------------------------------
  Start-InstalledAppAndClose -Exe $exe -Dir $installDir -Label 1

  # --- second launch, graceful close ---------------------------------------
  Start-InstalledAppAndClose -Exe $exe -Dir $installDir -Label 2

  # --- uninstall ------------------------------------------------------------
  $uninstaller = @(Get-ChildItem -LiteralPath $installDir -Filter 'Uninstall*.exe' -File)
  if ($uninstaller.Count -ne 1) { throw "Expected exactly one uninstaller in $installDir, found $($uninstaller.Count)." }
  $uninstallerPath = $uninstaller[0].FullName
  # NSIS uninstallers copy themselves to temp and return immediately, so wait
  # for the installation directory to actually disappear.
  $null = Start-Process -FilePath $uninstallerPath -ArgumentList '/S' -Wait -PassThru
  $deadline = (Get-Date).AddSeconds(120)
  while ((Test-Path $installDir) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 1 }
  if (Test-Path $installDir) {
    $stuck = (Get-ChildItem -LiteralPath $installDir -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 5).FullName
    throw "uninstall did not remove the installation directory; still present: $($stuck -join ', ')"
  }

  $deadline = (Get-Date).AddSeconds(30)
  while ((@(Get-SoundControlUninstallEntries).Count -gt $baseline) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 1 }
  $leftEntries = @(Get-SoundControlUninstallEntries | Where-Object { $_.InstallLocation -like "$installDir*" })
  if ($leftEntries.Count -ne 0) { throw "uninstall left $($leftEntries.Count) uninstall registry entries behind" }

  Stop-SoundControl
  if (Get-Helper) { throw 'a Python helper survived the uninstall' }
  if (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue) { throw 'port 8765 is still owned after uninstall' }
  if (Test-Path $runKey) {
    $left = Get-ItemProperty -Path $runKey -Name $legacyName -ErrorAction SilentlyContinue
    if ($left) { throw 'a SoundControl startup registration exists after uninstall' }
  }

  Write-Host 'UNINSTALL_OK two clean launches, then silent uninstall left no directory, no registry entry, no process, no helper, no port and no startup registration'
} finally {
  Stop-SoundControl
  Get-Helper | Stop-Process -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $installDir -Recurse -Force -ErrorAction SilentlyContinue
}
