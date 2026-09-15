# Correção: Equipar Espada da Mochila

## Problema Identificado
O jogador iniciava o jogo com uma espada (`starter-sword`) na mochila, mas:
1. Não havia indicação visual de que o item podia ser equipado
2. Não havia instruções claras de como equipar
3. O item não ficava visível na área primária após equipar

## Alterações Realizadas

### 1. `src/ui/InventoryOverlay.ts` (linhas 58-62)
**Modificação:** Adicionado indicador visual e classe CSS para itens equipáveis

**Antes:**
```typescript
const slots = view.backpack.map(({ index, item, quantity }) => `
  <button class="inventory-slot${item ? ' has-item' : ''}" type="button" data-inventory-index="${index}" ...>
    ${item ? `${inventoryItemArt(item)}<span class="item-quantity">${quantity}</span><small>${item.label}</small>` : ''}
  </button>`).join('');
```

**Depois:**
```typescript
const slots = view.backpack.map(({ index, item, quantity }) => {
  const isEquipment = item && item.kind === 'equipment' && item.slot;
  const equipLabel = isEquipment ? '<span class="equip-indicator">Equipar</span>' : '';
  return `
    <button class="inventory-slot${item ? ' has-item' : ''}${isEquipment ? ' is-equipment' : ''}" type="button" data-inventory-index="${index}" ... aria-label="${item ? `${item.label}, quantidade ${quantity}${isEquipment ? ', clique para equipar' : ''}` : `Espaço vazio ${index + 1}`}">
      ${item ? `${inventoryItemArt(item)}<span class="item-quantity">${quantity}</span><small>${item.label}</small>${equipLabel}` : ''}
    </button>`;
}).join('');
```

**Benefícios:**
- Itens equipáveis recebem a classe `.is-equipment`
- Badge visual "Equipar" aparece no item
- Texto de acessibilidade informa que o item pode ser equipado

### 2. `src/style.css` (linha 1745-1751)
**Modificação:** Adicionados estilos para itens equipáveis

**Adicionado:**
```css
.inventory-slot.is-equipment { border-color: #a96c35; }
.inventory-slot.is-equipment:hover { border-color: #ffb800; background: #1f1c16; }
.equip-indicator { 
  position: absolute; 
  bottom: 2px; 
  left: 50%; 
  transform: translateX(-50%); 
  padding: 2px 6px; 
  background: #ffb800; 
  color: #000; 
  font-size: 7px; 
  font-weight: 700; 
  text-transform: uppercase; 
  letter-spacing: 0.05em; 
  border-radius: 2px; 
  pointer-events: none; 
}
```

**Benefícios:**
- Borda dourada (#a96c35) diferencia itens equipáveis
- Hover mostra borda amarela (#ffb800) indicando interatividade
- Badge "EQUIPAR" em amarelo e preto com alta visibilidade

## Fluxo Corrigido

1. **Início do jogo:** Jogador começa com "Espada do Recruta" na mochila
2. **Visualização:** Na mochila (tecla `I`), a espada aparece com:
   - Borda dourada diferenciada
   - Badge "EQUIPAR" na parte inferior
   - Texto acessível indicando que pode equipar
3. **Equipar:** Ao clicar na espada:
   - Item é removido da mochila
   - Item vai para o slot de arma no equipamento
   - Item também é definido como `primaryWeapon` (área primária)
   - Mensagem de confirmação aparece
4. **Resultado:** Espada equipada e disponível para uso em combate

## Sistema de Equipamento

O sistema já estava funcionando corretamente em `InventoryStore.equip()`:
- Valida se o item é equipável
- Remove da mochila
- Adiciona ao slot correto
- Se já havia item equipado, devolve para a mochila
- Define `primaryWeapon` automaticamente para armas

## Arquivos Relacionados

- `src/inventory/InventoryCatalog.ts`: Define `starter-sword` como equipment
- `src/profile/PlayerProfile.ts`: Inicializa perfil com espada na mochila (linha 176)
- `src/inventory/InventoryStore.ts`: Lógica de equipar (método `equip()`)
- `src/ui/InventoryOverlay.ts`: Interface de mochila e equipamento
- `src/style.css`: Estilos visuais

## Teste

1. Inicie o jogo
2. Pressione `I` para abrir a mochila
3. Veja a "Espada do Recruta" com o indicador "EQUIPAR"
4. Clique na espada
5. Verifique que ela foi para o slot de arma no equipamento
6. A arma estará disponível para combate

## Data
10/09/2026
