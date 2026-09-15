# Seleção de personagem e correção de animações

## Objetivo

Adicionar uma etapa inicial em que o jogador escolhe entre os modelos `dragonminer-optimized.glb` e `dragonminer-optimized2.glb`, visualizando ambos em 3D antes de iniciar. Após a confirmação, o jogo deve carregar o cenário com apenas o personagem escolhido e reproduzir corretamente as animações de repouso, corrida, ataque, dano e morte.

## Escopo

O trabalho inclui o seletor 3D, o carregamento do personagem selecionado, o mapeamento de clipes por modelo e a correção das transições entre `idle` e `running`. Não inclui novos inimigos, habilidades, inventário, persistência da escolha ou alterações de balanceamento.

## Diagnóstico atual

- `dragonminer-optimized.glb` contém somente os clipes `idle` e `ataque`.
- `dragonminer-optimized2.glb` contém 14 clipes, incluindo `Parado`, `correndo`, `hit` e `morte`.
- O código atual carrega apenas `dragonminer-optimized.glb`.
- O mapeamento atual não reconhece todos os nomes em português do segundo arquivo.
- No controle por teclado, `moveByDirection()` ativa `running`, mas `Player.update()` retorna a `idle` no mesmo frame porque não existe `moveTarget` de clique.
- Os modelos compartilham os mesmos 33 ossos principais com nomes `mixamorig:*`, permitindo adaptar clipes ausentes do segundo modelo para o primeiro.

## Arquitetura

O aplicativo terá três estados explícitos de inicialização:

1. `selecting`: exibe uma cena 3D de seleção e mantém HUD e cenário principal ocultos.
2. `loading`: confirma a escolha, mostra o progresso e prepara o jogo.
3. `playing`: remove a seleção, adiciona somente o personagem escolhido à cena principal e inicia o loop normal.

Um catálogo central de personagens será a fonte única para identificador, nome exibido, caminho do GLB, escala, enquadramento da prévia e mapeamento de animações. O carregamento preparará os dois GLB uma vez. As prévias e o personagem jogável serão instâncias separadas derivadas dos dados carregados, evitando novo download e impedindo que mixers da seleção compartilhem estado com o mixer do jogo.

O mesmo `WebGLRenderer` e o mesmo canvas serão usados para seleção e jogo. Isso evita múltiplos contextos WebGL e mantém a transição visual contínua.

## Catálogo e animações

### Dragon Miner

- Modelo: `/models/dragonminer-optimized.glb`
- `idle`: `idle`
- `attacking`: `ataque`
- `running`, `hit` e `dead`: clipes compatíveis obtidos de `dragonminer-optimized2.glb`

### Paladino

- Modelo: `/models/dragonminer-optimized2.glb`
- `idle`: `Parado`
- `running`: `correndo`
- `attacking`: `Corte_rapido`
- `hit`: `hit`
- `dead`: `morte`

O fallback entre modelos será permitido apenas para estados explicitamente configurados. Ao adaptar um clipe para o Dragon Miner, serão mantidas as trilhas de rotação dirigidas aos 33 ossos compartilhados. Trilhas de ossos inexistentes, escala e translação serão removidas para evitar deformação por diferenças de proporção e deslocamento de raiz. Os clipes adaptados conservarão duração e repetição do original.

As ações `idle` e `running` usarão repetição contínua. Ataque, dano e morte usarão repetição única; ataque e dano poderão retornar ao estado apropriado, enquanto morte permanecerá no quadro final.

## Movimento e transições

O estado de locomoção deixará de depender exclusivamente de `moveTarget`. O `Player` receberá em cada frame a informação de movimento ativo:

- Movimento por WASD ou setas mantém `running` durante toda a entrada.
- Movimento até um ponto clicado mantém `running` enquanto a distância for maior que a tolerância.
- Ao soltar as teclas, sem destino de clique nem alvo de ataque, o estado retorna a `idle`.
- Ataque, dano e morte continuam com precedência sobre locomoção.

O movimento real continuará sendo aplicado ao grupo raiz do jogador. Os clipes não poderão deslocar o personagem pelo cenário.

## Tela de seleção

A tela usará a estética escura e metálica da dungeon existente:

- Título `ESCOLHA SEU CAMPEÃO`.
- Dois pedestais iluminados com os personagens em 3D, girando lentamente e executando `idle`.
- Nomes `Dragon Miner` e `Paladino`.
- Seleção por clique no modelo ou no cartão.
- Personagem selecionado com destaque dourado e leve aproximação visual.
- Botão `ENTRAR NA DUNGEON`, habilitado somente após uma escolha.
- Setas ou `A`/`D` alternam a escolha; `Enter` confirma.
- Em telas largas, as opções aparecem lado a lado; em telas estreitas, ficam empilhadas ou alternáveis sem cortar os controles.

Após a confirmação, a tela de seleção fará uma transição para o progresso de carregamento existente. A escolha durará somente até a página ser atualizada.

## Tratamento de falhas

- Se um GLB falhar, sua opção ficará marcada como indisponível e o outro personagem continuará selecionável.
- Se ambos falharem, a interface exibirá o erro de carregamento e a ação para recarregar a página.
- Se um clipe obrigatório não puder ser resolvido nem adaptado, será registrado no logger e exibido pelo aviso de animação já existente.
- Falhas de um personagem não devem iniciar parcialmente a cena principal.

## Acessibilidade e interação

Os controles HTML da seleção serão botões reais, com foco visível, rótulos acessíveis e operação completa por teclado. A interface respeitará tamanhos mínimos de toque e não dependerá somente de cor para indicar seleção ou indisponibilidade.

## Testes e critérios de aceite

Testes automatizados devem comprovar:

- O catálogo resolve os nomes exatos de animação de cada modelo.
- A adaptação mantém somente rotações de ossos compartilhados e não mantém translação de raiz.
- Movimento contínuo por teclado mantém `running` e, ao parar, retorna a `idle`.
- Clique em cada opção produz o identificador correto; teclado alterna e confirma a seleção.
- Somente a instância escolhida é adicionada à cena principal.
- Uma falha isolada desabilita apenas o personagem afetado.

Validação final:

- TypeScript e build Vite concluídos sem erros.
- As duas prévias aparecem, giram e reproduzem `idle`.
- Dragon Miner entra na cena e executa `idle`, `running`, ataque, dano e morte.
- Paladino entra na cena e executa `idle`, `running`, ataque, dano e morte.
- WASD, setas e clique no chão apresentam transições corretas entre repouso e corrida.
- A interface funciona em viewport desktop e móvel.
