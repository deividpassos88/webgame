# Painel ADM de teste — desenho técnico

Data: 2026-08-28

## Objetivo e limite de segurança

Adicionar ao protótipo Three.js um painel de ferramentas para testar ondas e o Boss sem repetir toda a progressão. O painel só existe quando o build local recebe `VITE_ADMIN_MODE=true`; com a variável ausente ou diferente de `true`, nenhum controle ADM é criado e o atalho público `F9` deixa de funcionar.

Essa autorização é deliberadamente temporária e não será tratada como proteção de produção: variáveis `VITE_*` são incorporadas ao frontend. Na integração futura com o Projeto Miner, o provedor local será substituído pela permissão da sessão validada pelo backend, e os comandos que modificam progressão, drops ou combate serão confirmados pelo servidor.

## Interface e comandos

O painel será criado dinamicamente no canto superior direito apenas para uma sessão autorizada. Ele começa recolhido, exibe a fase atual e oferece:

- botões `Wave 1` a `Wave 5`;
- `Ir para o Boss`;
- `Hitkill Boss`, desabilitado enquanto não houver Boss vivo;
- alternador `Imortalidade`;
- alternador `Câmera ADM` para a faixa de zoom ampliada já existente.

Os controles terão estados visuais de ativo, desabilitado e confirmação curta da última ação. O painel não cobrirá HUD, seleção de arma nem janela de vitória, e continuará utilizável com mouse e teclado.

## Componentes

### Autorização

Um contrato pequeno de acesso responderá se a sessão pode usar ferramentas ADM. O adaptador do protótipo lerá `import.meta.env.VITE_ADMIN_MODE === 'true'`. `Game` receberá a decisão pronta e não conhecerá detalhes de login. Isso permite substituir o adaptador pelo usuário autenticado do Projeto Miner sem mudar painel ou comandos.

### Estado e comandos ADM

Um controlador independente manterá somente estados locais de teste, como imortalidade e câmera ampliada. Ele validará cada comando antes de encaminhá-lo ao jogo; mesmo no protótipo, chamadas não autorizadas serão recusadas.

### Progressão

`WaveManager` ganhará operações explícitas e testáveis para iniciar uma wave regular específica ou a batalha final. Cada salto:

1. invalida a fase anterior incrementando `phaseId`;
2. cancela pedidos de spawn e tentativas pendentes;
3. limpa os IDs ativos e conhecidos da fase anterior;
4. zera contadores e temporizadores incompatíveis;
5. configura a fase escolhida para gerar seu primeiro lote no próximo `update`.

`RunProgression` apenas encaminhará essas operações, preservando o encapsulamento do gerenciador.

### Limpeza da cena

Antes de mudar de fase, `Game` cancelará alvo e movimento de ataque, encerrará efeitos do Boss, limpará plasmas pendentes, descartará corretamente todos os inimigos registrados e ocultará a barra do Boss. Assim, monstros antigos não poderão atacar, conceder recompensa ou reportar morte depois do salto.

### Imortalidade

O estado será aplicado no próprio `Player`, fazendo `takeDamage` ignorar dano enquanto ativo. Dessa forma ele também protege contra as teclas locais de teste e não apenas contra golpes recebidos pelo registro de combate. Desativar a opção não altera o HP atual.

### Hitkill do Boss

O comando só atuará sobre o Boss vivo registrado. Ele aplicará dano fatal e passará pelo mesmo manipulador de morte usado pelo combate normal: animação, efeitos, limpeza do alvo, registro da derrota e avanço da progressão. O comando não fabricará o drop diretamente; quando a recompensa final for adicionada, ela será disparada pelo mesmo fluxo normal.

### Ataque automático do alvo marcado

O alvo marcado continuará sendo a única autorização para o ataque automático. Quando esse monstro estiver vivo e entrar no alcance da arma, o ataque terá prioridade temporária sobre o movimento manual: o deslocamento pausa, o personagem vira para o alvo e executa o golpe. Manter uma tecla de movimento pressionada não cancelará a animação desse golpe.

O sistema não perseguirá automaticamente um alvo distante. Se o alvo sair do alcance, morrer ou perder a marcação, o ataque automático cessa e o movimento que o jogador estiver pressionando volta a funcionar. Sem alvo marcado, aproximar-se de qualquer monstro não inicia ataques.

### Ataque simultâneo dos monstros na formação

A proximidade real do personagem terá prioridade sobre o deslocamento para um ponto de formação. Cada monstro avaliará individualmente seu próprio alcance antes de continuar correndo para o slot de cerco. Se estiver dentro do alcance e com recarga disponível, interromperá a corrida, iniciará sua animação de ataque e aplicará um único dano no momento configurado do golpe.

Monstros diferentes não compartilharão recarga nem bloqueio de ataque. Portanto, todos os que alcançarem o personagem poderão atacar, mesmo enquanto os demais continuam se reposicionando. Um golpe animado ainda será cancelado sem dano se o personagem sair do alcance antes do impacto.

## Fluxo de dados

1. O bootstrap resolve a permissão ADM temporária.
2. `Game` cria o painel somente quando autorizado.
3. O painel emite um comando tipado.
4. O controlador valida autorização e estado do comando.
5. `Game` executa a operação usando `RunProgression`, `CombatEntityRegistry`, `Player` e `CameraController`.
6. O snapshot da progressão atualiza o painel e habilita ou desabilita ações contextuais.

Nenhum botão acessará diretamente entidades Three.js ou campos privados do gerenciador de waves.

## Tratamento de erros

- Wave fora de `1..5`: recusada sem alterar o estado.
- Hitkill sem Boss vivo: recusado e botão permanece desabilitado.
- Comando sem autorização: recusado e registrado como aviso.
- Mudança de fase durante morte/efeito: primeiro limpa os registros, depois inicia a nova fase.
- Reinício completo da partida: desliga imortalidade e câmera ADM, mas mantém o painel disponível se a sessão continuar autorizada.

## Testes e aceitação

Serão escritos testes antes da implementação para comprovar:

- painel inexistente sem autorização e visível com autorização;
- comandos recusados quando não autorizados;
- salto correto para cada wave e para a batalha final;
- estado antigo completamente invalidado após um salto;
- imortalidade bloqueando dano e voltando ao normal ao ser desligada;
- hitkill indisponível sem Boss e usando a morte normal quando houver Boss;
- câmera ampliada acessível apenas pelo painel autorizado;
- alvo marcado dentro do alcance interrompendo o movimento e iniciando ataque;
- alvo distante não sendo perseguido automaticamente;
- movimento não cancelando o golpe automático já iniciado;
- ausência de alvo marcado impedindo qualquer ataque automático;
- monstro dentro do alcance atacando mesmo com um slot de formação ainda distante;
- vários monstros dentro do alcance iniciando golpes e causando dano independentemente;
- monstros fora do alcance continuando o movimento de cerco;
- build, typecheck e suíte completa sem regressões.

Uma verificação manual no navegador confirmará posição, recolhimento, legibilidade, estados dos botões e execução das ações principais.

## Integração futura com o Projeto Miner

Na migração, o adaptador local será removido. O backend entregará a permissão da sessão e validará novamente cada comando administrativo. Comandos de progressão e recompensa não confiarão no navegador, e todas as ações administrativas serão registradas com usuário, horário, DG e alvo. O painel e os tipos de comando permanecerão os mesmos.
