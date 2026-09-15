# Correção: Equipar Arma no Lobby

## Problema Identificado
O jogador podia ver a espada na mochila no lobby, mas não conseguia equipá-la antes de iniciar a partida. O sistema de equipar só funcionava durante o jogo (overlay in-game).

## Alterações Realizadas

### 1. `src/ui/LobbyScreen.ts` - Função `renderLobbyBackpackContents` (linhas 56-68)

**Antes:**
```typescript
export function renderLobbyBackpackContents(
  profile: PlayerProfile,
  inventory: InventorySnapshot
): string {
  return buildRpgUiViewModel(profile, inventory).backpack.map(({ index, item, quantity }) => `
      <div class="inventory-slot${item ? ' has-item' : ''}" data-rarity="${item?.rarity ?? 'empty'}" ${item ? `${itemTooltipDataAttributes(item, quantity)} tabindex="0" role="img" aria-label="${item.label}, quantidade ${quantity}"` : `aria-label="Espaço vazio ${index + 1}"`}>
        ${item ? renderInventorySlotContent(item, quantity) : ''}
      </div>`).join('');
}
```

**Depois:**
```typescript
export function renderLobbyBackpackContents(
  profile: PlayerProfile,
  inventory: InventorySnapshot
): string {
  return buildRpgUiViewModel(profile, inventory).backpack.map(({ index, item, quantity }) => {
    const isEquipment = item && item.kind === 'equipment' && item.slot;
    const equipLabel = isEquipment ? '<span class="equip-indicator">Equipar</span>' : '';
    return `
      <button class="inventory-slot${item ? ' has-item' : ''}${isEquipment ? ' is-equipment' : ''}" type="button" data-lobby-inventory-index="${index}" data-rarity="${item?.rarity ?? 'empty'}" ${item ? itemTooltipDataAttributes(item, quantity) : ''} ${item ? '' : 'disabled'} aria-label="${item ? `${item.label}, quantidade ${quantity}${isEquipment ? ', clique para equipar' : ''}` : `Espaço vazio ${index + 1}`}">
        ${item ? `${renderInventorySlotContent(item, quantity)}${equipLabel}` : ''}
      </button>`;
  }).join('');
}
```

**Mudanças:**
- Alterado de `<div>` para `<button>` para permitir interação
- Adicionado atributo `data-lobby-inventory-index` para identificar o item clicado
- Adicionado classe `.is-equipment` para itens equipáveis
- Adicionado badge visual `<span class="equip-indicator">Equipar</span>`
- Melhorado texto de acessibilidade

### 2. `src/ui/LobbyScreen.ts` - Imports (linhas 10-12)

**Adicionado:**
```typescript
import type { PlayerProfile, RpgEquipmentSlot } from '../profile/PlayerProfile';
import { getInventoryItem } from '../inventory/InventoryCatalog';
```

**Benefício:** Permite validar o tipo do item e executar a operação de equipar.

### 3. `src/ui/LobbyScreen.ts` - Método `bind()` (linha 446)

**Adicionado:**
```typescript
this.lobbyScreen.addEventListener('click', this.lobbyInventoryClick);
```

**Benefício:** Registra o listener de clique nos itens da mochila.

### 4. `src/ui/LobbyScreen.ts` - Método `unbind()` (linha 464)

**Adicionado:**
```typescript
this.lobbyScreen.removeEventListener('click', this.lobbyInventoryClick);
```

**Benefício:** Remove o listener ao desmontar o lobby.

### 5. `src/ui/LobbyScreen.ts` - Novo Método `lobbyInventoryClick` (linhas 589-609)

**Adicionado:**
```typescript
private lobbyInventoryClick = (event: Event): void => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-lobby-inventory-index]');
  if (!button) return;
  const index = Number(button.dataset.lobbyInventoryIndex);
  const stack = this.inventory.snapshot().backpack[index];
  if (!stack) return;
  const item = getInventoryItem(stack.itemId);
  if (!item || item.kind !== 'equipment' || !item.slot) {
    this.setLobbyStatus(item?.kind === 'material'
      ? 'Material guardado para o sistema de craft.'
      : 'Este item não pode ser equipado.');
    return;
  }
  const targetSlot = item.slot === 'weapon' ? 'weapon' : item.slot;
  const result = this.inventory.equip(index, targetSlot as RpgEquipmentSlot);
  this.setLobbyStatus(result.kind === 'equipped'
    ? `${item.label} equipado.`
    : 'O item não é compatível com esse espaço.');
  if (result.kind === 'equipped') {
    this.renderData();
    this.requestFrame();
  }
};
```

**Funcionalidades:**
1. Identifica o item clicado pelo `data-lobby-inventory-index`
2. Valida se o item é equipável
3. Chama `inventory.equip()` - mesmo método usado no overlay in-game
4. Exibe mensagem de feedback no rodapé do lobby
5. Re-renderiza a interface para mostrar o item equipado
6. Atualiza a prévia 3D do personagem com a arma equipada

## Fluxo Completo no Lobby

### Antes de Iniciar a Partida:
1. **Jogador abre o lobby** → Vê a espada na aba "Inventário"
2. **Espada aparece com badge "EQUIPAR"** → Indicador visual claro
3. **Jogador clica na espada** → Sistema executa:
   - Remove da mochila
   - Adiciona ao slot de arma
   - Define como `primaryWeapon`
   - Atualiza preview 3D (se aplicável)
4. **Mensagem aparece no rodapé** → "Espada do Recruta equipado."
5. **Equipamento atualizado** → Visível na aba "Herói"
6. **Jogador clica em "Iniciar partida"** → Entra com a arma já equipada

### Consistência com Sistema In-Game:
- Usa o mesmo método `InventoryStore.equip()`
- Mesmos estilos CSS (`.is-equipment`, `.equip-indicator`)
- Mesma validação de compatibilidade de slots
- Mesma lógica de troca (item anterior volta para mochila)

## Arquivos Modificados
- `src/ui/LobbyScreen.ts` (5 alterações)
- `src/style.css` (já modificado na correção anterior)

## Arquivos Relacionados (não modificados)
- `src/inventory/InventoryStore.ts` - Lógica de equipar (reutilizada)
- `src/inventory/InventoryCatalog.ts` - Definição de itens
- `src/profile/PlayerProfile.ts` - Estrutura de equipamento
- `src/ui/InventoryOverlay.ts` - Sistema in-game (já corrigido)

## Teste

1. Abra o jogo e vá para o lobby
2. Clique na aba "Inventário"
3. Veja a "Espada do Recruta" com o badge "EQUIPAR"
4. Clique na espada
5. Veja a mensagem no rodapé: "Espada do Recruta equipado."
6. Clique na aba "Herói" e veja a arma no slot de equipamento
7. Inicie a partida - a arma estará equipada

## Build
✅ Build realizado com sucesso
✅ TypeScript compilou sem erros
✅ Todos os tipos validados corretamente

## Data
10/09/2026
