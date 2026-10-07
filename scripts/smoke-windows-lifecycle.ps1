# Release lifecycle acceptance test (Windows CI, packaged app):
#
#   launch SoundControl.exe  ->  bundled Python helper adopts port 8765
#   close the window like a user (WM_CLOSE, same as pressing X)
#   -> SoundControl.exe exits
#   -> no python.exe running soundcore_bridge.py survives
#   -> port 8765 is released
#   -> no helper auto-restart appears afterwards
#
# This is the Windows-side proof for "closing the window really closes the
# application"; the cross-platform state-machine races are covered by
# scripts/test_main_lifecycle.mjs.
$ErrorActionPreference = 'Stop'

$exe = Join-Path $PWD 'release\win-unpacked\SoundControl.exe'
if (-not (Test-Path $exe)) {
  throw "Packaged executable was not found at $exe"
}
$log = Join-Path $env:APPDATA 'soundcontrol\main.log'
Remove-Item $log -ErrorAction SilentlyContinue

$app = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
try {
  # --- helper adoption: the packaged app must start its bundled bridge -----
  $helper = $null
  $deadline = (Get-Date).AddSeconds(25)
  while ((Get-Date) -lt $deadline) {
    $helper = Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
      Where-Object { $_.CommandLine -like '*soundcore_bridge.py*' } |
      Select-Object -First 1
    if ($helper) { break }
    if ($app.HasExited) {
      if (Test-Path $log) { Get-Content $log | Select-Object -Last 40 }
      throw "SoundControl exited during startup (exit code $($app.ExitCode))"
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $helper) {
    if (Test-Path $log) { Get-Content $log | Select-Object -Last 40 }
    throw 'packaged app did not start its bundled Python helper within 25s'
  }
  $port = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
  if (-not $port) { throw 'helper is running but nothing listens on port 8765' }
  Write-Host "helper pid=$($helper.ProcessId) owns port 8765; closing the window like a user (WM_CLOSE)"

  # --- user close: WM_CLOSE is exactly what the X button sends -------------
  $closed = $app.CloseMainWindow()
  if (-not $closed) { throw 'CloseMainWindow failed - the app had no main window handle' }
  $deadline = (Get-Date).AddSeconds(20)
  while (-not $app.HasExited -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
  if (-not $app.HasExited) { throw 'SoundControl did not exit within 20s of the window close' }
  Write-Host "SoundControl exited (code $($app.ExitCode))"

  # --- nothing may survive: process, helper, port, delayed restart ---------
  Start-Sleep -Seconds 4
  $leftApp = Get-Process -Name SoundControl -ErrorAction SilentlyContinue
  $leftHelper = Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { $_.CommandLine -like '*soundcore_bridge.py*' }
  $leftPort = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
  if ($leftApp) { throw "SoundControl.exe still running after close: $($leftApp.Id -join ',')" }
  if ($leftHelper) { throw "Python helper survived the app exit: pid $($leftHelper.ProcessId)" }
  if ($leftPort) { throw "port 8765 still owned after exit by pid $($leftPort.OwningProcess)" }
  if (Test-Path $log) { Get-Content $log | Select-Object -Last 25 }
  Write-Host 'LIFECYCLE_OK window close => full exit, helper killed, port 8765 released, no restart'
}
finally {
  if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force }
  $stray = Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { $_.CommandLine -like '*soundcore_bridge.py*' }
  if ($stray) { Stop-Process -Id $stray.ProcessId -Force -ErrorAction SilentlyContinue }
}
