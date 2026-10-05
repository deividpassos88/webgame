# Dragão das Marés — refinamento visual e revisão da queda

Data: **2026-10-04**. Esta revisão substitui a avaliação visual da entrega anterior, que foi rejeitada pelo usuário.

## Pedido e referências

Nesta rodada, a **imagem 1 é a referência do impacto**, a **imagem 2 é a conjuração Mizuchi**, e as imagens 3/4 mostram o resultado rejeitado. Os problemas destacados foram a espiral vazada e, principalmente, a água parecendo subir ao atingir o inimigo.

Escopo desta revisão: **skill 1 da Maga**. O ataque básico continua na velocidade original **1×**, conforme a correção anterior. Não houve novo rebalanceamento de dano, custos, cooldowns, lentidão, outras skills ou Guerreiro.

## O que mudou

### Conjuração

- Espiral de 1,82 voltas, com uma volta inferior densa e pescoço elevado; faixas largas e inclinadas para manter superfície visível pela câmera elevada do jogo.
- Duas camadas inferiores largas substituem os sete aros finos. Cabeça alongada e aletas baixas, voltadas para trás.
- Nova textura local de água, com massas azuis, cristas ciano/brancas e bordas afiladas. As primeiras tentativas só com ruído procedural foram rejeitadas durante a revisão porque pareciam faixas de neon ou plástico.
- A textura é compartilhada por todos os efeitos reutilizados, com mipmaps e anisotropia para evitar cintilação das cristas à distância. Procedência e preparação em `public/vfx/mage/water-flow-refined.SOURCE.md`.
- Contorno luminoso local, sem adicionar bloom global nem alterar a iluminação das outras skills.

### Queda, contato e dissipação

A causa da leitura de subida era a combinação de **splash crescendo também em Y**, coluna apagando cedo e camadas com convenções de fluxo diferentes.

Agora:

1. A coluna parte do alto e desce até o chão em **0,22 s**.
2. Núcleo, espuma, deformação e lâminas externas têm fluxo descendente. Em todas as geometrias da coluna, UV.y=0 significa chão e UV.y=1 significa céu; não há tempo negativo nas lâminas externas.
3. O núcleo fica preenchido e forte durante o espalhamento. Sua opacidade só começa a cair após 0,71 s de impacto.
4. A partir do contato, os respingos aumentam **somente a extensão XZ**, enquanto a escala Y diminui de 1 para 0,14. Não há crescimento uniforme de uma coroa/cúpula.
5. Arcos largos e quebrados permanecem próximos ao chão. Gotas externas descem pela coluna em um único desenho instanciado.
6. No término, a parte superior da coluna baixa até o chão: `topCut` diminui entre 0,55 e 0,85 s após o contato. A água não se retrai para cima.

A coluna acompanha o inimigo durante a queda e fixa o respingo no ponto de pouso. O callback de dano continua único, no contato. Sem alvo marcado, a queda mantém a consulta vertical no ponto à frente da Maga, sem acrescentar dano em área.

## Rodadas de execução e crítica

| Etapa | Crítica | Decisão |
| --- | --- | --- |
| Baseline | Espiral em fios, espaços vazios e splash que crescia em altura enquanto a coluna sumia. | Redesenhar volumes e separar o movimento vertical do espalhamento horizontal. |
| Massa/fluxo | Movimento corrigido, mas branco em faixas paralelas demais; aletas pareciam orelhas. | Fragmentar highlights, reduzir aletas, diminuir rotação. |
| Bordas procedurais | Recortes mais visíveis, porém angulosos e ainda com aspecto de plástico. | Substituir o desenho principal da água por textura pintada e animada. |
| Textura | Cristas mais orgânicas, mas o núcleo da coluna tinha transparência excessiva e detalhes cruzados curtos. | Preencher o núcleo e alongar os veios verticais; preservar recortes apenas nas lâminas externas. |
| Contato | Uma película radial de teste parecia um tapete geométrico. | Descartar a película; manter os jatos baixos e alargar os arcos próximos ao chão. |
| Validação final | Conferir a queda, primeiro contato, persistência e término no jogo, não apenas um frame isolado. | Capturas sequenciais no `Game` real e no build de produção; testes de regressão do movimento. |

Implementação e crítica foram etapas da mesma sessão, **não agentes independentes**. O resultado é uma reconstrução 3D orientada pelas referências, **não uma cópia pixel a pixel ou aprovação de “100%/AAA”**. A silhueta exata da cabeça, a distribuição das cristas e a projeção da espiral ainda diferem das imagens; a câmera do jogo também muda sua leitura. A correção funcional da queda não deve ser confundida com equivalência artística absoluta.

## Validação executada

### Testes e build

- `npm run build`: **passou**, incluindo TypeScript; 164 módulos no build Vite.
- Testes direcionados: **158 passaram em 12 arquivos**, incluindo dez casos novos do contrato de movimento e dois novos casos de integração/pooling/textura.
- Última execução da suíte completa: **1.161 passaram e 1 falhou**, em `src/ui/LobbyScreen.test.ts:626`. É a falha preexistente do aviso ao clicar num botão nativamente desabilitado; não foi alterada para tornar a suíte verde.
- O build mantém o aviso de bundle do jogo acima de 500 kB. Não foi feita refatoração de carregamento fora do escopo.

As regressões verificam descida monotônica, contato no chão, expansão XZ com redução de Y, persistência da coluna, escoamento superior descendente, UVs consistentes, sinal de fluxo, reset do efeito reutilizado e propriedade compartilhada da textura. Os testes anteriores de alvo morto/ausente, saturação, callback único/reentrante, limpeza e classes foram preservados.

### Game real / WebGL

Foram usados os modelos reais da Maga e do inimigo, o loop de `Game.ts` e a câmera padrão de gameplay — **não apenas a cena isolada de revisão**. A instrumentação do browser intercepta a resposta de bootstrap durante o teste; não foi acrescentado hook de depuração ao código do jogo.

- Alvo marcado: **50 → 45 HP**, uma única vez.
- Sem alvo marcado, com inimigo sob o ponto de queda: **45 → 43 HP**, uma única vez, respeitando o redutor de distância existente.
- Efeitos de água ativos retornaram a zero após a dissipação; os objetos ficaram disponíveis para reúso.
- Básico real: clip `mage:attack:ataque_basico`, duração `1.7999999523 s`, taxa **1**, tempo `0.5 s` após meio segundo, ataque ainda ativo.
- Sem erros de JavaScript ou compilação de shader detectados. A fonte externa Cinzel falhou no sandbox (`net::ERR_CONNECTION_CLOSED`); foi usado fallback. Requisições de preload não utilizadas também foram canceladas.
- Houve aviso de frame longo na preparação do browser de teste. A inspeção usa tempo fixo e captura quadros selecionados: **não é benchmark de FPS nem validação de performance em todos os dispositivos**.

Amostras do build de produção, em segundos após iniciar o cast:

| Tempo | Base da coluna Y | HP do alvo | Escala XZ do splash | Escala Y do splash |
| --- | ---: | ---: | ---: | ---: |
| 0,89 | 6,753 | 50 | oculto | oculto |
| 0,97 | 3,085 | 50 | oculto | oculto |
| 1,04 | 0,692 | 50 | oculto | oculto |
| 1,08 — primeiro contato amostrado | 0 | 45 | 0,820 | 1,000 |
| 1,22 | 0 | 45 | 1,079 | 0,504 |
| 1,40 | 0 | 45 | 1,200 | 0,140 |
| 1,60 | 0 | 45 | 1,200 | 0,140 |
| 1,99 | efeito encerrado | 45 | — | — |

## Arquivos e reprodução

- `src/vfx/water/WaterDragonGeometry.ts`: espiral, cabeça, coluna, lâminas e arcos baixos.
- `src/vfx/water/WaterDragonMaterials.ts`: textura, cristas, deformação e fluxo descendente.
- `src/vfx/water/WaterDragonMotion.ts`: contrato temporal de queda → contato → espalhamento e escoamento.
- `src/vfx/water/WaterDragonVFX.ts`: composição e animação dos objetos, pooling, luzes e callback.
- `src/vfx/water/WaterDragonMotion.test.ts` / `WaterDragonVFX.test.ts`: regressões novas e anteriores.
- `public/vfx/mage/water-flow-refined.png`: única textura nova de produção.

Artefatos locais ignorados pelo Git:

- `artifacts/water-final/`: cena isolada com os modelos reais; a vista chamada `game` aqui é somente uma aproximação da câmera.
- `artifacts/water-game-final/`: capturas do `Game` em desenvolvimento.
- `artifacts/water-production/`: capturas, sequência em câmera lenta e `review.json` do build final no `Game` real.
- `artifacts/review-game.cjs`: captura e assertions do alvo marcado, sem alvo, limpeza e básico 1×. Usar `PRODUCTION=1` com preview em 5175; sem essa variável usa dev em 5174.
- `artifacts/targeted-tests-final.log`, `full-tests-final.log`, `build.log`, `production-review.log`: resultados desta rodada.

O GIF é um recorte dos quadros reais com pausas para revisar o contato; não representa a cadência de renderização do jogo. As capturas completas ficam no mesmo diretório. Limites de pooling continuam em quatro conjurações e seis colunas, com fila lógica para não antecipar nem descartar dano durante saturação.
