; Install path: C:\Program Files (x86)\xiaowei
; Executable: xiaowei.exe
; Auto-run: handled by Electron app.setLoginItemSettings (no Startup shortcut here).

!macro preInit
  SetRegView 64
  StrCpy $INSTDIR "$PROGRAMFILES32\xiaowei"
!macroend
