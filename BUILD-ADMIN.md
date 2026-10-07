# Build com modo ADMIN (menu ADM ativo)

O jogo tem dois builds de produção:

| Comando | Modo | Menu ADM |
|---------|------|----------|
| `npm run build` | `production` | **desligado** (build público) |
| `npm run build:admin` | `admin` | **ligado** (painel/menu ADM funciona) |

Os dois geram a pasta `dist/` (ignorada pelo Git). O build ADMIN é o que você
pede: o botão flutuante **ADM** aparece no canto inferior direito, por cima do
lobby/menu e do jogo (`z-index: 10050`), e abre as waves, "Ir para o Boss",
"Hitkill Boss", "Imortalidade", "Câmera ADM" e "Adicionar item".

## Como funciona a ativação

`src/main.ts` pergunta para `resolveAdminEnabled` (em `src/admin/AdminAccess.ts`),
que recebe os sinais do bundle atual:

```ts
const adminEnabled = resolveAdminEnabled({
  adminParam: new URLSearchParams(window.location.search).get('admin'),
  mode: import.meta.env.MODE,
  viteAdminMode: import.meta.env.VITE_ADMIN_MODE,
  development: import.meta.env.DEV,
});
```

A regra, na ordem:

| Sinal | Resultado |
| --- | --- |
| `?admin=0`, `?admin=false` ou `VITE_ADMIN_MODE=false` | **desligado**, sempre |
| `npm run build:admin` (`MODE === 'admin'`) | **ligado** |
| servidor de desenvolvimento (`npm run dev`) | **ligado** |
| `.env.admin` (`VITE_ADMIN_MODE=true`) | **ligado** |
| build público (`npm run build`) | **desligado** — nem `?admin=1` liga |

- `npm run build:admin` usa `vite build --mode admin`, então `import.meta.env.MODE === 'admin'`
  já garante o ADM ligado **sem depender de nenhum arquivo `.env`**.
- O `.env.admin` (`VITE_ADMIN_MODE=true`) continua valendo, mas ele é ignorado
  pelo Git (`.env*`), por isso o `--mode admin` é o caminho confiável.
- No build ADMIN o `?admin=1` da URL **não** é necessário (essa rota só existe em dev).
- Os casos acima estão cobertos por `src/admin/AdminAccess.test.ts`.

Depois do build dá para conferir no bundle: em `dist/assets/index-*.js` o build ADM
passa `mode:"admin",viteAdminMode:"true"`, enquanto o público passa
`mode:"production",viteAdminMode:void 0`.

## Sintoma: "buildei e o menu ADM sumiu"

Os dois comandos escrevem na **mesma** pasta `dist/`. Se o último build foi o
público (`npm run build`), o `dist/` inteiro perde o ADM — inclusive o que já
estava sendo servido. Não existe build "meio ADM": o menu só volta rodando de
novo o build ADMIN:

```bash
npm run build:admin
```

Depois disso, recarregue a página com cache limpo (`Ctrl+Shift+R`). No preview
deste repositório (porta 5173) isso vale igual: o servidor entrega o `dist/`
tal como está no disco, então qualquer `npm run build` público tira o botão ADM
até o `build:admin` rodar de novo.

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
`draco/`, que vêm de `public/`). São ~190 MB hoje, a maior parte modelos `.glb`
— e cerca de 125 MB disso são arquivos que nenhuma tela carrega (fontes `.blend`
e imagens de referência; veja a seção 7.3 do `ANALISE-PROJETO.md`).

> Aviso: um build ADMIN publicado dá essas ferramentas a **qualquer pessoa** que
> abrir o site. Use-o para teste interno; para o público, gere com `npm run build`.
