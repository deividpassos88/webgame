@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title Dragon Miner - Build ADMIN (dist)

REM Gera o build de producao com o modo ADMIN ligado (menu ADM ativo) e,
REM se quiser, serve a pasta dist localmente para testar no navegador.
REM O build normal (sem ADM) continua sendo: npm run build

cd /d "%~dp0"
set "DIST_URL=http://127.0.0.1:4173/"
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
echo   Dragon Miner - Build ADMIN (pasta dist)
echo ==========================================================
call :SHOWDIST
echo.
echo [1] Buildar com modo ADMIN (npm run build:admin)
echo [2] Buildar ADMIN e servir a pasta dist na porta 4173
echo [3] Abrir Edge InPrivate em %DIST_URL%
echo [4] Encerrar o servidor da porta 4173
echo [5] Sair deste painel
echo.
choice /C 12345 /N /M "Escolha uma opcao"
if errorlevel 5 goto :END
if errorlevel 4 goto :STOPSERVER
if errorlevel 3 goto :OPENBROWSER
if errorlevel 2 goto :BUILDANDSERVE
if errorlevel 1 goto :BUILD

:BUILD
call :DOBUILD
if errorlevel 1 goto :MENU
echo.
echo Build ADMIN concluido em: %CD%\dist
echo Copie o conteudo de "dist" para qualquer hospedagem estatica.
pause
goto :MENU

:BUILDANDSERVE
call :DOBUILD
if errorlevel 1 goto :MENU
call :ISSERVERRUNNING
if not errorlevel 1 (
  echo.
  echo O servidor da pasta dist ja esta ativo na porta 4173.
  goto :OPENBROWSER
)
echo.
echo Servindo "dist" em uma janela minimizada...
start "Dragon Miner Dist" /min /d "%CD%" cmd /d /c "call npm run preview:admin -- --host 127.0.0.1 --port 4173"
powershell -NoProfile -Command "$deadline = (Get-Date).AddSeconds(30); while ((Get-Date) -lt $deadline) { if (Test-NetConnection -ComputerName 127.0.0.1 -Port 4173 -InformationLevel Quiet) { exit 0 }; Start-Sleep -Seconds 1 }; exit 1"
if errorlevel 1 (
  echo O servidor nao respondeu em 30 segundos. Consulte a janela "Dragon Miner Dist".
  pause
  goto :MENU
)
echo Servidor pronto.
goto :OPENBROWSER

:OPENBROWSER
call :ISSERVERRUNNING
if errorlevel 1 (
  echo.
  echo Nao ha servidor ativo na porta 4173. Use a opcao 2 primeiro.
  pause
  goto :MENU
)
echo.
echo Abrindo Edge InPrivate em %DIST_URL%
start "Dragon Miner Admin Build" msedge.exe --inprivate "%DIST_URL%"
set "BROWSER_OPENED=1"
timeout /t 1 /nobreak >nul
goto :MENU

:STOPSERVER
call :SHOWLISTENER
if errorlevel 2 (
  echo.
  echo Nenhum servidor esta ouvindo a porta 4173.
  pause
  goto :MENU
)
if errorlevel 1 (
  echo.
  echo Nao foi possivel consultar o processo da porta 4173.
  pause
  goto :MENU
)
echo.
set "STOP_CONFIRM="
set /p "STOP_CONFIRM=Encerrar somente o processo listado acima? [S/N]: "
if /I not "%STOP_CONFIRM%"=="S" goto :MENU
powershell -NoProfile -Command "$connections = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue; $processIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique); if ($processIds.Count -eq 0) { exit 2 }; foreach ($processId in $processIds) { Stop-Process -Id $processId -Force -ErrorAction Stop }"
if errorlevel 1 (
  echo Nao foi possivel encerrar o processo. Execute este painel como administrador se necessario.
) else (
  echo Servidor encerrado.
  set "BROWSER_OPENED="
)
pause
goto :MENU

:DOBUILD
echo.
echo Gerando build ADMIN ^(typecheck + vite build --mode admin^)...
call npm run build:admin
if errorlevel 1 (
  echo.
  echo O build ADMIN falhou. Leia as mensagens acima.
  pause
  exit /b 1
)
exit /b 0

:ISSERVERRUNNING
powershell -NoProfile -Command "if (Test-NetConnection -ComputerName 127.0.0.1 -Port 4173 -InformationLevel Quiet) { exit 0 } else { exit 1 }"
exit /b %errorlevel%

:SHOWDIST
if exist "dist\index.html" (
  echo Status: dist presente ^(build ADMIN ja gerado^)
) else (
  echo Status: dist ausente ^(nenhum build gerado ainda^)
)
exit /b 0

:SHOWLISTENER
powershell -NoProfile -Command "$connections = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue; if (-not $connections) { exit 2 }; $processIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique); Get-Process -Id $processIds -ErrorAction SilentlyContinue | Select-Object Id, ProcessName | Format-Table -AutoSize; exit 0"
exit /b %errorlevel%

:END
echo.
echo Painel fechado.
endlocal
exit /b 0
