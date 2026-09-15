# CODEX HANDOFF

## Objetivo atual

Reconstruir o lobby **Salao do Guerreiro** para ficar muito proximo da referencia enviada pelo usuario: um lobby de fantasia sombria, com cabecalho ornamental, painel de equipamentos a esquerda, personagem 3D no centro e mochila a direita. A interface precisa continuar funcional e integrada ao jogo existente.

O ultimo pedido do usuario foi apenas criar este handoff antes da troca de agente. Nao foram feitas novas alteracoes grandes depois da reconstrucao visual do lobby.

## Onde o trabalho parou

O novo shell visual do lobby foi implementado e validado por tipo, testes unitarios direcionados e build do Vite. O servidor local Vite ja estava disponivel em `http://127.0.0.1:5174/`.

Ainda falta uma validacao visual manual no navegador, em especial contra a referencia do usuario, para ajustar proporcoes, espacamentos e possiveis sobreposicoes nas resolucoes que ele usa. Nao havia Playwright configurado no projeto para capturas automatizadas.

## Implementado nesta etapa: lobby

- Reestruturado visualmente o lobby em tres colunas:
  - equipamentos e status a esquerda;
  - personagem 3D e chamada principal ao centro;
  - inventario a direita.
- Cabecalho ornamentado com brasao, marca "Fortaleza de Cinzafogo", abas Heroi, Inventario, Skills e Oficina, alem de indicador de disciplina.
- Titulo central do personagem, faixa descritiva, frase decorativa, estandarte e plataforma runica sob o personagem.
- Equipamentos renderizados em molduras ornamentadas, mantendo os slots reais e os eventos ja existentes.
- Painel de inventario redesenhado com contador de capacidade, busca e filtro por todos/equipamentos/materiais.
- Aba Skills continua funcional: a aba alterna o painel direito entre inventario e skills sem remover a logica existente.
- Rodape redesenhado, preservando o status dinamico e o botao `INICIAR PARTIDA` real.
- Layout responsivo para faixas abaixo de 1180 px e 760 px.

## Implementado anteriormente: sistemas que devem ser preservados

### Inventario e equipamentos

- Equipar/desequipar foi ajustado para evitar duplicacao de itens na mochila.
- Itens de equipamento podem ser adicionados por painel de administrador e aparecem na mochila.
- Itens do set comum forjado possuem imagens para mochila e para os slots equipados.
- Bonus de conjunto foi adicionado ao completar as cinco pecas comuns e deve aparecer de forma destacada no status atual.
- O menu contextual de item inclui equipar/desequipar, aprimorar e destruir; o aviso pequeno amarelo "equipar" no icone do item foi removido no fluxo mais recente.
- A mochila, filtros, capacidade, eventos de clique e drag/drop existentes devem continuar funcionando.

### Oficina / ferreiro

- Sistema de craft de cinco pecas do conjunto comum:
  - Capacete, Peitoral, Calca, Luvas e Botas.
  - Cada receita requer cinco materiais, dez unidades de cada material.
  - Materiais possuem nomes e descricoes.
  - Receita diferencia material suficiente em verde e insuficiente em vermelho.
- Itens craftados vao para mochila e podem ser equipados/desequipados.
- A pagina da oficina possui apresentacao 3D do ferreiro:
  - `idle` enquanto o jogador escolhe/aguarda;
  - `working` por 15 segundos durante a forja, com particulas de brasa;
  - `delivery` no final, quando o item e entregue e a mochila e atualizada.
- O martelo do modelo fica invisivel exclusivamente na animacao `delivery`; permanece nas demais animacoes.
- Foi criado um fundo de bancada de forja para dar contexto ao ferreiro.
- A oficina ainda pode precisar de refinamento visual manual, principalmente apos a reorganizacao recente do lobby.

### Combate e qualidade de vida implementados anteriormente

- Monstro arqueiro carregado de `public/models/Monstros/fase 1-1/monster_arch.glb`.
- Monstro normal passou a usar `public/models/Monstros/fase 1-1/monstro_normal.glb`.
- Arqueiro possui comportamento de distancia, ataque com projeteis/trilha luminosa, alcance maior e dano menor que inimigos corpo a corpo.
- Foram feitos ajustes para assentar o arqueiro no chao.
- Fadiga impede uso de skill a 0% e exige recuperacao acima de 7% antes de liberar novas skills.
- Shift executa dash curto para esquiva.
- Foi adicionado atalho visual `Q Target` proximo das skills.
- Painel de administrador foi transformado em um botao circular arrastavel, com janela maior e transparencia ajustavel.

## Arquivos modificados nesta etapa

- `index.html`
  - Estrutura do lobby, cabecalho, abas com icones, palco do heroi, controles de busca/filtro de inventario e rodape.
  - IDs e atributos funcionais existentes foram preservados.
- `src/ui/LobbyScreen.ts`
  - Estado e eventos da busca/filtro de inventario.
  - Alternancia do painel direito entre inventario e skills pelo atributo `data-lobby-view`.
  - Sincronizacao de controles apos o inventario ser renderizado.
- `src/styles/lobby-reference.css`
  - Novo tema visual isolado do lobby, com grid de tres colunas, molduras, cabecalho, estagio central, inventario, rodape e responsividade.
- `src/ui/BlacksmithForgePresentation.ts`
  - Alteracoes anteriores relevantes ao ferreiro 3D: carregamento Draco, animacoes, particulas, entrega e ocultacao do martelo em `delivery`.
- `src/ui/BlacksmithScreen.ts`
  - Alteracoes anteriores para integracao da apresentacao 3D e do fluxo de craft.
- `Ligarserver.bat` e `Ligarserver-Admin-Incognito.bat`
  - Alterados/criados anteriormente para iniciar o servidor e abrir o navegador em modo anonimo, evitando duas paginas quando possivel.

## Arquivos criados nesta etapa

- `CODEX_HANDOFF.md` (este arquivo).
- `src/styles/lobby-reference.css`.
- `public/assets/ui/lobby/crest-warrior.svg`.
- `public/assets/ui/lobby/icon-hero.svg`.
- `public/assets/ui/lobby/icon-inventory.svg`.
- `public/assets/ui/lobby/icon-skills.svg`.
- `public/assets/ui/lobby/icon-workshop.svg`.
- `public/assets/ui/lobby/equipment-slot-frame.svg`.
- `public/assets/ui/lobby/character-platform.svg`.

## Assets criados anteriormente e relevantes

- `public/blacksmith/forge-bench-background.png`
  - Fundo raster gerado para a area de trabalho do ferreiro.
- `public/draco/draco_decoder.js`
- `public/draco/draco_decoder.wasm`
- `public/draco/draco_wasm_wrapper.js`
  - Necessarios porque o GLB novo do ferreiro usa compressao Draco.

## Decisoes importantes

- O arquivo `src/styles/lobby-reference.css` e carregado por ultimo no `index.html`, funcionando como uma camada de override visual sem refatorar todo o CSS legado.
- O palco central mantem fundo transparente em pontos estrategicos para nao esconder o canvas/WebGL do personagem e do cenario 3D ja existentes.
- Os identificadores DOM importantes nao foram trocados para evitar quebrar a logica existente. Entre eles:
  - `#lobby-equipment-slots`
  - `#lobby-current-status`
  - `#lobby-capacity`
  - `#lobby-backpack`
  - `#lobby-skills`
  - `#lobby-hotkeys`
  - `#start-game`
- As abas continuam usando os atributos `data-lobby-tab`; Oficina segue sua navegacao propria para o ferreiro.
- O filtro de inventario oculta itens que nao correspondem, mas mantem slots vazios visiveis para preservar a leitura da capacidade da mochila.
- O projeto nao possui repositorio Git inicializado neste diretorio. Nao ha hash de commit para retomada.

## Problemas encontrados e como foram tratados

- O GLB do ferreiro nao carregava porque usa `KHR_draco_mesh_compression` e `EXT_texture_webp`.
  - Foram adicionados os decodificadores Draco em `public/draco/` e configurado o caminho local em `BlacksmithForgePresentation.ts`.
- O martelo passou a existir no GLB atualizado e aparecia indevidamente na entrega.
  - O objeto com nome `martelo` e localizado e ocultado apenas em `delivery`.
- Teste de `LobbyScreen` falhou inicialmente porque o fixture de teste nao inclui `.lobby-detail-panel`.
  - A alteracao foi protegida com null guard, sem exigir mudar o fixture.
- `npm run build` algumas vezes aparentou exceder o timeout do ambiente apos o typecheck sem novo output.
  - A build Vite direta foi executada com sucesso e e a validacao confiavel registrada abaixo.

## Validacao ja executada

- `npm run typecheck` - passou.
- `npx vitest run src/ui/LobbyScreen.test.ts src/ui/BlacksmithScreen.test.ts` - passou: 2 arquivos, 24 testes.
- `npx vite build --emptyOutDir=false` - passou.
  - Aviso normal: bundle principal acima de 500 kB.
- Verificado que os recursos abaixo respondem em `http://127.0.0.1:5174/`:
  - `/src/styles/lobby-reference.css`
  - `/assets/ui/lobby/crest-warrior.svg`

## Comandos para continuar e testar

No PowerShell, a partir da raiz do projeto:

```powershell
./Ligarserver.bat
```

Ou iniciar diretamente:

```powershell
npm run dev -- --host 127.0.0.1 --port 5174
```

Abrir o lobby:

```text
http://127.0.0.1:5174/
```

Abrir com administrador:

```text
http://127.0.0.1:5174/?admin=1
```

Validar tipos:

```powershell
npm run typecheck
```

Rodar os testes mais relacionados:

```powershell
npx vitest run src/ui/LobbyScreen.test.ts src/ui/BlacksmithScreen.test.ts
```

Build de producao:

```powershell
npx vite build --emptyOutDir=false
```

## Proximas tarefas recomendadas

1. Abrir o lobby em 1920x1080 e em viewport menor, comparar com a referencia enviada e ajustar apenas detalhes visuais de alta fidelidade.
2. Verificar manualmente Heroi, Inventario, Skills, Oficina, inicio de partida, busca e filtro no inventario, equipar/desequipar e drag/drop.
3. Fazer uma passada visual na oficina para garantir que o layout 3D do ferreiro e as receitas continuam bons apos qualquer ajuste global de CSS.
4. Se o usuario enviar nova captura, usar a imagem para calibrar alturas do cabecalho, proporcoes das tres colunas, escala do personagem e espacamento do rodape.

## 1. Objetivo atual

Alcancar um lobby funcional e visualmente muito proximo da referencia fornecida para o **Salao do Guerreiro**, sem comprometer os sistemas reais de personagem 3D, inventario, equipamentos, skills, oficina e inicio da partida.

## 2. Estado atual

O lobby tem uma nova camada visual completa e funcional. A estrutura principal, interacoes e build estao saudaveis. Falta somente uma rodada de inspecao visual manual no navegador, porque nao foi possivel fazer captura automatizada com Playwright neste ambiente.

## 3. O que foi concluido nesta sessao

- Criado o shell visual completo do lobby em tres colunas.
- Atualizado o HTML do lobby com novas estruturas sem remover IDs de integracao.
- Adicionado o stylesheet isolado `src/styles/lobby-reference.css`.
- Criados e integrados brasao, icones de abas, moldura de slot e plataforma do personagem.
- Implementadas busca e filtragem de inventario no `LobbyScreen`.
- Implementada troca visual entre Inventario e Skills no painel direito.
- Executados typecheck, testes direcionados e build Vite com sucesso.
- Criado o handoff inicial e, nesta atualizacao, adaptado ao protocolo permanente solicitado pelo usuario.

## 4. Arquivos modificados

- `index.html`: markup do lobby, incluindo cabecalho, abas, palco central, controles da mochila e rodape.
- `src/ui/LobbyScreen.ts`: busca/filtro da mochila, sincronizacao dos controles e troca de aba Inventario/Skills.
- `src/styles/lobby-reference.css`: camada visual do lobby inspirada na referencia.
- `src/ui/BlacksmithForgePresentation.ts`: integracao anterior das animacoes 3D do ferreiro, Draco, particulas e martelo no delivery.
- `src/ui/BlacksmithScreen.ts`: integracao anterior da apresentacao 3D ao fluxo da oficina.
- `Ligarserver.bat`: script de inicializacao usado pelo usuario.
- `Ligarserver-Admin-Incognito.bat`: script anterior para abrir a pagina de administrador em modo anonimo.

## 5. Arquivos criados

- `CODEX_HANDOFF.md`.
- `src/styles/lobby-reference.css`.
- `public/assets/ui/lobby/crest-warrior.svg`.
- `public/assets/ui/lobby/icon-hero.svg`.
- `public/assets/ui/lobby/icon-inventory.svg`.
- `public/assets/ui/lobby/icon-skills.svg`.
- `public/assets/ui/lobby/icon-workshop.svg`.
- `public/assets/ui/lobby/equipment-slot-frame.svg`.
- `public/assets/ui/lobby/character-platform.svg`.
- `public/blacksmith/forge-bench-background.png` (criado anteriormente nesta sequencia de trabalho).
- `public/draco/draco_decoder.js`.
- `public/draco/draco_decoder.wasm`.
- `public/draco/draco_wasm_wrapper.js`.

## 6. Assets criados ou alterados

- `public/assets/ui/lobby/crest-warrior.svg`: brasao do cabecalho; integrado em `index.html`.
- `public/assets/ui/lobby/icon-hero.svg`: icone da aba Heroi; integrado em `index.html`.
- `public/assets/ui/lobby/icon-inventory.svg`: icone da aba Inventario; integrado em `index.html`.
- `public/assets/ui/lobby/icon-skills.svg`: icone da aba Skills; integrado em `index.html`.
- `public/assets/ui/lobby/icon-workshop.svg`: icone da aba Oficina; integrado em `index.html`.
- `public/assets/ui/lobby/equipment-slot-frame.svg`: moldura visual de slots; integrado em `lobby-reference.css`.
- `public/assets/ui/lobby/character-platform.svg`: plataforma runica do heroi; integrado em `index.html` e estilizado em `lobby-reference.css`.
- `public/blacksmith/forge-bench-background.png`: fundo da bancada do ferreiro; integrado anteriormente na oficina.
- `public/draco/*`: decodificadores necessarios ao GLB do ferreiro; integrados por `BlacksmithForgePresentation.ts`.

## 7. Alteracoes parciais

- `src/styles/lobby-reference.css`, todo o layout do lobby:
  - Feito: estrutura, tema, hierarquia visual e responsividade basica foram implementados.
  - Falta: comparar no navegador com a imagem de referencia em 1920x1080 e corrigir microajustes de escala, contraste, espacamento e eventuais sobreposicoes.
  - Cuidado: nao tornar opaco o centro do palco, pois o canvas WebGL do personagem precisa continuar visivel.
- Oficina / ferreiro 3D:
  - Feito: animacoes e fluxo de craft foram integrados anteriormente.
  - Falta: uma revisao visual manual final da pagina apos mudancas futuras de CSS, principalmente tamanhos e enquadramento do modelo.
  - Cuidado: o GLB depende de Draco em `/draco/`; nao remover os tres arquivos do decoder nem a configuracao de caminho local.

## 8. Proximas tarefas

- **P0**: abrir `http://127.0.0.1:5174/`, comparar com a referencia entregue pelo usuario e revisar se o personagem 3D, o equipamento, a mochila e o botao de inicio seguem visiveis e clicaveis.
- **P0**: confirmar manualmente que todas as abas (Heroi, Inventario, Skills e Oficina) ainda navegam corretamente apos o CSS novo.
- **P1**: ajustar detalhadamente o visual do lobby conforme qualquer nova captura enviada pelo usuario, sem reescrever a logica.
- **P1**: testar busca e filtros de inventario com itens reais, inclusive mochila vazia e cheia.
- **P1**: testar equipar/desequipar repetidamente, drag/drop e o bonus de conjunto para garantir que nao houve regressao.
- **P2**: revisar visualmente a oficina e o enquadramento do ferreiro 3D em diferentes resolucoes.

## 9. Problemas e bugs conhecidos

- Nao ha erro TypeScript conhecido: `npm run typecheck` passou.
- Nao ha falha conhecida nos testes direcionados: 24 testes passaram.
- Nao houve inspeccao visual automatizada do novo lobby, pois Playwright nao estava configurado. Podem existir pequenas diferencas de fidelidade ou layout a corrigir apos verificacao manual.
- O projeto nao e um repositorio Git neste diretorio, portanto nao e possivel obter `git status` ou `git diff --stat`.
- A build Vite emite apenas o aviso padrao de bundle principal acima de 500 kB; nao impede a build.

## 10. Funcionalidades que devem ser preservadas

- Personagem 3D, canvas/Three.js, rig e animacoes existentes.
- Cenario de fundo e visibilidade do personagem no lobby.
- Inventario, capacidade, busca, filtros, localStorage e atualizacao imediata da mochila.
- Equipar/desequipar sem duplicar itens, incluindo arma primaria e arma secundaria.
- Drag/drop de equipamentos e itens.
- Imagens de set comum na mochila e nos slots equipados.
- Bonus de conjunto no status atual.
- Skills, hotkeys, fadiga, dash e alvo por `Q` no jogo.
- Oficina, receitas, materiais, coloracao verde/vermelha, craft e entrega do ferreiro 3D.
- Decodificacao Draco do ferreiro e ocultacao do martelo somente no delivery.
- Botao `INICIAR PARTIDA` e a transicao para a partida.
- Painel de administrador circular, movivel e com configuracao de transparencia.

## 11. Testes realizados

- `npm run typecheck`: executado e passou.
- `npx vitest run src/ui/LobbyScreen.test.ts src/ui/BlacksmithScreen.test.ts`: executado e passou, com 2 arquivos e 24 testes.
- Teste manual HTTP: os recursos `/src/styles/lobby-reference.css` e `/assets/ui/lobby/crest-warrior.svg` responderam com sucesso no servidor de desenvolvimento em `127.0.0.1:5174`.
- Inspecao visual automatizada: **NAO TESTADO**. Nao havia Playwright configurado.

## 12. Build

- Comando: `npx vite build --emptyOutDir=false`.
- Resultado: passou com sucesso.
- Saida relevante: 111 modulos transformados; build concluida em aproximadamente 6 segundos.
- Aviso: bundle principal acima de 500 kB. Nenhum erro de build.

## 13. Git

Comandos executados antes deste checkpoint:

```powershell
git status --short
git diff --stat
```

Resultado: ambos indicaram que `C:\Users\pteix\OneDrive\Documentos\Gameweb\projeto2` nao contem um repositorio Git (`fatal: not a git repository`). Nenhum commit foi feito.

## 14. Ultima coisa que eu estava fazendo

Eu estava trabalhando na reconstrucao visual do lobby em `src/styles/lobby-reference.css`, principalmente no grid de tres colunas, molduras ornamentadas, estagio central e painel de inventario. A implementacao foi concluida e validada por tipo, testes direcionados e build. O proximo passo deve ser abrir o navegador, comparar com a referencia do usuario e fazer apenas os ajustes visuais necessarios sem quebrar os IDs e eventos existentes.

## START HERE - PROXIMO AGENTE

Primeiro, leia este arquivo inteiro. Depois inicie ou confirme o servidor em `http://127.0.0.1:5174/`, abra o lobby em uma janela de 1920x1080 e valide visualmente o resultado contra a imagem de referencia mais recente. Antes de editar, inspecione `index.html`, `src/styles/lobby-reference.css` e `src/ui/LobbyScreen.ts`; preserve os IDs e a transparencia do palco Three.js.

---

## Checkpoint de refinamento visual - 13/09/2026

### Estado real encontrado

O estado mais recente continha um refinamento adicional que nao aparecia no handoff inicial:

- `public/assets/ui/lobby/character-platform.svg` ja havia sido atualizado para uma plataforma menor, com camada de pedra/metal, borda espessa, runas, sombra e perspectiva.
- `public/assets/ui/lobby/icon-crossed-swords.svg` ja havia sido criado.
- As regras desktop no final de `src/styles/lobby-reference.css` ja integravam esse icone no pseudo-elemento do CTA e posicionavam a plataforma embaixo do personagem.
- O arquivo mencionado na instrucao, `scripts-inspect/capture-lobby.mjs`, nao existia no disco. Ele foi criado nesta sessao e esta integrado ao fluxo de verificacao local.

Nao houve Git disponivel: `git status --short` e `git diff --stat` retornaram `fatal: not a git repository`. O estado do disco foi a fonte de verdade.

### O que foi concluido neste checkpoint

- Criado `scripts-inspect/capture-lobby.mjs`.
  - Usa Chrome DevTools Protocol em `127.0.0.1:9237`.
  - Abre a aplicacao em 1920x1080.
  - Espera o carregamento, confirma a classe quando necessario e so entao captura o lobby.
  - Exemplo: `node scripts-inspect/capture-lobby.mjs artifacts/lobby-verification-refined.png`.
- Capturado e inspecionado o lobby real em `artifacts/lobby-verification-current.png` e `artifacts/lobby-verification-refined.png`.
- Ajustado `src/styles/lobby-reference.css` para o desktop:
  - grid vertical de `68px / restante / 76px` para `84px / restante / 92px`;
  - masthead para 84px;
  - abas para 62px;
  - rodape para 92px.
- Esse ajuste aproxima a composicao da referencia: o cabecalho e o rodape recuperam presenca, os paineis ganham respiro vertical e o botao central fica na mesma faixa compositiva da plataforma, sem mudar a camera, o modelo ou o Three.js.

### Arquivos modificados neste checkpoint

- `src/styles/lobby-reference.css`: proporcao desktop do cabecalho, abas e rodape.
- `CODEX_HANDOFF.md`: este checkpoint.

### Arquivos criados neste checkpoint

- `scripts-inspect/capture-lobby.mjs`.
- `artifacts/lobby-verification-current.png`.
- `artifacts/lobby-verification-refined.png`.

### Validacao deste checkpoint

- Visual: `artifacts/lobby-verification-refined.png` foi gerada e analisada manualmente. A plataforma aparece abaixo dos pes, menor e em perspectiva; o botao `INICIAR PARTIDA` esta centralizado e usa `icon-crossed-swords.svg` no desktop.
- `npm run typecheck`: passou.
- `npx vitest run src/ui/LobbyScreen.test.ts src/ui/LobbyPresentation.test.ts src/ui/BlacksmithScreen.test.ts`: passou, 3 arquivos e 30 testes.
- `npx vite build --emptyOutDir=false`: passou; os artefatos recentes incluem `dist/assets/Game-v7yvoF2D.js`, `dist/assets/index-BUzby6N5.css` e `dist/assets/index-Di7GUtpf.js`.
- O aviso de bundle maior que 500 kB continua sendo apenas um aviso do Vite.

### Alteracoes parciais e cuidados

- Nao ha alteracao funcional parcial no lobby neste checkpoint.
- Ainda vale testar manualmente as abas, equipar/desequipar e drag/drop se uma proxima solicitacao alterar esses fluxos. Esta sessao confirmou o shell visual, a carga do lobby, a plataforma e o CTA, mas nao simulou esses fluxos no navegador.
- O botao circular `ADM` aparece sobre o personagem na captura porque o modo/admin persistido estava ativo na sessao de navegador. Ele nao faz parte do layout visual de referencia e deve continuar pequeno/arrastavel; nao remove-lo por conta disso.

### Ultima coisa que eu estava fazendo

Eu estava ajustando a cadencia vertical desktop em `src/styles/lobby-reference.css`, depois de verificar o lobby real em `artifacts/lobby-verification-current.png`. O proximo passo, caso haja nova solicitacao visual, deve partir de `artifacts/lobby-verification-refined.png` e fazer pequenos ajustes direcionados, preservando o palco Three.js, os IDs do DOM e as regras desktop no fim do stylesheet.

## START HERE - PROXIMO AGENTE (ATUALIZADO)

Abra primeiro `artifacts/lobby-verification-refined.png`. Em seguida, use `node scripts-inspect/capture-lobby.mjs artifacts/lobby-verification-next.png` para uma nova captura antes de qualquer mudanca visual. Compare as capturas e edite apenas `src/styles/lobby-reference.css` quando a correcao for estritamente de layout; nao toque em `LobbyScreen.ts` ou na camera 3D sem necessidade funcional comprovada.

---

## Checkpoint de arte integrada do lobby - 13/09/2026

### Objetivo atual

Reconstruir o lobby **Salao do Guerreiro** pela direcao de arte, preservando toda a logica existente. O pedido deixou de ser um refinamento CSS: o acabamento deve vir de assets de ambiente, molduras, icones e ornamentos reais, com o personagem ainda renderizado pelo Three.js sobre o palco.

### Referencia disponivel e limitacao encontrada

- O arquivo citado como definitivo, `references/lobby-target.png`, **nao existe** nesta maquina. Foi procurado no projeto e em `C:\Users\pteix` sem resultado.
- A unica direcao disponivel foi o briefing e as imagens anexadas na conversa. Quando a referencia exata for colocada em `references/lobby-target.png`, compare a proxima captura lado a lado antes de novos ajustes de proporcao.

### Implementado neste checkpoint

- Criado e integrado um cenario raster real de fortaleza medieval, sem personagem ou UI embutidos. Ele e carregado por `LobbyPresentation.ts` no `backdropScene` do Three.js, preservando o canvas, rig e animacoes do heroi.
- Criadas e aplicadas molduras raster de metal/pedra para os paineis de equipamento e inventario, em vez de depender de caixas CSS genericas.
- Criada e aplicada uma moldura raster para os sete slots de equipamento.
- Criado e aplicado um estandarte vertical azul/dourado no palco central.
- O antigo pedestal SVG foi ocultado no desktop porque o novo cenario ja contem um dais de pedra alinhado aos pes do personagem. Nao mostre os dois ao mesmo tempo.
- Criado `public/assets/ui/lobby/reference-redesign/ASSET_MANIFEST.md` com os assets integrados, assets restantes e o seletor/arquivo de integracao exato para cada um.
- Atualizado o teste da URL do backdrop para acompanhar o novo asset.
- Registrada a captura visual final em `artifacts/lobby-reference-redesign-final.png`.

### Arquivos modificados neste checkpoint

- `src/ui/LobbyPresentation.ts`: `LOBBY_BACKDROP_URL` aponta para o novo ambiente raster.
- `src/ui/LobbyPresentation.test.ts`: expectativa da URL atualizada.
- `src/styles/lobby-reference.css`: variaveis de assets, paineis/slots com arte raster, estandarte e regra desktop que evita pedestal duplicado.
- `public/assets/ui/lobby/reference-redesign/ASSET_MANIFEST.md`: contratos de integracao de arte presentes e futuros.
- `CODEX_HANDOFF.md`: este checkpoint.

### Arquivos e assets criados neste checkpoint

- `public/assets/ui/lobby/reference-redesign/lobby-warrior-background.png`
- `public/assets/ui/lobby/reference-redesign/panel-equipment-frame.png`
- `public/assets/ui/lobby/reference-redesign/equipment-slot-frame.png`
- `public/assets/ui/lobby/reference-redesign/warrior-banner.png`
- `public/assets/ui/lobby/reference-redesign/ASSET_MANIFEST.md`
- `artifacts/lobby-reference-redesign-p0-final.png`
- `artifacts/lobby-reference-redesign-final.png`
- `artifacts/build-reference-redesign.log`
- `artifacts/build-reference-redesign-error.log`

### Decisoes importantes

- O fundo esta em PNG de alta qualidade, nao em `.webp`, porque o gerador interno devolve PNG e nao havia conversor WebP instalado. O contrato para a versao otimizada `lobby-warrior-background.webp` esta documentado no manifest; quando ela existir, altere somente `LOBBY_BACKDROP_URL`.
- Nenhum texto, controle, personagem ou acao foi desenhado dentro dos bitmaps. Todos continuam em HTML/Three.js e portanto acessiveis e funcionais.
- O painel direito usa provisoriamente a mesma familia de moldura do painel esquerdo. O proximo asset previsto e `panel-inventory-frame.png`, com assimetria propria, para evitar repeticao visual.
- A aparicao do botao circular `ADM` na captura e estado persistido do administrador. Ele deve continuar pequeno, movivel e separado da arte do lobby.

### Funcionalidades que devem ser preservadas

- Three.js, `backdropScene`, canvas, rig, animacoes e enquadramento do personagem.
- Inventario, filtros, busca, capacidade, persistencia em `localStorage`, drag/drop, equipar e desequipar sem duplicacao.
- Bonus de conjunto, skills, hotkeys, fadiga, dash e target por `Q` na partida.
- Oficina, materiais, craft e animacoes do ferreiro 3D.
- CTA `#start-game`, navegacao e todos os IDs mantidos no `index.html`/`LobbyScreen.ts`.

### Validacao executada

- `npm run typecheck`: passou.
- `npx vitest run src/ui/LobbyPresentation.test.ts src/ui/LobbyScreen.test.ts`: passou, 24 testes.
- `npm run build`: passou. Vite transformou 111 modulos em aproximadamente 1 minuto; o unico aviso e o bundle `Game` acima de 500 kB.
- `node scripts-inspect/capture-lobby.mjs artifacts/lobby-reference-redesign-final.png`: passou. A captura foi aberta e revisada visualmente em 1920x1080.

### Problemas conhecidos e tarefas restantes

**P0**

- Receber ou localizar `references/lobby-target.png` para comparacao exata.
- Criar/fornecer a versao WebP otimizada do fundo se o requisito de formato for obrigatorio.

**P1 - assets especificos ainda necessarios**

- `panel-inventory-frame.png`, `equipment-slot-frame-active.png`, `equipment-ornament-top.png`, `equipment-divider.png`, `lobby-platform.png`, `start-game-frame.png`, `footer-frame.png`.
- Icones ilustrados transparentes: `helmet.png`, `chest.png`, `pants.png`, `gloves.png`, `boots.png`, `offhand.png`, `weapon.png`.
- Integrar esses assets nos seletores descritos no manifest, sem remover fallbacks ou eventos dos slots.

**P2**

- Revisar visualmente a oficina e o enquadramento do ferreiro 3D em resolucoes desktop e mobile.
- Testar manualmente abas, inventario, equipar/desequipar e drag/drop depois de qualquer mudanca no render dos icones.

### Estado de Git

`git status --short` e `git diff --stat` continuam indisponiveis porque esta pasta nao e um repositorio Git. Nenhum commit foi criado.

### Ultima coisa feita / START HERE

O ultimo trabalho foi a captura e revisao de `artifacts/lobby-reference-redesign-final.png` apos a build bem-sucedida. Para continuar:

1. Abra essa captura e compare com `references/lobby-target.png` assim que o arquivo existir.
2. Leia `public/assets/ui/lobby/reference-redesign/ASSET_MANIFEST.md` antes de criar mais arte.
3. Mantenha `src/ui/LobbyPresentation.ts` como dono da URL do ambiente e `src/styles/lobby-reference.css` como dono da pele visual.
4. Antes e depois de cada mudanca visual, execute `node scripts-inspect/capture-lobby.mjs artifacts/lobby-next.png`.
5. Teste com `npm run typecheck`, `npx vitest run src/ui/LobbyPresentation.test.ts src/ui/LobbyScreen.test.ts`, e `npm run build`.

### Comando para rodar localmente

```powershell
npm run dev -- --host 127.0.0.1 --port 5174
```

Abra `http://127.0.0.1:5174/`. O servidor desta sessao esta ativo nessa URL.

---

## Rodada final de fidelidade visual - 13/09/2026

### Pedido e referencia

- A referencia definitiva agora esta no projeto como `lobby.png`.
- O estado antes desta rodada foi preservado e capturado em `artifacts/lobby-reference-redesign-final.png`.
- A comparacao passou a ser feita diretamente contra `lobby.png`, em 1920x1080, com `scripts-inspect/capture-lobby.mjs`.

### Concluido nesta rodada

- Corrigido `Ligarserver-Admin-Incognito.bat`: se `127.0.0.1:5174` ja estiver ativo, ele abre **somente uma** janela Edge InPrivate com `?admin=1` e encerra sem iniciar outro Vite ou emitir `Port 5174 is already in use`.
- Criados sete assets SVG de equipamento vazio, com volumes, metais envelhecidos, highlights e sombras: capacete, peitoral, calca, luvas, botas, arma secundaria e arma primaria.
- Criado `equipment-slot-refined.svg`, uma moldura interna mais leve para reduzir o peso dos slots vazios.
- Criado `start-game-frame.svg`, uma moldura em camadas para o CTA real `#start-game`.
- Ampliada a area util do painel esquerdo e do inventario para aproximar a composicao da referencia; os slots preservam a grade original e a arma primaria fica centralizada.
- Recuperada a leitura da secao **Status atual**: resumo em duas colunas, atributos em duas colunas, espaco vertical maior e pequenos marcadores metalicos.
- Reenquadrado o heroi 3D apenas pela camera: `zoom` padrao de `4.9` para `5.55` e alvo vertical de `0.98` para `0.94`. O GLB, rig e animacoes nao foram alterados. Os pes agora permanecem visiveis e apoiados no dais existente no background.
- Reduzido e reposicionado o estandarte para atuar como ornamento secundario.
- Reintegrado o icone da mochila no cabecalho do inventario.
- Painel ADM: transparencia inicial de 40%, circulo recolhido de 34px e ancoragem inicial no canto inferior direito. O arraste continua funcionando e, ao arrastar, remove corretamente as ancoras direita/inferior.

### Arquivos modificados

- `Ligarserver-Admin-Incognito.bat`
- `src/ui/LobbyScreen.ts`
- `src/admin/AdminPanel.ts`
- `src/style.css`
- `src/styles/lobby-reference.css`
- `public/assets/ui/lobby/reference-redesign/ASSET_MANIFEST.md`
- `CODEX_HANDOFF.md`

### Assets criados

- `public/assets/ui/lobby/reference-redesign/equipment-slot-refined.svg`
- `public/assets/ui/lobby/reference-redesign/start-game-frame.svg`
- `public/assets/ui/lobby/reference-redesign/icons/helmet.svg`
- `public/assets/ui/lobby/reference-redesign/icons/chest.svg`
- `public/assets/ui/lobby/reference-redesign/icons/pants.svg`
- `public/assets/ui/lobby/reference-redesign/icons/gloves.svg`
- `public/assets/ui/lobby/reference-redesign/icons/boots.svg`
- `public/assets/ui/lobby/reference-redesign/icons/offhand.svg`
- `public/assets/ui/lobby/reference-redesign/icons/weapon.svg`

### Capturas e validacao

- Antes/P0: `artifacts/lobby-fidelity-p0.png`.
- Pos-calibracao: `artifacts/lobby-fidelity-p1.png`.
- Final: `artifacts/lobby-fidelity-final-focus.png`.
- Responsividade desktop: `artifacts/lobby-fidelity-1600x900.png` e `artifacts/lobby-fidelity-1366x768.png`. Nao ha corte horizontal; em 1366x768 os paineis preservam seu scroll interno, como previsto.
- `npm run typecheck`: passou.
- `npx vitest run src/ui/LobbyScreen.test.ts src/ui/LobbyPresentation.test.ts src/admin/AdminPanel.test.ts src/style.test.ts`: passou, 4 arquivos e 36 testes.
- `npm run build`: passou. Vite transformou 111 modulos em 41,13 segundos. O unico aviso e o bundle `Game` acima de 500 kB; nao ha erro de build.

### Preservar obrigatoriamente

- Canvas/Three.js, `backdropScene`, personagem 3D, rig e animacoes.
- Todos os IDs, clique de iniciar, navegacao, inventario, busca/filtro, tooltips, drag/drop, equipar/desequipar e persistencia.
- O item equipado continua tendo prioridade visual sobre os novos SVGs vazios.
- O ADM deve permanecer apenas em sessao administrativa, pequeno quando recolhido, movivel e com transparencia ajustavel.

### Pendencias reais

- Conferir manualmente as resolucoes menores se houver novos assets de tamanho fixo; a rodada atual ja foi capturada em `1600x900` e `1366x768`.
- Pode ser fornecida uma variacao artistica dedicada para a moldura do painel direito e para o slot equipado. O manifesto descreve os seletores.
- A moldura externa do CTA e asset SVG agora, mas uma versao raster final pode substitui-la se houver arte aprovada.

### START HERE

1. Abra `artifacts/lobby-fidelity-final-focus.png` lado a lado com `lobby.png`.
2. Antes de qualquer novo ajuste, capture `node scripts-inspect/capture-lobby.mjs artifacts/lobby-next.png`.
3. Nao reintroduza o pedestal DOM sobre o dais do background, nem reduza novamente a area de Status atual.

---

## Correcao de alinhamento apos comparacao com lobby.png - 13/09/2026

### Ajustado

- `src/styles/lobby-reference.css` recebeu a correcao fina solicitada pelo usuario:
  - slots comuns com `aspect-ratio: 1.29`, levemente mais altos;
  - arma primaria compactada para `aspect-ratio: 2.08`, liberando espaco vertical;
  - PNGs de equipamento equipado limitados a uma area segura (`72%` e `object-fit: contain`) para nao cortar imagem nem rotulo;
  - grid com espacamento vertical menor e Status atual antecipado;
  - CTA convertido para coluna flexivel com texto centralizado dentro do frame e icone posicionado absolutamente, eliminando o titulo fora da moldura.

### Captura validada

- `artifacts/lobby-alignment-final.png` em 1920x1080: textos do CTA estao dentro do frame; Status atual esta visivel no painel; slots vazios e arma primaria estao alinhados.
- `npm run build` apos a correcao: passou em 34,59 segundos; somente o aviso conhecido do bundle `Game` acima de 500 kB.

### Preservar

- Nao aumentar novamente a arma primaria sem reduzir sua area proporcionalmente.
- Equipamentos reais usam `.is-equipped-art`; manter `object-fit: contain` e area maxima, pois imagens de capacete/peitoral sao altas.

---

# HANDOFF FINAL - PARADA SEGURA DA SESSAO

**Data:** 13/09/2026  
**Motivo da parada:** limite de cota baixo. Nenhuma nova implementacao deve ser iniciada a partir deste checkpoint sem nova solicitacao.

## Objetivo atual

O objetivo foi aproximar visualmente o lobby **Salao do Guerreiro** da referencia local `lobby.png`, sem quebrar Three.js, inventario, equipamento, persistencia, navegacao, skills, oficina ou inicio da partida. A ultima solicitacao foi uma correcao de alinhamento: textos dentro do CTA e artes de equipamentos sem corte.

## Estado real do lobby

### Estrutura e composicao

- O lobby permanece uma tela de tres regioes com cabecalho, painel esquerdo de equipamento/status, palco central Three.js, painel direito de inventario e rodape/CTA.
- A referencia visual local usada e `lobby.png` na raiz do projeto.
- A captura final de alinhamento e `artifacts/lobby-alignment-final.png` (1920x1080).
- Capturas anteriores relevantes: `artifacts/lobby-fidelity-p0.png`, `artifacts/lobby-fidelity-p1.png`, `artifacts/lobby-fidelity-final-focus.png`, `artifacts/lobby-fidelity-1600x900.png` e `artifacts/lobby-fidelity-1366x768.png`.

### Painel esquerdo e equipamentos

- O painel esquerdo usa a moldura raster `panel-equipment-frame.png`.
- Slots vazios usam `equipment-slot-refined.svg`, uma moldura mais leve que a raster antiga.
- A grade continua: Capacete/Peitoral, Calca/Luvas, Botas/Arma secundaria e Arma primaria centralizada.
- Nesta ultima correcao, slots comuns foram ajustados para `aspect-ratio: 1.29`; a arma primaria ficou em `aspect-ratio: 2.08` para preservar espaco do Status atual.
- Itens equipados continuam prioritarios: as imagens reais usam `.is-equipped-art`, `object-fit: contain`, largura/altura de 72%; a arma primaria usa 48% x 74%. Isto evita que capacetes e peitorais altos sejam cortados pelo slot ou pelo rótulo.
- A logica de equipar/desequipar, drag/drop, tooltip e item menu nao foi alterada nesta rodada.

### Icones de equipamento

Sete SVGs de metal envelhecido foram criados e estao **realmente integrados apenas para slots vazios** por seletores em `src/styles/lobby-reference.css`:

- `icons/helmet.svg`
- `icons/chest.svg`
- `icons/pants.svg`
- `icons/gloves.svg`
- `icons/boots.svg`
- `icons/offhand.svg`
- `icons/weapon.svg`

Eles nao substituem imagens reais de itens equipados; `renderEquipmentSlotContent()` continua entregando arte do item quando houver equipamento.

### Status atual

- O bloco recebeu maior espaco util, titulo maior e maior separacao vertical.
- Resumo Nivel/Pontos esta em duas colunas.
- Atributos estao em duas colunas, com marcador metalico discreto antes do texto.
- O bloco foi antecipado para evitar que fique comprimido abaixo da arma primaria.
- O modelo ainda exibe os atributos atuais do perfil: Forca, Ataque, Defesa, Agilidade, Critico fisico, Critico magico e Esquiva. Nenhum atributo do perfil foi removido.
- Bonus de conjunto permanece renderizado por `renderLobbyCurrentStatus()` quando ativo; nao foi removido.

### Personagem, camera e plataforma

- O personagem continua sendo o mesmo GLB, rig e animacoes de lobby. Nenhum asset 3D foi modificado.
- `src/ui/LobbyScreen.ts` alterou somente o enquadramento: `zoom` inicial mudou de `4.9` para `5.55` e `camera.lookAt` de `0.98` para `0.94` no eixo Y.
- Resultado esperado: corpo inteiro e pes visiveis, apoiados visualmente no dais presente no cenario.
- O pedestal DOM antigo `hero-stage-platform` continua oculto em desktop porque o background raster ja contem um dais fisico. Nao reativar os dois juntos.

### Background e luz

- O background integrado e `public/assets/ui/lobby/reference-redesign/lobby-warrior-background.png`.
- Ele e carregado como `LOBBY_BACKDROP_URL` em `src/ui/LobbyPresentation.ts` para o `backdropScene` do Three.js, nao como fundo CSS comum.
- `configureLobbyBackdropTexture()` e `fitLobbyBackdropTexture()` continuam preservados.
- Luzes, fallback e transparencia do palco foram preservados; nenhuma animacao/modelo foi alterado.
- Ainda nao existe a versao WebP otimizada mencionada em um pedido anterior. A URL ativa e PNG e funciona.

### Banner

- O estandarte ativo e `warrior-banner.png`.
- Ele foi reduzido e reposicionado com `top: 15%`, `right: 5%`, `bottom: 23%` no desktop, servindo como ornamento secundario.
- O texto HTML interno do banner permanece oculto porque a arte raster e usada como decoracao visual.

### Painel direito e inventario

- O painel direito usa provisoriamente a mesma moldura raster `panel-equipment-frame.png` do painel esquerdo.
- A area tem iconografia de mochila no cabecalho, titulo, capacidade, busca, filtro e grade de inventario preservados.
- Slots de inventario, hover, item art, quantidade, filtro, busca, capacidade, expansao e persistencia nao foram alterados funcionalmente.
- Ainda falta uma arte exclusiva `panel-inventory-frame.png` caso seja desejada uma assimetria mais proxima da referencia.

### Botao INICIAR PARTIDA

- O CTA continua sendo o botao HTML real `#start-game`; o clique e a transicao para a partida foram preservados.
- A moldura integrada e `public/assets/ui/lobby/reference-redesign/start-game-frame.svg`.
- A ultima correcao mudou o conteudo interno para coluna flexivel: `Entrar na masmorra` e `Iniciar partida` ficam centralizados dentro do frame; o icone de espadas e absoluto, evitando texto fora da moldura.
- O CTA esta maior e sobrepoe o rodape de forma intencional, conforme a composicao de referencia.

### Footer e header

- Header preserva brasao, Fortaleza de Cinzafogo, Salao do Guerreiro, navegacao e disciplina.
- Footer preserva status a esquerda e frase a direita; recebeu textura/camadas escuras em CSS, mas nao possui um asset raster exclusivo.
- Ainda falta, se necessario, `footer-frame.png` para acabamento artistico final. Nao foi criado nesta sessao.

### ADM

- `Ligarserver-Admin-Incognito.bat` foi corrigido: se a porta 5174 estiver ativa, abre somente uma janela InPrivate com `?admin=1` e nao inicia outro Vite.
- Painel ADM continua exclusivo de sessao administrativa, arrastavel e expansivel.
- Transparencia padrao mudou de 60% para 40% (`--admin-panel-opacity: .4` e slider inicial 40).
- Quando recolhido, mede 34px e inicia no canto inferior direito, fora do personagem.
- Durante um arraste, `right` e `bottom` passam para `auto`, preservando o posicionamento manual.

## Estado atual da tela Skills

- Skills e hotkeys continuam funcionando pelos componentes existentes de `LobbyScreen` e catalogos de skills.
- Esta sessao nao alterou estrutura, logica, keybinds, energia/fadiga ou artes da tela Skills.
- O painel direito ainda alterna entre inventario e skills pela navegacao existente.
- Nao houve teste manual de cada skill nesta rodada.

## Estado atual da Oficina

- A Oficina continua sendo rota/tela completa administrada por `BlacksmithScreen`.
- Logica de receitas, materiais, cores de disponibilidade, craft, mochila e fluxo do ferreiro 3D permanecem como estavam antes desta sessao.
- Esta sessao nao alterou `BlacksmithScreen.ts`, o GLB, as animacoes do ferreiro, a bancada ou CSS especifico da oficina.
- A oficina nao foi revalidada manualmente nesta rodada; a captura anterior mostrou layout existente e o handoff anterior descreve esse estado.

## Arquivos modificados nesta sessao e passagens imediatamente anteriores

### Codigo e estilos

- `src/styles/lobby-reference.css`
  - Integracao visual do lobby, slots, status, banner, painel direito, CTA, footer e correcao final de alinhamento.
- `src/ui/LobbyScreen.ts`
  - Somente camera/enquadramento do preview 3D.
- `src/ui/LobbyPresentation.ts`
  - URL do backdrop raster ativo.
- `src/ui/LobbyPresentation.test.ts`
  - Expectativa atualizada para a URL do backdrop.
- `src/style.css`
  - Posicionamento/tamanho/opacidade padrao do ADM.
- `src/admin/AdminPanel.ts`
  - Slider padrao de transparencia e limpeza de ancoras durante drag.
- `scripts-inspect/capture-lobby.mjs`
  - Aceita agora caminho, largura e altura opcionais: `node scripts-inspect/capture-lobby.mjs arquivo.png 1600 900`.
- `Ligarserver-Admin-Incognito.bat`
  - Prevencao do segundo servidor na porta 5174.

### Documentacao

- `CODEX_HANDOFF.md` (este handoff, inclusive checkpoints anteriores).
- `public/assets/ui/lobby/reference-redesign/ASSET_MANIFEST.md`.

## Assets criados ou alterados

### Diretamente integrados

- `public/assets/ui/lobby/reference-redesign/lobby-warrior-background.png`
- `public/assets/ui/lobby/reference-redesign/panel-equipment-frame.png`
- `public/assets/ui/lobby/reference-redesign/equipment-slot-refined.svg`
- `public/assets/ui/lobby/reference-redesign/warrior-banner.png`
- `public/assets/ui/lobby/reference-redesign/start-game-frame.svg`
- `public/assets/ui/lobby/reference-redesign/icons/helmet.svg`
- `public/assets/ui/lobby/reference-redesign/icons/chest.svg`
- `public/assets/ui/lobby/reference-redesign/icons/pants.svg`
- `public/assets/ui/lobby/reference-redesign/icons/gloves.svg`
- `public/assets/ui/lobby/reference-redesign/icons/boots.svg`
- `public/assets/ui/lobby/reference-redesign/icons/offhand.svg`
- `public/assets/ui/lobby/reference-redesign/icons/weapon.svg`

### Existentes/preservados e ainda usados em parte do layout

- `public/assets/ui/lobby/crest-warrior.svg`
- `public/assets/ui/lobby/icon-hero.svg`
- `public/assets/ui/lobby/icon-inventory.svg`
- `public/assets/ui/lobby/icon-skills.svg`
- `public/assets/ui/lobby/icon-workshop.svg`
- `public/assets/ui/lobby/icon-crossed-swords.svg`
- `public/assets/ui/lobby/character-platform.svg` (preservado, mas oculto no desktop para nao duplicar o dais do background)
- `public/assets/ui/lobby/reference-redesign/equipment-slot-frame.png` (preservado; substituido visualmente no desktop por `equipment-slot-refined.svg`).

## Alteracoes parciais e pontos de atencao

- A moldura do painel direito ainda reutiliza a moldura esquerda; nao ha `panel-inventory-frame.png` exclusivo integrado.
- O footer ainda depende de estilo/texture CSS, sem `footer-frame.png` dedicado.
- O estado ativo/equipado ainda usa brilho/estilo sobre a moldura; nao existe `equipment-slot-frame-active.png` exclusivo.
- O CTA usa SVG, nao uma versao raster final aprovada. A estrutura HTML e o clique estao corretos.
- O background e PNG; nao converter ou trocar para WebP sem validar novamente o recorte do `backdropScene`.
- Em 1366x768, os paineis podem usar scroll interno para comportar a grade e Status, sem corte horizontal. Isso e esperado pelo layout responsivo atual.

## Bugs conhecidos / riscos visuais

- A captura pode mostrar um fino retangulo de foco ao redor do CTA dependendo de como o navegador da foco programatico ao `#start-game`; o texto agora fica dentro da moldura. Nao remover foco acessivel sem validar teclado.
- O botao ADM aparece em capturas administrativas por design; em sessoes normais ele nao deve ser montado.
- Ainda e necessario comparar manualmente itens altos reais (capacete/peitoral) no navegador apos equipar, embora o CSS final tenha reservado area com `object-fit: contain` para resolver o corte mostrado pelo usuario.
- Nao ha repositorio Git inicializado neste diretorio, logo Git nao consegue listar diff/status. O resultado exato deve ser conferido apos este handoff, conforme instrucao abaixo.

## Funcionalidades testadas

- Captura automatica do lobby em 1920x1080: passou.
- Capturas em 1600x900 e 1366x768: geradas; sem corte horizontal. Paineis podem rolar internamente em 1366x768.
- `npm run typecheck`: passou durante esta sessao.
- `npx vitest run src/ui/LobbyScreen.test.ts src/ui/LobbyPresentation.test.ts src/admin/AdminPanel.test.ts src/style.test.ts`: passou, 4 arquivos e 36 testes.
- Ultimo `npm run build` apos a correcao de alinhamento: passou em aproximadamente 34,59s, 111 modulos transformados. Aviso unico: bundle `Game` maior que 500 kB.
- `Ligarserver-Admin-Incognito.bat` foi revisado no codigo para o caso de porta ocupada; nao foi executado novamente de forma automatizada para evitar abrir janela do navegador durante o handoff.

## Funcionalidades NAO testadas nesta rodada final

- Fluxo manual completo de equipar/desequipar cada tipo de item apos o ultimo CSS.
- Drag/drop de cada slot apos o ultimo CSS.
- Clique/teclado manual no CTA apos a ultima correcao visual.
- Troca manual pelas abas Skills e Oficina na mesma sessao final.
- Animacoes, entrega/craft e enquadramento do ferreiro 3D.
- Gameplay de combate, fadiga, dash, target por Q, arqueiros, drops e boss.

## Comandos e porta correta

### Rodar localmente

```powershell
npm run dev -- --host 127.0.0.1 --port 5174
```

- URL normal: `http://127.0.0.1:5174/`
- URL administrador: `http://127.0.0.1:5174/?admin=1`
- Porta correta: **5174**.
- O script para administrador e `Ligarserver-Admin-Incognito.bat` na raiz.

### Testar

```powershell
node scripts-inspect/capture-lobby.mjs artifacts/lobby-next.png
npm run typecheck
npx vitest run src/ui/LobbyScreen.test.ts src/ui/LobbyPresentation.test.ts src/admin/AdminPanel.test.ts src/style.test.ts
npm run build
```

## Arquivos que o proximo agente deve editar, somente se houver nova solicitacao

- Layout/fidelidade do lobby: `src/styles/lobby-reference.css`.
- Camera/preview 3D: `src/ui/LobbyScreen.ts`.
- URL/recorte do cenario: `src/ui/LobbyPresentation.ts`.
- Novos assets e contratos: `public/assets/ui/lobby/reference-redesign/` e `ASSET_MANIFEST.md`.
- ADM: `src/style.css`, `src/admin/AdminPanel.ts`, `Ligarserver-Admin-Incognito.bat`.
- Oficina somente se o pedido for sobre ela: `src/ui/BlacksmithScreen.ts` e estilos correspondentes; nao tocar por reflexo de uma solicitacao de lobby.

## START HERE — PROXIMO AGENTE

1. **Nao faca uma nova implementacao antes de abrir este handoff inteiro.** A ultima mudanca valida esta em `src/styles/lobby-reference.css` e a melhor prova visual e `artifacts/lobby-alignment-final.png` comparada com `lobby.png`.
2. Confirme que o servidor esta em `http://127.0.0.1:5174/` ou inicie-o com a porta 5174. Para admin, use `Ligarserver-Admin-Incognito.bat` ou `?admin=1`.
3. Antes de tocar no CSS, capture novamente: `node scripts-inspect/capture-lobby.mjs artifacts/lobby-next.png`.
4. Se a proxima tarefa continuar a fidelidade visual, priorize verificar equipamento alto real e CTA com teclado. Preserve os limites de `.is-equipped-art`, a grade/Status e o dais do background.
5. Se forem criados novos assets, atualize `ASSET_MANIFEST.md` e este handoff no mesmo checkpoint.
6. Reexecute typecheck, os testes direcionados e build somente depois de uma nova mudanca real. Nao faca commit sem pedido explicito.

## Resultado da verificacao Git desta parada

Comandos executados apos este handoff:

```powershell
git status
git diff --stat
```

Resultado real:

- `git status`: `fatal: not a git repository (or any of the parent directories): .git`
- `git diff --stat`: Git informou que a pasta nao e repositorio e exibiu a ajuda de `git diff --no-index`.
- Nao ha como obter automaticamente uma lista de arquivos modificados ou diffstat neste diretorio. Nenhum commit foi criado.

## Conferencia manual de arquivos importantes

Como o Git esta indisponivel, estes arquivos foram conferidos manualmente e devem constar em qualquer proxima revisao:

- `index.html`: estrutura funcional atual do lobby, navegacao, painel esquerdo, palco, inventario, footer e CTA. Foi parte da reconstrucao anterior e deve ser preservado.
- `src/styles/lobby-reference.css`: pele visual dominante do lobby e local da ultima correcao.
- `src/ui/LobbyScreen.ts`: render do lobby e enquadramento da camera.
- `src/ui/LobbyPresentation.ts` e `src/ui/LobbyPresentation.test.ts`: backdrop raster e seu teste.
- `src/style.css` e `src/admin/AdminPanel.ts`: painel ADM.
- `Ligarserver-Admin-Incognito.bat`: inicio administrador sem conflito de porta.
- `scripts-inspect/capture-lobby.mjs`: captura de verificacao, agora com largura/altura opcionais.
- `public/assets/ui/lobby/reference-redesign/`: todos os novos assets do passe visual.
- `public/assets/ui/lobby/character-platform.svg` e `public/assets/ui/lobby/icon-crossed-swords.svg`: assets anteriores preservados.
- `CODEX_HANDOFF.md`: documento de continuidade atualizado nesta parada.

---

## Checkpoint de retomada — 13/09/2026

### Registro imediato solicitado pelo usuario

- Regra permanente: antes de encerrar uma sessao, mudar de agente ou ficar sem creditos, atualizar este arquivo com o que foi concluido, alteracoes parciais, assets, validacoes, riscos e proximo passo seguro.
- O lobby descrito acima permanece a ultima entrega consolidada. Nenhuma regressao intencional foi feita neste checkpoint.
- Nova solicitacao em andamento: reconstruir visualmente a **Oficina / Forja de Cinzafogo** no mesmo universo do lobby, preservando integralmente receitas, materiais, conversa, inventario, craft e apresentacao 3D do ferreiro. O refinamento visual incremental de Skills vem em seguida.
- Antes de alterar a Forja, sera feita uma auditoria estrutural dos componentes e estilos reais; o novo checkpoint final registrara arquivos e testes efetivamente executados.

---

## Checkpoint de entrega — Forja e Skills — 13/09/2026

### Concluído

- Reconstruída a aparência da rota **Forja de Cinzafogo** sem alterar `BlacksmithScreen.ts`, callbacks, estado, inventário ou persistência.
- A composição agora tem masthead próprio, selo de bigorna, cena 3D do ferreiro/bancada à esquerda, equipamento e mochila reais à direita e trilho de receitas abaixo no desktop.
- Conversa de licença, compra, materiais, estados disponível/indisponível, craft de 15 s, entrega e notificação continuam sendo os elementos reais já renderizados pelo componente.
- A aba **Skills** recebeu refinamento visual incremental como grimório de guerra: duas colunas de skills no desktop, atalhos mais legíveis e o mesmo acabamento de metal/pergaminho do lobby. Nenhuma tecla, energia ou lógica de skill foi alterada.
- Corrigido defeito encontrado na inspeção mobile da Forja: as três regiões ficavam sobrepostas por alturas herdadas do CSS legado. Em telas estreitas, a camada nova força fluxo vertical de cena, conversa, equipamento e receitas, preservando rolagem natural.

### Arquivos alterados nesta entrega

- `index.html`
  - Carrega `src/styles/forge-reference.css` e `src/styles/skills-reference.css` após as camadas visuais anteriores.
- `src/styles/forge-reference.css` (novo)
  - Camada isolada da Oficina: paleta, molduras, cenografia, equipamentos, mochila, receitas, CTA, foco visível, responsividade e `prefers-reduced-motion`.
- `src/styles/skills-reference.css` (novo, criado pelo agente de Skills)
  - Acabamento visual isolado da aba Skills; não modifica TypeScript.
- `scripts-inspect/capture-lobby.mjs`
  - Agora aceita um quinto argumento opcional `forge` ou `skills` para capturar essas telas, por exemplo: `node scripts-inspect/capture-lobby.mjs artifacts/forge.png 1920 1080 forge`.
  - Flags opcionais de verificação: `--layout-report`, `--keyboard-report` e `--reduced-motion`.
- `CODEX_HANDOFF.md` (este checkpoint).

### Assets novos da Forja

Todos foram criados em `public/assets/ui/forge/`, validados como XML e integrados apenas como decoração sem interceptar clique:

- `panel-ornate-frame.svg`
- `anvil-crest.svg`
- `forge-divider.svg`
- `hammer-anvil-cta.svg`
- `ASSET_MANIFEST.md`

### Inspeção visual realizada

- Desktop Forja: `artifacts/forge-visual-review.png` em 1920x1080.
- Desktop Skills: `artifacts/skills-visual-review.png` em 1920x1080.
- Mobile Forja: `artifacts/forge-visual-mobile.png` em 390x844, após a correção de sobreposição.
- A captura é feita pela sessão local CDP já configurada em `127.0.0.1:9237`; não exige Playwright.

### Acessibilidade e movimento

- Navegação sem mouse verificada por Tab na Forja: 13 destinos focáveis na sessão administrativa, incluindo retorno, conversa e mochila. LOG/ADM globais também aparecem no ciclo por serem controles existentes fora da rota.
- Navegação sem mouse verificada por Tab em Skills: abas, controle automático, cinco registros de teclas e CTA permanecem focáveis.
- `prefers-reduced-motion: reduce` foi emulado nas duas telas. A regra ativa reduziu `transitionDuration` para `1e-05s` (0,01 ms).

### Validação final desta entrega

- `npx vitest run src/ui/BlacksmithScreen.test.ts src/crafting/BlacksmithWorkshop.test.ts src/ui/LobbyScreen.test.ts`
  - Passou: 3 arquivos, 31 testes.
- `npm run typecheck`
  - Passou.
- `npx vite build --emptyOutDir=false`
  - Passou: 113 módulos transformados, build em 38,66 s.
  - Aviso conhecido apenas: bundle `Game` acima de 500 kB; não bloqueia a build.

### Preservar / próximo passo seguro

- Não modificar os contratos de `BlacksmithScreen`: `data-back-from-blacksmith`, `data-open-blacksmith-negotiation`, `data-buy-blacksmith-license`, `data-craft-recipe`, `data-workshop-backpack-item`, hosts da cena e estados `is-*`.
- Não remover nem redimensionar a cena `BlacksmithForgePresentation` a zero; ela usa `ferreiro.glb`, Draco e animações idle/working/delivery.
- Ao mexer no responsivo da Forja, manter o fluxo mobile em bloco definido em `src/styles/forge-reference.css`; não reintroduzir as linhas de grid fixas do CSS legado.
- Próxima melhoria opcional: validar uma receita licenciada com materiais suficientes em tela real, para inspecionar o estado `is-ready` e a animação de forja sem alterar o tempo de 15 s.

---

## Checkpoint de correção — Forja desktop — 13/09/2026

### Relato reproduzido e causa confirmada

- O usuário executou `Ligarserver-Admin-Incognito.bat` e reproduziu o defeito também em janela InPrivate. Portanto, o problema não era cache.
- A camada `forge-reference.css` estava carregada, mas regras antigas de `src/style.css` ainda mantinham a conversa/equipamento como grids internos com linhas mínimas, slots com `aspect-ratio` e o item `.workshop-layout` esticado dentro da linha fixa da tela.
- O resultado era overflow visual: cena, equipamento, mochila e receitas ocupavam a mesma região e as decorações atravessavam o conteúdo.

### Correção aplicada

- `src/styles/forge-reference.css`
  - `.workshop-layout` usa `align-self: start`, permitindo altura intrínseca e rolagem natural.
  - Conversa e equipamento neutralizam os grids legados com `display: block`.
  - A cena deixa de herdar crescimento/flex mínimo (`flex: none; min-height: 0`).
  - Slots de equipamento usam `aspect-ratio: auto`, mantendo a arma primária compacta.
  - O texto gerado por `aria-label` no pseudo-elemento foi removido da apresentação; o rótulo visível real permanece, sem duplicação.
  - A moldura ornamental recebeu uma camada escura de segurança para não competir com títulos e controles.
- `src/styles/forge-reference.test.ts` (novo)
  - Cinco contratos de regressão cobrem altura intrínseca, neutralização dos grids antigos, cena sem flex mínimo, slot sem proporção herdada e ausência do rótulo duplicado.
- `scripts-inspect/capture-lobby.mjs`
  - O relatório de layout inclui `#blacksmith-screen` e foi mantida uma sonda opcional de diagnóstico (`--probe-align-start`) usada para confirmar a causa antes da alteração permanente.

### Evidência visual e acessibilidade

- Desktop real, 1904x930: `artifacts/forge-overlap-fixed-final.png`.
  - Layout: conversa e equipamento terminam em `912.14px`; receitas iniciam em `930.14px`. Não há interseção.
- Mobile real, 390x844: `artifacts/forge-overlap-fixed-mobile.png`.
  - Fluxo vertical preservado: conversa, equipamento e receitas aparecem em sequência, com rolagem natural.
- Teclado e movimento reduzido: `artifacts/forge-overlap-accessibility.png`.
  - Percurso por Tab executado; `prefers-reduced-motion: reduce` ativo com `transitionDuration: 1e-05s`.

### TDD e validação final

- RED confirmado: o novo teste de rótulo duplicado falhou antes da correção; os quatro contratos estruturais também haviam falhado antes da primeira implementação.
- GREEN: `src/styles/forge-reference.test.ts` passou com 5/5 testes.
- Suíte final direcionada: 3 arquivos, 18/18 testes aprovados.
- `npm run typecheck`: aprovado (`tsc --noEmit`).
- `vite build --emptyOutDir=false`: aprovado, 113 módulos transformados.
- Aviso conhecido e não bloqueante: chunk `Game` acima de 500 kB.
- Nenhuma regra de inventário, licença, craft, persistência ou apresentação Three.js foi alterada.

---

# HANDOFF FINAL DA SESSÃO — 13/09/2026

Este checkpoint é o registro autoritativo mais recente. Os checkpoints anteriores permanecem no arquivo como histórico. Depois do pedido de parada do usuário, nenhum código, estilo ou asset foi alterado; somente este `CODEX_HANDOFF.md` foi atualizado.

## Estado executivo atual

- O lobby **Salão do Guerreiro** está reconstruído e funcional, com direção visual de fantasia sombria semelhante à referência fornecida.
- A tela **Skills** recebeu uma camada visual própria, sem alteração de regras, energia, estrelas ou teclas.
- A **Forja de Cinzafogo** recebeu uma camada visual própria. A sobreposição grave reproduzida pelo usuário em InPrivate foi corrigida; a causa era CSS legado ainda impondo grid, alturas mínimas e proporção aos slots, não cache.
- O último typecheck, a última suíte direcionada da Forja e o último build passaram.
- Não foi criado commit. Esta pasta não contém `.git` e os comandos Git não conseguem calcular status ou diff.
- Os processos temporários Vite e Edge/CDP usados na última validação foram encerrados. O próximo agente deve verificar a porta antes de assumir que há servidor ativo.

## Lobby — tudo que está concluído

### Estrutura geral e cabeçalho

- Shell em três áreas no desktop: equipamento/status à esquerda, personagem 3D no centro e inventário/Skills à direita.
- Header com brasão, textos “Fortaleza de Cinzafogo” e “Salão do Guerreiro”, abas Herói, Inventário, Skills e Oficina e bloco de disciplina.
- As abas continuam sendo botões HTML reais com `data-lobby-tab`; IDs e eventos existentes foram preservados.
- O stylesheet dominante é `src/styles/lobby-reference.css`, carregado depois de `src/style.css`.
- Há layouts responsivos abaixo de 1180 px e 760 px. Em 1366x768, scroll interno de painel pode ocorrer e é comportamento esperado.

### Ícones e slots de equipamentos

- Foram criados sete ícones dedicados de metal envelhecido para os estados vazios:
  - `icons/helmet.svg`
  - `icons/chest.svg`
  - `icons/pants.svg`
  - `icons/gloves.svg`
  - `icons/boots.svg`
  - `icons/offhand.svg`
  - `icons/weapon.svg`
- No desktop, esses SVGs substituem visualmente os glifos inline vazios; o SVG inline original fica com opacidade zero, mas o DOM e os rótulos acessíveis permanecem.
- Itens equipados continuam exibindo a arte real do item, não o ícone vazio. A área `.is-equipped-art` usa `object-fit: contain` e limites menores para evitar corte de capacetes, peitorais e armas altas.
- O ícone da arma primária usa largura menor para manter a lâmina inteira visível.
- Slots desktop usam `equipment-slot-refined.svg`; o raster `equipment-slot-frame.png` permanece como fallback integrado nas faixas abaixo do breakpoint desktop.
- O estado equipado usa brilho/saturação sobre a moldura existente. Ainda não existe `equipment-slot-frame-active.png` exclusivo.

### Painel esquerdo

- O painel mantém o título “Armadura e arma”, grade de duas colunas para Capacete, Peitoral, Calça, Luvas, Botas e Arma secundária e slot largo centralizado para Arma primária.
- Usa `panel-equipment-frame.png` como moldura artística.
- Mantém slots reais, botões reais para itens equipados, clique, ações e atributos de integração.
- O conteúdo pode rolar dentro do painel em alturas menores; não deve ser convertido novamente em uma altura rígida.

### STATUS ATUAL

- Permanece dentro do painel esquerdo abaixo dos equipamentos.
- Exibe Nível, Pontos disponíveis e os sete atributos reais: Força, Ataque, Defesa, Agilidade, Crítico físico, Crítico mágico e Esquiva.
- Desktop usa resumo e atributos em duas colunas, divisores finos e marcadores dourados.
- Valores vêm de `buildRpgUiViewModel`; não são texto decorativo.
- O bônus `Conjunto do Forjador Comum` continua aparecendo quando as cinco peças comuns são equipadas.

### Personagem 3D e câmera

- O personagem continua no canvas Three.js real, com rotação por arraste/setas e zoom por roda/setas para cima/baixo.
- Câmera atual: perspectiva 24°, zoom inicial `5.55`, posição `(0, 1.35, zoom)` e `lookAt(0, 0.94, 0)`.
- Limite de zoom continua entre `4.7` e `8.2`.
- O modelo é assentado pelo bounding box, recebe sombras e usa a animação `lobby_dwarf_idle`, com fallback para idle do personagem.
- Nós de arma do modelo são ocultados no preview do lobby para não duplicar o equipamento visual.
- Iluminação específica do lobby e ACES Filmic tone mapping com exposição `1.08` permanecem ativos apenas durante o lobby.
- `prefers-reduced-motion` desativa a animação/loop contínuo do preview conforme a política existente.

### Background e plataforma

- Background ativo: `public/assets/ui/lobby/reference-redesign/lobby-warrior-background.png`.
- Ele é carregado por `LOBBY_BACKDROP_URL` em `src/ui/LobbyPresentation.ts` e renderizado em `backdropScene`, não como CSS opaco sobre o personagem.
- O recorte é ajustado por `fitLobbyBackdropTexture` para cobrir o viewport mantendo o centro.
- O PNG já contém o dais de pedra. Por isso `character-platform.svg` fica oculto no desktop para evitar duas plataformas; continua integrado e disponível nos breakpoints menores.
- Ainda não existe versão WebP integrada.

### Banner

- `warrior-banner.png` está integrado em `.hero-stage-banner`.
- No desktop aparece como estandarte vertical recortado à direita do palco, com drop shadow.
- Os textos e o símbolo HTML antigos do banner ficam ocultos; o elemento continua decorativo e sem capturar cliques.
- Em telas estreitas o banner é ocultado para preservar espaço.

### Inventário / painel direito

- O painel direito mantém título, contador de capacidade, busca, filtro Todos/Equipamentos/Materiais, ícone de grade e mochila real.
- A busca e o filtro são mantidos em `LobbyScreen.ts`; slots vazios continuam visíveis para representar a capacidade total.
- Grade, quantidade, arte real, seleção, hover, expansão, persistência e evento de atualização do ADM foram preservados.
- O painel alterna entre Inventário e Skills pelo atributo `data-lobby-view`.
- Provisoriamente usa o mesmo `panel-equipment-frame.png` do painel esquerdo. `panel-inventory-frame.png` exclusivo ainda não existe.
- O ícone do cabeçalho usa `icon-inventory.svg`.

### Botão INICIAR PARTIDA

- Continua sendo o botão HTML real `#start-game`; clique, foco e transição para o jogo não foram substituídos por imagem.
- `start-game-frame.svg` está integrado como moldura de fundo.
- O conteúdo interno foi organizado em coluna: “Entrar na masmorra” e “Iniciar partida” ficam dentro da moldura.
- `icon-crossed-swords.svg` está integrado como ícone absoluto, sem deslocar o texto.
- O CTA é maior no desktop e sobrepõe o topo do footer de modo intencional, seguindo a referência.
- Foco de teclado permanece visível como iluminação interna da moldura.

### Footer

- Mantém o status dinâmico à esquerda e a frase “Guerreiros não nascem prontos. Eles se constroem.” à direita.
- Usa camadas escuras e divisores em CSS; ainda não existe `footer-frame.png` dedicado.
- O ícone de status usa `icon-hero.svg`.
- Em telas pequenas a frase da direita é ocultada e o CTA é reposicionado.

## Estado atual da tela Skills

- `src/styles/skills-reference.css` está carregado e limita suas regras à aba Skills do lobby.
- Visual atual: grimório de guerra, cards em duas colunas no desktop, arte real de cada skill, custo de energia, cooldown, estrelas, seção de atalhos, ataque básico automático e botões para redefinir teclas.
- Em até 620 px, os cards passam para uma coluna.
- Valores, cinco skills, estrelas, energia, cooldown, captura de teclas e mensagens acessíveis continuam vindo de `LobbyScreen.ts`; não houve alteração de lógica.
- Capturas existentes: `artifacts/skills-visual-review.png` e `artifacts/skills-accessibility-review.png`.
- Teclado e `prefers-reduced-motion` foram verificados na rodada visual da Skills.
- Não foi executada uma partida usando cada skill depois do último passe visual.

## Estado atual da Oficina / Forja de Cinzafogo

- `src/styles/forge-reference.css` está carregado após os estilos base e controla somente `#blacksmith-screen`.
- Composição atual: masthead e retorno ao salão; cena 3D/bancada e conversa à esquerda; equipamento e mochila à direita; receitas abaixo, com rolagem natural.
- Os quatro assets da Forja estão realmente integrados:
  - `anvil-crest.svg` no cabeçalho;
  - `panel-ornate-frame.svg` nos painéis, sob camada escura para não competir com o conteúdo;
  - `forge-divider.svg` no cabeçalho de receitas;
  - `hammer-anvil-cta.svg` nos botões de craft.
- A correção mais recente adicionou altura intrínseca ao layout, neutralizou grids legados em conversa/equipamento, removeu flex mínimo da cena, retirou `aspect-ratio` herdado dos slots e eliminou o rótulo visual duplicado gerado por `aria-label`.
- Evidência atual:
  - desktop 1904x930: `artifacts/forge-overlap-fixed-final.png`;
  - mobile 390x844: `artifacts/forge-overlap-fixed-mobile.png`;
  - teclado/reduced motion: `artifacts/forge-overlap-accessibility.png`.
- Na medição final, conversa/equipamento terminavam em `912.14px` e receitas começavam em `930.14px`; não havia interseção.
- A página da Forja é mais alta que um viewport e usa scroll de propósito; as receitas podem começar abaixo da dobra.
- Regras de licença, 30 Guild Tokens, cinco receitas comuns, materiais, cores, craft de 15 s, inventário, entrega e persistência não foram alteradas pelo passe visual.
- `BlacksmithForgePresentation` continua responsável por GLB, Draco, idle, working, partículas, delivery e martelo invisível somente durante delivery.

## Arquivos de código, estilo e configuração modificados/importantes

Como Git não está disponível, esta lista foi reconciliada manualmente com os checkpoints e referências atuais:

- `index.html` — markup do lobby/Forja, abas, painéis, CTA, footer e carregamento de `lobby-reference.css`, `forge-reference.css` e `skills-reference.css`.
- `src/styles/lobby-reference.css` — camada visual dominante do lobby.
- `src/styles/skills-reference.css` — camada visual da Skills.
- `src/styles/forge-reference.css` — camada visual e correção de layout da Forja.
- `src/styles/forge-reference.test.ts` — cinco contratos de regressão da correção da Forja.
- `src/style.css` — CSS legado e ajustes anteriores do painel ADM; continua sendo carregado antes das camadas de referência.
- `src/ui/LobbyScreen.ts` — render do lobby, status, busca/filtro, troca de painel, equipamento, câmera e preview Three.js.
- `src/ui/LobbyPresentation.ts` — background, recorte, iluminação/apresentação e ocultação de arma no preview.
- `src/ui/LobbyPresentation.test.ts` — contrato do background e recorte.
- `src/ui/BlacksmithScreen.ts` — integração funcional da oficina; não foi alterado pela correção CSS mais recente.
- `src/ui/BlacksmithForgePresentation.ts` — apresentação 3D do ferreiro e Draco; alteração anterior preservada.
- `src/admin/AdminPanel.ts` — opacidade/arraste do ADM em alteração anterior.
- `scripts-inspect/capture-lobby.mjs` — captura lobby/forge/skills, tamanhos opcionais, relatório de layout, teclado, reduced motion e sonda diagnóstica.
- `Ligarserver.bat` — inicialização normal existente.
- `Ligarserver-Admin-Incognito.bat` — porta 5174, modo admin, detecção de servidor existente e abertura Edge InPrivate.
- `CODEX_HANDOFF.md` — histórico e este checkpoint final.

## Assets criados, alterados e integração real

### Lobby — integrados agora

- `public/assets/ui/lobby/reference-redesign/lobby-warrior-background.png` — backdrop Three.js ativo.
- `public/assets/ui/lobby/reference-redesign/panel-equipment-frame.png` — moldura dos dois painéis laterais.
- `public/assets/ui/lobby/reference-redesign/equipment-slot-refined.svg` — moldura dos slots no desktop.
- `public/assets/ui/lobby/reference-redesign/equipment-slot-frame.png` — fallback integrado nas faixas menores.
- `public/assets/ui/lobby/reference-redesign/warrior-banner.png` — estandarte do palco.
- `public/assets/ui/lobby/reference-redesign/start-game-frame.svg` — moldura do CTA.
- Os sete SVGs em `public/assets/ui/lobby/reference-redesign/icons/` — ícones vazios de equipamento no desktop.
- `public/assets/ui/lobby/crest-warrior.svg` — brasão do header.
- `public/assets/ui/lobby/icon-hero.svg`, `icon-inventory.svg`, `icon-skills.svg`, `icon-workshop.svg` — navegação/status.
- `public/assets/ui/lobby/icon-crossed-swords.svg` — CTA.
- `public/assets/ui/lobby/character-platform.svg` — integrado nos breakpoints menores e oculto no desktop porque o background já contém dais.
- `public/assets/ui/lobby/reference-redesign/ASSET_MANIFEST.md` — contrato dos assets.

### Forja — integrados agora

- `public/assets/ui/forge/anvil-crest.svg`.
- `public/assets/ui/forge/panel-ornate-frame.svg`.
- `public/assets/ui/forge/forge-divider.svg`.
- `public/assets/ui/forge/hammer-anvil-cta.svg`.
- `public/assets/ui/forge/ASSET_MANIFEST.md`.
- `public/blacksmith/forge-bench-background.png` — background da bancada já integrado na apresentação da cena.
- `public/draco/draco_decoder.js`, `draco_decoder.wasm` e `draco_wasm_wrapper.js` — dependência real do GLB do ferreiro.

### Assets previstos, mas não criados/não integrados

- `lobby-warrior-background.webp`.
- `panel-inventory-frame.png`.
- `equipment-slot-frame-active.png`.
- `equipment-ornament-top.png`.
- `equipment-divider.png`.
- `lobby-platform.png` separado.
- `footer-frame.png`.

Não referenciar esses nomes como se existissem. Eles aparecem apenas como contratos futuros no manifest.

## Alterações parciais, bugs conhecidos e riscos

- Não existe Git nesta pasta; não há baseline confiável para diferenciar automaticamente todos os arquivos modificados de arquivos preexistentes.
- O painel direito reutiliza a arte do painel esquerdo.
- Footer não possui frame artístico dedicado.
- Estado equipado não possui frame ativo dedicado.
- Background é PNG e pode ser pesado; não trocar para WebP sem preservar recorte e teste.
- Em resoluções baixas, painéis do lobby podem ter scroll interno. Isso é intencional para evitar corte horizontal.
- Na Forja, receitas ficam abaixo da dobra em 1904x930. Isso é scroll normal, não a sobreposição anterior.
- Capturas administrativas exibem o botão ADM; isso não deve ser confundido com elemento do layout público.
- O build emite aviso de chunk `Game` acima de 500 kB. É aviso conhecido, não erro.
- Os estilos são camadas de override sobre `src/style.css`; alterações globais tardias no CSS legado podem voltar a competir com Lobby/Skills/Forja.
- `scripts-inspect/capture-lobby.mjs` depende de aplicação em 5174 e de uma instância de browser com CDP em 9237. A porta 9237 é apenas de inspeção; a porta da aplicação é 5174.
- Há vários screenshots e arquivos de diagnóstico em `artifacts/`; não são runtime assets do jogo.

## O que ainda falta

- Somente após novo pedido do usuário: microajustes de fidelidade do lobby contra uma nova captura.
- Testar em navegador real itens altos equipados em cada slot após o último CSS.
- Testar manualmente equipar/desequipar, drag/drop, destruir/aprimorar e bônus do conjunto após o último passe visual.
- Testar manualmente o CTA com clique e teclado em sessão completa até entrar no combate.
- Testar o lobby em viewport mobile real; existem verificações em 1920x1080, 1600x900 e 1366x768, mas não há aceite final mobile equivalente ao da Forja.
- Na Forja, validar visualmente uma conta licenciada com materiais suficientes, esperar os 15 s e observar estados `is-ready`, `working` e `delivery` no navegador real.
- Testar gameplay completo: combate, fadiga, dash, target Q, arqueiro, drops, waves e boss.
- Os assets futuros listados acima são opcionais e só devem ser produzidos se o usuário pedir novo refinamento.

## Funcionalidades testadas

- Lobby capturado/revisado em 1920x1080, 1600x900 e 1366x768; melhor evidência: `artifacts/lobby-alignment-final.png`.
- Suite anterior do lobby: `LobbyScreen.test.ts`, `LobbyPresentation.test.ts`, `AdminPanel.test.ts` e `style.test.ts` — 36 testes aprovados.
- Suite consolidada posterior incluiu Lobby/Blacksmith — 31 testes aprovados.
- Skills capturada visualmente; navegação por Tab e reduced motion verificados.
- Forja atual capturada em desktop 1904x930 e mobile 390x844; ausência de sobreposição confirmada numericamente.
- Forja: navegação por Tab e `prefers-reduced-motion: reduce` verificados.
- Teste TDD novo da Forja passou 5/5.
- Última suíte executada depois da correção final: `forge-reference.test.ts`, `BlacksmithScreen.test.ts` e `BlacksmithWorkshop.test.ts` — 3 arquivos, 18/18 testes aprovados.
- Último `npm run typecheck`: aprovado com `tsc --noEmit`.
- Último build Vite: aprovado.

## Funcionalidades NÃO testadas depois do último passe visual

- Uma partida completa iniciada pelo CTA até gameplay e fim de wave.
- Cada ação de inventário por clique e drag/drop em browser real.
- Cada skill usada em combate e cada tecla redefinida durante gameplay.
- Compra real da licença e craft visual completo de 15 s com entrega depois da correção CSS final.
- Todas as animações/estados do ferreiro na mesma sessão final.
- Lobby mobile com inspeção visual final equivalente à Forja.
- Instalação limpa (`npm install`) em outra máquina.

## Comandos, URLs e porta correta

### Iniciar para o usuário

```powershell
.\Ligarserver-Admin-Incognito.bat
```

O script abre `http://127.0.0.1:5174/?admin=1` em Edge InPrivate. Se a porta já estiver ocupada, abre somente o navegador e não cria outro Vite.

Inicialização direta usada pelos agentes, sempre via RTK:

```powershell
rtk npm run dev -- --host 127.0.0.1 --port 5174
rtk npm run dev:admin -- --host 127.0.0.1 --port 5174
```

- URL normal: `http://127.0.0.1:5174/`
- URL admin: `http://127.0.0.1:5174/?admin=1`
- Porta correta da aplicação: **5174**.
- Porta opcional de Chrome DevTools usada por capturas: **9237**.

### Capturar/verificar

```powershell
rtk node scripts-inspect/capture-lobby.mjs artifacts/lobby-next.png 1920 1080 lobby --layout-report
rtk node scripts-inspect/capture-lobby.mjs artifacts/skills-next.png 1920 1080 skills --keyboard-report --reduced-motion
rtk node scripts-inspect/capture-lobby.mjs artifacts/forge-next.png 1904 930 forge --layout-report --keyboard-report --reduced-motion
```

### Testar/buildar

```powershell
rtk npm run typecheck
rtk npx vitest run src/ui/LobbyScreen.test.ts src/ui/LobbyPresentation.test.ts src/admin/AdminPanel.test.ts src/style.test.ts
rtk npx vitest run src/styles/forge-reference.test.ts src/ui/BlacksmithScreen.test.ts src/crafting/BlacksmithWorkshop.test.ts
rtk npx vite build --emptyOutDir=false
```

## Resultado do último build

- Comando: `rtk npx vite build --emptyOutDir=false`.
- Resultado: sucesso, exit code 0.
- 113 módulos transformados.
- `dist/index.html`: 17.13 kB, gzip 4.57 kB.
- `dist/assets/index-BxnA82JO.css`: 169.11 kB, gzip 33.90 kB.
- `dist/assets/index-ys-f6znr.js`: 8.18 kB, gzip 3.16 kB.
- `dist/assets/Game-CKYdf7Fe.js`: 905.37 kB, gzip 241.69 kB.
- Tempo registrado: 1 min 13 s.
- Único aviso: chunk maior que 500 kB; build não falhou.

## Resultado de `git status` e `git diff --stat`

Executados depois do pedido de handoff, exatamente na raiz `C:\Users\pteix\OneDrive\Documentos\Gameweb\projeto2`:

```powershell
rtk git status
rtk git diff --stat
```

Resultado real:

- `git status`: exit code 1, `Not a git repository`.
- `git diff --stat`: exit code 1, aviso `Not a git repository. Use --no-index to compare two paths outside a working tree`, seguido pela ajuda do Git.
- Portanto não existe lista Git de arquivos alterados nem diffstat. A conferência acima foi manual.
- Nenhum commit foi criado.

---

## UPDATE FINAL - Auditoria Sol, lobby contido e Oficina 55/45 (2026-09-14)

Esta secao supersede as medidas e pendencias visuais dos checkpoints anteriores quando houver conflito. Ela registra o estado real deixado no disco nesta rodada.

### Objetivo atendido nesta rodada

- Comparar o lobby atual com `lobby.png` usando um agente `gpt-5.6-sol` com raciocinio `high`.
- Corrigir os pontos marcados pelo usuario: tamanho e conteudo dos slots, bloco de bonus do conjunto, grade do inventario, CTA e composicao do background.
- Reconstruir a Oficina como duas areas claras: toda a coluna esquerda para o ferreiro e uma unica janela tabulada na direita para `Equipamento`, `Inventario` e `Itens de craft`.
- Preservar inventario, equipamento, crafting, animacoes, ARIA, GLBs e persistencia existentes.

### Auditoria do agente Sol

O agente `/root/sol_visual_compare` fez somente auditoria visual, sem editar arquivos. Principais medidas encontradas, normalizadas para 1920x1080:

- Slots comuns atuais estavam perto de 139x103, enquanto a referencia pede aproximadamente 146x111.
- A arma primaria estava larga e baixa; a referencia pede aproximadamente 193x127.
- `STATUS ATUAL` precisava descer cerca de 35 px para recuperar o ritmo vertical da referencia.
- A grade do inventario precisava usar mais largura interna sem ultrapassar a moldura.
- CTA precisava ficar mais alto e um pouco mais estreito.
- O background anterior escondia a estatua no recorte central.
- A Oficina estava limitada por `max-width`/`max-height`; a recomendacao foi 55/45, sem rolagem da pagina no desktop e com rolagem somente no painel ativo.

### Arquivos modificados nesta rodada

- `src/ui/LobbyPresentation.ts`
- `src/ui/LobbyPresentation.test.ts`
- `src/styles/lobby-reference.css`
- `src/styles/forge-reference.css`
- `scripts-inspect/capture-lobby.mjs`
- `CODEX_HANDOFF.md`

### Asset criado e realmente integrado

- `public/assets/ui/lobby/reference-match/background-v2.png` - novo cenario raster, 2.582.611 bytes, realmente usado por `LOBBY_BACKDROP_URL` em `LobbyPresentation.ts`.
- O asset foi gerado com a ferramenta `imagegen`, usando como referencias o background anterior e `lobby.png`. Instrucao central: preservar o portao, plataforma, paleta e iluminacao; mover a estatua blindada para aproximadamente 25% da largura para que apareca no recorte central; nao incluir UI, personagem, texto nem banner.
- Arquivo bruto de geracao mantido fora do projeto em `C:\Users\pteix\.codex-conta2\generated_images\01a096fd-3209-70d2-ba2b-b00ba5d7baeb\exec-6f8a2532-0760-4fd0-85be-adca2d6a32df.png`.
- Os demais assets ja existentes de moldura, slots, banner, icones, ferreiro 3D e bancada nao foram substituidos nesta rodada.

### Lobby - estado real final

- Background: `background-v2.png` mostra a estatua novamente no lado esquerdo do palco central e preserva o portao/fortaleza. O personagem continua sendo o GLB vivo, separado do fundo.
- Personagem/camera: rig, animacao, escala, rotacao, zoom e camera nao foram alterados nesta rodada. O enquadramento validado continua com cabeca e pes dentro do palco.
- Painel esquerdo: fileiras passaram a usar alturas estaveis de 90 a 102 px, gaps menores e area separada para arte e rotulo. As imagens equipadas usam `object-fit: contain` e ficam inteiras.
- Arma primaria: ficou centralizada, mais estreita e mais alta, com largura de 62% da grade e altura entre 104 e 116 px.
- `STATUS ATUAL`: foi deslocado para baixo pelo aumento controlado dos slots; em 1672x941 ocupa aproximadamente `y632..813`, dentro do painel `y100..839`.
- Bonus de conjunto: o bloco verde `Conjunto do Forjador Comum` aparece quando as cinco pecas estao equipadas. Na fixture de conjunto completo ocupa `y760..813`, inteiramente dentro do painel. Stats reais permanecem `Forca +2`, `Ataque +2`, `Defesa +3`, `Agilidade +2`.
- Inventario: continua 4x5 com busca, filtro, quantidade real e handlers originais. A largura interna foi ampliada e as celulas agora usam altura desktop estavel de 72 a 82 px; em 1672 e 1904 a quinta fileira termina dentro da moldura.
- Banner: largura desktop foi reduzida para 116 px e alinhada na borda direita do palco, sem invadir o inventario.
- CTA: usa o mesmo `start-game-frame.svg`, agora com largura responsiva de 470 a 520 px e altura minima de 115 px. Em 1672x941 mede `x601..1071, y799..914`; click handler e foco continuam intactos.
- Footer: icone, mensagem real e citacao permanecem dentro da faixa inferior. ADM continua movivel e restrito ao modo admin.
- Desktop validado em 1672x941 e 1904x950. Mobile validado em 390x844 como fluxo vertical rolavel, sem estouro horizontal.

### Skills - estado atual

- A tela Skills nao foi redesenhada nesta rodada.
- Foi reaberta em 1672x941 apos as alteracoes; as cinco skills, estrelas, custos, cooldowns, autoataque e redefinicao das teclas continuam dentro da moldura e visiveis.
- A captura de regressao e `artifacts/pass2-skills-1672x941.png`.

### Oficina - estado real final

- Desktop: `.workshop-layout` ocupa `x32..1640, y120..916` em 1672x941, com 1608 px de largura util e relacao de colunas 55/45.
- Esquerda: `.workshop-conversation` mede aproximadamente 873x756; a cena do ferreiro ocupa 835x552 e exibe o GLB, bancada, background e texto/licenca. Esta coluna e integralmente dedicada ao ferreiro.
- Direita: `.workshop-equipment` mede aproximadamente 715x756 e agora funciona como uma unica janela. O tablist mede cerca de 673x60 e o corpo interno 673x641.
- Abas: `Equipamento`, `Inventario` e `Itens de craft` tem icones reais, estado selecionado em dourado, `role=tab`, `aria-selected`, `aria-controls` e somente um painel visivel por vez.
- Equipamento: os sete slots reais continuam disponiveis dentro do painel.
- Inventario: itens e selecao reais continuam disponiveis; a grade nao cria dados falsos.
- Craft: licenca, receitas, materiais verdes/vermelhos e botoes foram conferidos em estado liberado. O conteudo longo rola somente dentro do painel, sem aumentar a pagina desktop.
- Mobile 390x844: a Oficina vira duas secoes verticais; as tres abas foram compactadas para que seus textos completos caibam sem truncamento.
- GLB/animacoes do ferreiro, martelo, particulas, ciclo de 15 segundos e entrega nao foram alterados nesta rodada.

### Capturas finais e diagnosticas desta rodada

- `artifacts/pass2-lobby-full-set-1672x941.png`
- `artifacts/pass2-lobby-full-set-1904x950.png`
- `artifacts/pass2-lobby-mobile-390x844.png`
- `artifacts/pass2-skills-1672x941.png`
- `artifacts/pass2-forge-craft-1672x941.png`
- `artifacts/pass2-forge-inventory-1672x941.png`
- `artifacts/final-forge-mobile-390x844.png`

O script ganhou duas fixtures exclusivas de QA:

- `--full-set-fixture`: equipa as cinco pecas no perfil descartavel do navegador de captura.
- `--licensed-forge-fixture`: libera a licenca no perfil descartavel para renderizar receitas.

Essas flags nao alteram o save real usado pelo usuario.

### Testes e build finais

Executados com sucesso:

```powershell
npm run typecheck
npx vitest run src/ui/LobbyPresentation.test.ts src/ui/LobbyScreen.test.ts src/ui/BlacksmithScreen.test.ts src/styles/forge-reference.test.ts src/style.test.ts --pool=forks --maxWorkers=1
npx vitest run src/styles/forge-reference.test.ts src/ui/LobbyPresentation.test.ts --pool=forks --maxWorkers=1
npm run build
```

- Typecheck: passou.
- Suite focada principal: 5 arquivos, 44/44 testes passaram.
- Regressao apos o ultimo ajuste mobile: 2 arquivos, 11/11 testes passaram.
- Build final: passou; 113 modulos transformados em 14.33 s.
- Artefatos finais: `dist/assets/index-CDJmhFwb.css`, `dist/assets/index-DlQz2KPf.js`, `dist/assets/Game-Ci9wJOxM.js`.
- Aviso conhecido e nao bloqueante: chunk `Game` maior que 500 kB.

### Funcionalidades verificadas e nao verificadas

Verificadas: renderizacao desktop/mobile; background integrado; personagem 3D visivel; imagens dos equipamentos sem corte; bonus completo; grade 4x5 contida; Skills apos as mudancas; tres abas da Oficina; receitas licenciadas; rolagem interna de craft; typecheck; testes focados; build.

Nao verificadas manualmente nesta rodada: ciclo completo de 15 segundos de uma forja; retirada visual do martelo no ultimo segundo da entrega; compra real da licenca no save do usuario; equipar/desquipar cada combinacao; drag/drop; iniciar e concluir uma partida; navegador diferente do Edge/CDP.

### Limitacoes conhecidas

- A referencia nao pode ser literalmente pixel a pixel porque o personagem e um GLB vivo e o inventario mostra o save real. O layout, proporcoes, hierarquia e enquadramento foram aproximados por medidas, sem transformar a screenshot em interface raster.
- Nao existe controle funcional de configuracoes; por isso a engrenagem ilustrativa da referencia continua ausente.
- Em mobile o lobby e a Oficina sao deliberadamente longos e rolaveis; paineis inferiores ficam abaixo da primeira dobra.
- O warning do bundle `Game` maior que 500 kB permanece.
- A pasta continua sem repositorio `.git`; nenhum commit foi criado.

### Comandos para iniciar e reproduzir QA

```powershell
npm run dev:admin -- --host 127.0.0.1 --port 5174
node scripts-inspect/capture-lobby.mjs artifacts/check-lobby.png 1672 941 lobby --layout-report --full-set-fixture
node scripts-inspect/capture-lobby.mjs artifacts/check-forge.png 1672 941 forge-craft --layout-report --licensed-forge-fixture
node scripts-inspect/capture-lobby.mjs artifacts/check-mobile.png 390 844 forge --layout-report --licensed-forge-fixture
```

- Aplicacao: `http://127.0.0.1:5174/?admin=1`
- Porta correta: **5174**.
- CDP usado pelo script: **9237**.

## START HERE - PROXIMO AGENTE

Comece comparando `artifacts/pass2-lobby-full-set-1672x941.png` diretamente com `lobby.png`; essa e a nova baseline real. Nao reverta `background-v2.png`, as alturas fixas dos slots, o bloco de bonus, a grade 4x5 nem a Oficina 55/45. Para ajustes pontuais no lobby, edite apenas o bloco desktop final `Viewport-safe desktop sizing` no fim de `src/styles/lobby-reference.css`. Para a Oficina, continue no bloco `Two-column workshop console` no fim de `src/styles/forge-reference.css`. Edite `src/ui/BlacksmithScreen.ts` somente se o pedido alterar comportamento das abas; preserve todos os `data-*` e ARIA existentes. A proxima validacao manual de maior valor e executar uma forja real ate o fim dos 15 segundos e confirmar trabalho, particulas, entrega sem martelo, notificacao e item entrando na mochila. Nao faca commit enquanto esta pasta continuar sem `.git`.

## Arquivos que o próximo agente deve editar, conforme o tipo do próximo pedido

- Fidelidade/layout do lobby: `src/styles/lobby-reference.css`.
- Estrutura/controles do lobby: `index.html` e `src/ui/LobbyScreen.ts`.
- Câmera/personagem/background: `src/ui/LobbyScreen.ts`, `src/ui/LobbyPresentation.ts` e `src/ui/LobbyPresentation.test.ts`.
- Assets do lobby: `public/assets/ui/lobby/reference-redesign/` e seu `ASSET_MANIFEST.md`.
- Skills, somente visual: `src/styles/skills-reference.css`; lógica/teclas continuam em `src/ui/LobbyScreen.ts`.
- Oficina, somente visual/layout: `src/styles/forge-reference.css` e `src/styles/forge-reference.test.ts`.
- Oficina funcional/3D, somente se o pedido exigir: `src/ui/BlacksmithScreen.ts`, `src/ui/BlacksmithForgePresentation.ts` e `src/crafting/BlacksmithWorkshop.ts`.
- Captura e QA: `scripts-inspect/capture-lobby.mjs`.
- ADM/launcher: `src/style.css`, `src/admin/AdminPanel.ts` e `Ligarserver-Admin-Incognito.bat`.
- Sempre atualizar `CODEX_HANDOFF.md` antes de encerrar uma nova sessão.

## START HERE — PRÓXIMO AGENTE

1. Leia primeiro esta seção final e os dois checkpoints imediatamente anteriores sobre Forja/Skills. Considere este “HANDOFF FINAL DA SESSÃO” a fonte de verdade quando houver divergência com textos antigos no início do arquivo.
2. Não presuma que o servidor está ativo. Confirme a porta **5174**; se necessário, use `Ligarserver-Admin-Incognito.bat` ou `rtk npm run dev:admin -- --host 127.0.0.1 --port 5174`.
3. Antes de qualquer edição, abra ou capture o estado atual. Para lobby, compare `artifacts/lobby-alignment-final.png`; para Forja, compare `artifacts/forge-overlap-fixed-final.png` e `artifacts/forge-overlap-fixed-mobile.png`.
4. A última alteração de código válida está em `src/styles/forge-reference.css`; ela corrigiu a sobreposição desktop. Não remova `align-self: start`, os overrides `display: block`, `flex: none`, `min-height: 0` ou `aspect-ratio: auto` sem reproduzir desktop e mobile.
5. Se o próximo pedido for sobre lobby, comece por `src/styles/lobby-reference.css`; não toque em lógica de inventário, Three.js ou Oficina apenas para ajustar aparência.
6. Preserve todos os IDs, `data-*`, click targets, foco, rotação/zoom, inventário, status, CTA e contratos de craft descritos acima.
7. Depois de uma nova alteração real, execute o teste direcionado, typecheck, build e captura correspondente. Registre os resultados neste handoff.
8. Esta pasta não é um repositório Git. Não tente commit até o usuário fornecer/inicializar um repositório. **Nenhum commit foi feito nesta sessão.**

---

## UPDATE - Surgical lobby calibration (2026-09-13)

### Scope and files changed

This pass followed the latest annotated comparison against `lobby.png`: correct proportions and alignment only; no visual rewrite, no asset swap, no GLB/camera/inventory/crafting behavior changes.

Modified:

- `src/styles/lobby-reference.css`
- `src/admin/AdminPanel.ts`
- `CODEX_HANDOFF.md`

No asset was created, moved, removed, or replaced. The integrated lobby background, frames, slot art, banner, `start-game-frame.svg`, warrior GLB, inventory data and all event contracts remain untouched.

### Lobby changes completed

- Added a final desktop-only (`min-width: 1181px`) calibration block in `src/styles/lobby-reference.css`.
- Reduced side-column proportions to `clamp(340px, 21.2vw, 408px)` on the left and `clamp(390px, 24.2vw, 465px)` on the right, returning space to the 3D scene.
- Tightened the left panel margins/padding, kept the two-column equipment grid, reduced its gaps and visual slot height, and centered the primary weapon at 70% width.
- Enlarged the safe contain area for equipped PNG art, so images can remain visible without changing their assets.
- Compacted `STATUS ATUAL` typography, rows and gaps so the full status area can fit desktop height without a visible left scrollbar. Set bonus markup and stat logic are preserved.
- Corrected the header discipline block with controlled height, min-width and line-height so `DISCIPLINA / FORJA / LENDA` stays inside the masthead.
- Rebalanced inventory header, capacity, search/filter/grid controls and four-column backpack gaps; no controls or inventory behavior were removed.
- Slightly widened/tallened and repositioned the existing vertical banner only through CSS.
- Reduced CTA width to `clamp(470px, 30.5vw, 590px)` and raised its minimum height to 114px, preserving the existing frame asset, click target and focus behavior.

### ADM placement

- In `AdminPanel.ts`, a real drag now adds `.is-moved` once it exceeds 3px.
- While the lobby is visible and the panel has not been moved, CSS anchors ADM at the lower-right footer zone. After a drag, the user retains normal movable placement. The opacity control, expanded admin panel, all commands and non-admin invisibility were preserved.

### Tests and build executed

```powershell
npm run typecheck
npx vitest run src/admin/AdminPanel.test.ts src/ui/LobbyScreen.test.ts src/ui/LobbyPresentation.test.ts
npm run build
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5174/
```

- Typecheck: passed.
- Focused tests: 3 files, 28 tests passed.
- Build: passed after the final cascade correction; Vite transformed 113 modules. Current output includes `index-Beu2bOPI.css`, `index-dkExdTI3.js`, and `Game-Bpc0aLPj.js`. The known chunk-over-500kB warning remains non-blocking.
- `http://127.0.0.1:5174/` returned HTTP 200. Correct app port remains **5174**.

### Important visual verification still needed

`scripts-inspect/capture-lobby.mjs` could not capture this pass because CDP at `127.0.0.1:9237` refused connection. No new automated screenshot was produced. The command failed before navigation with `ECONNREFUSED`.

Open `http://127.0.0.1:5174/?admin=1`, reload, and compare at 1920x1080 with `lobby.png`. Check: all status rows fit, no left scrollbar, discipline is fully in the header, inventory title/capacity do not collide, CTA has reduced lateral wings, and ADM begins lower-right until dragged.

### START HERE - next agent

For any remaining lobby polish, edit only the final `Effective final position` section in `src/styles/lobby-reference.css`; it was deliberately placed after `Final fidelity pass` so it wins the cascade. Do not touch lobby markup, Three.js, assets, Skills or Oficina to make minor layout changes. First obtain a visual capture (launch browser with CDP port 9237 or inspect manually), then preserve the currently passed typecheck/tests/build. This workspace is still not a Git repository; no commit was made.

---

## UPDATE - Guardian enemy and wave roster (2026-09-13)

### Files changed

- `src/waves/EnemyAssetStore.ts`
- `src/waves/WaveEnemyFactory.ts`
- `src/entities/Enemy.ts`
- `src/core/Game.ts`
- `src/waves/EnemyAssetStore.test.ts`
- `src/waves/WaveEnemyFactory.test.ts`
- `CODEX_HANDOFF.md`

No visual asset was generated or moved. The newly supplied asset already exists and is now integrated at:

`public/models/Monstros/fase 1-1/monstro_guardiao.glb`

### Implemented behavior

- `EnemyAssetStore` loads normal, archer and guardian GLBs from the phase-one folder and skeleton-clones guardian visuals like the existing enemy models.
- Added a deterministic `selectRegularEnemyVariant(wave, spawnIndex)` roster. It does not depend on the global entity-id counter, so miniboss interruptions and ADM jumps do not contaminate a later wave's monster composition.
- Wave 1 and 2: normal only.
- Wave 3 and 4: normal / archer alternating.
- Wave 5: normal / archer / guardian repeating.
- Wave 6: archer / guardian alternating.
- The final boss path and its allied regular enemies were intentionally left unchanged.
- Guardian is a grounded melee enemy with its own tougher baseline descriptor (`78 HP`, `14 damage` before wave multipliers, collision radius `0.5`). When the GLB cannot load, the existing procedural `Enemy` fallback still preserves the Guardian's combat presence.
- Archer and Guardian now both declare `groundAnimatedModel: true` and use the same continuous animated floor anchoring. `Enemy` gained `animatedGroundOffset`; both use a 0.035-unit sink to remove the visible gap while their animation moves bones. Normal enemy grounding behavior was not changed.

### Tests and build

Executed successfully:

```powershell
npm run typecheck
npx vitest run src/waves/EnemyAssetStore.test.ts src/waves/WaveEnemyFactory.test.ts src/waves/WaveManager.test.ts src/core/RunProgression.test.ts
npm run build
```

- Typecheck: passed.
- Focused wave/asset tests: 4 files, 31 tests passed.
- Production build completed and wrote current artifacts including `dist/assets/index-Beu2bOPI.css`, `dist/assets/index-ByqniZZ-.js`, and `dist/assets/Game-C5U6d9u6.js`.
- Direct Node inspection of the GLBs was not usable because all three models are Draco-compressed; browser runtime loading remains correct through the already-configured `DRACOLoader` in `EnemyAssetStore`.

### Start here for follow-up

For a follow-up visual adjustment to floating, inspect `Enemy.keepAnimatedModelGrounded()` in `src/entities/Enemy.ts` and the `animatedGroundOffset` values in `src/waves/WaveEnemyFactory.ts`. Do not compensate by changing level spawn Y values: all enemy roots must remain on the shared level floor at Y=0.

---

## UPDATE - High-precision lobby visual audit (2026-09-13)

### Objective and method

This pass compared the real target `lobby.png` (1672x941, normalized to 1920x1080) against a new clean 1920x1080 capture. The work was deliberately split into measured groups: left equipment/status, inventory, then header/center/banner/CTA/footer. Each group was captured before continuing. No gameplay, inventory, Skills, Forge, GLB, rig, animation, persistence or crafting logic was redesigned.

The final verified capture is:

- `artifacts/lobby-audit-post-build.png`

Supporting captures:

- `artifacts/lobby-audit-baseline.png`
- `artifacts/lobby-audit-group1.png`
- `artifacts/lobby-audit-group2.png`
- `artifacts/lobby-audit-group3.png`
- `artifacts/lobby-audit-final-v5.png`
- `artifacts/lobby-audit-comparison.png` (target/current diagnostic pair; an earlier pre-final comparison)

### Files changed in this pass

- `src/styles/lobby-reference.css`
- `src/ui/LobbyScreen.ts`
- `index.html`
- `CODEX_HANDOFF.md`

No runtime image, SVG, GLB or inventory asset was created or replaced. Only diagnostic PNG captures were generated under `artifacts/`.

### Final visual state at 1920x1080

- Global desktop rows are now `92px / minmax(0, 1fr) / 104px`, matching the target header and footer bands.
- Final desktop columns are `450px / 950px / 520px` at 1920px (`23.4vw` left and `27.1vw` right caps). This makes the visible panel boundaries and central stage align with the target.
- Left equipment panel is approximately `x47 y112 w398 h861`.
- Its six regular slots are approximately 150x110 CSS boxes with 12px gaps. The primary weapon is centered at about 194x125 and begins on the target row.
- `STATUS ATUAL` has a 205px minimum area, 12px values, larger attribute diamonds and comfortable row spacing. All rows remain visible without an internal scrollbar at 1920x1080.
- Inventory panel is approximately `x1418 y124 w452 h728`. It uses the existing 4x5 inventory system. Search/filter stay intact; the grid starts around y309, uses 9px gaps and finishes inside the target frame height.
- The center title, quote and banner were repositioned relative to the corrected stage. The banner uses the existing `warrior-banner.png`, now 150px wide and extended vertically; no asset swap occurred.
- Lobby preview camera changed only for fidelity: default zoom `5.55 -> 5.3`, look-at Y `0.94 -> 0.875`. The GLB, model scale, animation, rotation and wheel/keyboard zoom contracts were not changed.
- CTA uses the existing `start-game-frame.svg`, now 610x138 at 1920px and centered on the target axis. Its icon, subtitle and single-line title were individually aligned; click/focus behavior is unchanged.
- Header brand is offset and slightly enlarged; desktop nav buttons now occupy the target width while discipline text remains inside the 92px masthead.
- Footer starts at y976 with 104px height. Left status spacing was expanded and its image source was changed from generic `icon-hero.svg` to the already integrated metallic `reference-redesign/icons/helmet.svg`, matching the target. The right quote keeps its real text.
- ADM remains functional and movable at bottom-right in admin mode. It is intentionally absent from normal mode, but still appears in admin comparison captures.

### Known remaining visual differences

- The target contains a different underlying courtyard composition, including a large armored statue and different architecture. The prompt explicitly prohibited unnecessary background replacement, so the already integrated `lobby-warrior-background.png` was preserved. Layout fidelity is high, but the background artwork is not pixel-identical.
- The target shows a settings gear in the header. No real settings route/action or matching asset exists in the current project; a fake nonfunctional control was not added.
- The current banner artwork is the existing generated banner and cannot reproduce every fold/crop of the target. Its bounding box and visual weight were corrected.
- This pass was verified only at 1920x1080. The existing responsive CSS below 1181px was not changed, but no new mobile acceptance capture was made.
- No manual equip/unequip, drag/drop, item action, Skills or Forge workflow was exercised after this CSS-only layout pass. Their IDs, data attributes and handlers were preserved.

### Verification results

Executed successfully:

```powershell
npm run typecheck
npx vitest run src/ui/LobbyScreen.test.ts src/ui/LobbyPresentation.test.ts src/admin/AdminPanel.test.ts src/style.test.ts
npm run build
node scripts-inspect/capture-lobby.mjs artifacts/lobby-audit-post-build.png 1920 1080 lobby
```

- Typecheck: passed.
- Focused lobby suite: 4 files, 36/36 tests passed.
- Production build: passed; 113 modules transformed in 37.43s.
- Output: `dist/index.html` 17.15 kB, `dist/assets/index-y7HvVa6S.css` 177.04 kB, `dist/assets/index-269lqOO6.js` 8.18 kB, `dist/assets/Game-CVnI0-3S.js` 907.17 kB.
- Known non-blocking warning remains: Game chunk exceeds 500 kB.
- Post-build 1920x1080 capture completed and visually matches the final accepted capture.
- Application remained available at `http://127.0.0.1:5174/`. Correct app port is 5174; CDP capture port used successfully was 9237.

`git status --short` and `git diff --stat` were executed again. Both fail because this workspace still has no `.git` repository. No commit was created.

### START HERE - next agent

Use `artifacts/lobby-audit-post-build.png` as the current lobby baseline and compare it directly with `lobby.png`. Do not resume generic lobby restyling. If the user requests a specific remaining correction, edit only the final `Effective final position` block at the end of `src/styles/lobby-reference.css`; camera framing lives at `LobbyScreen.ts` lines near the `zoom` field and `camera.lookAt`. Preserve the final panel boxes, inventory 4x5 grid, CTA click target, ADM behavior and all functional contracts. Skills and Forge were not part of this pass and must not be inferred as visually revalidated by these screenshots.

---

## IN-PROGRESS CHECKPOINT — Lobby de referência e contenção (2026-09-14)

Este checkpoint registra o estado real antes da QA final. A implementação está em andamento e ainda não deve ser tratada como aceitação final.

### Alterações já presentes no disco

- `src/ui/LobbyPresentation.ts`: o lobby agora usa `/assets/ui/lobby/reference-match/background.png` como cenário.
- `src/styles/lobby-reference.css`: nova calibração desktop do cabeçalho, colunas, painel esquerdo, slots, STATUS ATUAL, painel de Inventário/Skills, banner, CTA e footer. Os sete atributos reais continuam intactos.
- `index.html`: brasão principal aponta para `reference-redesign/crest-warrior-w.svg`; o ícone do footer usa o novo capacete metálico.
- `scripts-inspect/capture-lobby.mjs`: captura de lobby seleciona explicitamente a aba Inventário e o relatório inclui retângulos/estilos relevantes.
- `public/assets/ui/lobby/reference-redesign/crest-warrior-w.svg`: novo brasão W.
- `public/assets/ui/lobby/reference-match/background.png`: novo cenário 1672x941, sem interface e sem personagem embutidos; está realmente integrado.
- `public/assets/ui/lobby/reference-match/{helmet,chest,pants,gloves,boots,offhand,weapon}.svg`: novos ícones metálicos reconhecíveis, realmente integrados nos slots.
- `public/assets/ui/lobby/reference-match/equipment-slot-frame.svg`: moldura de slot integrada.
- `public/assets/ui/lobby/reference-match/start-game-frame.svg`: moldura CTA integrada; o filtro que produzia limite retangular foi removido.

### Evidência atual já verificada em 1904x950

- `artifacts/lobby-reference-final-1904.png`: aba Inventário ativa. Painel esquerdo `x32..441`, STATUS `y615..770` dentro do painel `y100..848`; mochila `x1470..1804, y277..723` dentro do painel `x1407..1867, y108..742`; CTA sem borda retangular espúria.
- `artifacts/skills-reference-final-1904.png`: aba Skills ativa. Conteúdo interno `x1450..1824, y145..741`, incluindo a última mensagem em `y727..741`, dentro do painel `x1407..1867, y100..838`. Navegação por teclado foi percorrida pelo script; emulação `prefers-reduced-motion: reduce` foi detectada.

### Estado funcional preservado

- Inventário permanece 4x5 e exibe a contagem/itens reais do save; nenhum item falso foi criado para imitar a referência.
- Personagem continua sendo o GLB vivo, com câmera/rotação/zoom existentes; o cenário não contém personagem rasterizado.
- Tabs, busca, filtro, atalhos, autoataque e INICIAR PARTIDA continuam ligados aos handlers existentes.

### QA ainda pendente neste checkpoint

- Captura final 1672x941 e mobile de Lobby/Skills.
- Revisão e correção final da Oficina solicitada em 1904x950/mobile.
- Typecheck, testes focados e build após todas as alterações.
- Atualização deste documento com resultados finais, bugs residuais, arquivos exatos e `START HERE` definitivo.

### START HERE — PRÓXIMO AGENTE (caso haja interrupção agora)

Não reverta os assets `reference-match`. Continue pela QA de contenção: capture Lobby em 1672x941 e Lobby/Skills em 390x844, valide filhos contra o interior das molduras, depois finalize a Oficina em duas colunas (cena/conversa à esquerda e uma janela tabulada contida à direita). Ao terminar, rode typecheck, testes focados e build e substitua este checkpoint por um registro final honesto. Porta da aplicação: **5174**; CDP de captura: **9237**. Não faça commit.

---

## FINAL — Lobby de referência, Skills e Oficina tabulada (2026-09-14)

### Resultado real desta continuação

O lobby foi recalibrado contra a referência 1672x941, com novo cenário e novos assets de equipamento efetivamente integrados. A tela Skills foi contida dentro de sua moldura em desktop. A Oficina foi reconstruída como duas colunas: cena/conversa contínuas à esquerda e uma única janela funcional à direita, com abas `Equipamento`, `Inventário` e `Itens de craft`. Nenhuma contagem, stat ou item foi falsificado para imitar a imagem de referência.

### Arquivos modificados

- `index.html`
- `src/ui/LobbyPresentation.ts`
- `src/ui/LobbyPresentation.test.ts`
- `src/styles/lobby-reference.css`
- `src/ui/BlacksmithScreen.ts`
- `src/ui/BlacksmithScreen.test.ts`
- `src/ui/BlacksmithForgePresentation.ts`
- `src/styles/forge-reference.css`
- `scripts-inspect/capture-lobby.mjs`
- `CODEX_HANDOFF.md`

### Assets criados/alterados e integração real

- `public/assets/ui/lobby/reference-match/background.png`: criado em 1672x941 e integrado por `LOBBY_BACKDROP_URL`. Contém apenas o ambiente de fortaleza/catedral, estátua, braseiros e plataforma; não contém personagem nem UI rasterizada.
- `public/assets/ui/lobby/reference-match/helmet.svg`, `chest.svg`, `pants.svg`, `gloves.svg`, `boots.svg`, `offhand.svg`, `weapon.svg`: criados e integrados nos sete slots. Capacete, peitoral, calça, luvas, botas e escudo agora são silhuetas metálicas reconhecíveis; a arma primária usa lâminas cruzadas.
- `public/assets/ui/lobby/reference-match/equipment-slot-frame.svg`: criado e integrado como moldura dimensional consistente dos slots.
- `public/assets/ui/lobby/reference-match/start-game-frame.svg`: criado e integrado no CTA. O grupo de filtro que gerava um retângulo visível foi removido.
- `public/assets/ui/lobby/reference-redesign/crest-warrior-w.svg`: criado e integrado no cabeçalho.
- O banner continua usando o asset funcional já existente; somente enquadramento, altura e posição foram corrigidos. Nenhum GLB foi substituído.

### Lobby — estado visual e funcional

- Cabeçalho: marca/brasão, título e abas foram dimensionados e espaçados para não colidir em 1672 e 1904 pixels.
- Painel esquerdo: slots foram reduzidos e alinhados nas quatro fileiras da referência, com padding interno seguro, rótulos legíveis e arma primária centralizada. O texto técnico `Ficha persistida` foi ocultado visualmente, sem remover dados.
- `STATUS ATUAL`: nível, pontos disponíveis e os sete atributos reais estão visíveis; não foi renomeado `Esquiva` para `Vitalidade`. Em 1672x941, o STATUS ocupa `y610..765` dentro do painel `y100..839`. Não há um bloco de bônus de conjunto emitido atualmente pelo view-model; a área inferior permanece contida e disponível, sem texto inventado.
- Personagem/câmera: o Guerreiro continua sendo o GLB vivo, com animação, rotação e zoom. O estado de câmera do lobby já consolidado permanece com zoom padrão 5.3 e look-at Y 0.875; esta continuação não alterou rig, escala, animação ou controle.
- Background: trocado de fato para `reference-match/background.png`; o handoff antigo que dizia que o background anterior estava preservado ficou obsoleto.
- Banner: encurtado e reposicionado para liberar o painel direito e aproximar a proporção da referência; o asset funcional existente foi preservado.
- Inventário: grade 4x5, busca e filtro permanecem funcionais. Em 1672x941 a mochila mede `x1299..1572, y277..723`, dentro do painel `x1236..1635, y108..742`. A imagem de referência mostra 1 item e a aplicação mostra exatamente o conteúdo real do save corrente.
- `INICIAR PARTIDA`: nova moldura integrada, região centralizada e sem o retângulo de clipping/foco espúrio. O handler original continua ativo.
- Footer: altura e distribuição corrigidas; capacete metálico, status real e frase permanecem dentro da faixa inferior. O ADM continua fora do conteúdo normal e só aparece no modo admin.

### Skills — estado atual

- A aba continua com cinco skills reais, estrelas, energia/cooldown, autoataque e redefinição das teclas 1–5.
- Em 1904x950 o conteúdo ocupa `x1450..1824, y145..741` dentro da moldura `x1407..1867, y100..838`; a última instrução termina em `y741`, sem sair do frame.
- A travessia sem mouse alcançou tabs, controle de autoataque, cinco botões `Definir tecla` e CTA. A emulação `prefers-reduced-motion: reduce` foi confirmada (`transitionDuration: 1e-05s`).
- Em mobile a tela é uma página vertical rolável: equipamento/status vêm antes de Skills. Nada é cortado, mas Skills não aparece no primeiro viewport de 390x844 sem rolagem.

### Oficina — estado atual

- Desktop 1904x950: layout total `x182..1722, y120..925`; coluna esquerda `x238..999, y138..903`; janela direita `x1017..1666, y138..903`.
- A cena do ferreiro agora ocupa `x257..980` (723 px de largura) e mantém cabeça/corpo visíveis sobre a bancada. A câmera atual usa target Y 1.88 e posição `(0, 1.48, 5.9)`; animações idle/trabalho/entrega e partículas continuam intactas.
- A janela direita contém um tablist em `x1036..1647, y157..217` e um corpo único em `x1036..1647, y234..884`. Apenas um `tabpanel` fica visível; conteúdo longo usa rolagem interna.
- `Equipamento` preserva os sete slots reais. `Inventário` preserva itens, seleção e inspetor. `Itens de craft` preserva bloqueio/licença, materiais, receitas e botões de forja.
- As três tabs são alcançáveis por teclado e expõem `role=tab`, `aria-selected`, `aria-controls` e painéis associados.
- Mobile 390x844: as duas colunas viram blocos verticais roláveis; cabeçalho, cena, conversa e janela tabulada permanecem dentro de 390 px.

### Capturas revisadas

- `artifacts/lobby-reference-final-1904.png`
- `artifacts/lobby-reference-final-1672.png`
- `artifacts/lobby-reference-final-mobile-top.png`
- `artifacts/skills-reference-final-1904.png`
- `artifacts/skills-reference-final-mobile.png`
- `artifacts/forge-equipment-final-1904.png`
- `artifacts/forge-inventory-final-1904.png`
- `artifacts/forge-craft-final-1904.png`
- `artifacts/forge-equipment-final-mobile.png`

Real rendered desktop and mobile screenshots reviewed before Sol acceptance.

Complete no-mouse traversal and active prefers-reduced-motion: reduce emulation completed before Sol acceptance.

### Verificação executada

Comandos principais, todos via RTK:

```powershell
rtk npm run typecheck
rtk proxy npx vitest run src/ui/BlacksmithScreen.test.ts --reporter=verbose --pool=forks --maxWorkers=1
rtk proxy npx vitest run src/ui/LobbyPresentation.test.ts --reporter=verbose --pool=forks --maxWorkers=1
rtk proxy npx vite build --emptyOutDir=false
rtk proxy node scripts-inspect/capture-lobby.mjs <arquivo> <largura> <altura> <lobby|skills|forge|forge-inventory|forge-craft> --layout-report --keyboard-report --reduced-motion
rtk git status --short
rtk git diff --stat
```

- Typecheck: passou.
- `BlacksmithScreen.test.ts`: 7/7 testes passaram, incluindo a nova troca funcional das três abas, `EXITCODE=0`.
- `LobbyPresentation.test.ts`: 6/6 testes passaram depois de atualizar a expectativa do novo background, `EXITCODE=0`.
- Antes dessa correção, a execução combinada tinha 54 testes aprovados e 1 expectativa obsoleta falhando; a única falha era o caminho antigo do background e foi corrigida. A repetição combinada longa foi interrompida pelo limite da sessão de comando após 21 pontos de progresso; não foi registrada nova falha.
- Build de produção: passou e gerou `dist/assets/Game-Be0I21ma.js`, `dist/assets/index-Cq-XtBvD.js` e `dist/assets/index-zC9nz7C2.css`. O aviso conhecido de chunk grande continua não bloqueante.
- Porta correta da aplicação: **5174**. CDP usado nas capturas: **9237**.
- `git status --short` e `git diff --stat` foram executados e ambos falharam porque este diretório não contém `.git`. Nenhum commit foi feito.

### Funcionalidades testadas e não testadas

Testadas: renderização de Lobby/Skills/Oficina; seleção visual das três abas da Oficina; DOM e ARIA das abas; contenção desktop por retângulos; viewport mobile; navegação Tab; reduced motion; retorno da Oficina; compra/licença/receitas/forja pelos testes existentes; backdrop e crop; typecheck e build.

Não testadas manualmente nesta continuação: compra real de licença usando o save do navegador; aguardar os 15 s completos de uma forja na UI real; entrega visual de item após animação; equipar/desequipar e drag/drop em todas as combinações; iniciar e concluir uma partida; todos os estados possíveis de mochila cheia; navegadores diferentes do Edge/CDP usado.

### Bugs/limitações conhecidos e alterações parciais

- A fidelidade não é literalmente pixel a pixel: personagem é GLB vivo, conteúdo do inventário é real e fontes/renderização dependem do navegador. A composição está próxima e não usa screenshot inteira como UI.
- No mobile o lobby é deliberadamente longo e rolável; STATUS, Skills, mochila e CTA ficam abaixo da dobra conforme a ordem de leitura.
- A aba de craft pode estar vazia/bloqueada até a licença ser adquirida; isso é comportamento real, não erro visual.
- Não existe uma ação real de Configurações no projeto, portanto nenhum botão falso de engrenagem foi adicionado.
- O warning de bundle maior que 500 kB permanece.

## START HERE — PRÓXIMO AGENTE

Comece pelas capturas listadas acima, principalmente `lobby-reference-final-1672.png` e as três `forge-*-final-1904.png`. Não refaça o layout nem substitua os assets `reference-match`. Se houver feedback visual específico, ajuste somente o último bloco efetivo de `src/styles/lobby-reference.css` ou o bloco `Two-column workshop console` no fim de `src/styles/forge-reference.css`, preservando os retângulos documentados. Para comportamento das abas, edite `src/ui/BlacksmithScreen.ts` e mantenha os seletores `data-workshop-equipment`, `data-workshop-backpack-item`, `data-workshop-recipes` e `data-craft-recipe`. Primeiro repita a suíte combinada com `--pool=forks --maxWorkers=1`, depois faça uma compra/forja manual completa em save descartável. Não faça commit enquanto o workspace continuar sem `.git`.

### Verificação final do agente raiz — 2026-09-14 10:04

- `rtk npm run typecheck`: passou (`tsc --noEmit`, exit code 0).
- Suíte combinada final: 7 arquivos e 55/55 testes passaram, exit code 0.
- `rtk npx vite build --emptyOutDir=false`: passou; 113 módulos transformados em 23.34 s. Saídas: `index-zC9nz7C2.css`, `index-Cq-XtBvD.js` e `Game-Be0I21ma.js`. Permanece somente o aviso não bloqueante de chunk maior que 500 kB.
- `rtk git status` e `rtk git diff --stat` foram repetidos: ambos retornaram exit code 1 porque a pasta não é um repositório Git.
- Nenhum commit foi criado.

---

## REGISTRO AUTORITATIVO MAIS RECENTE - 2026-09-14 11:14

O handoff completo e atual desta rodada está na seção `UPDATE FINAL - Auditoria Sol, lobby contido e Oficina 55/45 (2026-09-14)` acima. Essa seção supersede todos os checkpoints anteriores quando houver conflito. Os arquivos finais alterados nesta rodada são `src/ui/LobbyPresentation.ts`, `src/ui/LobbyPresentation.test.ts`, `src/styles/lobby-reference.css`, `src/styles/forge-reference.css`, `scripts-inspect/capture-lobby.mjs`, `CODEX_HANDOFF.md` e o novo asset integrado `public/assets/ui/lobby/reference-match/background-v2.png`.

Depois de atualizar o handoff, `git status` e `git diff --stat` foram executados novamente. Ambos falharam porque `C:\Users\pteix\OneDrive\Documentos\Gameweb\projeto2` não contém um diretório `.git`. Portanto não há diff Git confiável nem commit nesta pasta. As portas foram conferidas: aplicação escutando em **5174** e CDP em **9237**.

Build final confirmado: 113 módulos, `dist/assets/index-CDJmhFwb.css`, `dist/assets/index-DlQz2KPf.js` e `dist/assets/Game-Ci9wJOxM.js`; somente o aviso não bloqueante do chunk `Game` maior que 500 kB.

## START HERE - PRÓXIMO AGENTE

Abra primeiro `artifacts/pass2-lobby-full-set-1672x941.png` e compare com `lobby.png`; esta é a baseline visual real mais nova. Preserve `background-v2.png`, o personagem GLB separado, as alturas estáveis dos slots, o bônus verde do conjunto, a grade 4x5, o CTA, o ADM movível e todos os handlers. Para lobby, mexa apenas no bloco final `Viewport-safe desktop sizing` de `src/styles/lobby-reference.css`. Para Oficina, continue apenas no bloco final `Two-column workshop console` de `src/styles/forge-reference.css`; mantenha a coluna esquerda integralmente dedicada ao ferreiro e a direita como uma única janela de abas. A próxima validação de maior valor é uma forja manual completa de 15 segundos, confirmando animação de trabalho, partículas, entrega sem martelo, notificação e item na mochila. Execute novamente testes e build após qualquer ajuste. Não faça commit enquanto a pasta continuar sem `.git`.

---

# REGISTRO AUTORITATIVO FINAL - LOOP DESIGNER/CRÍTICO TRIPLO A (2026-09-14 19:55)

Esta seção é o estado real mais recente e substitui checkpoints anteriores quando houver conflito. O pedido desta rodada foi um refinamento cirúrgico do Lobby e da Oficina com exatamente dois agentes: `DESIGNER` e `CRÍTICO`, ambos GPT-5.6 Sol com raciocínio médio. Foram executadas três rodadas de implementação e crítica até a aprovação explícita das duas telas.

## Objetivo concluído

- Refinar o Lobby sem refazer sua identidade ou trocar background, personagem, GLB, rig ou lógica.
- Refinar a Oficina para uma composição premium em duas colunas: cena do ferreiro protagonista à esquerda e uma única janela tabulada à direita.
- Preservar navegação, inventário, equipamento, slots, tooltips, persistência/localStorage, oficina e personagem.
- Encerrar somente após o CRÍTICO declarar `APROVADO TRIPLO A` para Lobby e Oficina.

## Resultado do loop obrigatório

1. Rodada 1: o DESIGNER ajustou Lobby e Oficina. O CRÍTICO aprovou o Lobby e rejeitou a Oficina por GLB inconsistente nas capturas, excesso de vazio, inventário em faixa 10x2, equipamento instável e Craft truncado.
2. Rodada 2: o DESIGNER adicionou prova real de modelo pronto/pixels WebGL, reorganizou Equipamento em 4+3, Inventário em 7+7+6, tornou Craft legível e integrou o diálogo à cena. O CRÍTICO manteve o Lobby aprovado e rejeitou somente dois P1: painel compacto ancorado no topo e falta de prova com equipamentos reais.
3. Rodada 3: o DESIGNER centralizou verticalmente os painéis compactos e capturou o conjunto completo mais espada real nos slots de 100x100. O CRÍTICO declarou: `LOBBY APROVADO TRIPLO A` e `OFICINA APROVADA TRIPLO A`, sem bloqueios restantes.

## Lobby - estado final

- Mochila: grade 4x5 usa toda a altura útil do painel, com distribuição vertical e padding equilibrados; a parte inferior não fica abandonada.
- Equipamento: a área útil vertical foi ampliada e as sete posições permanecem completas, alinhadas e contidas; arma primária centralizada.
- `STATUS ATUAL`: virou subárea visualmente separada dentro da moldura esquerda, com nível, pontos, sete atributos reais e bônus verde de conjunto quando ativo, sem corte.
- Personagem/câmera: nenhuma mudança nesta rodada; GLB vivo, enquadramento, rotação, zoom, rig e animações existentes foram preservados.
- Background/banner: `public/assets/ui/lobby/reference-match/background-v2.png` e o banner existente continuam integrados; nenhum asset foi substituído nesta rodada.
- CTA/footer: `INICIAR PARTIDA`, faixa inferior, estado real do equipamento e ADM movível foram preservados e permanecem contidos.
- O CRÍTICO proibiu novas mudanças estruturais no Lobby depois da rodada 1, pois ele já estava aprovado.

## Oficina - estado final

- A cena 3D ocupa integralmente a coluna esquerda e permanece a protagonista. O ferreiro, bancada e fundo existentes continuam integrados.
- O diálogo RPG agora fica dentro da própria cena, em overlay compacto: legenda/estado à esquerda e pergunta/opções à direita. A solução foi aprovada e preservada nas rodadas seguintes.
- A moldura ornamental grande com estrela foi removida/simplificada; permanece apenas ornamentação discreta e coerente.
- À direita existe uma única janela com abas `Equipamento`, `Inventário` e `Itens de craft`, preservando ARIA e teclado.
- Equipamento: sete slots quadrados de 100x100 em grade estável 4+3; segunda linha centralizada. Cinco peças comuns e a Espada do Recruta foram renderizadas com `object-fit: contain`, sem corte, deformação ou estouro. Arma secundária fica vazia corretamente porque não há item real compatível no catálogo.
- Inventário: 20 slots pequenos de 64x64 em grade 7+7+6, todos contidos; item real da mochila continua visível.
- Equipamento e Inventário usam painéis compactos centralizados verticalmente. O vazio restante passou a funcionar como respiro equilibrado, com margens superior/inferior comparáveis, conforme aprovação do CRÍTICO.
- Craft: é o único painel que preenche a altura e usa rolagem interna; cards mantêm alturas coerentes, nomes e ingredientes quebram em até duas linhas, sem truncamento ilegível. Estados verde/vermelho, licença, materiais e botão de forja foram preservados.
- GLB: `BlacksmithForgePresentation` expõe `data-blacksmith-model-ready`; a captura rejeita `data-blacksmith-model-error` e exige pixels WebGL úteis via `readPixels`. Não houve mudança no rig, animações, martelo ou ciclo de trabalho/entrega.

## Arquivos modificados nesta rodada

- `src/styles/lobby-reference.css`: refinamento final da altura/distribuição de equipamento, subárea STATUS e preenchimento da mochila no Lobby.
- `src/styles/forge-reference.css`: layout final da Oficina, diálogo integrado, painéis compactos, equipamento 4+3, inventário 7+7+6 e legibilidade do Craft.
- `src/ui/BlacksmithScreen.ts`: estado da aba ativa exposto em `data-workshop-panel` e renderização das posições vazias reais da mochila da Oficina.
- `src/ui/BlacksmithForgePresentation.ts`: estado observável `data-blacksmith-model-ready` para validar que o GLB foi renderizado.
- `scripts-inspect/capture-lobby.mjs`: espera por GLB pronto, verifica erro/pixels WebGL, zera scroll depois de navegação/troca de aba e suporta fixture visual com conjunto completo e espada inicial.
- `CODEX_HANDOFF.md`: este registro autoritativo.

## Assets criados ou alterados nesta rodada

- Nenhum asset novo foi criado e nenhum GLB/imagem foi alterado nesta rodada.
- Assets realmente integrados e preservados: `public/blacksmith/`, `public/blacksmith/forge-bench-background.png`, `public/assets/ui/lobby/reference-match/background-v2.png`, molduras/ícones do Lobby e imagens reais de equipamento/craft já existentes.

## Capturas finais e de auditoria

- Lobby aprovado: `artifacts/designer-round1-lobby-1672x941.png` e `artifacts/designer-round1-lobby-1904x950.png`.
- Oficina R2: `artifacts/designer-round2-forge-equipment-1672x941.png`, `designer-round2-forge-equipment-1904x950.png`, `designer-round2-forge-inventory-1672x941.png`, `designer-round2-forge-inventory-1904x950.png`, `designer-round2-forge-craft-1672x941.png`, `designer-round2-forge-craft-1904x950.png`, `designer-round2-forge-dialogue-1904x950.png`.
- Prova final R3: `artifacts/designer-round3-forge-equipment-fullset-1672x941.png`, `designer-round3-forge-equipment-fullset-1904x950.png`, `designer-round3-forge-inventory-1672x941.png`, `designer-round3-forge-inventory-1904x950.png`.
- Mobile raiz: `artifacts/final-round-lobby-mobile-390x844.png` e `artifacts/final-round-forge-mobile-390x844.png`.

## Verificação final executada

```powershell
npm run typecheck
npx vitest run src/ui/LobbyPresentation.test.ts src/ui/LobbyScreen.test.ts src/ui/BlacksmithScreen.test.ts src/styles/forge-reference.test.ts src/style.test.ts --pool=forks --maxWorkers=1
npm run build
node scripts-inspect/capture-lobby.mjs artifacts/final-round-lobby-mobile-390x844.png 390 844 lobby --layout-report --reduced-motion
node scripts-inspect/capture-lobby.mjs artifacts/final-round-forge-mobile-390x844.png 390 844 forge --layout-report --keyboard-report --reduced-motion --full-set-fixture
```

- Typecheck: passou, exit code 0.
- Testes focados: 5 arquivos, 44/44 testes passaram em 34.08 s.
- Build: passou, 113 módulos transformados em 18.67 s.
- Saídas finais: `dist/assets/index-kG5zj_ti.css`, `dist/assets/index-BBoSLqNi.js`, `dist/assets/Game-CHL0flaa.js`.
- Aviso não bloqueante: `Game-CHL0flaa.js` tem 908.92 kB e excede o aviso padrão de chunk de 500 kB.
- Responsividade: Lobby e Oficina foram renderizados em 390x844; o layout mobile é vertical/rolável e permanece dentro da largura.
- Teclado: na Oficina mobile foram alcançados Voltar, duas opções de diálogo e as três tabs.
- Reduced motion: confirmado com `transitionDuration: 1e-05s`.
- Porta da aplicação: **5174**. CDP das capturas: **9237**. Ambos estavam escutando ao final.
- `git status` e `git diff --stat` foram executados após este registro; ambos retornaram exit code 1 porque a pasta não contém `.git`. Nenhum commit foi criado.

## Funcionalidades testadas

- Renderização visual do Lobby em 1672x941 e 1904x950.
- Renderização da Oficina em Equipamento, Inventário, Craft e Diálogo nas larguras desktop.
- Presença real do ferreiro GLB por flag pronta, ausência de erro e pixels WebGL úteis.
- Equipamento real completo nos slots da Oficina sem corte.
- Grade real de 20 posições do inventário.
- Troca de abas/ARIA pelos testes existentes; navegação básica por teclado na captura mobile.
- Layout mobile do Lobby e Oficina, reduced motion, TypeScript, testes focados e build.

## Não testado manualmente nesta rodada

- Ciclo real completo de forja aguardando 15 segundos, partículas, animação de entrega e notificação final.
- Compra real de licença com Guild Tokens no save permanente do usuário.
- Equipar/desequipar e drag/drop de todas as combinações possíveis.
- Iniciar e concluir uma partida, IA/ondas e combate.
- Mochila cheia e todos os estados extremos do save.
- Navegadores diferentes do Edge controlado por CDP.

## Bugs/limitações conhecidas

- O bundle principal continua grande; é aviso de desempenho, não erro de build.
- Em mobile as telas são deliberadamente longas e roláveis; seções abaixo não aparecem no primeiro viewport, mas continuam acessíveis.
- O texto/diálogo sobreposto na cena mobile ocupa mais altura que no desktop, sem extrapolar a largura; não foi bloqueado pelo CRÍTICO, cuja aprovação final foi baseada nas duas larguras desktop solicitadas.
- A fidelidade do Lobby não é raster pixel a pixel porque personagem, inventário, status e equipamento são dados/componentes vivos.
- A pasta continua sem `.git`; portanto não existe diff/commit confiável.

## Decisões importantes a preservar

- Não reabrir a estrutura do Lobby: o CRÍTICO aprovou e pediu que largura dos painéis/distribuição da mochila não sejam alteradas.
- Não substituir `background-v2.png`, GLBs, rig, câmera ou animações sem defeito reproduzível.
- Manter cena esquerda integral, diálogo overlay, única janela tabulada direita e Craft como único painel alto/rolável.
- Manter Equipment 4+3 com 100px, Inventory 7+7+6 com 64px, `data-workshop-panel` e `data-blacksmith-model-ready`.
- Manter o script de captura esperando o GLB e validando `readPixels`; capturas sem essa guarda geraram falsos negativos antes.

## START HERE - PRÓXIMO AGENTE

O trabalho visual solicitado está concluído e aprovado pelo CRÍTICO. Comece abrindo `artifacts/designer-round3-forge-equipment-fullset-1672x941.png`, `artifacts/designer-round2-forge-craft-1672x941.png` e `artifacts/designer-round1-lobby-1672x941.png`; estas são as provas finais. Não redesenhe Lobby ou Oficina por iniciativa própria. O próximo teste de maior valor é uma forja manual completa de 15 segundos em save descartável, confirmando trabalho, partículas, entrega sem martelo, notificação e item na mochila. Se surgir regressão visual, edite somente o bloco desktop final correspondente em `src/styles/lobby-reference.css` ou `src/styles/forge-reference.css`, preserve os data attributes e repita os 44 testes mais o build. Não faça commit enquanto a pasta continuar sem `.git`.

---

# REGISTRO AUTORITATIVO MAIS RECENTE - LOBBY TABS E LAUNCHER CONTROLÁVEL (2026-09-14 21:05)

Este registro substitui os anteriores quando houver conflito. A rodada usou exatamente dois agentes solicitados pelo usuário: DESIGNER em `gpt-5.6-terra` com raciocínio `high`, e CRÍTICO em `gpt-5.6-sol` com raciocínio `high`. Houve três rodadas: implementação principal, correção mobile/listener e correção do prompt real de parada. O veredito final do CRÍTICO foi `APROVADO TRIPLO A` para visual e launcher.

## Objetivo e resultado

- Rebatizar a marca do Lobby para `Dungeon Guild` e `Dungeon dos Heróis`.
- Transformar o painel esquerdo em duas abas reais, `Equipamentos` e `Status`, usando a mesma moldura.
- Remover os ícones placeholder dos slots vazios sem esconder imagens de itens equipados.
- Aumentar a altura dos slots sem alterar sua largura.
- Simplificar o CTA e compactar/centralizar Inventário e instrução de Skills.
- Tornar `Ligarserver-Admin-Incognito.bat` um painel persistente que inicia, abre e encerra o servidor com controle explícito.

## Lobby final

- Cabeçalho: o pequeno texto agora é `Dungeon Guild`; o título grande é `Dungeon dos Heróis`. O brasão existente foi preservado.
- Painel esquerdo: removidos o kicker `Equipamento` e o título `Armadura e arma`; agora há somente o título grande amarelo `EQUIPAMENTOS`.
- Abas internas: `Equipamentos` e `Status` usam `role=tab`, `aria-selected`, `aria-controls`, `tabpanel`, clique e navegação por setas. Status ocupa o mesmo painel e não fica mais espremido abaixo dos slots.
- Slots vazios: Capacete, Peitoral, Calça, Luvas, Botas, Arma secundária e Arma primária mantêm moldura/rótulo, mas não mostram arte placeholder. Itens realmente equipados continuam aparecendo com `object-fit: contain`.
- Slots: altura aumentada mantendo a largura e a grade 2+2+2+1; peças completas continuam contidas.
- Status: nível, pontos, sete atributos e bônus real de conjunto permanecem preservados. Quando ativo, o bônus verde aparece dentro da aba Status.
- CTA: a moldura SVG antiga foi removida. `INICIAR PARTIDA` virou um botão menor, retangular, com cantos arredondados e borda CSS multicolorida animada por `conic-gradient`; `prefers-reduced-motion` desliga a animação.
- Inventário: removidos `Mochila` e `Itens armazenados`; o título único centralizado é `Inventário`. Busca, filtro e ícone foram reduzidos; a grade 4x5 usa 80% da largura, com slots aproximadamente 20% menores e centralizados dentro da moldura.
- Skills: a instrução `Clique em “Definir tecla” e pressione a tecla desejada.` foi ampliada e centralizada dentro da moldura.
- Personagem, câmera, background, banner, footer, itens reais e handlers não foram alterados.
- Mobile <=760px: navegação usa quatro colunas compactas para todos os rótulos caberem; `.forge-frame` global fica oculta para não atravessar seções da página rolável.

## Launcher final

Arquivo: `Ligarserver-Admin-Incognito.bat`.

- A janela principal permanece aberta como painel de controle.
- Opção 1 inicia Vite em uma janela própria minimizada e abre Edge InPrivate em `http://127.0.0.1:5174/?admin=1`.
- Opção 2 abre o navegador no máximo uma vez durante a execução do painel.
- Opção 3 atualiza o status.
- Opção 4 lista o processo que escuta `5174`, pede confirmação por linha e só encerra com `S`/`s`.
- Opção 5 fecha apenas o painel e informa que o servidor mantém seu estado.
- O Vite não usa `/b`, portanto não disputa stdin com o menu.
- A consulta usa `Get-NetTCPConnection -LocalPort 5174 -State Listen`, cobrindo `127.0.0.1`, `0.0.0.0` e IPv6.
- Nunca inicia uma segunda instância quando a porta já está ocupada.
- O teste real do agente raiz iniciou exatamente um listener Node, PID 18796, abriu Edge, listou o PID, confirmou `S`, encerrou o listener, voltou ao menu mostrando a porta livre e fechou pela opção 5.
- Estado final obrigatório: **porta 5174 livre e servidor desligado**.

## Arquivos modificados

- `index.html`
- `src/ui/LobbyScreen.ts`
- `src/styles/lobby-reference.css`
- `scripts-inspect/capture-lobby.mjs`
- `Ligarserver-Admin-Incognito.bat`
- `CODEX_HANDOFF.md`

## Assets

- Nenhum asset foi criado, alterado ou substituído nesta rodada.
- Permanecem integrados os assets de `public/assets/ui/lobby/`, `background-v2.png`, banner, personagem GLB e imagens reais de equipamento/inventário.

## Capturas aprovadas

- `artifacts/designer-terra-lobby-empty-1672x941.png`
- `artifacts/designer-terra-lobby-empty-1904x950.png`
- `artifacts/designer-terra-lobby-fullset-1672x941.png`
- `artifacts/designer-terra-lobby-fullset-1904x950.png`
- `artifacts/designer-terra-status-1672x941.png`
- `artifacts/designer-terra-status-1904x950.png`
- `artifacts/designer-terra-skills-1672x941.png`
- `artifacts/designer-terra-skills-1904x950.png`
- `artifacts/designer-terra-round2-lobby-mobile-390x844.png`
- `artifacts/designer-terra-round2-status-mobile-390x844.png`

## Verificação final

```powershell
npm run typecheck
npx vitest run src/ui/LobbyPresentation.test.ts src/ui/LobbyScreen.test.ts src/styles/lobby-reference.test.ts src/styles/skills-reference.test.ts src/style.test.ts --pool=forks --maxWorkers=1
npm run build
npm test -- --pool=forks --maxWorkers=1
cmd /d /c Ligarserver-Admin-Incognito.bat
Get-NetTCPConnection -LocalPort 5174 -State Listen
```

- Typecheck: passou.
- Testes focados finais: 3 arquivos executados, 32/32 testes passaram.
- Build: passou, 113 módulos transformados em 12.64 s.
- Saídas: `dist/assets/index-i9uqa-OL.css`, `dist/assets/index-COD2c0B1.js`, `dist/assets/Game-D-5zTnJU.js`.
- Aviso conhecido: chunk `Game` com 910.50 kB, não bloqueante.
- Suíte completa: 698/701 testes passaram; três expectativas antigas continuam falhando e não foram causadas por esta rodada:
  - `src/ui/CraftRewardsPresentation.test.ts`: duas expectativas ainda procuram `.png`, mas o catálogo real usa `/items/craft/common/1.webp`.
  - `src/ui/InventoryOverlay.test.ts:141`: espera `primaryWeapon` nulo, mas o perfil real já inicia com `starter-sword`.
- Nenhum arquivo de teste foi alterado para mascarar essas falhas.
- Fluxo real do BAT foi testado do início ao fim e a porta 5174 foi deixada livre.

## Decisões que precisam ser preservadas

- Não restaurar ícones placeholder; o usuário enviará novos ícones depois.
- Não mover Status novamente para baixo dos equipamentos; ele deve continuar como aba no mesmo painel.
- Não restaurar `start-game-frame.svg` no CTA.
- Não aumentar novamente slots/controles do Inventário.
- Preservar comportamento real de itens equipados, busca, filtro, tooltips, localStorage e início da partida.
- No BAT, manter confirmação explícita antes de `Stop-Process` e nunca restringir listener a apenas `127.0.0.1`.

## Bugs/limitações conhecidos

- O layout mobile é vertical e rolável; conteúdo abaixo da dobra exige rolagem, por projeto.
- A animação da borda do CTA não aparece em screenshot estática, mas foi confirmada no CSS; reduced motion fornece estado estático.
- O bundle principal continua acima de 500 kB.
- As três falhas antigas da suíte completa estão documentadas acima.
- A pasta não possui `.git`, portanto não há commit/diff Git confiável.

## START HERE - PRÓXIMO AGENTE

Comece pelas capturas `designer-terra-lobby-fullset-1672x941.png`, `designer-terra-status-1672x941.png`, `designer-terra-skills-1672x941.png` e pelas duas `designer-terra-round2-*-mobile-390x844.png`. O trabalho visual e o launcher estão aprovados pelo CRÍTICO. Não restaure placeholders: aguarde os novos ícones que o usuário prometeu enviar. Para Lobby, edite `index.html`, `src/ui/LobbyScreen.ts` e somente o bloco final efetivo de `src/styles/lobby-reference.css`. Para captura, preserve o modo `status` em `scripts-inspect/capture-lobby.mjs`. Para servidor, use `Ligarserver-Admin-Incognito.bat`; ao terminar testes, escolha 4, confirme `S`, verifique porta 5174 livre e só então escolha 5. Não faça commit enquanto a pasta continuar sem `.git`.

---

# REGISTRO AUTORITATIVO MAIS RECENTE - REVISÃO DO LOBBY CONTRA lobby.png (2026-09-15)

Este registro substitui os anteriores quando houver conflito. A rodada partiu das
alterações locais restantes, revisou o lobby contra `lobby.png`, incluiu os
ajustes de inventário e confirmou todos os assets WebP.

## Estado inicial encontrado

- O repositório já possuía `.git` (ao contrário do que diziam os registros
  antigos), na branch `arena/01a0a70d-webgame`.
- O commit anterior `6a6b9bb` já havia trocado os PNGs `ChatGPT Image ...` por
  27 arquivos WebP otimizados.
- As dependências não estavam instaladas; `npm install` foi necessário.
- A suíte tinha **7 testes falhando** em 5 arquivos.

## Revisão contra lobby.png e correções

1. **Status atual com seis métricas.** A referência lista exatamente Força,
   Ataque, Defesa, Agilidade, Crítico e Vitalidade. `renderLobbyCurrentStatus`
   agora projeta essas seis linhas (`LOBBY_STATUS_METRICS`), exibindo
   `criticalAttack` como "Crítico" e derivando Vitalidade de Força, que é o
   atributo que concede vida ao Guerreiro. O `RpgUiViewModel` mantém intacto o
   contrato de sete atributos usado pelas outras telas.

2. **Engrenagem de configurações.** A referência tem uma engrenagem dourada no
   topo direito, que não existia. Foi criado
   `public/assets/ui/lobby/icon-settings.svg` no mesmo estilo do conjunto e
   adicionado como `.lobby-settings-mark` no cabeçalho.

3. **Marca de espadas cruzadas no CTA.** `#start-game` passou a conter
   `img.lobby-start-icon` como primeiro filho. No desktop (>=1181px) a placa
   assada já traz as espadas, então a marca fica oculta por CSS mantendo-se na
   árvore do DOM.

4. **Ajuste de inventário: equipar exige confirmação.** Antes, um clique em uma
   peça da mochila equipava imediatamente. Agora o clique abre o inspetor, que
   ganhou o botão `[data-equip-inventory-item]`; a troca só ocorre ao confirmar
   em "Equipar". Isso vale para clique e para Enter/Espaço.
   `populateCraftInspector` passou a aceitar equipamentos além de materiais
   (`isInspectableItem`), mostrando a descrição do item.

5. **Geometria travada corrigida.** `lobby-reference.test.ts` ainda travava
   medidas em pixel de uma rodada superada (`397px ... 446px`). O teste agora
   trava a composição proporcional realmente em vigor
   (`23.026% 50% 26.974%` / `8.82% 80.23% 10.95%`) e a placa do CTA.

## Assets WebP

Os 27 WebP estão presentes e referenciados. `InventoryCatalog.ts` aponta para os
`.webp` de `items/craft/common`, `items/equipment/armas`,
`items/equipment/common-forged` e `items/equipment/equipado`. As expectativas
antigas em `CraftRewardsPresentation.test.ts` que ainda procuravam `.png` foram
atualizadas para `.webp`. Todos os caminhos foram verificados servindo `200
image/webp` no Vite.

## Verificação final

- `npm run typecheck`: passou.
- `npx vitest run --pool=forks --maxWorkers=1`: **136 arquivos, 716/716 testes
  passaram**. As três falhas antigas documentadas nos registros anteriores
  deixaram de existir; nenhum teste foi enfraquecido para mascarar defeito.
- `npm run build`: passou. Aviso conhecido do chunk `Game` (913 kB) permanece,
  não bloqueante.

## Limitações desta rodada

- Não foi possível baixar o Chromium do Playwright no sandbox, portanto não há
  captura raster nova. A revisão contra `lobby.png` foi feita lendo markup e CSS
  efetivo. Uma conferência visual no navegador ainda é recomendada.

## START HERE - PRÓXIMO AGENTE

A suíte está 100% verde pela primeira vez. Antes de mexer no visual, rode
`npm install`, `npm run typecheck` e a suíte. Não restaure o equipar por clique
único: a confirmação no inspetor é intencional. Não volte a travar geometria em
pixel no `lobby-reference.test.ts`; a composição desktop é proporcional.
