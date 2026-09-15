# Guerreiro procedural em runtime Three.js — Design

Data: 2026-08-31  
Status: aprovado pelo usuário  
Projeto: `C:\Users\pteix\OneDrive\Documentos\Gameweb\projeto2`

## Objetivo

Substituir a aparência do personagem jogável `paladin` por um guerreiro
masculino atlético de armadura média criado integralmente no navegador com
Three.js. O personagem usa o esqueleto Mixamo e as animações já carregadas do
GLB atual, mas não depende de uma malha ou export GLB novo produzido no Blender.

O alvo visual é a prévia aprovada nesta conversa: couro marrom-escuro, calça
carvão, couraça de aço escovado, ombreira assimétrica em camadas, braçadeiras,
grevas, botas altas, bainha e espada longa. A prévia é direção artística; ela
não é um asset distribuído ou dependência de execução.

## Decisão de arquitetura

Usar uma fábrica híbrida de geometria procedural runtime:

- `CharacterAssetStore` continua carregando `Guerreiro.glb`, exclusivamente
  para seu `Skeleton`, hierarquia de ossos e `AnimationClip`s existentes.
- `RuntimeWarriorFactory` constrói uma vez um `THREE.Group` de corpo, roupa,
  armadura e espada através de `BufferGeometry` e `MeshStandardMaterial`.
- `RuntimeWarriorSkinning` escreve `skinIndex` e `skinWeight` para cada
  geometria deformável e cria `THREE.SkinnedMesh`es vinculadas ao mesmo
  `Skeleton` da instância do personagem.
- A malha GLB original só é ocultada após todas as malhas runtime terem sido
  criadas e vinculadas com sucesso. Os ossos nunca são ocultados ou removidos.
- Espada e bainha são malhas rigidamente anexadas a `mixamorigRightHand` e
  `mixamorigHips`, respectivamente; não usam skinning por vértice.
- Falha de construção, osso ausente, atributo inválido ou orçamento excedido
  mantém a malha original visível e registra o motivo. O loop de renderização
  não pode lançar exceção por essa falha.

Essa solução preserva `AnimationMixer`, `SkeletonUtils.clone` e clipes atuais,
eliminando importação de personagem/armadura/espada produzidos pelo Blender no
caminho de execução.

## Componentes propostos

| Componente | Responsabilidade |
| --- | --- |
| `src/characters/RuntimeWarriorFactory.ts` | Orquestra criação, ligação ao esqueleto, reversão e métricas. |
| `src/characters/RuntimeWarriorGeometry.ts` | Cria `BufferGeometry` determinística para corpo, cabelo, roupa, placas e espada. |
| `src/characters/RuntimeWarriorSkinning.ts` | Mapeia ossos, calcula influência por distância e valida pesos. |
| `src/characters/RuntimeWarriorMaterials.ts` | Biblioteca PBR de sete materiais e compartilhamento por instância. |
| `src/characters/RuntimeWarriorConfig.ts` | Medidas, orçamento e regiões anatômicas explicitamente versionados. |
| `src/characters/RuntimeWarriorFactory.test.ts` | Contrato de integração, fallback e orçamento. |
| `src/characters/RuntimeWarriorSkinning.test.ts` | Normalização, máximo de quatro influências e falhas de osso. |
| `src/entities/Player.ts` | Chama a fábrica após clonar o modelo, antes de iniciar o mixer. |

Os módulos de Blender em `tools/procedural_warrior/` e seus artefatos
permanecem no workspace como referência e não são removidos por esta migração.

## Geometria e pesos

O corpo será gerado por perfis em anéis e superfícies paramétricas com regiões
de tórax, abdômen, quadril, membros, mãos, cabeça, nariz, orelhas, cabelo e
barba. Roupa de couro e calça seguem superfícies corporais com pequeno offset;
placas metálicas são painéis curvos de baixa espessura. A espada tem lâmina
dupla afunilada, fuller central, guarda, empunhadura e pomo.

Cada vértice deformável recebe candidatos de ossos apenas da sua região
anatômica. A influência usa a distância ao segmento do osso (não somente à
cabeça), decaimento quadrático e um limite de quatro resultados. Pesos menores
que `0.001` são descartados; os restantes são normalizados para soma `1`.
Mãos, ombros, quadril, cotovelos e joelhos recebem candidatos de transição
explícitos para reduzir deformação de "tubo". A geração ocorre no carregamento,
nunca durante `update()`.

## Animação e combate

As ações atuais `Idle`, `Running`, `AttackHorizontal`, `Reaction` e `Death`
continuam sendo resolvidas pelo sistema existente. A malha runtime compartilha
o mesmo `Skeleton`, portanto acompanha as ações sem conversão de arquivos.

O combo de espada terá três estágios rápidos comandados por uma máquina de
estado pura. O primeiro usa `AttackHorizontal`; os estágios seguintes usam
instâncias do mesmo clipe com janela, time scale e direção de rastro próprios
quando clipes nativos diferentes não estiverem disponíveis. A duração alvo é
`0.33 s`, `0.36 s` e `0.40 s`, sem deslocamento de root. A implementação do
combo só abre dano na janela configurada e não cria objetos por frame.

## Orçamento desktop WebGL

| Recurso | Limite |
| --- | ---: |
| Triângulos do guerreiro completo, sem sombra | 14.000–18.000 |
| Materiais PBR compartilhados | 7 |
| Draw calls adicionais do guerreiro | no máximo 8 |
| Influências de osso por vértice | no máximo 4 |
| Geração de geometria e pesos | uma vez por instância carregada |
| Alocações no caminho por frame | zero para geometria/pesos |
| Plataforma de aceite | desktop WebGL; meta média de 60 FPS |

O monitor `FramePerformanceMonitor` será usado durante uma rota in-game de 60
segundos. Se a média for menor que 60 FPS, a correção reduz primeiro detalhes
geométricos e número de materiais antes de alterar regras de jogo ou animação.

## Materiais e aparência

Todos os materiais usam `MeshStandardMaterial` e são criados uma vez por
fábrica compartilhada: pele, olhos, cabelo, tecido, couro, aço e metal escuro.
Variação visual será feita por cores, roughness e normal/bump procedurais
contidos no shader; nenhuma textura externa nova é obrigatória. A variação é
restrita para evitar o ruído excessivo que prejudica leitura de materiais em
WebGL.

## Fluxo de falha e ciclo de vida

1. `Player.load()` clona o GLB atual e localiza a primeira `SkinnedMesh` válida.
2. A fábrica extrai o `Skeleton` e a lista de ossos com nomes normalizados.
3. Geometrias e pesos são criados e validados fora do grafo visível.
4. Quando todas forem válidas, o grupo runtime é anexado e as malhas GLB são
   ocultadas.
5. Em qualquer erro, o grupo parcial é descartado, as malhas GLB continuam
   visíveis e um aviso estruturado é emitido.
6. `Player.dispose()` remove o grupo runtime, geometrias e materiais que não
   forem compartilhados, sem tocar no esqueleto ou nos clipes do asset store.

## Critérios de aceite

- O jogador inicial aparece como o guerreiro runtime, sem novo GLB de
  personagem, armadura ou espada no caminho de execução.
- O visual conserva a silhueta, camadas de couro/metal, espada e proporções da
  prévia aprovada dentro do orçamento WebGL.
- Todo atributo de posição, normal, UV, índice e peso é finito e consistente;
  nenhum vértice tem mais de quatro influências e os pesos ativos somam `1`.
- Idle, corrida, reação, morte e ataque movem corretamente corpo e roupa;
  espada segue a mão e bainha segue quadril.
- Falha de factory ou de mapeamento de osso conserva o personagem GLB atual,
  sem falha no render loop.
- Testes unitários verificam topologia determinística, pesos, orçamentos,
  fallback e integração com `Player`.
- A rota desktop de 60 segundos é registrada pelo `FramePerformanceMonitor`
  com média de pelo menos 60 FPS; regressões são corrigidas antes do aceite.

## Fora de escopo

- Suporte mobile, WebGPU ou geração de LOD por plataforma nesta entrega.
- Igualdade pixel a pixel com a prévia conceitual fotorealista.
- Remoção dos arquivos Blender existentes.
- Geração de texturas bitmap ou rede durante o loop de jogo.
