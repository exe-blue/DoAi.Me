; Install path: c:\client (사용자 요구 사양)
; Executable: doai-me.exe
; Auto-run: Electron app.setLoginItemSettings(openAtLogin)

!macro preInit
  SetRegView 64
  StrCpy $INSTDIR "c:\client"
!macroend
