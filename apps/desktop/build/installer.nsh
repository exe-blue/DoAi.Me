; Install path: C:\Program Files (x86)\xiaowei (nsis.installDir)
; Executable: xiaowei.exe
; Auto-run: Electron app.setLoginItemSettings(openAtLogin)

!macro preInit
  SetRegView 32
  StrCpy $INSTDIR "$PROGRAMFILES32\xiaowei"
!macroend
