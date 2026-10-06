# water-flow-refined.png

Textura criada para o refinamento de **Dragão das Marés**, em 2026-10-04.

- Base visual gerada por IA especificamente para esta skill: uma faixa horizontal de água azul/ciano, com cristas brancas irregulares e pontas arrastadas pela corrente. Não é um recorte das imagens de referência.
- Preparação local: conversão do fundo preto em alfa suave e aproximação das bordas esquerda/direita para repetição horizontal.
- Formato: PNG RGBA, 1792 × 592, aproximadamente 1,42 MB.
- `MageVFXResources` carrega e possui uma única textura compartilhada. Materiais e efeitos reutilizados não descartam essa textura individualmente.
- `wrapS = RepeatWrapping`, mipmaps trilineares e anisotropia 4 para reduzir cintilação na câmera elevada do jogo.
- `NoColorSpace` é intencional: o shader usa os canais pintados como dados artísticos, incluindo a máscara de espuma derivada de R/G; não é um albedo PBR.
- A coordenada horizontal é advectada pelo shader; na coluna, ela corresponde à altura. Tempo positivo com `WATER_COLUMN_FLOW_RATE > 0` desloca os detalhes de cima para baixo. A transparência recortada fica nas lâminas externas; o núcleo da coluna permanece preenchido.

A textura é servida localmente. Não depende de um serviço de geração de imagem em tempo de execução.
