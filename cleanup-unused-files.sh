#!/bin/bash
# Script para mover arquivos não utilizados para pasta externa

PROJETO_DIR="C:/Users/pteix/OneDrive/Documentos/Gameweb/projeto2"
BACKUP_DIR="C:/Users/pteix/OneDrive/Documentos/Gameweb/projeto2-arquivos-nao-utilizados"

echo "🧹 Iniciando limpeza de arquivos não utilizados..."
echo "📂 Destino: $BACKUP_DIR"
echo ""

# Criar estrutura de pastas no backup
mkdir -p "$BACKUP_DIR/models/Guerreiro/Comum"
mkdir -p "$BACKUP_DIR/models/mini-boss"
mkdir -p "$BACKUP_DIR/models/personagem/qualidade alta"
mkdir -p "$BACKUP_DIR/models/personagem/qualidade baixa"
mkdir -p "$BACKUP_DIR/items/craft/common"
mkdir -p "$BACKUP_DIR/ui/lobby"
mkdir -p "$BACKUP_DIR/blacksmith"

# Função para mover arquivo com log
move_file() {
    local src="$1"
    local dst="$2"
    if [ -f "$src" ]; then
        mv "$src" "$dst"
        echo "✓ Movido: $(basename "$src")"
    else
        echo "⚠ Não encontrado: $(basename "$src")"
    fi
}

echo "🗂️  Movendo modelos GLB não utilizados..."
move_file "$PROJETO_DIR/public/dragonminer-optimized2.glb" "$BACKUP_DIR/"
move_file "$PROJETO_DIR/public/models/dragonminer-optimized2.glb" "$BACKUP_DIR/models/"
move_file "$PROJETO_DIR/public/models/Guerreiro/Comum/guerreiro_comum.glb" "$BACKUP_DIR/models/Guerreiro/Comum/"
move_file "$PROJETO_DIR/public/models/Guerreiro/guerreiro_animado.before-remove-happy-20260906-214917.glb" "$BACKUP_DIR/models/Guerreiro/"
move_file "$PROJETO_DIR/public/models/mini-boss/mini boss.glb" "$BACKUP_DIR/models/mini-boss/"
move_file "$PROJETO_DIR/public/models/monstros.rar" "$BACKUP_DIR/models/"
move_file "$PROJETO_DIR/public/models/personagem/qualidade alta/dragonminer-optimized2.glb" "$BACKUP_DIR/models/personagem/qualidade alta/"
move_file "$PROJETO_DIR/public/models/personagem/qualidade baixa/dragonminer-optimized2.glb" "$BACKUP_DIR/models/personagem/qualidade baixa/"

echo ""
echo "🖼️  Movendo imagens duplicadas e não utilizadas..."
# Items craft - versões .webp duplicadas (já temos .png)
move_file "$PROJETO_DIR/public/items/craft/common/1.webp" "$BACKUP_DIR/items/craft/common/"
move_file "$PROJETO_DIR/public/items/craft/common/2.webp" "$BACKUP_DIR/items/craft/common/"
move_file "$PROJETO_DIR/public/items/craft/common/3.webp" "$BACKUP_DIR/items/craft/common/"
move_file "$PROJETO_DIR/public/items/craft/common/4.webp" "$BACKUP_DIR/items/craft/common/"
move_file "$PROJETO_DIR/public/items/craft/common/5.webp" "$BACKUP_DIR/items/craft/common/"

# UI/Lobby não utilizados
move_file "$PROJETO_DIR/public/ui/lobby/medieval-wall-normal.jpg" "$BACKUP_DIR/ui/lobby/"
move_file "$PROJETO_DIR/public/ui/lobby/kenney-rpg-ui.png" "$BACKUP_DIR/ui/lobby/"

# Blacksmith não utilizado
move_file "$PROJETO_DIR/public/blacksmith/working.png" "$BACKUP_DIR/blacksmith/"

echo ""
echo "🗑️  Removendo pastas vazias..."
find "$PROJETO_DIR/public" -type d -empty -delete 2>/dev/null

echo ""
echo "✅ Limpeza concluída!"
echo ""
echo "📊 Resumo:"
echo "   - Modelos GLB removidos: 8"
echo "   - Imagens removidas: 8"
echo "   - Total: 16 arquivos"
echo ""
echo "📁 Arquivos movidos para: $BACKUP_DIR"
echo "   (Você pode deletar esta pasta se não precisar mais dos arquivos)"
