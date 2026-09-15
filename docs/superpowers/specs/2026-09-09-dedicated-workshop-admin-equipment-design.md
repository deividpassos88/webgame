# Oficina dedicada, administração e equipamento — Design

## Objetivo

Transformar a Oficina em uma tela de lobby dedicada, tornar o ciclo de teste de craft seguro para administradores e consolidar o comportamento de inventário, equipamento e reinício de expedição.

## Escopo aprovado

### Oficina dedicada

- O botão `Oficina` abre uma tela exclusiva e de largura total, sem reaproveitar o painel lateral atual.
- A tela mantém a linguagem visual de aço escuro, ouro e brasa; exibe a arte do ferreiro, o equipamento atual do personagem e as receitas.
- O jogador primeiro conversa com o ferreiro. A criação só fica disponível após pagar exatamente 30 Tokens da Guilda.
- A licença já existente continua válida por 36 horas e só então volta a exigir pagamento.
- Um retorno explícito leva o jogador de volta ao lobby, sem alterar o estado da expedição.

### Administração de inventário

- Apenas quando o painel/conta administrativa estiver ativo, a interface mostra um seletor de item do catálogo e uma quantidade válida.
- A ação respeita pilha máxima e capacidade da mochila, persiste pelo mesmo caminho do inventário normal e apresenta uma mensagem clara em caso de capacidade insuficiente.
- O recurso não é renderizado nem acionável para jogador comum.

### Materiais comuns 6–10

- Os cinco novos materiais usam as versões WebP em `public/items/craft/common/`.
- Cada material recebe identificador estável, nome temático e descrição curta.
- O tooltip é renderizado pelo UI do jogo, com tipografia, moldura e descrição; não dependerá do tooltip nativo do navegador.
- O mesmo componente/contrato de tooltip atende inventário do lobby e inventário do cenário.

Nomes propostos:

| Arquivo | Id | Nome |
| --- | --- | --- |
| 6.webp | `volatile-draconic-essence` | Essência Dracônica Instável |
| 7.webp | `ossified-draco-ribs` | Costelas de Draco Ossificadas |
| 8.webp | `verdant-draco-talisman` | Talismã Dracônico Esmeralda |
| 9.webp | `crimson-draco-talon` | Garra do Draco Carmesim |
| 10.webp | `obsidian-draco-eye` | Olho de Draco Obsidiano |

### Espada e equipamento

- A Espada do Recruta usa `public/items/equipment/armas/sword.webp`.
- Em um perfil novo ela começa na mochila e não equipada: dano base 0.
- Ao clicar para equipar, ocupa Arma primária e concede dano base 8; ao desequipar, o dano retorna a 0.
- Perfis existentes permanecem como estão, sem retirada automática de itens ou equipamentos.
- Os cartões de equipamento passam a ser slots amplos, com peça centralizada e título visualmente gravado na base/fundo do slot.

### Retorno após o boss final

- Ao concluir o boss e voltar ao lobby, a expedição reinicia: nível, XP, atributos e pontos disponíveis voltam ao estado inicial.
- Mochila, capacidade, itens e equipamento permanecem.
- A implementação será coberta por teste de regressão no caminho real de vitória/retorno, além do teste unitário do reset.

### Lobby

- O botão de início de partida é centralizado na faixa inferior do lobby, conforme a referência aprovada.
- A Oficina deixa de ocupar o painel direito do lobby comum.

## Arquitetura

- `BlacksmithWorkshop` continua concentrando regras de pagamento, validade e receitas. Uma nova view de tela dedicada a consome; a regra não é duplicada em UI.
- O catálogo de inventário passa a conter descrição e imagem WebP para os novos itens, e metadados de dano para equipamento quando necessário.
- O estado de equipamento continua no perfil; o `InventoryStore` é a única porta para equipar/desequipar e atualizar mochila.
- A tela dedicada e o lobby usam callbacks explícitos para persistir alterações, permitindo testes sem `localStorage` real.
- O fluxo de vitória é exercitado por uma teste de contrato/integrado que confirma persistência antes de reapresentar o lobby.

## Erros e limites

- Sem 30 Tokens, a conversa informa a quantidade faltante e não libera receitas.
- Tentativa ADM que ultrapasse a capacidade ou pilha máxima falha sem alterar a mochila.
- Item desconhecido ou quantidade inválida é recusado.
- Falha de persistência não deixa a UI apresentar equipamento, licença ou item como se estivesse salvo.

## Verificação

- Testes unitários: catálogo, tooltips/view-model, equipamento/dano, mochila ADM, licença/receita e reset de vitória.
- Testes existentes e novos: `npm test`.
- Produção WebGL: `npm run build` e `npm run validate:warrior-glb`.
- Revisão visual desktop do lobby, tela da oficina, tooltip, arma equipada/desequipada e retorno do boss.
