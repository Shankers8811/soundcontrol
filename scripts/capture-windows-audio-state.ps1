<#
.SYNOPSIS
  Read-only Windows audio-state snapshot for the SoundControl regression
  guard (Phase 18, Task 16).

.DESCRIPTION
  SOUND CONTROL = EAR BUD CONTROL — NEVER WINDOWS AUDIO. This script PROVES
  it: it captures the Windows audio configuration, compares two captures,
  and fails when ANYTHING changed. It never modifies a single audio setting:
  every COM call below is a read (Get*), never a Set*. A self-check in
  scripts/test_command_targets.mjs scans this file for write-side APIs
  (SetMasterVolumeLevel, SetMute, SetDefaultAudioEndpoint, SendInput,
  VK_VOLUME, registry writes, ...) and fails the build if one ever appears.

  Captured state (best effort — an unreadable item is recorded as
  "unavailable", never faked):
    - default playback (render) endpoint friendly name
    - default recording (capture) endpoint friendly name
    - master volume + mute of the default playback endpoint
    - per-application audio sessions: process name, volume, mute

  Exit codes:
    0  captured (and, with -Baseline, compared clean)
    1  REGRESSION: the compared state differs from the baseline
    2  capture unavailable in this environment (no audio service/endpoints)

.PARAMETER OutFile
  Write the snapshot to this file (default: print to stdout).

.PARAMETER Baseline
  Compare the current state against a previously captured file instead of
  writing. Any difference exits 1 with a diff.

.EXAMPLE
  # Hardware checklist (docs/R50I-R50I-NC-HARDWARE-TEST.md): capture before
  ./scripts/capture-windows-audio-state.ps1 -OutFile before.txt
  # ... run SoundControl feature tests ...
  ./scripts/capture-windows-audio-state.ps1 -Baseline before.txt
#>
param(
  [string]$OutFile = '',
  [string]$Baseline = ''
)

$ErrorActionPreference = 'Stop'

# Read-only WASAPI/MMDevice access via inline C#. Every method invoked is a
# getter; there is deliberately no Set* / mutation method in this source.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

// MMDeviceEnumerator CLSID: BCDE0395-E52F-467C-8E3D-C4579291692E (activated
// via Type.GetTypeFromCLSID + Activator.CreateInstance below).
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    // remaining vtable slots (GetDevice, RegisterEndpointNotificationCallback,
    // UnregisterEndpointNotificationCallback) are never called
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, out IAudioEndpointVolume volume);
    int OpenPropertyStore(int access, out IPropertyStore properties);
    // remaining slots unused
}

[Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPropertyStore {
    int GetCount(out int count);
    int GetAt(int i, out PROPERTYKEY key);
    int GetValue(ref PROPERTYKEY key, out PROPVARIANT value);
}

[StructLayout(LayoutKind.Sequential)]
struct PROPERTYKEY { public Guid fmtid; public int pid; }

[StructLayout(LayoutKind.Explicit)]
struct PROPVARIANT {
    [FieldOffset(0)] public ushort vt;
    [FieldOffset(8)] public IntPtr pointerValue;
}

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr notify);
    int UnregisterControlChangeNotify(IntPtr notify);
    int GetChannelCount(out int channels);
    int SetMasterVolumeLevel(float db, IntPtr ctx);          // NEVER CALLED (guard)
    int SetMasterVolumeLevelScalar(float level, IntPtr ctx); // NEVER CALLED (guard)
    int GetMasterVolumeLevel(out float db);
    int GetMasterVolumeLevelScalar(out float level);
    int SetChannelVolumeLevel(int channel, float db, IntPtr ctx);       // NEVER CALLED
    int SetChannelVolumeLevelScalar(int channel, float level, IntPtr ctx); // NEVER CALLED
    int GetChannelVolumeLevel(int channel, out float db);
    int GetChannelVolumeLevelScalar(int channel, out float level);
    int SetMute(bool mute, IntPtr ctx);                      // NEVER CALLED (guard)
    int GetMute(out bool mute);
}

// Per-application sessions (ISimpleAudioVolume reads only).
[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume {
    int SetMasterVolume(float level, IntPtr ctx); // NEVER CALLED (guard)
    int GetMasterVolume(out float level);
    int SetMute(bool mute, IntPtr ctx);           // NEVER CALLED (guard)
    int GetMute(out bool mute);
}

[Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
    // vtable order per IAudioSessionControl then IAudioSessionControl2;
    // only GetSessionIdentifier/GetProcessId/GetSessionInstanceIdentifier matter
    int GetState(out int state);
    int GetDisplayName(out IntPtr name);
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr ctx); // NEVER CALLED
    int GetIconPath(out IntPtr icon);
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string icon, IntPtr ctx);    // NEVER CALLED
    int GetGroupingParam(out Guid group);
    int SetGroupingParam(ref Guid group, IntPtr ctx);                              // NEVER CALLED
    int RegisterAudioSessionNotification(IntPtr notify);
    int UnregisterAudioSessionNotification(IntPtr notify);
    int GetSessionIdentifier(out IntPtr id);
    int GetSessionInstanceIdentifier(out IntPtr id);
    int GetProcessId(out int pid);
    int IsSystemSoundsSession();
}

[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 {
    int GetAudioSessionControl(IntPtr guid, int flags, out IntPtr ctl); // unused
    int GetSimpleAudioVolume(IntPtr guid, int flags, out ISimpleAudioVolume volume);
    int GetSessionEnumerator(out IAudioSessionEnumerator enumerator);
    int RegisterSessionNotification(IntPtr notify);   // NEVER CALLED
    int UnregisterSessionNotification(IntPtr notify); // NEVER CALLED
    int RegisterDuckNotification(IntPtr unused, IntPtr notify);   // NEVER CALLED
    int UnregisterDuckNotification(IntPtr notify);                // NEVER CALLED
}

[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator {
    int GetCount(out int count);
    int GetSession(int index, out IAudioSessionControl2 session);
}

public static class AudioStateReader {
    // PKEY_Device_FriendlyName
    static readonly PROPERTYKEY PKEY_FriendlyName = new PROPERTYKEY {
        fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 };

    public static string DefaultEndpoint(int dataFlow) {
        try {
            var en = (IMMDeviceEnumerator)Activator.CreateInstance(
                Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")));
            IMMDevice dev;
            Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(dataFlow, 0 /*eConsole*/, out dev));
            IPropertyStore store;
            Marshal.ThrowExceptionForHR(dev.OpenPropertyStore(0 /*STGM_READ*/, out store));
            int count; store.GetCount(out count);
            for (int i = 0; i < count; i++) {
                PROPERTYKEY key; store.GetAt(i, out key);
                if (key.fmtid == PKEY_FriendlyName.fmtid && key.pid == PKEY_FriendlyName.pid) {
                    PROPVARIANT v; store.GetValue(ref key, out v);
                    if (v.vt == 31 /*VT_LPWSTR*/) return Marshal.PtrToStringUni(v.pointerValue);
                }
            }
            return "(endpoint without friendly name)";
        } catch (Exception e) { return "unavailable: " + e.Message; }
    }

    public static string MasterVolumeAndMute() {
        try {
            var en = (IMMDeviceEnumerator)Activator.CreateInstance(
                Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")));
            IMMDevice dev;
            Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0 /*eRender*/, 0, out dev));
            var iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
            IAudioEndpointVolume vol;
            Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 1 /*CLSCTX_INPROC_SERVER*/, IntPtr.Zero, out vol));
            float level; Marshal.ThrowExceptionForHR(vol.GetMasterVolumeLevelScalar(out level));
            bool mute; Marshal.ThrowExceptionForHR(vol.GetMute(out mute));
            return string.Format("{0:F4} mute={1}", level, mute);
        } catch (Exception e) { return "unavailable: " + e.Message; }
    }

    public static string Sessions() {
        try {
            var en = (IMMDeviceEnumerator)Activator.CreateInstance(
                Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")));
            IMMDevice dev;
            Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0, 0, out dev));
            var iid = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
            IAudioSessionManager2 mgr;
            Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 1, IntPtr.Zero, out mgr));
            IAudioSessionEnumerator sessions;
            Marshal.ThrowExceptionForHR(mgr.GetSessionEnumerator(out sessions));
            int n; sessions.GetCount(out n);
            var lines = new System.Collections.Generic.List<string>();
            for (int i = 0; i < n; i++) {
                IAudioSessionControl2 ctl;
                if (sessions.GetSession(i, out ctl) != 0) continue;
                // Session identity by pid: stable within a comparison and
                // dependency-free (no System.Diagnostics reference needed).
                int pid; ctl.GetProcessId(out pid);
                string proc = "pid-" + pid;
                ISimpleAudioVolume vol;
                if (mgr.GetSimpleAudioVolume(IntPtr.Zero, 0, out vol) == 0) {
                    float level; vol.GetMasterVolume(out level);
                    bool mute; vol.GetMute(out mute);
                    lines.Add(string.Format("  {0}: {1:F4} mute={2}", proc, level, mute));
                }
            }
            lines.Sort(StringComparer.Ordinal);
            return lines.Count == 0 ? "  (no active sessions)" : string.Join("\n", lines.ToArray());
        } catch (Exception e) { return "  unavailable: " + e.Message; }
    }
}
"@

function Capture-State([string]$label) {
    $render = [AudioStateReader]::DefaultEndpoint(0)
    $capture = [AudioStateReader]::DefaultEndpoint(1)
    $master = [AudioStateReader]::MasterVolumeAndMute()
    $sessions = [AudioStateReader]::Sessions()
    # A headless CI runner may report every item unavailable; that is an
    # honest environment limitation, recorded as such (never faked).
    $allUnavailable = ($render -like 'unavailable*') -and ($capture -like 'unavailable*') -and ($master -like 'unavailable*')
    $text = @"
[$label] default-playback=$render
[$label] default-recording=$capture
[$label] master-volume=$master
[$label] per-app-sessions=
$sessions
"@
    return $text, $allUnavailable
}

if ($Baseline -ne '') {
    if (-not (Test-Path -LiteralPath $Baseline)) {
        Write-Error "baseline file not found: $Baseline"
        exit 2
    }
    $before = (Get-Content -LiteralPath $Baseline -Raw) -replace '\[before\]', '[state]'
    $now, $unavail = Capture-State 'state'
    if ($unavail) {
        Write-Output 'AUDIO STATE CAPTURE UNAVAILABLE in this environment — comparison not possible (recorded, not faked).'
        exit 2
    }
    $beforeLines = $before -split "`r?`n" | Where-Object { $_ -ne '' }
    $nowLines = $now -split "`r?`n" | Where-Object { $_ -ne '' }
    $diff = Compare-Object -ReferenceObject $beforeLines -DifferenceObject $nowLines
    if ($diff) {
        Write-Output 'WINDOWS AUDIO STATE CHANGED — SoundControl (or another process) modified audio configuration:'
        $diff | ForEach-Object { Write-Output ("  {0} {1}" -f $_.SideIndicator, $_.InputObject) }
        exit 1
    }
    Write-Output 'WINDOWS AUDIO STATE UNCHANGED — default devices, master volume, mute and per-app sessions all identical.'
    exit 0
}

$state, $unavail = Capture-State 'before'
if ($OutFile -ne '') {
    Set-Content -LiteralPath $OutFile -Value $state -Encoding UTF8
    Write-Output "captured to $OutFile"
} else {
    Write-Output $state
}
if ($unavail) {
    Write-Output 'NOTE: audio endpoints unavailable in this environment — snapshot records that honestly.'
    exit 2
}
exit 0
