# Combo de skills rápido + efeitos visuais exclusivos por skill — Design

## Pedido do usuário (2 de outubro de 2026)

1. Os combos precisam ser mais rápidos; a parte verde precisa ser menor (está
   fácil demais acertar) ou o cursor precisa ser mais rápido.
2. O cursor que passa dentro da barra deve ir e voltar, mais rápido, e o
   jogador precisa acertar o verde.
3. Assim que o primeiro combo acerta, a skill fica mais rápida e o dano de cada
   skill dobra.
4. Nenhuma skill, depois do primeiro combo acertado, pode chegar até o fim: um
   pouco antes de terminar já emenda na próxima skill (mesmo antes da animação
   acabar).
5. A imunidade começa a partir da primeira skill. Se o combo falhar, restam
   apenas 0.2 s de imunidade. Se todos os combos forem acertados, a imunidade
   vale até o final do combo e mais 0.8 s após o término.
6. O efeito das skills 1 e 2 do Guerreiro estava aparecendo nas skills 1 e 2 da
   Maga. Cada skill precisa ter o seu próprio efeito visual, vinculado a ela,
   sem interferir na outra. Um efeito existente pode servir de BASE/exemplo para
   um efeito novo, mas nunca ser reaproveitado pela outra skill.

## Onde cada regra vive

| Regra | Arquivo |
| --- | --- |
| Cursor ida-e-volta, verde menor, janela mais curta | `src/combat/SkillComboController.ts` |
| Skill mais rápida e dano dobrado após o 1º link | `src/combat/ComboEmpowerment.ts` |
| Imunidade do combo (0.2 s na falha / fim + 0.8 s no completo) | `src/combat/ComboImmunity.ts` |
| Aceleração do clipe e imunidade no corpo do personagem | `src/entities/Player.ts` |
| Ligação de tudo no loop e no dano | `src/core/Game.ts` |
| Vínculo exclusivo skill → efeito visual | `src/vfx/SkillVisualBindings.ts` |
| Selo “RÁPIDO · DANO x2” e seta do cursor | `src/ui/ComboGauge.ts`, `src/styles/combo-gauge.css` |
| Clarão de gelo próprio do Giro Glacial | `src/vfx/WarriorSlashVFX.ts` |

## 1. Gauge mais rápida e menor

- `COMBO_SWEEP_SECONDS` agora é a duração de **uma passada** do cursor
  (0.55 s → 0.50 s → 0.45 s → 0.40 s conforme os links), e não mais a duração
  total da gauge. Antes a varredura inteira levava 1.7 s → 1.25 s.
- O cursor faz **ida e volta** (`comboCursorPosition` / `comboCursorDirection`,
  onda triangular). A gauge continua aberta por `windowSeconds` e o jogador tem
  de 2 a 4 oportunidades de acertar o mesmo verde, porém cada uma bem mais
  curta.
- `COMBO_GREEN_WIDTHS` encolheu de `0.20 / 0.15 / 0.11 / 0.08` para
  `0.15 / 0.12 / 0.10 / 0.08` da barra. Em tempo de clique isso significa
  ~83 ms no primeiro link e ~32 ms no quarto (medido com os clipes reais do
  `guerreiro_animado.glb`).
- `COMBO_END_MARGIN_SECONDS` subiu de 0.15 s para **0.35 s**: a gauge sempre se
  resolve 0.35 s antes do fim da animação, então a próxima skill emenda antes do
  clip terminar (pedido 4).
- `COMBO_MIN_GREEN_SECONDS` passou a ser o piso por passada (0.03 s) e foi
  adicionado o limite de alcançabilidade
  (`GREEN_REACH_WINDOW_RATIO = 0.75`): em animações muito curtas o verde é
  puxado para frente para que o cursor consiga cruzá-lo dentro da janela. Acertar
  o verde antes do último dano nunca corta dano — o Game já enfileira a próxima
  skill até o último hit sair (`queuedComboSkill` + `canChainSkill`).

## 2. Recompensa do combo (`ComboEmpowerment`)

- A partir do primeiro link verde o combo fica `empowered` enquanto estiver vivo
  (`SkillComboController.empowered`).
- Cada skill lançada nesse estado sai com `playbackScale = 1.3`
  (`COMBO_EMPOWER_PLAYBACK_MULTIPLIER`, teto de segurança 1.5) e com
  `damageMultiplier = 2`.
- O `Player` aplica a escala ao `effectiveTimeScale` do clipe, à duração usada
  pelo controlador de ataque e à recuperação de aterrissagem do Pulo Atacando;
  `getWarriorSkillComboTiming` e `getWarriorSkillTimingSeconds` usam a mesma
  escala, então a gauge e o efeito de impacto continuam sincronizados com a
  animação acelerada.
- O dano dobrado é gravado **por skill no instante do cast**
  (`Game.comboDamageBySkill`). Isso importa para a Maga: o projétil só resolve o
  dano no impacto, quando a próxima skill do combo já pode ter sido lançada.
- O resfriamento 2x mais lento das skills que participaram do link
  (`COMBO_COOLDOWN_MULTIPLIER`) foi preservado.

## 3. Imunidade do combo (`ComboImmunity`)

- Começa na **primeira skill** do combo (`onSkillCast`) e acompanha a animação
  em execução enquanto a gauge varre ou o link aguarda a próxima skill.
- Falhou (clicou fora do verde ou a janela fechou): restam **0.2 s**
  (`COMBO_IMMUNITY_FAIL_SECONDS`).
- Acertou todos os combos (`finished`, quando nenhuma outra skill pode seguir):
  cobre o resto da última skill **+ 0.8 s**
  (`COMBO_IMMUNITY_COMPLETE_TAIL_SECONDS`).
- O `Player` ganhou um canal próprio (`setComboInvulnerability` /
  `comboInvulnerabilityRemaining`) para não misturar com a invulnerabilidade de
  ação, do dash ou do teleporte. Morte, overlay aberto e reset de partida zeram
  o contador junto com o combo.

## 4. Efeitos visuais exclusivos por skill (`SkillVisualBindings`)

Tabela única `classe → skill → efeitos`, em três palcos (`cast`, `hit-window`,
`impact`). Cada entrada tem um `effectId` que já carrega o dono
(`paladin.ataque_giratorio_2.frost-spin-ring`), e o teste
`SkillVisualBindings.test.ts` falha se:

- algum `effectId` aparecer em outra skill, classe ou palco;
- uma skill da Maga usar um kind do kit do Guerreiro (ou o contrário);
- duas skills usarem o mesmo feitiço / o mesmo estilo de clarão.

Vínculos atuais:

| Skill | Guerreiro (paladin) | Maga (mage) |
| --- | --- | --- |
| 1 `ataque_giratorio` | anel de giro dourado + clarão branco/ciano | feitiço `water` |
| 2 `ataque_giratorio_2` | anel de giro glacial + clarão de gelo (novo, criado a partir do clarão base) | feitiço `ice` |
| 3 `pulo_atacando` | mergulho com tornado de chamas no impacto | feitiço `lightning` |
| 4 `triplo_ataque` | leque de chama por janela de dano + clarão de fogo | feitiço `laser` |
| 5 `corte_duplo` | leque de chama sombria + tempestade de arcos + clarão sombrio | feitiço `lava` |

O `Game` deixou de decidir efeitos por `if (id === ...)`: `playSkillCastEffects`,
`playSkillWindowEffect` e `playSkillImpactFlash` só executam o que a tabela
devolve para a classe em jogo. O `Player` também passou a pegar o feitiço da Maga
na mesma tabela (`getSkillMageSpellId`), que devolve `null` para o Guerreiro —
o mapa privado `MAGE_SPELL_BY_ATTACK_ID` foi removido. Assim o efeito do
Guerreiro 1/2 não aparece mais na Maga 1/2, e nenhum efeito da Maga pode sair no
Guerreiro.

Quando uma skill nova precisar de efeito, a receita é: copiar um efeito existente
como BASE, criar um `kind`/parâmetros próprios e registrar um `effectId` novo na
tabela. Reaproveitar o mesmo registro em outra skill quebra o teste.

## Verificação

- `npm run typecheck` limpo.
- `npm test`: 1058 testes passando; a única falha é
  `src/ui/LobbyScreen.test.ts > blocks Iniciar partida…`, que já falhava antes
  desta mudança (baseline confirmado).
- `npm run build` conclui o bundle de produção.
- Testes novos: `ComboEmpowerment.test.ts`, `ComboImmunity.test.ts`,
  `SkillVisualBindings.test.ts`, `GameSkillVFXContract.test.ts`, além dos casos
  de aceleração/imunidade em `PlayerCombo.integration.test.ts` e da gauge
  ida-e-volta em `SkillComboController.test.ts` / `ComboGauge.test.ts`.
