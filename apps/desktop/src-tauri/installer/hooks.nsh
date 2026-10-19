; NOVA installer hooks (bundle.windows.nsis.installerHooks).
; File-type registration lives in the app (src/shell.rs) so the installer, the
; uninstaller and Settings > Windows > Repair all write exactly the same keys.
; NOVA is offered in "Open with" and Default apps; no default is ever taken.

; Tauri's template sets no CompanyName; the installer's file properties should
; name the same publisher as the app, the signature and the website.
VIAddVersionKey "CompanyName" "SNOWBROS"

!macro NSIS_HOOK_POSTINSTALL
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --register-file-types'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Removes only NOVA's own ProgIDs and OpenWithProgids values. Re-registered
  ; by the new version's post-install step when this runs as part of a reinstall.
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --unregister-file-types'
!macroend
