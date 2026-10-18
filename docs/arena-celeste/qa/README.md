# QA visual da Arena Celeste

Capturas geradas por `tools/capture-arena.mjs` (Chromium headless, 1254 × 1254,
sem interface). A referência fica à esquerda e a reconstrução à direita nos
arquivos `comparativo-*.png`.

| Arquivo | Conteúdo |
| --- | --- |
| `comparativo-ref1.png` | ref 1 (frontal) x `arena-ref1.png` |
| `comparativo-ref2.png` | ref 2 (perspectiva) x `arena-ref2.png` |
| `arena-ref1.png` | câmera calibrada para a ref 1 |
| `arena-ref2.png` | câmera calibrada para a ref 2 |
| `arena-overview.png` | visão geral da arena |

Para regerar:

```bash
npm run dev                      # laboratório em http://localhost:5173
node tools/capture-arena.mjs http://127.0.0.1:5173 docs/arena-celeste/qa
```


## v2 (revisão após reprovação)

As capturas desta pasta foram refeitas com a câmera recalibrada
(`(0, 37,86, 63,16) → (0, −4,09, 0)`, fov 58°) e com o piso re-retificado a
partir do quadrilátero corrigido (`fl 89,851 · fr 1163,851 · bl 330,420 ·
br 925,420`). `comparativo-ref1.png` / `comparativo-ref2.png` são lado a lado
(referência | reconstrução), 2508 × 1254.

Pendências visuais desta rodada estão listadas na seção 8.3 da especificação
(tribunas, céu e relevo da fachada).
