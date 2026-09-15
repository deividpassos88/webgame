@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title Dragon Miner - Controle do servidor administrador

REM Este painel permanece aberto. Use [1] para iniciar e abrir o Edge uma vez,
REM [4] para encerrar somente o processo que estiver ouvindo a porta 5174.
REM Se outro programa ja estiver na porta, o script mostra o processo e pede
REM confirmacao antes de encerra-lo; nenhum processo e finalizado sem confirmar.

cd /d "%~dp0"
set "GAME_URL=http://127.0.0.1:5174/?admin=1"
set "BROWSER_OPENED="

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale-o em https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo Falha ao instalar as dependencias.
    pause
    exit /b 1
  )
)

:MENU
cls
echo ==========================================================
echo   Dragon Miner - Administrador / Controle do servidor
echo ==========================================================
call :SHOWSTATUS
echo.
echo [1] Iniciar servidor e abrir Edge InPrivate
echo [2] Abrir Edge InPrivate uma unica vez
echo [3] Atualizar status
echo [4] Encerrar servidor da porta 5174
echo [5] Sair deste painel
echo.
choice /C 12345 /N /M "Escolha uma opcao"
if errorlevel 5 goto :END
if errorlevel 4 goto :STOPSERVER
if errorlevel 3 goto :MENU
if errorlevel 2 goto :OPENBROWSER
if errorlevel 1 goto :STARTANDOPEN

:STARTANDOPEN
call :ISSERVERRUNNING
if not errorlevel 1 (
  echo.
  echo O servidor ja esta ativo na porta 5174. Nenhuma segunda instancia sera criada.
  goto :OPENBROWSER
)

echo.
echo Iniciando Vite em uma janela minimizada e controlavel...
REM Sem /B: o Vite recebe a propria janela e nao disputa a entrada do menu.
start "Dragon Miner Vite" /min /d "%CD%" cmd /d /c "set VITE_ADMIN_MODE=true&& call npm run dev:admin -- --host 127.0.0.1 --port 5174"
powershell -NoProfile -Command "$deadline = (Get-Date).AddSeconds(30); while ((Get-Date) -lt $deadline) { if (Test-NetConnection -ComputerName 127.0.0.1 -Port 5174 -InformationLevel Quiet) { exit 0 }; Start-Sleep -Seconds 1 }; exit 1"
if errorlevel 1 (
  echo O servidor nao respondeu em 30 segundos. Consulte a janela Vite e tente atualizar o status.
  pause
  goto :MENU
)
echo Servidor pronto.
goto :OPENBROWSER

:OPENBROWSER
if defined BROWSER_OPENED (
  echo.
  echo O Edge InPrivate ja foi aberto nesta execucao: %GAME_URL%
  pause
  goto :MENU
)
call :ISSERVERRUNNING
if errorlevel 1 (
  echo.
  echo Nao ha servidor ativo na porta 5174. Use a opcao 1 primeiro.
  pause
  goto :MENU
)
echo.
echo Abrindo Edge InPrivate em %GAME_URL%
start "Dragon Miner Admin" msedge.exe --inprivate "%GAME_URL%"
set "BROWSER_OPENED=1"
timeout /t 1 /nobreak >nul
goto :MENU

:STOPSERVER
call :SHOWLISTENER
if errorlevel 2 (
  echo.
  echo Nenhum servidor esta ouvindo a porta 5174.
  pause
  goto :MENU
)
if errorlevel 1 (
  echo.
  echo Nao foi possivel consultar o processo da porta 5174.
  pause
  goto :MENU
)
echo.
set "STOP_CONFIRM="
set /p "STOP_CONFIRM=Encerrar somente o processo listado acima? [S/N]: "
if /I not "%STOP_CONFIRM%"=="S" goto :MENU
powershell -NoProfile -Command "$connections = Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue; $processIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique); if ($processIds.Count -eq 0) { exit 2 }; foreach ($processId in $processIds) { Stop-Process -Id $processId -Force -ErrorAction Stop }"
if errorlevel 1 (
  echo Nao foi possivel encerrar o processo. Execute este painel como administrador se necessario.
) else (
  echo Servidor encerrado.
  set "BROWSER_OPENED="
)
pause
goto :MENU

:ISSERVERRUNNING
powershell -NoProfile -Command "if (Test-NetConnection -ComputerName 127.0.0.1 -Port 5174 -InformationLevel Quiet) { exit 0 } else { exit 1 }"
exit /b %errorlevel%

:SHOWSTATUS
call :SHOWLISTENER >nul
if errorlevel 2 (
  echo Status: parado ^(porta 5174 livre^)
  exit /b 0
)
if errorlevel 1 (
  echo Status: nao foi possivel consultar a porta 5174
  exit /b 0
)
echo Status: ativo em http://127.0.0.1:5174/
exit /b 0

:SHOWLISTENER
powershell -NoProfile -Command "$connections = Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue; if (-not $connections) { exit 2 }; $processIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique); Get-Process -Id $processIds -ErrorAction SilentlyContinue | Select-Object Id, ProcessName | Format-Table -AutoSize; exit 0"
exit /b %errorlevel%

:END
echo.
echo Painel fechado. O servidor continua como estiver; use a opcao 4 para encerra-lo antes de sair.
endlocal
exit /b 0
