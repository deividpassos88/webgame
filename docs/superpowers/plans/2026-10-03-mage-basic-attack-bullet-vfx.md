# Ataque básico da Maga — bala azul com fumaça de gelo

Data: 2026-10-03
Arquivos principais: `src/vfx/VFXConfig.ts`, `src/vfx/ProjectileManager.ts`,
`src/vfx/ParticleManager.ts`, `src/vfx/MageVFX.ts`, `src/vfx/ImpactVFX.ts`,
`src/vfx/VFXTypes.ts`, `src/vfx/MageVFXResources.ts`
Página de teste: `maga-teste.html` (servida pelo `npm run dev`)

## Problema

O ataque básico usava o mesmo desenho dos feitiços grandes: um orbe de `0.42 m`
com halo de `1.43 m`, rastro de `1.3 m`, flash de impacto de `1.8 m` e nuvens de
partículas com 2–8 m de diâmetro. O resultado era um "efeito grande" que não lia
como projétil e poluía a tela a cada tiro (o ataque básico é o ataque de spam da
Maga, disparado a cada ~0,7 s).

## O que mudou

1. **Formato de bala** (`projectile.shape: 'bullet'`, só no preset `basic`).
   Primeira versão: ponta cônica + corpo + cone de choque em malhas 3D.
   **Versão final (a que vale)**: um único sprite de cometa desenhado em shader
   (`createFrostBulletMaterial`) — dardo com borda viva e "V" interno, seda
   ondulando atrás, partículas de gelo presas ao rastro e aura suave. O sprite é
   um *stretched billboard*: fica de frente para a câmera e gira dentro do plano
   da tela para apontar no sentido do voo projetado, então aparece igual às
   referências de qualquer ângulo. O orbe, o shard de gelo e o núcleo de lava
   ficam escondidos nesse formato — os outros feitiços seguem com o visual antigo.
2. **Tamanhos menores**: raio `0.42 → 0.19`, halo `raio × 2.3` (`0.44 m`),
   rastro `1.3 → 0.85 m` / `0.08 → 0.05 m`, impacto `0.75 → 0.42 m`
   (onda `1.35 → 0.85 m`), carga na mão `1 → 0.45`, flash de saída `0.35 → 0.22`.
3. **Efeito azul ao redor**: azul `0x3fa6ff` como cor de aura, `0x1c63e8` no
   cone de choque, núcleo branco-gelo e luz temporária mais fraca e curta.
4. **Fumaça de gelo**: `PooledParticleCloud` ganhou `add()` (cauda contínua, em
   vez de substituir o puff a cada quadro), faixa de `size`, `opacity` explícita,
   `growth` (puff que cresce) e escolha de blending. A fumaça vive no **scene**,
   não dentro do projétil, então ela fica para trás enquanto a bala voa. Com o
   sprite assumindo a cauda, ela virou névoa fina atrás do cometa (0 na contagem
   desliga). No impacto a mesma névoa dá um puff curto.
5. **Escala de partículas corrigida**: no shader do jogo `1 unidade ≈ 0,21 m`
   na tela; as partículas do básico usam `0.8–4 u` (0,17–0,86 m) em vez dos
   `10–36 u` (2–8 m) dos feitiços grandes.

## Como o desenho é validado sem navegador

`tools/preview-frost-bullet.mjs` reimplementa a MESMA matemática do fragment
shader em JS, rasteriza o sprite e grava um PNG (`node
tools/preview-frost-bullet.mjs artifacts/frost-bullet-sprite.png 760 190`). É
assim que o dardo, a seda e as partículas foram ajustados até ficarem iguais às
referências de cometa de gelo. O script aceita `MASK=head,sparks` para isolar
cada termo do desenho e achar o que está engordando o rastro.

**Regra:** mudou o desenho no shader, mude o mesmo número no preview (e vice-versa).

## Como ajustar

`maga-teste.html` roda o `MageVFX` de verdade com o preset `basic` do jogo, com
sliders para raio, velocidade, halo, cometa (largura/comprimento/dardo/brilho/
seda/gelo solto/aura), fumaça, impacto e carga, além de:
"Disparar agora", auto-disparo, câmera lenta, "Padrão do jogo",
"Copiar ajustes" e "Aplicar JSON colado". O botão **Ver de lado** põe a câmera na
altura do voo (o enquadramento da referência) e **Ver do jogo** volta para a
câmera atrás da Maga. O painel mostra as medidas em metros e compara o cometa com
a altura da Maga (1,8 m), para decidir tamanho sem adivinhar.

## Verificação

- `npm run typecheck` limpo.
- `npx vitest run` → 1066 testes passando (`src/ui/LobbyScreen.test.ts`
  já falhava antes desta mudança, sem relação com VFX).
- `src/vfx/MageBasicBullet.test.ts` novo, cobrindo: preset pequeno/azul, sprite
  do cometa no lugar do orbe antigo, posição da ponta no ponto de colisão,
  billboard (face na câmera + eixo no voo) inclusive voando para dentro da
  câmera, halo < 0,5 m, cauda de gelo no espaço de mundo, descarte no `clear()`
  e o comportamento de `add()`/`emit()` das partículas.
