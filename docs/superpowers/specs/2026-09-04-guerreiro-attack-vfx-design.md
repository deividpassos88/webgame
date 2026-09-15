# VFX dos ataques do Guerreiro — Design

Data: 2026-09-04  
Status: aprovado pelo usuário  
Plataforma: desktop WebGL

## Objetivo

Usar as onze animações do arquivo `personagem_final.blend` no jogo e criar VFX
leves para os seis ataques renomeados pelo usuário. O GLB contém personagem,
rig, espada, animações e nós de referência; trilhas, partículas, fumaça e
impactos são gerados em tempo real pelo Three.js.

## Decisão de arquitetura

- O Blender normaliza os nomes das Actions e NLA strips para `snake_case`.
- O arquivo exportado é `public/models/Guerreiro/guerreiro_animado.glb`.
- A espada recebe os nós vazios `VFX_SwordBase`, `VFX_SwordTip` e
  `VFX_Impact`, exportados como nós glTF sem geometria.
- O Three.js seleciona uma animação e um perfil visual pela mesma chave de
  ataque. As seis animações são consumidas em ordem determinística, três por
  combo, e o combo seguinte continua nas três restantes.
- O VFX usa buffers fixos: duas fitas aditivas, um pool de faíscas e um pool de
  fumaça. Nenhuma geometria, material, vetor ou array é criado no frame loop.
- O sistema atual permanece como fallback quando um clipe ou nó não existe.

## Nomes normalizados

| Nome informado | Nome exportado | Uso |
| --- | --- | --- |
| `ataque basico` | `ataque_basico` | golpe azul/branco |
| `ataque giratorio` | `ataque_giratorio` | círculo verde |
| `ataque giratorio 2` | `ataque_giratorio_2` | círculo roxo em duas camadas |
| `pulo atacando` | `pulo_atacando` | arco dourado e impacto |
| `triplo ataque` | `triplo_ataque` | fogo, brasas e fumaça |
| `corte duplo` | `corte_duplo` | duas fases roxa e laranja |
| `merrendo` | `morte` | morte |
| `recebe dano` | `recebe_dano` | reação de dano |
| `runing` | `correndo` | corrida |
| `caminhando` | `caminhando` | fonte de pose parada |
| `caiu` | `caiu` | queda |

O estado parado é derivado no navegador do primeiro quadro de `caminhando`,
sem duplicar uma Action no GLB.

## Perfis visuais

| Ataque | Cor principal | Cor secundária | Complemento |
| --- | --- | --- | --- |
| `ataque_basico` | `#d9f4ff` | `#2aa8ff` | faíscas azuis |
| `ataque_giratorio` | `#b9ff39` | `#16e868` | rastro longo e partículas verdes |
| `ataque_giratorio_2` | `#ff66ff` | `#633cff` | brilho duplo e partículas violetas |
| `pulo_atacando` | `#fff19a` | `#ffad16` | explosão curta no impacto |
| `triplo_ataque` | `#fff0b0` | `#ff4a00` | brasas e fumaça cinza |
| `corte_duplo` | `#d573ff` | `#ff8a32` | alternância de cor no segundo corte |

## Integração com combate

`Player` cria uma `AnimationAction` por ataque disponível. O estágio de combo
recebe a próxima chave da rotação de seis ataques, ajusta a duração do clipe à
janela existente e passa a mesma chave ao VFX. `damage-opened` abre a fita e
emite uma rajada; `damage-closed`, cancelamento, dano recebido, morte, troca de
arma e fim do combo fecham e limpam o efeito. Machado nunca ativa este VFX.

## Orçamento e ciclo de vida

- Máximo de duas fitas, 96 faíscas e 32 partículas de fumaça por jogador.
- No máximo quatro draw calls visuais adicionais enquanto o ataque está ativo.
- Materiais usam `AdditiveBlending` ou transparência com `depthWrite=false`.
- Buffers e materiais são criados no construtor e liberados em `dispose()`.
- Partículas expiradas são compactadas nos arrays existentes.
- O GLB não recebe partículas, volumes ou texturas VFX.

## Critérios de aceite

- O GLB exportado contém onze animações com nomes únicos e os três nós VFX.
- Os seis ataques aparecem no runtime e cada um seleciona seu perfil de cor.
- A fita acompanha base e ponta da espada e desaparece após o golpe.
- Interrupções não deixam partículas ou meshes visíveis permanentemente.
- O machado e o fluxo de dano existente continuam funcionando.
- Testes, typecheck e build aprovam; a cena é inspecionada no navegador.

## Fora de escopo

- Igualdade pixel a pixel com as imagens de referência.
- Simulação volumétrica de fogo ou fumaça do Blender no navegador.
- Suporte mobile, WebGPU ou alteração dos valores de dano do combo.
