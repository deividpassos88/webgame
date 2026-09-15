@echo off
chcp 65001 >nul
title Dragon Miner - Servidor de Desenvolvimento
color 0A

echo ========================================
echo    DRAGON MINER - INICIANDO SERVIDOR
echo ========================================
echo.

cd /d "%~dp0"

REM Verifica se o Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado!
    echo Por favor instale o Node.js em: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Verifica se node_modules existe, se nao, instala dependencias
if not exist "node_modules\" (
    echo [INFO] Dependencias nao encontradas. Instalando...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERRO] Falha ao instalar dependencias!
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencias instaladas com sucesso!
    echo.
)

echo [INFO] Verificando modelo 3D do personagem...
if not exist "public\models\dragonminer-optimized.glb" (
    echo [AVISO] Arquivo nao encontrado: public\models\dragonminer-optimized.glb
    echo O jogo pode nao carregar o personagem corretamente.
    echo.
)

echo [INFO] Iniciando servidor Vite...
echo [INFO] O navegador abrira automaticamente...
echo.
echo ----------------------------------------
echo  Para PARAR o servidor: feche esta janela
echo  ou pressione CTRL+C
echo ----------------------------------------
echo.

call npm run dev

echo.
echo [INFO] Servidor encerrado.
pause