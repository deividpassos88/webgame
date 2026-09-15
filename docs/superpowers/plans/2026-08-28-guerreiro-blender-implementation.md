# Guerreiro Blender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produzir um Guerreiro Mixamo com sete animações, cinco equipamentos ajustados e skinados, um `.blend` completo e seis GLBs validados.

**Architecture:** Um script Blender reproduzível importa o personagem base e copia as ações dos FBX compatíveis para uma única armature. O mesmo script ajusta, otimiza e transfere os pesos dos equipamentos, salva o arquivo de trabalho e exporta o personagem completo e cada equipamento modular; um segundo script reabre cada saída e valida sua estrutura.

**Tech Stack:** Blender 5.2 LTS, Blender Python API (`bpy`, `bmesh`), FBX, glTF/GLB.

**Spec:** `docs/superpowers/specs/2026-08-28-guerreiro-blender-design.md`

## Global Constraints

- Preservar todos os FBX originais em `C:\Users\pteix\Downloads\guerreiro\`.
- Usar somente a armature Mixamo de 65 ossos do `Idle.fbx` como armature principal.
- Manter sete ações: `Idle`, `Walking`, `Running`, `Reaction`, `AttackHorizontal`, `JumpAttack` e `Death`.
- Aplicar `Decimate` com proporção `0.7` em cada equipamento.
- Aplicar `Merge by Distance` conservador após o Decimate.
- Salvar `Guerreiro-completo.blend` em `C:\Users\pteix\Downloads\guerreiro\`.
- Exportar os GLBs em `public\models\guerreiro\`.
- Não integrar o novo personagem ao Three.js nesta etapa.
- O diretório não possui `.git`; os checkpoints serão arquivos e relatórios verificáveis, sem commits.

---

### Task 1: Validador estrutural das saídas

**Files:**
- Create: `tools/inspect_guerreiro_asset.py`
- Test: saídas em `C:\Users\pteix\Downloads\guerreiro\Guerreiro-completo.blend` e `public\models\guerreiro\*.glb`

**Interfaces:**
- Consumes: caminho absoluto do asset depois de `--`.
- Produces: saída `GUERREIRO_ASSET_OK ...` ou erro `GUERREIRO_ASSET_ERROR ...` com exit code `1`.

- [ ] **Step 1: Criar o validador antes do construtor**

Implementar as constantes e verificações:

```python
EXPECTED_ACTIONS = {
    "Idle", "Walking", "Running", "Reaction",
    "AttackHorizontal", "JumpAttack", "Death",
}
EXPECTED_BONES = 65
EXPECTED_EQUIPMENT = {
    "Equip_Capacete", "Equip_Peito", "Equip_Luva",
    "Equip_Calca", "Equip_Bota",
}
```

O validador deve:

1. abrir `.blend` ou importar `.glb`;
2. exigir uma armature de 65 ossos;
3. confirmar que toda malha possui modificador/skin ligado à armature;
4. confirmar materiais e imagens;
5. rejeitar vértices soltos;
6. no arquivo completo, exigir as sete ações;
7. nos equipamentos individuais, exigir uma única malha de equipamento e nenhuma animação.

- [ ] **Step 2: Executar o validador contra uma saída ainda inexistente**

Run:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python tools\inspect_guerreiro_asset.py -- public\models\guerreiro\Guerreiro.glb
```

Expected: FAIL com `GUERREIRO_ASSET_ERROR Asset does not exist`.

### Task 2: Consolidar personagem e animações

**Files:**
- Create: `tools/build_guerreiro_asset.py`
- Modify: `C:\Users\pteix\Downloads\guerreiro\Guerreiro-completo.blend` (gerado)

**Interfaces:**
- Consumes: diretório fonte recebido depois de `--` e o mapa `ACTION_FILES`.
- Produces: `Guerreiro_Armature`, `Guerreiro_Corpo` e sete ações persistentes.

- [ ] **Step 1: Definir entradas e invariantes**

```python
ACTION_FILES = {
    "Idle": "Idle.fbx",
    "Walking": "Walking.fbx",
    "Running": "Running.fbx",
    "Reaction": "Reaction.fbx",
    "AttackHorizontal": "Standing Melee Attack Horizontal.fbx",
    "JumpAttack": "Standing Melee Run Jump Attack.fbx",
    "Death": "Standing Death Forward 01.fbx",
}
EXPECTED_BONES = 65
MERGE_DISTANCE = 0.0001
DECIMATE_RATIO = 0.7
```

- [ ] **Step 2: Importar o `Idle.fbx` e validar o corpo**

Criar `import_fbx(path)`, `imported_armature(objects, filename)` e `current_action(armature, filename)`. Exigir uma armature, 65 ossos e uma malha corporal skinada; renomear para `Guerreiro_Armature` e `Guerreiro_Corpo`.

- [ ] **Step 3: Executar a primeira construção e comprovar falha enquanto as demais ações não existem**

Run:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python tools\build_guerreiro_asset.py -- 'C:\Users\pteix\Downloads\guerreiro'
```

Expected: FAIL explícito indicando as ações ainda não consolidadas.

- [ ] **Step 4: Copiar as seis ações adicionais**

Para cada FBX, comparar exatamente a sequência dos 65 nomes de ossos, copiar a Action, renomeá-la pelo mapa e remover a armature temporária. Marcar cada ação com `use_fake_user = True` e criar uma NLA track independente por ação.

- [ ] **Step 5: Normalizar deslocamento horizontal das ações de locomoção**

Implementar `make_horizontal_motion_in_place(action)` para remover somente o deslocamento acumulado horizontal de `mixamorig:Hips`, sem remover o movimento vertical dos passos, saltos ou morte. O deslocamento do personagem no jogo continuará sendo controlado pelo Three.js.

- [ ] **Step 6: Salvar checkpoint animado e validar as ações**

Salvar temporariamente `Guerreiro-completo.blend`, executar o validador e esperar que a verificação das ações passe, embora os equipamentos ainda sejam reportados como ausentes.

### Task 3: Ajustar, skinning e otimizar os equipamentos

**Files:**
- Modify: `tools/build_guerreiro_asset.py`
- Modify: `C:\Users\pteix\Downloads\guerreiro\Guerreiro-completo.blend` (regenerado)

**Interfaces:**
- Consumes: `Guerreiro_Corpo`, `Guerreiro_Armature` e os cinco FBX dentro de `equipament`.
- Produces: coleção `Equipamentos` com cinco malhas skinadas e otimizadas.

- [ ] **Step 1: Definir o catálogo e nomes das peças**

```python
EQUIPMENT_FILES = {
    "Equip_Capacete": "equipament/capacete/Meshy_AI_Doomhorn_Visage_0828150500_texture.fbx",
    "Equip_Peito": "equipament/Peito/Meshy_AI_Skullguard_Plate_Mail_0828145444_texture.fbx",
    "Equip_Luva": "equipament/luva/Meshy_AI_Doomforged_Skull_Gaun_0828150012_texture.fbx",
    "Equip_Calca": "equipament/calça/Meshy_AI_Dreadbone_Warplate_0828150224_texture.fbx",
    "Equip_Bota": "equipament/bota/Meshy_AI_Doomguard_Greaves_0828150134_texture.fbx",
}
```

- [ ] **Step 2: Importar cada malha sem perder materiais**

Criar `import_equipment(path, object_name, collection)`. Exigir uma única malha por FBX, preservar material e imagens empacotadas, mover o objeto para `Equipamentos` e remover objetos auxiliares importados.

- [ ] **Step 3: Ajustar cada peça na pose de repouso**

Criar `fit_equipment(equipment, body, armature, equipment_name)`. Usar os limites do corpo e posições mundiais dos ossos relevantes como referências iniciais; aplicar correções por peça em um dicionário `FIT_ADJUSTMENTS` com `scale`, `rotation` e `offset`. Aplicar as transformações e mover somente a origem para `(0, 0, 0)`, preservando a geometria já encaixada.

Referências obrigatórias:

- capacete: `mixamorig:Head` e `mixamorig:HeadTop_End`;
- peito: `mixamorig:Spine`, `Spine1`, `Spine2` e ombros;
- luva: mãos e antebraços esquerdo/direito;
- calça: quadril e pernas superiores;
- bota: pernas, pés e dedos.

- [ ] **Step 4: Transferir e limpar pesos**

Criar `skin_equipment(equipment, body, armature)`:

1. adicionar modificador `Armature` apontando para `Guerreiro_Armature`;
2. usar modificador `DataTransfer` com `use_vert_data=True`, `data_types_verts={'VGROUP_WEIGHTS'}` e `vert_mapping='POLYINTERP_NEAREST'`;
3. aplicar o `DataTransfer`;
4. executar `vertex_group_clean(group_select_mode='ALL', limit=0.001)`;
5. limitar cada vértice a quatro influências;
6. normalizar todos os grupos;
7. suavizar os pesos em duas iterações.

- [ ] **Step 5: Aplicar Decimate e limpeza geométrica**

Criar `optimize_equipment(equipment)` para aplicar `DECIMATE` com `ratio=0.7`, executar `bmesh.ops.remove_doubles(..., dist=0.0001)` e remover somente vértices sem arestas e sem faces. Falhar se a redução adicional do Merge exceder `2%`, pois isso indica escala/distância incorreta.

- [ ] **Step 6: Gerar previews de deformação**

Criar uma câmera e iluminação temporárias, renderizar uma grade de quadros representativos das sete animações em `C:\Users\pteix\Downloads\guerreiro\preview-guerreiro.png` e revisar visualmente encaixe, clipping e deformações.

- [ ] **Step 7: Corrigir os parâmetros de encaixe e pesos**

Ajustar somente os valores explícitos de `FIT_ADJUSTMENTS` e, quando necessário, os grupos locais da peça afetada. Regenerar o preview até que cabeça, torso, braços, quadril, joelhos e pés acompanhem o corpo sem deslocamentos graves.

### Task 4: Salvar e exportar os seis GLBs

**Files:**
- Modify: `tools/build_guerreiro_asset.py`
- Create: `C:\Users\pteix\Downloads\guerreiro\Guerreiro-completo.blend`
- Create: `public\models\guerreiro\Guerreiro.glb`
- Create: `public\models\guerreiro\capacete.glb`
- Create: `public\models\guerreiro\peito.glb`
- Create: `public\models\guerreiro\luva.glb`
- Create: `public\models\guerreiro\calca.glb`
- Create: `public\models\guerreiro\bota.glb`

**Interfaces:**
- Consumes: cena validada da Task 3.
- Produces: arquivo editável completo e seis assets runtime.

- [ ] **Step 1: Empacotar e salvar o `.blend`**

Executar `bpy.ops.file.pack_all()` e `bpy.ops.wm.save_as_mainfile(...)` somente depois da validação visual das peças.

- [ ] **Step 2: Exportar o personagem completo**

Selecionar corpo, cinco equipamentos e armature. Exportar `Guerreiro.glb` com `use_selection=True`, `export_animations=True`, `export_animation_mode='NLA_TRACKS'`, materiais e imagens inclusos, câmeras e luzes desabilitadas.

- [ ] **Step 3: Exportar cada equipamento individual**

Para cada peça, selecionar somente a peça e a armature. Desabilitar animações e exportar com modificadores, skinning e materiais preservados. Mapear nomes:

```python
EQUIPMENT_EXPORTS = {
    "Equip_Capacete": "capacete.glb",
    "Equip_Peito": "peito.glb",
    "Equip_Luva": "luva.glb",
    "Equip_Calca": "calca.glb",
    "Equip_Bota": "bota.glb",
}
```

- [ ] **Step 4: Emitir relatório de construção**

Imprimir `GUERREIRO_BUILD_OK` com caminhos, tamanhos, contagens de vértices antes/depois, ações e nomes dos equipamentos.

### Task 5: Verificação estrutural e visual final

**Files:**
- Test: `tools/inspect_guerreiro_asset.py`
- Test: todos os arquivos produzidos nas Tasks 3 e 4.

**Interfaces:**
- Consumes: `.blend`, seis GLBs e preview PNG.
- Produces: evidência final de estrutura, conteúdo e aparência.

- [ ] **Step 1: Validar o `.blend` completo**

Run:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python tools\inspect_guerreiro_asset.py -- 'C:\Users\pteix\Downloads\guerreiro\Guerreiro-completo.blend'
```

Expected: `GUERREIRO_ASSET_OK`, 65 ossos, seis malhas e sete ações.

- [ ] **Step 2: Validar `Guerreiro.glb`**

Executar o mesmo validador em `public\models\guerreiro\Guerreiro.glb` e exigir seis malhas, 65 ossos, materiais, skinning e sete animações.

- [ ] **Step 3: Validar os cinco GLBs individuais**

Executar o validador para `capacete.glb`, `peito.glb`, `luva.glb`, `calca.glb` e `bota.glb`. Cada execução deve confirmar uma malha, uma armature, skinning, materiais e nenhuma animação.

- [ ] **Step 4: Inspecionar visualmente o preview**

Abrir `C:\Users\pteix\Downloads\guerreiro\preview-guerreiro.png` e confirmar que as peças acompanham corretamente Idle, caminhada, corrida, reação, dois ataques e morte.

- [ ] **Step 5: Registrar resultado final**

Informar caminhos, tamanhos, número de polígonos e animações. Qualquer clipping pequeno inevitável deve ser descrito de forma específica; nenhuma saída será declarada concluída se o validador ou a inspeção visual falhar.
