# Oficina do Ferreiro — Design

## Objetivo

Adicionar uma oficina persistente ao lobby para criar o set comum do Guerreiro e reduzir a expedição para seis ondas regulares seguidas pelo boss final.

## Fluxo da oficina

1. A aba **Oficina** abre a cena estática do ferreiro com a arte de refeição e a fala: “Estou ocupado. O que deseja?”.
2. **Quero que você crie meus itens** abre a negociação. Quando a licença estiver expirada, a arte de cobrança aparece e o jogador pode pagar 30 Token da Guilda. **Desculpa, vou embora** volta à aba Herói sem modificar o perfil.
3. O pagamento só é aceito quando há 30 `guild-token` na mochila. A dedução e a extensão do prazo são uma transação única; o acesso termina 36 horas após a confirmação.
4. Enquanto a licença estiver ativa, o catálogo de receitas aparece. Ao escolher uma receita, a arte de trabalho aparece, materiais são debitados e uma peça vai para a mochila. O jogador equipa a peça manualmente pela interface existente.

## Dados duráveis

O perfil receberá um campo de oficina com `availableUntil` em milissegundos Unix ou `null`. A versão será migrada sem alterar equipamentos, mochila, capacidade, cofre, hotkeys, progressão ou atributos já existentes.

## Receitas iniciais

Cada receita usa 10 unidades de cada material: Garra de Draco Desgastada, Couro de Draco Antigo, Fragmento de Chifre Negro, Presa Carmesim e Escama Rubra Serrilhada.

As saídas são Capacete do Forjador Comum, Peitoral do Forjador Comum, Calça do Forjador Comum, Luvas do Forjador Comum e Botas do Forjador Comum. Cada saída ocupa um slot compatível da mochila, sem autoequipar. Falta de materiais, licença expirada ou falta de espaço não consomem nada.

## Arte e interface

As três imagens fornecidas serão copiadas para `public/blacksmith/` com nomes estáveis: `working.png`, `meal.png` e `payment.png`. As cinco artes do set serão copiadas para `public/items/equipment/common-forged/` e apresentadas nas receitas e no inventário. A oficina seguirá o visual de aço escuro, dourado e fogo já adotado pelo lobby.

## Campanha

A sequência passa a ser ondas 1–6, seguidas pelo boss final. XP, limiares de nível e desbloqueio de skills serão redistribuídos para que todas as cinco skills estejam liberadas até a onda 6, mantendo a curva inicial mais leve e aumentando a exigência nas ondas finais.

## Restrições

- Desktop WebGL apenas.
- Sem carteira externa; o pagamento usa exclusivamente `guild-token` já existente na mochila.
- Sem pausas automáticas no cenário; a oficina é uma tela do lobby.
