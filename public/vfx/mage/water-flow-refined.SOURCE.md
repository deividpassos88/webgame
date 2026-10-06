# water-flow-refined.png

Textura de água do **Dragão das Marés**.

## Como é gerada

Não é mais uma imagem de IA: é **procedural e determinística**, gravada por

```bash
node tools/build-water-flow-texture.mjs          # 1024x256
node tools/build-water-flow-texture.mjs saida.png 2048 512
```

O script só usa `node:zlib` (mesmo padrão de `tools/preview-impact-ring.mjs`),
roda em qualquer máquina e produz sempre o mesmo PNG. Para mudar o desenho
(cristas, espessura, paleta), edite o script e regenere — não retoque o PNG.

## Por que mudou

A versão anterior era um recorte de IA com centenas de fios finos e leitosos.
Aplicada nos ribbons do efeito, ela virava um "novelo de arame": oito linhas
paralelas atravessando cada faixa, sem massa de água. A referência da skill é o
oposto — **poucas faixas largas, com núcleo azul-marinho profundo e cristas
brancas finas e vítreas**.

## O que o desenho tem

- **4 pinceladas** largas (duas cristas nas bordas, duas no miolo), cada uma
  serpenteando com frequência inteira em X para a repetição horizontal não ter
  emenda visível.
- **Núcleo escuro:** o miolo da faixa puxa para azul-marinho e o azul vivo fica
  perto das bordas, dando volume de tubo de água.
- **Veios escuros** compridos, que separam uma faixa de água da outra.
- **Fio de branco na silhueta:** a borda superior/inferior da faixa é branca,
  como o contorno dos lençóis da referência.

## Convenções que o shader espera

`src/vfx/water/WaterDragonMaterials.ts` lê os canais assim:

- **X** = sentido do fluxo (`along`), e a imagem **repete** nesse eixo;
- **Y** = largura da faixa (`across`), sem repetição;
- **RGB** = água já pintada (o shader multiplica por um realce azul);
- **R** = densidade/corpo; **G** = espuma (a máscara de foam sai de R/G);
- **A** = opacidade (cheia no miolo, dissolvida nas bordas).

## Propriedades em runtime

- Formato: PNG RGBA, 1024 × 256 (leve: ~350 KB).
- `MageVFXResources` carrega e possui uma única textura compartilhada. Materiais
  e efeitos reutilizados não descartam essa textura individualmente.
- `wrapS = RepeatWrapping`, mipmaps trilineares e anisotropia 4 para reduzir
  cintilação na câmera elevada do jogo.
- `NoColorSpace` é intencional: o shader usa os canais pintados como dados
  artísticos, incluindo a máscara de espuma; não é um albedo PBR.
- A coordenada horizontal é advectada pelo shader; na coluna, ela corresponde à
  altura. Tempo positivo com `WATER_COLUMN_FLOW_RATE > 0` desloca os detalhes de
  cima para baixo.

A textura é servida localmente. Não depende de um serviço de geração de imagem
em tempo de execução.
