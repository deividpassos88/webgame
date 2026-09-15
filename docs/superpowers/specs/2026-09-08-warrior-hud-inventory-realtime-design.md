# Guerreiro: mochila expansível e HUD em tempo real — Design

## Aprovação

O usuário aprovou a direção em 8 de setembro de 2026 com “pode executar tudo”.

## Contexto e objetivo

**Mundo:** arena WebGL desktop de Dragon Miner, onde o Guerreiro enfrenta ondas e administra equipamento, atributos e materiais.

**Público:** jogadores de desktop com teclado e mouse.

**Trabalho único da interface:** preparar o Guerreiro para a próxima onda.

Não há suporte de controles móveis. Layouts estreitos não ganham mecânicas alternativas; preservam legibilidade e foco, mas o produto continua desktop-only.

## Direção visual

- **Obsidiana:** `#090F18`, base translúcida dos painéis.
- **Aço noturno:** `#172536`, fundos e profundidade dos cards.
- **Ouro forjado:** `#D6A84B`, molduras, destaque e progresso.
- **Vida carmesim:** `#E34A55`, barra de vida.
- **Mana celeste:** `#62B9F5`, barra de mana.
- **Fadiga âmbar:** `#F08A32`, barra de cansaço.

Títulos usam a família serif já presente no projeto; dados e controles usam a família monoespaçada existente. A assinatura visual é o retrato ilustrado dourado, com vida e progressão imediatamente à direita, sem repetir a vida na base da tela.

**Risco estético deliberado:** reduzir o HUD inferior a recursos e atalhos, deixando o centro do campo de batalha livre. A informação de combate essencial sobe para o retrato em vez de formar uma faixa pesada no rodapé.

**Sistema de ícones:** PNGs fornecidos pelo usuário para os seis ataques; SVGs nativos de `RpgIcons.ts` para equipamento e controles. Nenhum emoji será usado como ícone.

## Escopo funcional

### Mochila e compra de espaço

1. Um perfil novo começa com `backpackCapacity = 20`.
2. Cada expansão aumenta exatamente 5 slots; limite máximo: 60 slots.
3. A expansão por Token da Guilda custa exatamente 30 unidades de `guild-token` e é uma transação atômica: capacidade, tokens da mochila e tokens do cofre mudam juntos ou não mudam.
4. O perfil é migrado para um novo schema sem mover ou perder itens existentes.
5. O botão `+5` mostra o custo e fica indisponível se faltarem tokens ou se a capacidade já for 60.
6. A rota `5 CM` aparece como opção futura, desabilitada com a explicação de que não há carteira/integração de CM. Nenhum saldo, cobrança ou recibo fictício será criado.
7. O cofre continua como armazenamento interno de overflow e tenta transferir itens automaticamente após uma expansão; sua seção visual “Proteção de recompensa / Cofre da Guilda” deixa de existir na mochila.

### Lobby

- A mochila mostra slots maiores e o comando de expansão.
- Abaixo do grid de equipamento aparece “Status atual” com os sete atributos persistidos: Força, Ataque, Defesa, Agilidade, Crítico físico, Crítico mágico e Esquiva.
- Cada uma das cinco skills usa cinco estrelas SVG preenchidas conforme `profile.skillStars`. Isto apenas representa o nível existente: não cria um sistema de melhoria de skills não solicitado.

### HUD e assets

- A imagem fornecida do rosto substitui por completo a captura 3D do retrato; isso remove um `WebGLRenderTarget` extra.
- Os assets são guardados com nomes estáveis em `public/assets/ui/portrait/` e `public/assets/ui/skills/`.
- Mapeamento explícito, compartilhado por HUD e lobby:
  - `ataque_basico` → ataque normal;
  - `ataque_giratorio` → giro dourado;
  - `ataque_giratorio_2` → giro glacial;
  - `pulo_atacando` → pulo de impacto;
  - `triplo_ataque` → golpe flamejante;
  - `corte_duplo` → corte duplo.
- No topo esquerdo: retrato, barra de vida grande e cartão compacto de nível/pontos.
- Na base: somente XP, mana e fadiga, sempre em porcentagem.
- No canto inferior direito: seis atalhos quadrados de ataque, incluindo o ataque básico.

### Fadiga

`FatigueMeter` é independente de mana. Ele fica entre 0 e 100, perde valor apenas com deslocamento efetivo (teclado ou clique) e regenera parado. Nesta entrega não reduz velocidade nem bloqueia controles; a barra começa como informação confiável e configurável, evitando alterar a movimentação recém-estabilizada.

Valores iniciais configuráveis:

- drenagem: 12 pontos por segundo em movimento;
- recuperação: 18 pontos por segundo parado.

### Janelas em tempo real

Abrir equipamento, mochila, status, inspector ou loot não muda a fase `playing` nem interrompe inimigos, ondas, recargas, fadiga ou animações. O painel retém foco de teclado, libera teclas já pressionadas e cancela o deslocamento do jogador para impedir ações acidentais através da janela. Morte e vitória têm prioridade sobre qualquer painel aberto.

O navegador/Windows pode reduzir `requestAnimationFrame` para abas ou janelas minimizadas; o jogo não tenta adulterar o relógio para compensar tempo em segundo plano.

## Limites

- Não integrar pagamento real de CM nem carteira externa.
- Não apagar dados do cofre interno.
- Não alterar o combate, ondas, XP ou regras de atributos existentes.
- Não reintroduzir controles mobile.

## Critérios de aceitação

- Perfil novo e migrado abre com 20 slots; expansão bem-sucedida mostra 25 após recarregar a página.
- Saldo insuficiente, capacidade máxima, CM indisponível ou persistência falha não mudam tokens nem capacidade.
- A mochila não mostra “Proteção de recompensa” nem “Cofre da Guilda”.
- O status atual fica abaixo do equipamento no lobby.
- As cinco skills do lobby exibem exatamente cinco estrelas e respeitam `skillStars`.
- Retrato e seis ícones correspondem aos arquivos fornecidos e à ordem definida.
- Painéis abertos não pausam a simulação e não deixam movimento ou ataques atravessarem o foco do painel.
- Vida, XP, mana e fadiga exibem valores arredondados de `0%` a `100%`.
- Navegação de teclado mantém foco visível; `Escape` fecha painel; preferências de movimento reduzido removem transições não essenciais.

Real rendered desktop and mobile screenshots reviewed before Sol acceptance.

Complete no-mouse traversal and active prefers-reduced-motion: reduce emulation completed before Sol acceptance.
