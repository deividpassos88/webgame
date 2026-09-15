@echo off
setlocal EnableExtensions DisableDelayedExpansion

rem ================================================================
rem LimparRAMLeve.bat
rem Fecha processos de navegadores que ficaram sem nenhuma janela
rem aberta. Nao encerra servicos do Windows nem aplicativos em uso.
rem
rem Uso normal: execute este arquivo e deixe a janela minimizada.
rem Teste unico: LimparRAMLeve.bat --uma-vez
rem Para mudar a frequencia, altere INTERVALO_SEGUNDOS abaixo.
rem ================================================================

set "INTERVALO_SEGUNDOS=180"
title Limpeza leve de memoria - navegadores em segundo plano

call :fechar_navegadores_orfaos

if /I "%~1"=="--uma-vez" exit /b 0

:aguardar
rem TIMEOUT nao usa CPU enquanto espera; a verificacao roda a cada 3 min.
timeout /t %INTERVALO_SEGUNDOS% /nobreak >nul
call :fechar_navegadores_orfaos
goto :aguardar

:fechar_navegadores_orfaos
rem MainWindowHandle diferente de zero indica que ainda existe uma janela
rem do navegador (inclusive minimizada). Nesse caso, nada e encerrado.
rem A sessao atual impede interferencia em outro usuario conectado ao PC.
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference='SilentlyContinue'; $sess=(Get-Process -Id $PID).SessionId; $alvos=@('chrome','msedge','firefox','brave','opera','opera_gx','vivaldi','waterfox','librewolf'); foreach($nome in $alvos){ $processos=@(Get-Process -Name $nome -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $sess }); if($processos.Count -gt 0 -and @($processos | Where-Object { $_.MainWindowHandle -ne 0 }).Count -eq 0){ $mb=[math]::Round((($processos | Measure-Object -Property WorkingSet64 -Sum).Sum / 1MB),0); $processos | Stop-Process -Force; Write-Output ('Fechado: ' + $nome + ' (' + $mb + ' MB liberados)') } }" 2>nul
exit /b 0
