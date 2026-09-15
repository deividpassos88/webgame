# Remaster do Guerreiro, VFX e Lobby — Design

Data: 2026-09-04  
Status: aprovado conceitualmente; aguardando aprovação da especificação  
Plataforma: Blender 5.2 LTS, glTF 2.0 e WebGL/Three.js

## Objetivo

Eliminar qualquer aparição de T-pose, substituir o estado parado pelo arquivo
`C:\Users\pteix\Downloads\personagem HD\Idle_sword.fbx`, tornar as cinco
skills visualmente fortes e com dano em área, e reconstruir o lobby como uma
tela clara e trabalhada de forja medieval. O Guerreiro aparece desarmado apenas
na prévia do lobby; começa a partida com sua espada normalmente.

## Estado verificado

- O arquivo mestre conectado é
  `C:\Users\pteix\Downloads\personagem HD\personagem_final.blend`.
- Há um Armature com 57 ossos, 11 Actions, um mesh de personagem, uma espada
  presa a `mixamorig:RightHand` e três marcadores VFX.
- `Idle_sword.fbx` existe na pasta `personagem HD`.
- O runtime já possui timelines de ataque, perfis por skill, fita de espada,
  partículas, fumaça e texturas transparentes.
- O lobby atual usa fundo quase preto, painéis planos e iluminação insuficiente.

## 1. Idle e prevenção de T-pose

O `Idle_sword.fbx` será importado em uma cópia de trabalho do `.blend`. Sua
Action será retargeteada para o Armature existente, limpa de root motion e
renomeada para `idle_sword`. A antiga Action `caminhando`, hoje usada como fonte
de pose parada, continuará disponível como clipe auxiliar, mas deixará de
alimentar o estado Idle. O catálogo do jogo apontará explicitamente para
`idle_sword`.

Todas as 11 Actions atuais e a nova Action serão avaliadas quadro a quadro.
Cada clipe exportado terá transformação válida para todos os ossos deformadores
desde o primeiro até o último quadro. Canais ausentes receberão a transformação
da pose válida correspondente; não será inserida a rest pose em T como
preenchimento. Transições do Three.js manterão o último estado válido durante o
crossfade, impedindo um frame intermediário de bind pose.

O GLB final terá 12 animações únicas: as 11 existentes mais `idle_sword`. O
validador será atualizado para exigir o novo clipe, proibir duplicatas e
confirmar que todas as animações possuem canais.

## 2. Combate e área das skills

O ataque básico permanece com seu dano, alcance e velocidade atuais. Cada skill
causará `dano da espada + 1` por acerto da timeline. O bônus não será aplicado a
ataques básicos, dano de inimigos ou bônus acumulado da run.

As áreas serão:

| Skill | Forma | Área efetiva |
| --- | --- | --- |
| Ataque Giratório | círculo no jogador | raio 3,4 m |
| Giro Arcano | círculo no jogador | raio 3,8 m |
| Pulo Atacando | impacto à frente | raio 4,2 m |
| Golpe Flamejante | arco frontal | alcance 4,0 m, abertura 140° |
| Corte Duplo | arco frontal | alcance 3,6 m, abertura 125° |

Cada inimigo poderá receber dano uma vez por evento de acerto. Skills com dois
ou três tempos de impacto poderão atingir novamente no evento seguinte, sem
duplicar dano no mesmo evento. A área visual e a área lógica usarão a mesma
configuração para evitar golpes invisíveis.

## 3. VFX remasterizados

Serão usadas somente texturas gratuitas cuja licença permita redistribuição,
preferencialmente CC0 de fontes oficiais como Kenney ou OpenGameArt. Cada asset
terá URL, autor, licença e data registrados em `public/vfx/warrior/SOURCE.md`.
Arquivos serão redimensionados e comprimidos antes de entrar no build.

O Blender receberá uma coleção `VFX_PREVIEW`, desligada da exportação principal,
com as mesmas texturas em materiais emissivos para conferir cores e posição.
O efeito que aparece no jogo continuará no Three.js, porque partículas e
shaders nativos do Blender não são preservados de forma confiável no GLB.

Mudanças visuais:

- histórico de fita maior para formar um arco contínuo e não um risco curto;
- duas camadas de rastro: núcleo claro e borda colorida;
- partículas permanecendo após a lâmina, com fade mais longo;
- glow junto à espada, faíscas na direção do golpe e impacto no solo;
- fogo animado, brasas alaranjadas e fumaça no Golpe Flamejante;
- decal/anel temporário indicando exatamente a área de dano;
- limites fixos de partículas e buffers reutilizados para não gerar lixo por
  frame nem travamentos no WebGL.

As cinco skills manterão velocidade máxima de reprodução de 1,2x. O ataque
básico continuará rápido.

## 4. Lobby remasterizado

A direção visual será uma forja medieval clara, com pedra, ferro escovado,
couro e luz quente. A composição terá moldura externa trabalhada, cabeçalho com
brasão do Guerreiro, painel de equipamentos à esquerda, palco 3D central e
painel de atributos/skills/inventário à direita. O botão de iniciar terá aspecto
de placa metálica aquecida, estados de hover, pressionado, foco e desabilitado.

O fundo deixará de ser preto: terá parede de pedra iluminada, braseiros fora de
foco, vinheta leve e piso circular de forja. Texturas externas seguirão a mesma
política de licença dos VFX. Ornamentação será usada como moldura e separador,
sem prejudicar a leitura dos 30 espaços da mochila, seis slots de equipamento e
cinco cards de skill com cinco estrelas.

Na prévia 3D:

- a espada e qualquer outro objeto cujo nome indique arma serão ocultados;
- o personagem reproduzirá apenas `idle_sword` em loop;
- o modelo manterá texturas originais, sem emissive map artificial;
- iluminação terá key quente, fill frontal neutra e rim fria;
- exposição do renderer será elevada somente durante o lobby e restaurada ao
  iniciar o jogo;
- arrastar para girar, roda para zoom e equivalentes de teclado serão mantidos.

## 5. Arquivos e integração

O trabalho persistente no Blender será salvo primeiro em backup e depois no
arquivo mestre. A exportação substituirá somente
`public/models/Guerreiro/guerreiro_animado.glb`. O jogo será alterado nos
módulos de catálogo/animação, Player, combate em área, perfis VFX, SwordTrail,
LobbyScreen, HTML e CSS. Assets gratuitos ficarão em pastas próprias dentro de
`public/vfx/warrior` e `public/ui/lobby`.

Falha no carregamento de uma textura decorativa usará cor/gradiente local como
fallback. Falha em textura VFX manterá as partículas procedurais existentes.
Falha no novo Idle será fatal na validação do asset e não será silenciosamente
substituída por T-pose.

## 6. Critérios de aceite

- O lobby mostra o Guerreiro claro, texturizado, desarmado e em `idle_sword`.
- Nenhum clipe ou transição exibe T-pose durante reprodução contínua.
- O GLB possui 12 animações únicas, skin, espada corretamente parentada e três
  marcadores VFX.
- Cada skill mostra rastro longo, impacto persistente e identidade de cor; o
  Golpe Flamejante contém fogo, brasas e fumaça.
- A área visual coincide com os raios/arcos definidos e atinge múltiplos
  inimigos, aplicando exatamente `dano da espada + 1` por evento.
- O lobby permanece utilizável em desktop e viewport móvel, com foco visível,
  sem overflow horizontal.
- Testes unitários, integrações, typecheck, build, validador GLB e inspeção
  visual no navegador passam antes da entrega.

## Fora de escopo

- Trocar o personagem, a espada de gameplay ou o sistema de craft.
- Adicionar novas classes.
- Usar partículas volumétricas do Blender diretamente no WebGL.
- Prometer igualdade pixel a pixel com jogos comerciais; a meta é acabamento
  visual consistente com o projeto e dentro do orçamento do navegador.
