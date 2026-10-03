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

1. **Formato de bala** (`projectile.shape: 'bullet'`, só no preset `basic`):
   cone de ponta (`MageBulletNose`), corpo cilíndrico (`MageBulletBody`), ponta
   branca (`MageProjectileCore`) e cone de choque oco azul atrás
   (`MageBulletShockCone`). O orbe, o shard de gelo e o núcleo de lava ficam
   escondidos nesse formato — os outros feitiços continuam com o visual antigo.
2. **Tamanhos menores**: raio `0.42 → 0.19`, halo `raio × 2.3` (`0.44 m`),
   rastro `1.3 → 0.85 m` / `0.08 → 0.05 m`, impacto `0.75 → 0.42 m`
   (onda `1.35 → 0.85 m`), carga na mão `1 → 0.45`, flash de saída `0.35 → 0.22`.
3. **Efeito azul ao redor**: azul `0x3fa6ff` como cor de aura, `0x1c63e8` no
   cone de choque, núcleo branco-gelo e luz temporária mais fraca e curta.
4. **Fumaça de gelo**: `PooledParticleCloud` ganhou `add()` (cauda contínua, em
   vez de substituir o puff a cada quadro), faixa de `size`, `opacity` explícita,
   `growth` (puff que cresce) e escolha de blending. A fumaça vive no **scene**,
   não dentro do projétil, então ela fica para trás enquanto a bala voa. No
   impacto a mesma névoa dá um puff curto.
5. **Escala de partículas corrigida**: no shader do jogo `1 unidade ≈ 0,21 m`
   na tela; as partículas do básico usam `0.8–4 u` (0,17–0,86 m) em vez dos
   `10–36 u` (2–8 m) dos feitiços grandes.

## Como ajustar

`maga-teste.html` roda o `MageVFX` de verdade com o preset `basic` do jogo, com
sliders para raio, velocidade, halo, fumaça, impacto e carga, além de:
"Disparar agora", auto-disparo, câmera lenta, "Padrão do jogo",
"Copiar ajustes" e "Aplicar JSON colado". O painel mostra as medidas em metros e
o diâmetro da aura comparado à altura da Maga (1,8 m), para decidir tamanho sem
adivinhar.

## Verificação

- `npm run typecheck` limpo.
- `npx vitest run` → 1066 testes passando (`src/ui/LobbyScreen.test.ts`
  já falhava antes desta mudança, sem relação com VFX).
- `src/vfx/MageBasicBullet.test.ts` novo, cobrindo: preset pequeno/azul,
  malhas da bala, halo < 0,5 m, cauda de gelo no espaço de mundo, descarte da
  cauda no `clear()` e o comportamento de `add()`/`emit()` das partículas.
