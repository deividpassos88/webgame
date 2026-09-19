# Arquivos do Projeto - Dragon Miner

## 📊 Resultado da Limpeza

**Antes:** ~232MB de assets  
**Depois:** 123MB no projeto  
**Redução:** 109MB (~47%)  
**Arquivos mantidos:** 52 arquivos ativos  
**Arquivos removidos:** 16 arquivos não utilizados

---

## ✅ Arquivos Mantidos (Em Uso no Código)

### 🎮 Modelos 3D (.glb) - 5 arquivos

| Arquivo | Tamanho | Usado em | Descrição |
|---------|---------|----------|-----------|
| `models/Guerreiro/guerreiro_animado.glb` | - | CharacterCatalog.ts | Modelo principal do Guerreiro |
| `models/monstro.glb` | 370KB | EnemyAssetStore.ts | Inimigos regulares |
| `models/Boss/Boss.glb` | - | BossAssetStore.ts | Boss final (Dragonic Overlord) |
| `models/chest.glb` | 1.1MB | RewardAssetStore.ts | Baú de recompensas |
| `models/sword.glb` | 134KB | EquipmentCatalog.ts | Espada (modelo 3D) |
| `models/axe.glb` | 188KB | EquipmentCatalog.ts | Machado (modelo 3D) |

**Total: 6 modelos GLB ativos**

### 🎨 UI - Assets de Interface (18 arquivos)

#### Ícones Gerais (2)
- `assets/ui/backpack-icon.png` - Ícone da mochila
- `assets/ui/status-icon.png` - Ícone de status

#### Skills do Guerreiro (6)
- `assets/ui/skills/basic-attack.png` - Ataque básico
- `assets/ui/skills/spin.png` - Ataque giratório
- `assets/ui/skills/frost-spin.png` - Ataque giratório 2
- `assets/ui/skills/jump-impact.png` - Pulo atacando
- `assets/ui/skills/flame-strike.png` - Triplo ataque
- `assets/ui/skills/double-cut.png` - Corte duplo

#### Retratos (1)
- `assets/ui/portrait/warrior-portrait.png` - Retrato do guerreiro

#### Lobby/Cenário (2)
- `ui/lobby/cinzafogo-war-courtyard-v1.jpg` - Backdrop do lobby
- `ui/lobby/medieval-wall-diffuse.jpg` - Textura de parede medieval (CSS)

### 🔨 Blacksmith - Ferreiro (3 arquivos)
- `blacksmith/meal.png` - Ferreiro fazendo refeição
- `blacksmith/payment.png` - Ferreiro aguardando pagamento
- `blacksmith/working-forging.png` - Ferreiro trabalhando na forja

### 📦 Items - Ícones de Itens (33 arquivos)

#### Craft Materials Common (15)
- `items/craft/common/1.png` até `10.png` - Materiais comuns
- `items/craft/common/6.webp` até `10.webp` - Versões webp (6-10)
- `items/craft/common/7.webp`, `8.webp`, `9.webp` - Usados em InventoryCatalog

#### Craft Materials Rare (5)
- `items/craft/rare/1.png` até `5.png` - Materiais raros

#### Guild Tokens (1)
- `items/craft/token-guild.png` - Token da guilda

#### Equipamentos (6)
- `items/equipment/armas/sword.webp` - Ícone da espada
- `items/equipment/common-forged/helmet.png` - Capacete forjado
- `items/equipment/common-forged/chest.png` - Peitoral forjado
- `items/equipment/common-forged/pants.png` - Calça forjada
- `items/equipment/common-forged/gloves.png` - Luvas forjadas
- `items/equipment/common-forged/boots.png` - Botas forjadas

### ✨ VFX - Efeitos Visuais (5 arquivos)
- `vfx/warrior/soft-glow.png` - Brilho suave
- `vfx/warrior/smoke.png` - Fumaça
- `vfx/warrior/slash-arc.png` - Arco de corte
- `vfx/warrior/impact-flare.png` - Clarão de impacto
- `vfx/warrior/flame.png` - Chamas

---

## 🗑️ Arquivos Removidos (Movidos para `projeto2-arquivos-nao-utilizados`)

### Modelos GLB Não Utilizados (8 arquivos)
1. ❌ `dragonminer-optimized2.glb` (root) - Duplicata não referenciada
2. ❌ `models/dragonminer-optimized2.glb` - Modelo antigo (referência morta em CharacterCatalog)
3. ❌ `models/Guerreiro/Comum/guerreiro_comum.glb` - Variante não usada
4. ❌ `models/Guerreiro/guerreiro_animado.before-remove-happy-20260906-214917.glb` - Backup antigo
5. ❌ `models/mini-boss/mini boss.glb` - Mini-boss não implementado
6. ❌ `models/monstros.rar` - Arquivo RAR (29MB)
7. ❌ `models/personagem/qualidade alta/dragonminer-optimized2.glb` - Duplicata
8. ❌ `models/personagem/qualidade baixa/dragonminer-optimized2.glb` - Duplicata

### Imagens Não Utilizadas (8 arquivos)
1. ❌ `items/craft/common/1.webp` até `5.webp` - Duplicatas (já existem .png)
2. ❌ `ui/lobby/medieval-wall-normal.jpg` - Normal map não usado
3. ❌ `ui/lobby/kenney-rpg-ui.png` - Asset de UI não referenciado
4. ❌ `blacksmith/working.png` - Variante não usada (existe working-forging.png)

---

## 🔍 Como Foram Identificados

Os arquivos foram analisados através de:
1. **Busca no código-fonte** - Grep em todos os arquivos `.ts`, `.css` e `.html`
2. **Referências diretas** - Verificação de imports e paths hardcoded
3. **Testes unitários** - Checagem de assertions que validam paths

### Arquivos de Referência no Código:
- `src/characters/CharacterCatalog.ts` - Define modelos de personagens
- `src/equipment/EquipmentCatalog.ts` - Define armas e equipamentos
- `src/inventory/InventoryCatalog.ts` - Define ícones de items
- `src/waves/EnemyAssetStore.ts` - Define modelo de inimigos
- `src/entities/BossAssetStore.ts` - Define modelo do boss
- `src/equipment/RewardAssetStore.ts` - Define modelo do baú
- `src/ui/WarriorSkillAssets.ts` - Define ícones de skills
- `src/effects/SwordTrail.ts` - Define texturas de VFX
- `src/ui/BlacksmithScreen.ts` - Define imagens do ferreiro
- `src/style.css` - Define backgrounds e texturas CSS

---

## 📁 Localização dos Arquivos Removidos

Todos os arquivos não utilizados foram movidos para:
```
C:/Users/pteix/OneDrive/Documentos/Gameweb/projeto2-arquivos-nao-utilizados/
```

**Esta pasta pode ser deletada com segurança se você não precisar mais desses arquivos.**

---

## ⚠️ Observações Importantes

1. **Modelo `dragonminer-optimized.glb`**: Referenciado em `CharacterCatalog.ts` mas **NÃO existe** no disco. O código usa fallback para `paladin` (guerreiro_animado.glb).

2. **Duplicatas webp**: Mantidas apenas as versões 6-10 em webp, pois são referenciadas no `InventoryCatalog.ts`. As versões 1-5 tinham duplicatas .png e .webp, mantive apenas .png.

3. **Mini-boss**: Há uma pasta `models/mini-boss/` mas o arquivo foi removido pois não está sendo usado no código atual.

4. **Backup seguro**: Todos os arquivos removidos estão na pasta externa, não foram deletados permanentemente.

---

## 🎯 Próximos Passos Sugeridos

1. ✅ **Limpeza concluída** - Projeto ~47% mais leve
2. 🔧 **Corrigir referência morta**: Remover ou corrigir `dragonminer-optimized.glb` em CharacterCatalog.ts
3. 🗑️ **Deletar backup**: Após confirmar que tudo funciona, deletar `projeto2-arquivos-nao-utilizados/`
4. 📦 **Adicionar .gitignore**: Se pretende versionar, adicionar regras para evitar acumular assets não usados

---

**Documento gerado em:** 10/09/2026  
**Script de limpeza:** `cleanup-unused-files.sh`
