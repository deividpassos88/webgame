# Painel de teste do build (`/teste.html`)

Página de diagnóstico que verifica, **de dentro do próprio build**, se tudo que o
jogo pede está realmente publicado e respondendo. Não depende de CDN, não escreve
nada no save do jogo e não altera o perfil do navegador.

| Arquivo | Papel |
|---------|-------|
| `public/teste.html` | o painel (copiado para a raiz do site em todo build) |
| `vite.config.ts` → plugin `dragon-miner:build-info` | gera `/build-info.json` e serve o mesmo JSON em dev |
| `tools/teste-page-smoke.mjs` | smoke test automatizado do painel (happy-dom) |

## Como abrir

```bash
# build público + painel de teste na raiz do site
npm run build
npm run serve:build:teste      # http://localhost:4174/  → painel
                               # http://localhost:4174/index.html → jogo

# o jogo na raiz e o painel em /teste.html
npm run serve:build            # http://localhost:4173/

# build ADMIN (dist-admin/) com o painel na raiz
npm run serve:build:admin      # http://localhost:4175/

# os dois builds de uma vez
npm run build:tudo             # dist/ (produção) + dist-admin/ (ADM)
```

Em desenvolvimento (`npm run dev`) o painel também funciona:
`http://localhost:5173/teste.html` — sem buildar nada, o `/build-info.json` é
montado na hora pelo middleware do Vite.

Ao publicar, basta servir a pasta: o painel fica em `https://seu-site/teste.html`.

## O que o painel faz

**1. Lê o `/build-info.json`** e mostra KPIs: id e modo do build, módulos gerados
pelo Vite (JS/CSS/HTML) com tamanho, quantidade e peso dos assets publicados,
referências do código e resultado do último teste.

**2. Testa arquivos de verdade** (um a um, com `cache: 'no-store'`), em conjuntos:

| Conjunto | O que cobre |
|----------|-------------|
| Essenciais | os ~91 assets citados no `src/` + `index.html` + `build-info.json` |
| Modelos 3D | todos os `.glb` |
| Imagens | todos os `.png/.webp/.jpg` (com decodificação real) |
| VFX | sprites de partículas em `/vfx/` |
| Bundle | só o que o Vite gerou |
| TUDO | build + public (~290 arquivos) |

Cada linha mostra status, caminho, tamanho, tempo e uma observação:

- **HTTP**: `HEAD` sem cache (com fallback para `GET` + `Range` em servidores que
  recusam `HEAD`), conferindo `content-length` contra o tamanho do arquivo no build.
- **Imagens**: são decodificadas em `<img>`, então o painel reporta as dimensões
  reais e o tamanho transferido — pega arquivo “200 OK” que na verdade é HTML de
  erro ou imagem corrompida.
- **`.glb`**: os 12 primeiros bytes são baixados e validados (`magic` = `glTF`,
  versão 2 e tamanho declarado no cabeçalho igual ao arquivo).

**3. Aponta buracos no build.** O plugin varre `src/**/*.ts` procurando caminhos
de asset (`'/models/....glb'`, `'/vfx/....png'`…) e compara com o conteúdo final
do `dist/`. O que é citado no código e não existe aparece num aviso vermelho — e
na tabela entra como *ignorado*, com o motivo, para não poluir o resultado.

**4. Aviso de ADM.** Se o `src/main.ts` estiver com
`adminEnabled = !adminExplicitlyDisabled` (estado atual do repositório), o menu
ADM aparece em **qualquer** build, inclusive `npm run build`. O painel detecta
isso na hora do build e mostra o alerta com o atalho `/index.html?admin=0`.

## `/build-info.json`

Gerado no fim do build (respeitando `--outDir`) e servido em dev pelo middleware:

```jsonc
{
  "buildId": "muv7...",            // mesmo id exibido no jogo
  "mode": "production",            // "admin" no build ADM
  "generatedAt": "2026-...",
  "node": "v22...",
  "assetCount": 288,               // arquivos vindos de public/
  "assetTotalBytes": 194837456,
  "adminDefaultOn": true,          // lido de src/main.ts
  "bundle":    [{ "path": "/assets/index-XXXX.js", "bytes": 43631 }],
  "assets":    [{ "path": "/models/Guerreiro/guerreiro_animado.glb", "bytes": 14287424 }],
  "referenced": ["/models/Maga/Maga-optimized.glb", "..."],
  "referencedMissing": ["/models/dragonminer-optimized.glb"]
}
```

## Smoke test automatizado

```bash
npm run test:painel                       # dist/
node tools/teste-page-smoke.mjs dist-admin
node tools/teste-page-smoke.mjs public
```

Ele roda o painel dentro de um DOM simulado (happy-dom) com um servidor falso que
responde a partir dos arquivos reais e confere 16 pontos: leitura do
`build-info.json`, KPIs, aviso de assets ausentes, preset essenciais sem falhas,
cabeçalho dos `.glb`, decodificação das imagens, 404 aparecendo como falha, filtro
“só problemas” e o aviso de ADM.

## Publicar sem o painel

O painel não interfere no jogo, mas se você não quiser expor o diagnóstico:

```bash
DRAGON_MINER_SKIP_TEST_PAGE=1 npm run build   # remove teste.html e build-info.json do dist
```
