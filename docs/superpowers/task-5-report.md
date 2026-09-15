# Relatório — Tarefa 5: dano e reset pós-boss

Data: 2026-09-10

## Alterações entregues

- `resolveEquippedBaseDamage(profile)` lê apenas a arma primária persistida e o catálogo. Sem arma equipada, o dano base é `0`; com `starter-sword`, é `8`.
- O modelo da espada agora é sincronizado com o equipamento persistido. `Game.start()` e `fullRunReset()` não equipam nem gravam a espada por padrão.
- A progressão de ondas só é armada quando há uma arma visualmente equipada, preservando o estado de um perfil que iniciou sem equipar a espada.
- O retorno após a vitória usa `persistVictoryReset`: reinicia progressão, atributos e pontos; sincroniza o `InventoryStore` com o mesmo perfil; persiste o resultado; só então cria o lobby. Equipamento, mochila, capacidade, cofre e licença são preservados.
- O view-model legado agora representa corretamente o perfil novo: espada na mochila e slot de arma primária vazio até a ação de equipar.

## Cobertura adicionada ou atualizada

- `GameProgressionContract.test.ts`: dano sem arma versus espada inicial equipada.
- `GameVictoryReset.test.ts`: reset persistido preservando equipamento, mochila, capacidade e cofre; falha de persistência não confirma a transição.
- `PlayerProfile.test.ts`: reset preserva capacidade da mochila e licença da oficina.
- `RpgUiViewModel.test.ts`: perfil novo expõe a espada na mochila, não no equipamento.

## Verificação executada

| Comando | Resultado |
| --- | --- |
| `npm test -- GameVictoryReset GameProgressionContract PlayerProfile RpgUiViewModel` | 4 arquivos, 28 testes aprovados |
| `npm test` | 130 arquivos, 669 testes aprovados |
| `npm run build` | typecheck e build Vite aprovados |

## Observações

- A build emitiu o aviso já conhecido de chunk JavaScript acima de 500 kB (`Game` com 869.37 kB, 232.48 kB gzip); não interrompeu a produção.
- Não foi realizada revisão visual manual de navegador nesta tarefa, pois ela pertence à validação visual integral da tarefa 6.
