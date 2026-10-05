# Build com modo ADMIN (menu ADM ativo)

O jogo tem dois builds de produção:

| Comando | Modo | Menu ADM |
|---------|------|----------|
| `npm run build` | `production` | **desligado** (build público) |
| `npm run build:admin` | `admin` | **ligado** (painel/menu ADM funciona) |

> **Correção — o build público também libera o ADM.** O `src/main.ts` atual usa
> `adminEnabled = !(?admin === '0' || ?admin === 'false' || VITE_ADMIN_MODE === 'false')`,
> então o botão ADM aparece em **qualquer** build, inclusive `npm run build`; o
> `--mode admin` não muda mais o resultado. Para abrir uma sessão sem ADM use
> `?admin=0`. O painel de teste (`/teste.html`) detecta isso no build e mostra o
> aviso automaticamente. Enquanto o `main.ts` estiver assim, trate este documento
> como descrição do modo pretendido, não do comportamento atual.

Os dois geram a pasta `dist/` (ignorada pelo Git). O build ADMIN é o que você
pede: o botão flutuante **ADM** aparece no canto inferior direito, por cima do
lobby/menu e do jogo (`z-index: 10050`), e abre as waves, "Ir para o Boss",
"Hitkill Boss", "Imortalidade", "Câmera ADM" e "Adicionar item".

## Como funciona a ativação

`src/main.ts` decide o acesso ADM assim:

```ts
const adminFromLauncher = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('admin') === '1';
const adminEnabled = adminFromLauncher
  || import.meta.env.MODE === 'admin'
  || resolveDevAdminAccess(import.meta.env.VITE_ADMIN_MODE, import.meta.env.DEV);
```

- `npm run build:admin` usa `vite build --mode admin`, então `import.meta.env.MODE === 'admin'`
  já garante o ADM ligado **sem depender de nenhum arquivo `.env`**.
- O `.env.admin` (`VITE_ADMIN_MODE=true`) continua valendo, mas ele é ignorado
  pelo Git (`.env*`), por isso o `--mode admin` é o caminho confiável.
- No build ADMIN o `?admin=1` da URL **não** é necessário (essa rota só existe em dev).

Depois do build dá para conferir no bundle: em `dist/assets/index-*.js` o trecho
fica `adminEnabled: !1 || !0` (ou seja, `true`).

## Testar o build localmente

```bash
npm run build:admin
npm run preview:admin -- --host 127.0.0.1 --port 4173
# abra http://127.0.0.1:4173/
```

No Windows, o atalho `Buildar-Admin.bat` faz isso com um menu:
buildar, buildar + servir a pasta `dist`, abrir o Edge InPrivate e encerrar o
servidor da porta 4173.

## Publicar

Basta copiar **todo o conteúdo de `dist/`** para a hospedagem estática
(incluindo `models/`, `assets/`, `items/`, `ui/`, `vfx/`, `blacksmith/` e
`draco/`, que vêm de `public/`). São ~158 MB, a maior parte modelos `.glb`.

> Aviso: um build ADMIN publicado dá essas ferramentas a **qualquer pessoa** que
> abrir o site. Use-o para teste interno; para o público, gere com `npm run build`.
