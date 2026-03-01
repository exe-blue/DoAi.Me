@echo off
title DoAi Agent Launcher
set "INSTALL_DIR=%~dp0"
set "XIAOWEI_EXE=C:\Program Files (x86)\xiaowei\xiaowei.exe"
set "AGENT_EXE=%INSTALL_DIR%..\DoAi Agent.exe"

if not exist "%XIAOWEI_EXE%" (
  echo Xiaowei not found at "%XIAOWEI_EXE%". Starting Agent only.
  goto :start_agent
)

tasklist /FI "IMAGENAME eq xiaowei.exe" 2>NUL | find /I "xiaowei.exe" >NUL
if errorlevel 1 (
  echo Starting Xiaowei...
  start "" "%XIAOWEI_EXE%"
  timeout /t 8 /nobreak >NUL
) else (
  echo Xiaowei already running.
)

:start_agent
if exist "%AGENT_EXE%" (
  start "" "%AGENT_EXE%"
) else (
  echo DoAi Agent not found at "%AGENT_EXE%"
  pause
)
