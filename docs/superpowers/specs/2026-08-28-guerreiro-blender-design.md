# Guerreiro modular no Blender

## Objetivo

Criar um personagem Guerreiro baseado em `C:\Users\pteix\Downloads\guerreiro\Idle.fbx`, consolidar todas as animações compatíveis e preparar cinco peças de equipamento modular com skinning, materiais e exportações GLB próprias.

Os arquivos FBX originais serão preservados.

## Entradas verificadas

### Personagem e animações

- `Idle.fbx`: malha principal texturizada, armature Mixamo com 65 ossos e animação Idle.
- `Walking.fbx`
- `Running.fbx`
- `Reaction.fbx`
- `Standing Melee Attack Horizontal.fbx`
- `Standing Melee Run Jump Attack.fbx`
- `Standing Death Forward 01.fbx`

Todos os sete FBX usam nomes e quantidade de ossos compatíveis. A textura do personagem está embutida no `Idle.fbx`.

### Equipamentos

- Capacete
- Peito
- Luva
- Calça
- Bota

Cada equipamento possui uma malha estática e mapas de cor, normal, metallic e roughness embutidos. As peças não possuem armature nem pesos próprios.

## Estrutura da cena

- Uma única armature principal chamada `Guerreiro_Armature`.
- Malha do personagem chamada `Guerreiro_Corpo`.
- Coleção `Equipamentos` com cinco objetos separados:
  - `Equip_Capacete`
  - `Equip_Peito`
  - `Equip_Luva`
  - `Equip_Calca`
  - `Equip_Bota`
- Ações renomeadas:
  - `Idle`
  - `Walking`
  - `Running`
  - `Reaction`
  - `AttackHorizontal`
  - `JumpAttack`
  - `Death`

Cada ação será associada à armature principal e preservada para exportação no arquivo completo.

## Preparação dos equipamentos

Cada peça será ajustada individualmente na pose de repouso do Guerreiro:

1. Corrigir orientação, escala e posição visual em relação ao corpo.
2. Aplicar posição, rotação e escala.
3. Reposicionar a origem do objeto no espaço global `(0, 0, 0)` sem deslocar a geometria ajustada.
4. Adicionar modificador `Armature` apontando para `Guerreiro_Armature`.
5. Transferir grupos de vértices do corpo para a peça por `NEAREST_FACE_INTERPOLATED`.
6. Limpar pesos pequenos, limitar influências, normalizar e suavizar os pesos.
7. Aplicar `Decimate` com proporção `0.7`.
8. Executar `Merge by Distance` com distância conservadora, removendo somente vértices realmente duplicados.
9. Remover geometria solta apenas quando ela não fizer parte visual do equipamento.

O ajuste visual vem antes da transferência de pesos porque os equipamentos Meshy foram exportados com proporções e sistemas de escala independentes.

## Validação de deformação

As cinco peças serão verificadas em quadros representativos de todas as sete ações. Serão observados:

- encaixe no corpo;
- clipping excessivo;
- partes soltas ou deformadas;
- pesos puxados por ossos incorretos;
- capacete acompanhando corretamente a cabeça;
- luvas acompanhando mãos e dedos;
- calça e botas acompanhando quadril, joelhos e pés;
- peito acompanhando coluna, ombros e braços.

Se a transferência automática produzir deformação incorreta, os pesos locais serão corrigidos antes da exportação.

## Saídas

### Arquivo de trabalho

- `C:\Users\pteix\Downloads\guerreiro\Guerreiro-completo.blend`

O `.blend` manterá o personagem completo, as sete ações, as peças separadas e as texturas empacotadas.

### Arquivos do projeto

Diretório: `C:\Users\pteix\OneDrive\Documentos\Gameweb\projeto2\public\models\guerreiro\`

- `Guerreiro.glb`: corpo, armature, equipamentos e sete animações.
- `capacete.glb`
- `peito.glb`
- `luva.glb`
- `calca.glb`
- `bota.glb`

Cada GLB individual conterá a peça selecionada, sua armature e skinning. As animações não serão duplicadas nesses cinco arquivos para evitar aumento desnecessário de tamanho. Materiais e texturas serão incluídos.

## Regras de exportação

- Formato glTF Binary (`.glb`).
- Somente objetos selecionados nas exportações individuais.
- Modificadores aplicados na exportação.
- Armature e skinning preservados.
- Materiais e imagens incluídos.
- Nenhuma câmera ou luz exportada.
- Animações habilitadas somente no `Guerreiro.glb`.

## Verificação final

Após salvar e exportar:

1. Reabrir o `.blend` salvo e confirmar as sete ações.
2. Importar cada GLB em uma cena Blender vazia.
3. Confirmar materiais, texturas, armature, skinning e quantidade esperada de malhas.
4. Confirmar as sete animações no `Guerreiro.glb`.
5. Executar uma inspeção visual do Guerreiro equipado em Idle, caminhada, corrida, ataques, reação e morte.
6. Registrar tamanhos finais e qualquer limitação visual restante.

## Fora do escopo

- Alterar os arquivos FBX originais.
- Integrar o Guerreiro ao código Three.js nesta etapa.
- Criar estatísticas ou lógica de equipamentos.
- Reduzir ou recomprimir texturas além do que a exportação GLB fizer normalmente.
