; In-app updates from older FMT builds spawn FMT-Setup.exe with --updated
; but without /S (quitAndInstall(false, true) + oneClick: false). Force silent
; mode so the assisted wizard does not appear and the installer can close FMT
; without showing a final-stage "app cannot be closed" error.

!macro customInit
  ${if} ${isUpdated}
    SetSilent silent
  ${endif}
!macroend
