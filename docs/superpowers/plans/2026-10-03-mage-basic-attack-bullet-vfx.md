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
2. **Tamanhos** (pedido do usuário: "o projétil está pequeno demais"):
   - cometa **2,74 m × 0,91 m** (raio `0.38`, `lengthScale 7.2`, `widthScale 2.4`
     — mesma arte da referência, só maior: ~1,5× a altura da Maga);
   - halo `raio × 2.3` = `0,87 m`; flash de saída `0.3`; carga na mão `0.58`.
   Antes o efeito era um orb de 0,42 m com halo de 1,43 m — redondo e curto demais.
3. **Impacto em camadas** (pedido: "o impacto precisa melhorar muito"):
   raio `1,05 m` (flash da explosão ≈ 3,6 m), **duas ondas no chão**
   (`2,25 m` + eco de `3,65 m`), **onda vertical de gelo** encarando a origem do
   tiro, `54` partículas, `18` estilhaços de gelo, névoa de gelo que fica,
   luz `1.15` e tremor `0,034`. Duração `0,78 s` (era `0,45 s`).
4. **Efeito azul ao redor**: azul claro `0x6fd6ff` na aura/seda, azul profundo
   `0x1f6bff` na cauda e branco `0xf6fcff` no miolo do dardo e no gelo solto.
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

## Nota de diagnóstico (03/10, mais tarde)

O usuário respondeu "não mudou nada" depois do commit `18dd627`. O servidor
estava servindo o código novo (conferido por `curl` em `/src/vfx/VFXConfig.ts`),
mas o proxy do preview segurava a página antiga no navegador. Medidas tomadas:

- `vite.config.ts`: o dev server agora manda `Cache-Control: no-store` em tudo
  (antes só o bloco de `preview` mandava);
- `maga-teste.html`: selo `FX v3` no cabeçalho mostrando os números **vivos** do
  preset + vigia que recarrega a página sozinho quando `/src/vfx/VFXConfig.ts`
  muda (o HMR do Vite não sobrevive ao proxy do preview);
- `Game.ts`: log no console com o tamanho real do cometa ao escolher a Maga;
- o preset `basic` subiu de novo (raio `0.3` → `0.38`, impacto `0.95` → `1.05`).

Medição na câmera de jogo (1600×900, FOV 60): a Maga de 1,8 m ocupa 224 px de
altura e o cometa chega a 441 px; o flash do impacto, a 304 px.

## Terceira rodada (03/10, noite) — comportamento do básico

- **Conjuração só com brilho**: `basic.charge.particleCount = 0` e
  `charge.sparkCount = 0` (o efeito de carga desliga as duas nuvens; as outras
  magias mantêm as suas). O clarão da mão continua sendo o próprio brilho.
- **Impacto só quando acerta inimigo**: o tiro que chega ao fim da vida ou do
  alcance sem topar ninguém não explode — ele se dissolve em 0,4 s
  (`beginFade`/`updateFade` no `ProjectileManager`), sem clarão, sem tremor,
  sem som e sem dano. O impacto em camadas fica reservado ao acerto.
- **Dano em área de 2 m**: `MAGE_BASIC_SPLASH_RADIUS_METERS = 2` e
  `MAGE_BASIC_SPLASH_DAMAGE_MULTIPLIER = 0.6` em `MageSkillImpact.ts`. O
  `Game.applyMageBasicSplashDamage` roda depois do dano cheio no alvo e
  queima os vizinhos dentro de 2 m do ponto de impacto (o alvo fica de fora),
  incluindo o boneco de treino.
- Laboratório: sliders **22** (poeira girando) e **23** (faíscas) da carga,
  para ligar de volta e comparar; selo subiu para **FX v4**.

## Quarta rodada (03/10, noite) — a conjuração que ficava na mão

O usuário mandou um print com dois círculos: o borrão na mão da Maga e o
brilho redondo em volta do projétil. Reclamação: "ao atacar e mover esse efeito
continua parado por alguns segundos; essa conjuração precisa ser milésimos de
segundos e sumir, não pode ficar ao andar".

Três causas encontradas:

1. **Carga presa na mão.** O clip `ataque basico` da Maga tem **1,8 s**. Com
   `chargeStart 0.12` o brilho acendia em 0,22 s e só saía em `launch 0.36`
   (0,65 s) — quase meio segundo de borrão na mão a cada tiro. Pior: quando o
   ataque é reiniciado no meio (andar + atacar de novo), a timeline do cast
   antigo zera o `fired` e **recria a carga**, mas o `launch` dele já tinha
   acontecido (`cast.launched = true`) — a carga ficava pendurada para sempre.
   Correções: `startCharge` ignora cast já lançado, o `update` libera a carga de
   qualquer cast lançado, e a janela virou `chargeStart 0.30 -> launch 0.36`
   (~0,1 s de brilho na mão, com rampa arcana de 9/s para acender de imediato).
2. **Clarão de saída parado no ar.** O "muzzle flash" era um `ImpactVFX`
   completo no ponto do disparo, com a duração do impacto (0,78 s) + fumaça:
   a Maga andava e o clarão continuava brilhando no chão. Na bala ele foi
   removido — o brilho da conjuração já anuncia o tiro.
3. **Bola branca no projétil.** O sprite de aura (`haloScale 2.3` = 0,87 m,
   opacidade 0.7, `depthTest: false`) cobria o cometa. Ficou em `haloScale 1.2`
   (0,46 m) e opacidade 0.42 — o dardo é do próprio sprite do cometa.

Laboratório: sliders **24** (quando a conjuração acende) e **25** (quando o tiro
sai), com o tempo de brilho na mão em ms no painel; selo **FX v5**.

## Quinta rodada (03/10, madrugada) — o impacto virou o da referência

O usuário reclamou que o impacto estava **feio** e ainda com **"aquele formato
que disse que não queria"** (o círculo de neon do `createMagicCircleMaterial`)
e mandou de novo a imagem de referência, agora pedindo para recriá-la **no
ataque base**.

O que entrou:

- **`src/vfx/ImpactRingTexture.ts`** (novo): a textura do anel da referência em
  `DataTexture` (sem canvas, funciona nos testes). Anel fino branco-quente com
  leve irregularidade (senoides de 5 e 11 ciclos), névoa azul irregular,
  **48 setores** de raios em cunha cruzando para dentro e para fora (uns poucos
  "heróis" 2,6× mais longos e mais brilhantes), pontas puxando para o azul
  profundo e **miolo vazio** (`smoothstep(0.17, 0.34, r)`), com a chegada dos
  raios limitada antes da borda do sprite. Uma textura só, compartilhada por
  todos os impactos do pool (nunca é descartada).
- **`ImpactVFX`**: o anel vertical de neon (`MageImpactVerticalBlastRing`) foi
  **removido**; no lugar entrou o sprite `MageImpactReferenceRing` — uma
  **billboard**, então o desenho encara a câmera em qualquer ângulo de jogo.
  Ele nasce em `shockwaveRadius × ringScale` (o anel desenhado ocupa 58% do
  quad) e abre até ~2,2× isso nos primeiros **40%** do impacto, girando devagar
  enquanto some.
- **Miolo curto**: no impacto da bala, núcleo, flash e explosão caem para ~1/2
  do tamanho e apagam em 30% da vida (`hotFade`) — quem desenha o impacto é o
  anel, com o buraco escuro no meio, como na referência. As ondas do chão
  baixaram para 0,42 / 0,30 de opacidade para não competir com o anel.
- **`impact.ringScale`** (novo, opcional, padrão 1) em `MageImpactConfig`, com
  slider **26** no laboratório (multiplicador do anel) e o tamanho do anel
  (diâmetro inicial e final) no painel.
- **Ferramenta**: `tools/preview-impact-ring.mjs` gera o PNG do anel sem
  navegador (`node tools/preview-impact-ring.mjs artifacts/impact-ring.png`),
  com a mesma matemática da textura — mudou numa, muda na outra.
- **Ferramenta**: `tools/shot-lab.mjs` dirige o laboratório quadro a quadro
  (relógio e `requestAnimationFrame` falsos, 1/60 s por passo) e grava PNGs do
  impacto — foi assim que o desenho foi conferido sem depender da tela do
  usuário. Precisa de `npm i --no-save puppeteer @sparticuz/chromium`.
- Testes: `src/vfx/ImpactRingTexture.test.ts` (miolo vazio, anel aceso, raios
  com ponta azulada, determinismo) e as asserções do impacto passaram a medir o
  anel no lugar do núcleo. Selo do laboratório: **FX v6**.

## Sexta rodada (03/10) — um impacto só, menor e mais perto da imagem

O usuário viu **dois impactos** no mesmo acerto e pediu para deixar só o novo,
**diminuir um pouco** e **melhorar** para ficar mais parecido com a imagem.

- **Um efeito só**: `ImpactVFX` ganhou o `legacyExplosion = !bulletImpact`. No
  ataque básico o núcleo branco, o flash, a explosão em sprite, a onda no chão
  **e a partícula/poeira** ficam desligados — sobra o anel da referência mais os
  estilhaços de gelo. Nas outras magias nada mudou. A segunda onda
  (`MageImpactOuterShockwave`) saiu de vez, porque só a bala a usava.
- **Menor**: `impact.ringScale` foi para **0,68** e o crescimento caiu para
  **1,7×** (o anel desenhado ocupa 58% do sprite). O anel final fica em torno de
  1,8 m de diâmetro — do tamanho da área de dano de 2 m.
- **Mais parecido com a imagem**: raios em três faixas (curtos, médios e uns
  poucos bem compridos), mais finos onde nascem, queda mais suave no
  comprimento (`span^2.1`) e halo azul maior/mais presente.
- **Dura mais**: o anel fica aceso quase até o fim do impacto (a queda só no
  último terço, `(1 - p^2.2)`) e some em 70% da vida, em vez de apagar em 40%.
- Laboratório: selo **FX v7**, painel avisa que o impacto é um efeito só e o
  diâmetro do anel considera o novo crescimento (1,7×).
