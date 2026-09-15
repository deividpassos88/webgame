# Paladino único, baú do boss e escolha de arma

## Objetivo

Deixar o Paladino (`dragonminer-optimized2.glb`) como único herói jogável e adicionar uma recompensa após a derrota do boss. Um baú surge na plataforma do chefe, o jogador clica nele, caminha automaticamente até o alcance e escolhe uma única arma entre Espada (`sword.glb`) e Machado (`axe.glb`). A arma escolhida é presa à mão direita do Paladino e acompanha todas as animações.

## Escopo

Inclui:

- início direto com o Paladino, sem tela de seleção de personagem;
- reativação dos inimigos e do boss necessários ao fluxo da recompensa;
- carregamento de `chest.glb`, `sword.glb` e `axe.glb`;
- surgimento do baú somente após a derrota do boss;
- interação com o baú por clique e aproximação automática;
- abertura procedural do baú;
- escolha única entre Espada e Machado;
- encaixe visual da arma no osso da mão direita;
- estrutura de equipamento com slots `weapon` e `chest`, mantendo o slot `chest` vazio e sem opção de peitoral nesta entrega.

Não inclui peitoral, inventário, troca posterior de arma, persistência após recarregar a página, atributos diferentes por arma ou animação real da tampa do baú.

## Estado atual dos assets

- `sword.glb`: uma malha estática, sem animações, com aproximadamente duas unidades de comprimento e origem próxima ao centro.
- `axe.glb`: uma malha estática, sem animações, com aproximadamente duas unidades de comprimento e origem próxima ao centro.
- `chest.glb`: uma única malha estática, sem animações e sem uma tampa separada.
- O osso de encaixe da arma no modelo carregado pelo Three.js é `mixamorigRightHand`.

Como o baú é uma malha única, a abertura não tentará girar uma tampa inexistente. O efeito será comunicado por movimento, escala e luz.

## Fluxo de jogo

1. O jogo carrega diretamente o Paladino e os três assets da recompensa.
2. Inimigos e boss funcionam normalmente.
3. Quando o boss morre, o combate termina e o baú surge na posição da plataforma do boss.
4. O surgimento usa uma breve elevação e um pulso de luz dourada.
5. O jogador clica no baú.
6. Se estiver fora do alcance, o Paladino recebe o baú como destino de interação e caminha até ele.
7. Ao chegar ao alcance, o movimento é cancelado e o baú executa a abertura procedural.
8. Depois do efeito, a interface bloqueia os controles de jogo e mostra somente Espada e Machado.
9. Ao escolher uma arma, ela é encaixada na mão direita, a interface fecha e o baú é marcado como consumido.
10. O baú deixa de aceitar interação e desaparece com uma transição curta. A escolha não pode ser refeita nessa sessão.

## Arquitetura

### Herói único

O `Game` deixará de instanciar `CharacterSelectScreen` e iniciará com o identificador fixo `paladin`. O arquivo antigo do Dragon Miner não será apagado, mas não será carregado nem apresentado ao jogador.

### Catálogo e carregamento da recompensa

Um catálogo de equipamento será a fonte única para:

- identificador da opção;
- rótulo exibido;
- caminho do GLB;
- slot ocupado;
- comprimento visual desejado;
- posição, rotação e ajustes específicos de encaixe.

Um carregador dedicado preparará `sword.glb`, `axe.glb` e `chest.glb` uma vez. Cada uso receberá uma instância clonada, evitando downloads repetidos e estado compartilhado.

### Baú de recompensa

Uma entidade `RewardChest` possuirá os estados:

- `spawning`;
- `closed`;
- `approaching`;
- `opening`;
- `choosing`;
- `claimed`.

A entidade controlará apenas o modelo, o alcance e os efeitos procedurais. O `Game` continuará responsável por raycast, navegação do jogador, derrota do boss e abertura da interface.

O baú será nivelado automaticamente ao piso usando o limite inferior de sua caixa envolvente. O efeito de abertura terá balanço curto, pequena elevação, pulso de escala e uma luz dourada que aumenta e desaparece. A interface só aparece quando o efeito termina.

### Interação por clique

O raycast do mouse verificará o baú antes do chão. Um clique no baú distante define um destino de aproximação próximo à sua posição. A cada frame, o jogo verifica a distância plana entre jogador e baú. Ao entrar no alcance configurado, o destino é cancelado e a abertura começa.

Enquanto a escolha de recompensa estiver visível, movimento, ataque e cliques no cenário ficam bloqueados. A animação do Paladino permanece em `idle`.

### Equipamento do Paladino

O `Player` guardará referências ao modelo animado e aos sockets encontrados no esqueleto. O slot `weapon` utilizará `mixamorigRightHand`; o slot futuro `chest` utilizará `mixamorigSpine2`.

O método de equipamento:

1. valida o socket solicitado;
2. remove qualquer item anterior do mesmo slot;
3. clona o modelo do item;
4. normaliza a escala visual usando a caixa envolvente do asset e a escala mundial do osso;
5. aplica posição e rotação específicas da Espada ou do Machado;
6. adiciona o item ao socket para que acompanhe `idle`, `running`, `ataque`, `hit` e `morte`.

Como os dois modelos têm origem central, o ajuste também deslocará cada malha até que a região do cabo coincida com a palma. Espada e Machado terão configurações independentes e serão revisados visualmente durante todas as animações.

### Interface de recompensa

A interface seguirá o sistema industrial já existente: fundo preto, tipografia monoespaçada, bordas retas e âmbar como cor de sinal. Um modal central mostrará o título `Escolha sua recompensa` e dois botões reais:

- `Espada`, com o nome do asset `Sword`;
- `Machado`, com o nome do asset `Axe`.

O diferenciador visual será a seleção dividida em duas placas de equipamento que reagem ao foco e ao ponteiro com uma borda âmbar sólida. Não haverá opção de fechar o modal sem escolher, pois a recompensa é obrigatória e única.

## Tratamento de falhas

- Se `chest.glb` falhar, o logger registra o erro e a escolha de recompensa aparece diretamente após a derrota do boss, sem impedir a progressão.
- Se uma arma falhar, somente sua opção fica desabilitada e mostra `Indisponível`.
- Se as duas armas falharem, o modal informa que a recompensa não pôde ser carregada e permite retornar ao jogo sem equipamento.
- Se `mixamorigRightHand` não for encontrado, a escolha não é consumida; o erro é registrado e o jogador pode tentar a outra opção.
- Cliques repetidos durante `opening`, `choosing` ou `claimed` são ignorados.

## Testes e critérios de aceite

Testes automatizados devem comprovar:

- o jogo resolve somente o Paladino como herói jogável;
- o baú não existe antes da derrota do boss;
- a derrota do boss cria exatamente um baú;
- clicar longe inicia aproximação e não abre imediatamente;
- entrar no alcance inicia a abertura uma única vez;
- a escolha aceita somente `sword` ou `axe`;
- a recompensa só pode ser consumida uma vez;
- o item anterior do slot é removido antes do novo encaixe;
- a arma é adicionada a `mixamorigRightHand`;
- uma falha isolada desabilita somente a opção afetada;
- o estado da interface bloqueia e depois libera os controles do jogo.

Validação visual final:

- o jogo entra diretamente com o Paladino;
- inimigos e boss voltam a aparecer;
- o baú surge somente após a morte do boss e repousa sobre a plataforma;
- o clique faz o jogador se aproximar e abrir o baú;
- o efeito procedural comunica claramente a abertura;
- o modal apresenta apenas Espada e Machado;
- Espada e Machado ficam na palma correta, com tamanho e orientação coerentes;
- as armas permanecem encaixadas durante as cinco animações do Paladino;
- testes, verificação TypeScript e build Vite terminam sem erros.
