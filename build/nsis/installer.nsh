; SoundControl NSIS Installer Custom Script
; Ensures clean installation with no warnings or errors

!include "MUI2.nsh"
!include "LogicLib.nsh"

; ============================================================================
; General Settings
; ============================================================================
Name "SoundControl"
OutFile "SoundControl-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\SoundControl"
InstallDirRegKey HKCU "Software\SoundControl" "InstallPath"

; Request execution level - highest for per-machine, user for per-user
RequestExecutionLevel user

; ============================================================================
; Modern UI Settings
; ============================================================================
!define MUI_ICON "${NSISDIR}\..\public\icon-512.png"
!define MUI_UNICON "${NSISDIR}\..\public\icon-512.png"
!define MUI_ABORTWARNING
!define MUI_WELCOMEFINISHPAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Wizard\win.bmp"
!define MUI_LICENSEPAGE_TEXT_TOP "Please review the license agreement before installing SoundControl."
!define MUI_LICENSEPAGE_TEXT_BOTTOM "Click 'I Agree' to continue with the installation."

; Welcome page
!insertmacro MUI_PAGE_WELCOME
; License page
!insertmacro MUI_PAGE_LICENSE "LICENSE"
; Directory page
!insertmacro MUI_PAGE_DIRECTORY
; Install options page (no additional options)
; Instfiles page
!insertmacro MUI_PAGE_INSTFILES
; Finish page
!define MUI_FINISHPAGE_RUN "$INSTDIR\SoundControl.exe"
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; ============================================================================
; Languages
; ============================================================================
!insertmacro MUI_LANGUAGE "English"

; ============================================================================
; Custom Functions
; ============================================================================

Function .onInit
    ; Disable Windows SmartScreen warning by setting proper execution level
    ; Already set to 'user' above
    
    ; Check if running on Windows 10/11
    ${If} ${AtLeastWin10}
        ; Windows 10/11 - no special handling needed
    ${Else}
        MessageBox MB_ICONEXCLAMATION "SoundControl requires Windows 10 or later."
        Abort
    ${EndIf}
FunctionEnd

Function .onInstSuccess
    ; Clean up any temporary files
    ; Hide the "Completed" message box if running silently
    ${If} $CMDLINE & "/S"
        ; Silent install - no message box
    ${Else}
        ; Show completion message
        MessageBox MB_ICONINFORMATION "SoundControl has been successfully installed!$\n$\nYou can now launch it from the Start menu or desktop shortcut."
    ${EndIf}
FunctionEnd

Function un.onUninstSuccess
    ; Clean up any remaining files
    ; Hide completion message for silent uninstall
    ${If} $CMDLINE & "/S"
        ; Silent uninstall
    ${Else}
        MessageBox MB_ICONINFORMATION "SoundControl has been successfully uninstalled."
    ${EndIf}
FunctionEnd

; ============================================================================
; Installer Sections
; ============================================================================

Section "Main" SEC_MAIN
    SetOutPath "$INSTDIR"
    
    ; Main application files
    File /r "dist\*.*"
    File "electron-main.cjs"
    File "preload.cjs"
    File "autostart.cjs"
    File "soundcore_bridge.py"
    File /r "public\*.*"
    
    ; Python runtime (bundled)
    File /r "python-embed\*.*"
    
    ; Create uninstaller
    WriteUninstaller "$INSTDIR\uninstall.exe"
    
    ; Write registry keys for uninstall
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SoundControl" "DisplayName" "SoundControl"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SoundControl" "UninstallString" "$INSTDIR\uninstall.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SoundControl" "DisplayVersion" "1.0.10"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SoundControl" "Publisher" "Shankers8811"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SoundControl" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SoundControl" "DisplayIcon" "$INSTDIR\SoundControl.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SoundControl" "NoModify" "1"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SoundControl" "NoRepair" "1"
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SoundControl" "EstimatedSize" 0
    
    ; Register App Paths for easy launch
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\SoundControl.exe" "" "$INSTDIR\SoundControl.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\SoundControl.exe" "Path" "$INSTDIR"
    
    ; Create shortcuts
    CreateDirectory "$SMPROGRAMS\SoundControl"
    CreateShortcut "$SMPROGRAMS\SoundControl\SoundControl.lnk" "$INSTDIR\SoundControl.exe" "" "$INSTDIR\SoundControl.exe" 0
    CreateShortcut "$SMPROGRAMS\SoundControl\Uninstall.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\uninstall.exe" 0
    
    ${If} ${GetShellContext} "DesktopShortcut" == "1"
        CreateShortcut "$DESKTOP\SoundControl.lnk" "$INSTDIR\SoundControl.exe" "" "$INSTDIR\SoundControl.exe" 0
    ${EndIf}
    
    ; Ensure no autostart registration (policy)
    ; The app itself enforces no autostart on every launch
SectionEnd

; ============================================================================
; Uninstaller
; ============================================================================

Section "Uninstall"
    ; Remove registry keys
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SoundControl"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\SoundControl.exe"
    
    ; Remove shortcuts
    Delete "$SMPROGRAMS\SoundControl\SoundControl.lnk"
    Delete "$SMPROGRAMS\SoundControl\Uninstall.lnk"
    Delete "$DESKTOP\SoundControl.lnk"
    RMDir /r "$SMPROGRAMS\SoundControl"
    
    ; Remove App Paths
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\SoundControl.exe"
    
    ; Remove files
    RMDir /r "$INSTDIR"
    
    ; Remove AppData settings (optional - ask user)
    MessageBox MB_YESNO "Remove user settings and data?" IDYES +2
    DeleteRegKey HKCU "Software\SoundControl"
    RMDir /r "$LOCALAPPDATA\SoundControl"
SectionEnd

; ============================================================================
; Silent Install/Uninstall
; ============================================================================

; Silent install: SoundControl-Setup.exe /S
; Silent uninstall: uninstall.exe /S

; ============================================================================
; Custom Pages (Optional)
; ============================================================================

; Custom page for additional options (if needed in future)
; Page custom customPageCreate customPageLeave
; UninstallPage custom customUninstallPageCreate customUninstallPageLeave

; ============================================================================
; Strings
; ============================================================================

LangString DESC_SecMain ${LANG_ENGLISH} "SoundControl - Windows & Linux Desktop Companion for Soundcore devices"
LangString UNDESC_SecMain ${LANG_ENGLISH} "SoundControl - Windows & Linux Desktop Companion for Soundcore devices"