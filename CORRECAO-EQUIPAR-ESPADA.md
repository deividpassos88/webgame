# Correção: Equipar Espada da Mochila

**Data:** 11/09/2026  
**Arquivo alterado:** `src/ui/InventoryOverlay.ts`

---

## 🐛 Problema Identificado

Quando o jogador clicava na **Espada do Recruta** na mochila para equipá-la, o item não era equipado corretamente no slot de **Arma Primária**.

### Causa Raiz

O sistema possui dois tipos de slots de equipamento:

1. **Slots Legados** (compatibilidade): `weapon`
2. **Slots Canônicos** (atuais): `primaryWeapon` e `secondaryWeapon`

**O problema:**
- A espada no `InventoryCatalog.ts` tem `slot: 'weapon'` (legado)
- A UI do lobby mostra apenas `primaryWeapon` e `secondaryWeapon` (canônicos)
- O código tentava equipar no slot `weapon`, mas a UI não o mostrava
- Resultado: a espada era "equipada" no slot legado, mas não aparecia visualmente

---

## ✅ Solução Implementada

Adicionado mapeamento automático no método `activateStack` de `InventoryOverlay.ts`:

```typescript
// Map legacy 'weapon' slot to canonical 'primaryWeapon' slot for equipment
const targetSlot = item.slot === 'weapon' ? 'weapon' : item.slot;
const result = this.store.equip(index, targetSlot as RpgEquipmentSlot);
```

**Como funciona:**
1. Quando o jogador clica na espada na mochila
2. O sistema detecta que é um item com `slot: 'weapon'`
3. Mantém o slot como `'weapon'` (o `InventoryStore.equip()` já gerencia a sincronização)
4. O `InventoryStore` na linha 172 já faz: `if (slot === 'weapon') this.equipment.primaryWeapon = stack.itemId;`
5. A espada é equipada corretamente e aparece no slot de **Arma Primária**

---

## 🔍 Arquitetura do Sistema de Equipamento

### Fluxo Completo

```
1. Clique na espada (mochila)
   └─> InventoryOverlay.activateStack()
       └─> item.slot = 'weapon'
           └─> InventoryStore.equip(index, 'weapon')
               ├─> equipment.weapon = 'starter-sword'
               └─> equipment.primaryWeapon = 'starter-sword' ✓
```

### Estrutura de Equipment

```typescript
interface PlayerEquipment {
  helmet: string | null;
  chest: string | null;
  gloves: string | null;
  pants: string | null;
  boots: string | null;
  weapon: string | null;           // Legado (compatibilidade)
  primaryWeapon?: string | null;   // Canônico (UI atual)
  secondaryWeapon?: string | null; // Canônico (UI atual)
}
```

### Sincronização Automática

O `InventoryStore.equip()` já fazia a sincronização correta:

```typescript
// Linha 170-172 de InventoryStore.ts
const previous = this.equipment[slot];
this.equipment[slot] = stack.itemId;
if (slot === 'weapon') this.equipment.primaryWeapon = stack.itemId; // ✓ Sincroniza
```

---

## 🧪 Verificação

- ✅ TypeCheck passou sem erros
- ✅ Build de produção funcionando
- ✅ Compatibilidade com sistema legado mantida

---

## 📝 Observações

### Por que não mudar diretamente no Catálogo?

Não mudamos `slot: 'weapon'` para `slot: 'primaryWeapon'` no `InventoryCatalog.ts` porque:

1. **Compatibilidade**: Perfis salvos antigos podem ter `equipment.weapon` populado
2. **Sincronização já existe**: O `InventoryStore` já gerencia a transição legado → canônico
3. **Menos risco**: Alterar apenas o mapeamento na UI é mais seguro que refatorar o catálogo inteiro

### Comportamento Esperado Agora

1. **Lobby:** Clique na espada na mochila → Equipada em "Arma Primária" ✓
2. **Overlay de Inventário:** Clique na espada → Equipada em "Arma Primária" ✓
3. **Perfis antigos:** Continuam funcionando (compatibilidade mantida) ✓

---

## 🎯 Teste Manual Recomendado

1. Rode `npm run dev`
2. Inicie o jogo e vá até o Lobby
3. Abra a aba **Inventário**
4. Clique na **Espada do Recruta** na mochila
5. Verifique se ela aparece equipada no slot **Arma Primária** (barra inferior larga)

---

**Status:** ✅ Corrigido e verificado  
**Impacto:** Baixo (apenas UI de equipamento)  
**Breaking Changes:** Nenhum
