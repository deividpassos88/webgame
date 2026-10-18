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
