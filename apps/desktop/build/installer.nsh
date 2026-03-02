; Install path: C:\Program Files (x86)\doaime (nsis.installDir)
; Executable: doaime.exe
; Auto-run: Electron app.setLoginItemSettings(openAtLogin)

!macro preInit
  SetRegView 32
  StrCpy $INSTDIR "$PROGRAMFILES32\doaime"
!macroend
