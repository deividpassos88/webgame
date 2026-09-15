# Quinze Ondas, Skills Progressivas e HUD de Vidro Compacto

## Status

**Aprovado para execução.** O jogador autorizou a execução contínua e solicitou que a progressão, a disposição do HUD e o desbloqueio de skills sejam ajustados sem novas perguntas.

## Contrato de design

- **Mundo:** Fortaleza de Cinzafogo, um action-RPG WebGL de desktop com um Guerreiro enfrentando quinze ondas antes do boss final.
- **Público:** jogadores no teclado e mouse que precisam abrir o inventário ou distribuir pontos sem esconder a arena.
- **Trabalho único da interface:** abrir a informação do personagem durante a luta.
- **Paleta:** Obsidian `#0B1220`, Vidro de Aço `#16243B`, Ouro de Forja `#D6A83A`, Mana `#7DD3FC`, Vida `#EF4444`, XP `#FACC15`.
- **Tipografia:** display serif já usada pelo jogo, texto de interface legível e números monoespaçados para porcentagens e XP.
- **Tese estrutural:** retrato e dois utilitários ficam em uma coluna no canto esquerdo; uma janela curta de vidro nasce abaixo deles; as três barras ficam no rodapé sem ocupar a área de combate.
- **Assinatura:** a coluna de utilidades parece conectada fisicamente à janela de vidro por uma linha dourada de energia, mas sem animação essencial.
- **Risco visual:** o painel é mais compacto que o anterior; a contrapartida é mostrar somente o modo solicitado (Mochila, Status ou Equipamento) em vez de três painéis concorrentes.
- **Sistema de ícones:** os PNGs nativos `public/assets/ui/backpack-icon.png` e `public/assets/ui/status-icon.png`, com ícones SVG já existentes para linhas internas.
- **Direção/revisão e execução:** assumidas pelo agente principal como fallback local, pois o usuário pediu explicitamente para não usar Astra.

### Critique ledger

| Padrão pedido | Decisão | Motivo |
| --- | --- | --- |
| Retrato no círculo azul do canto | Aceito, revisado | Mostra uma captura enquadrada no rosto, não mais no torso. |
| Mochila e Status em quadrados separados | Aceito | Dá acesso explícito aos dois sistemas sem um painel persistente. |
| Painel grande preto | Revisado | Vira uma superfície curta de vidro translúcido com borda dourada e tipografia menor. |
| Vida/Mana/XP com valores numéricos | Rejeitado | Mostra apenas porcentagens, conforme pedido, para uma leitura mais rápida. |
| Habilidades disponíveis desde o começo | Rejeitado | Ataque básico começa livre; as cinco skills são liberadas por nível. |

## Curva da campanha

Há quinze ondas regulares, cada uma com 25 inimigos normais e dois mini-bosses. A luta final continua sendo um boss com quatro aliados que podem reaparecer, por isso somente o boss dá XP uma vez e os aliados do boss não dão XP.

| Fase | Normal | Mini-boss | Total por onda | Intenção |
| --- | ---: | ---: | ---: | --- |
| Ondas 1–8 | 4 XP | 30 XP | 160 XP | Níveis iniciais curtos e construção da build. |
| Ondas 9–15 | 16 XP | 65 XP | 530 XP | Inimigos mais valiosos, mas o próximo nível exige muito mais XP. |
| Boss final | — | — | 10 XP | Fecha exatamente a progressão do capítulo uma única vez. |

O custo do próximo nível cresce de forma linear: no nível `L`, são necessários `40 + 20 × L` XP para o próximo. Portanto o primeiro nível pede 60 XP, o nível 9 pede 220 XP e o nível 20 pede 440 XP. O caminho obrigatório inteiro entrega exatamente 5.000 XP: nível 21 e 100 pontos de atributo (5 por nível), preservando o teto de build anteriormente aprovado. Antes da onda 9, o jogador chega ao nível 10; depois dela os custos passam a crescer e reduzem o ritmo de nível.

## Skills

O ataque básico permanece disponível no nível 1. Cada level seguinte libera uma das cinco skills, na ordem real da barra: Ataque Giratório, Giro Glacial, Pulo Atacando, Golpe Flamejante e Corte Duplo. Todas estão liberadas até o nível 6 — muito antes da onda 12 exigida pelo jogador. O bônus de dano é aplicado à skill antes da queda de dano por distância:

| Ordem de liberação | Nível | Skill | Bônus de dano |
| ---: | ---: | --- | ---: |
| 1 | 2 | Ataque Giratório | +10% |
| 2 | 3 | Giro Glacial | +14% |
| 3 | 4 | Pulo Atacando | +18% |
| 4 | 5 | Golpe Flamejante | +22% |
| 5 | 6 | Corte Duplo | +26% |

Skills bloqueadas continuam visíveis na barra, mostram o nível necessário e não podem ser usadas por botão nem teclado.

## Correção dos pontos de Status

`InventoryOverlay` recebe uma referência ao perfil. O bug vinha de `Game` substituir essa referência quando concedia XP; a janela permanecia com o perfil anterior. A atualização deve copiar o novo conteúdo para o objeto existente, preservar a referência e sincronizar HUD, persistência e atributos na mesma transação.

## Acessibilidade e plataforma

- Desktop WebGL é a única plataforma suportada. Em largura estreita, o HUD apenas evita overflow horizontal; isso não anuncia suporte mobile.
- Botões continuam ter nomes acessíveis, foco visível, ordem tabular previsível e Escape fecha a janela.
- `prefers-reduced-motion: reduce` remove transições não essenciais das janelas e botões.
- A aceitação visual exige capturas renderizadas em desktop e viewport estreito, percurso sem mouse e teste de redução de movimento ativo.

