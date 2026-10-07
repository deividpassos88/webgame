# Menu de Configurações do jogador

A engrenagem do lobby (`arena-settings`) e o botão **AJUSTES** da doca do HUD abrem
o mesmo painel. Antes a engrenagem era decorativa: existia no HTML, tinha hover no
CSS e nenhum handler no TypeScript.

## Como abrir

| Onde | Elemento |
| --- | --- |
| Lobby (canto superior direito) | `button.arena-settings[data-open-settings]` |
| Partida (doca de utilitários) | `button.hud-utility-button[data-open-settings]` |

Fecha com **Esc**, com o ✕ do cabeçalho, com o botão **Pronto** ou clicando fora.

## Opções

| Ajuste | O que muda de verdade |
| --- | --- |
| **Qualidade gráfica** (Alta / Média / Baixa) | Teto do `devicePixelRatio` do WebGL (2 / 1,5 / 1) e sombras dinâmicas (ligadas nas duas primeiras, desligadas em Baixa) |
| **Mostrar FPS** | Contador no canto superior direito, alimentado pelos dois loops (lobby e partida) |
| **Números de dano** | Texto flutuante de dano/cura; o contador de HITS do combo continua contando |
| **Sensibilidade do giro** (0,5x – 2x) | Multiplicador do arrasto que gira a prévia 3D do herói no lobby |
| **Restaurar padrões** | Volta Alta + FPS off + dano on + 1,00x |

Atalhos de teclado e ataque básico automático continuam na aba de hotkeys do lobby.

## Onde ficam salvos

No próprio perfil (`localStorage`, chave `dragon-miner.profile.v1`), no bloco
`settings`. O schema subiu de **11 para 12**: um save antigo é migrado na leitura
(`isVersionElevenProfile` → `migrateVersionElevenProfile`) e recebe os padrões, sem
perder progresso. A validação de `settings` é estrita (`isPlayerSettings`), então
um save corrompido cai na recuperação normal do perfil.

## Arquitetura

```
profile/PlayerSettings.ts   tipos, padrões, normalização e perfis gráficos (puro)
ui/SettingsPanel.ts         painel (DOM + eventos), recebe/devolve o objeto inteiro
ui/FpsBadge.ts              contador de FPS (janela de 30 quadros, 400 ms)
ui/SettingsMenuContract.test.ts  contrato da ligação (HTML + Game + Lobby)
core/Game.ts                dono do perfil: aplica no renderer, persiste, liga botões
ui/LobbyScreen.ts           sensibilidade do arrasto + amostra de FPS do lobby
```

O painel não guarda estado: quem persiste é o `Game`, que também aplica os efeitos
(`renderer.setPixelRatio`, `shadowMap.enabled`, badge de FPS) e repassa a amostra de
quadro para o lobby pelo callback `onFrameSample`.

## Verificação

```
npm run typecheck    → limpo
npm test             → 183 arquivos · 1.223 testes · 0 falhas
npm run build:admin  → dist/ com o painel (CSS em assets/index-*.css)
```
