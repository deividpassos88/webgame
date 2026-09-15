# Guerreiro procedural realista

## Objetivo

Substituir o Guerreiro que inicia a cena por um personagem masculino atlético, original e de aparência medieval realista. O novo visual será gerado por código, reutilizará a armature e as animações compatíveis do Guerreiro atual e será entregue como um GLB otimizado para Three.js.

O acabamento visual terá como referência geral o realismo medieval sóbrio de *The Witcher 3*, sem copiar o rosto, o traje ou outros elementos identificadores de Geralt. O resultado priorizará anatomia convincente, materiais fisicamente coerentes, silhueta legível na câmera do jogo, deformações limpas e combate rápido.

## Limites da promessa de qualidade

“Perfeito” e “Triplo A” são direções artísticas, não condições binárias verificáveis. A implementação usará critérios objetivos para impedir a entrega enquanto houver falhas técnicas observáveis. A aprovação estética final dependerá de inspeção humana dos renders e do personagem na cena.

O ciclo de refinamento será limitado por critérios verificáveis e pelo escopo deste projeto. Não será executado um loop infinito. Se um critério não puder ser atingido com os ativos ou a tecnologia disponíveis, a limitação será registrada com evidências e uma alternativa será proposta.

## Direção visual

### Anatomia e rosto

- Homem atlético com aproximadamente 1,85 m em escala visual.
- Proporções humanas naturais, sem musculatura exagerada.
- Cabeça completa com crânio, mandíbula, maçãs do rosto, nariz, lábios, olhos, pálpebras, orelhas e pescoço.
- Rosto maduro e original, com assimetria sutil para evitar aparência artificial.
- Cabelo médio preso e barba curta, construídos de forma a reduzir interseções durante ataques.
- Mãos com palma, polegar e dedos visualmente separados; a malha será simplificada de acordo com a distância da câmera.

### Roupa e armadura

- Camisa escura sob jaqueta segmentada de couro marrom.
- Calça de tecido grosso, cinto, fivela, botas reforçadas e luvas.
- Peitoral metálico parcial, ombreiras assimétricas, braçadeiras e grevas.
- Bolsas e pequenos acessórios somente onde não prejudicarem animação, leitura ou desempenho.
- Partes flexíveis receberão skinning; placas rígidas usarão pesos concentrados nos ossos apropriados para não dobrarem como tecido.

### Espada

- Espada longa de aço com lâmina, fuller discreto, guarda trabalhada, empunhadura revestida de couro e pomo.
- Bainha nas costas quando a espada não estiver empunhada, caso o fluxo de equipamento permita alternância sem conflito com o sistema existente.
- A arma equipada acompanhará o socket atual da mão direita e continuará utilizando as estatísticas do catálogo de equipamentos.

### Materiais

- Materiais PBR distintos para pele, olhos, cabelo, tecido, couro, aço e detalhes escurecidos.
- Variações procedurais de cor, rugosidade, relevo e desgaste em escala compatível com a câmera do jogo.
- Metal com microarranhões e variação moderada de roughness.
- Couro com poros e desgaste concentrado em bordas e áreas de contato.
- Pele com variação cromática sutil, sem depender de translucência cara em tempo real.
- Atlas e resolução de texturas serão escolhidos para preservar aparência e controlar memória e tamanho do GLB.

## Estratégia de geração

### Ferramenta principal

Será criado `tools/build_procedural_warrior.py`, executado pelo Blender em modo controlado. O script será determinístico: a mesma versão do Blender e os mesmos parâmetros deverão gerar um ativo equivalente.

O script realizará:

1. Importação do `Guerreiro.glb` atual.
2. Preservação da armature, dos nomes de ossos e das sete animações.
3. Remoção das malhas visuais antigas da cena de exportação.
4. Construção procedural do corpo e do rosto por perfis, curvas, primitivas convertidas e manipulação direta de vértices.
5. Construção das roupas, armaduras, cabelo e espada como objetos semanticamente separados durante a geração.
6. Aplicação de transformações e correção de topologia.
7. Cálculo e refinamento de pesos de skinning por região anatômica e proximidade à armature.
8. Criação dos materiais e mapas procedurais necessários.
9. Verificação automatizada da cena.
10. Exportação para `public/models/guerreiro/ProceduralWarrior.glb`.

### Topologia e deformação

- Loops adicionais serão concentrados em ombros, cotovelos, punhos, quadril, joelhos, tornozelos, boca e pálpebras.
- Regiões pouco visíveis terão densidade menor.
- Cada vértice skinned terá no máximo quatro influências normalizadas.
- Partes anatômicas não podem conter vértices soltos, faces degeneradas ou normais invertidas.
- Ombreiras e peças rígidas terão folga suficiente para as poses extremas dos ataques.
- Os pesos serão avaliados em quadros críticos das sete animações, não apenas na pose de repouso.

### Compatibilidade

- Os 65 ossos, a hierarquia e os nomes esperados pelo ativo atual serão mantidos.
- Permanecerão disponíveis os clipes `Idle`, `Walking`, `Running`, `Reaction`, `AttackHorizontal`, `JumpAttack` e `Death`.
- O novo ativo manterá compatibilidade com `CharacterAssetStore`, `Player`, `WeaponEquipment` e os sockets existentes.
- O GLB atual será preservado como fallback recuperável.

## Movimento e combate

### Locomoção

- Idle e corrida usarão cross-fades curtos e consistentes.
- A velocidade visual do ciclo de corrida será sincronizada com a velocidade real do jogador.
- Aceleração e desaceleração suavizarão início, mudança de direção e parada.
- Root motion incompatível com o controle do jogo será neutralizado sem remover o balanço corporal.
- A orientação para o alvo será suavizada, exceto no instante em que um golpe exigir alinhamento firme.

### Combo de espada

O ataque normal passará a suportar um combo rápido de três estágios:

1. Corte horizontal.
2. Corte reverso.
3. Finalização diagonal.

Cada golpe terá duração visual alvo entre 0,32 e 0,45 segundo. O próximo comando poderá ser armazenado em uma janela próxima ao fim do golpe atual. A sequência não poderá reiniciar abruptamente a pose nem causar teletransporte da espada.

O dano será aplicado por eventos temporais associados ao arco real da lâmina. Cada estágio causará no máximo um acerto por alvo, salvo se uma regra futura declarar explicitamente um ataque múltiplo.

### Efeitos

- Rastro curto e discreto acompanhará a lâmina somente durante a janela ativa.
- O impacto visual será emitido na região aproximada de contato.
- Efeitos não poderão ocultar o personagem nem substituir a clareza da animação.
- Bainha e acessórios poderão receber movimento secundário leve, desde que estável e sem simulação cara ou imprevisível.

## Arquitetura de código

### Gerador de ativo

`tools/build_procedural_warrior.py` concentrará a orquestração e chamará unidades menores para anatomia, vestuário, armadura, materiais, skinning, animação e exportação. Funções puras de cálculo geométrico serão separadas das operações que alteram a cena Blender sempre que isso facilitar testes.

### Catálogo e carregamento

`src/characters/CharacterCatalog.ts` apontará o personagem jogável inicial para `ProceduralWarrior.glb`. `CharacterAssetStore` continuará responsável pelo carregamento e clonagem do esqueleto. Falha do novo ativo deverá ativar explicitamente o GLB anterior, acompanhada de log claro.

### Controle de combo

O estado do combo ficará em uma unidade independente do renderizador e do `Player`, contendo:

- estágio atual;
- tempo do estágio;
- comando armazenado;
- janela ativa de dano;
- alvos já atingidos;
- regra de cancelamento por morte ou reação.

`Player` continuará coordenando deslocamento, alvo, cooldown e animação, consultando o controlador para avançar o combo. A resolução de dano continuará no fluxo atual do jogo.

### Espada e equipamento

O visual inicial da espada será equipado por meio do sistema existente. Alcance, dano e cooldown continuarão vindo de `EquipmentCatalog`, evitando duplicação de regras dentro do ativo 3D.

## Tratamento de falhas

- O gerador terminará com erro se faltar armature, osso obrigatório, clipe, material ou objeto essencial.
- A exportação não substituirá um GLB válido por uma saída parcial.
- A validação listará nomes de malhas, quantidade de vértices, ossos, clipes, influências inválidas e materiais ausentes.
- O carregamento em runtime registrará o erro original antes de usar o fallback.
- Falhas visuais detectadas nos renders serão registradas por pose e região corporal para orientar a iteração seguinte.

## Validação e ciclo de refinamento

### Verificação do ativo

- Um único esqueleto com os 65 ossos esperados.
- Sete clipes com os nomes previstos.
- Nenhuma malha essencial ausente.
- Nenhum vértice solto, face degenerada ou influência acima do limite.
- Pesos normalizados e materiais PBR válidos.
- Espada e sockets corretamente orientados.
- Arquivo GLB importável novamente em uma cena vazia.

### Inspeção visual

Serão renderizadas, no mínimo:

- pose de frente, costas e ambos os perfis;
- close do rosto e das mãos;
- quadros críticos de Idle e corrida;
- antecipação, contato e recuperação de cada golpe;
- reação, salto e morte;
- poses com maior abertura de ombros, flexão de cotovelos, quadril e joelhos.

Uma iteração será exigida quando houver clipping evidente, colapso de volume, articulação quebrada, textura esticada, peça flutuante, transparência incorreta, contato falso da mão com a espada ou deslizamento perceptível dos pés.

### Testes do jogo

- Testes unitários do controlador de combo, buffering, cancelamento e janelas de dano.
- Testes do catálogo e do fallback de carregamento.
- Testes de integração do equipamento inicial e dos sockets.
- Typecheck, suíte Vitest e build de produção.
- Execução visual na cena inicial com iluminação, sombras, câmera e combate reais.

### Metas de desempenho

- Manter 60 FPS no cenário de referência atual, considerando o conjunto completo da cena e não apenas o personagem isolado.
- Não introduzir alocações significativas por frame no controlador de animação ou nos efeitos da espada.
- Controlar draw calls por agrupamento racional de materiais.
- Registrar triângulos, materiais, texturas, tamanho do GLB e uso aproximado de memória para comparação com o personagem anterior.

## Critérios de aceite

O trabalho técnico estará apto para aprovação artística quando:

1. O novo guerreiro for o personagem que inicia a cena.
2. Corpo, cabeça, rosto, cabelo, roupas, armadura e espada forem integralmente visíveis e coerentes.
3. As sete animações funcionarem sem erros de carregamento.
4. Corrida e transições não apresentarem saltos ou deslizamento perceptível dos pés.
5. O combo executar três golpes rápidos e encadeáveis, com dano sincronizado à lâmina.
6. Nenhuma pose crítica apresentar clipping ou deformação extrema claramente visível na câmera de jogo.
7. A espada permanecer corretamente presa à mão durante todos os golpes.
8. Materiais de pele, tecido, couro e metal forem visualmente distintos sob a iluminação real da cena.
9. O jogo passar em typecheck, testes automatizados e build de produção.
10. O cenário de referência mantiver a meta de 60 FPS ou não apresentar regressão material documentada em relação ao ativo anterior.
11. Os renders de validação e a cena executável estiverem disponíveis para revisão do usuário.

Falhas nesses critérios mantêm a implementação em refinamento. Preferências puramente artísticas após o cumprimento dos critérios serão tratadas como feedback de revisão, não como um processo automático ilimitado.

## Fora do escopo

- Copiar a aparência exata de Geralt ou ativos protegidos de *The Witcher 3*.
- Captura de movimento profissional, escaneamento facial ou dublagem.
- Substituir toda a iluminação, cenário, câmera ou sistema de combate do jogo.
- Criar um sistema genérico de personalização de personagem.
- Prometer equivalência absoluta a uma produção AAA realizada por uma equipe multidisciplinar.
