# Build com modo ADMIN (menu ADM ativo)

O projeto tem dois builds e um servidor de teste:

| Comando | Modo | Menu ADM |
|---------|------|----------|
| `npm run dev:admin` | `admin` (servidor local) | **ligado** (página de teste) |
| `npm run build:admin` | `admin` | **ligado** (build de teste) |
| `npm run build` | `production` | **desligado** (build público) |

Os dois builds geram a pasta `dist/` (ignorada pelo Git). No modo ADMIN o botão
flutuante **ADM** aparece por cima do lobby/menu e do jogo (`z-index: 10050`).

## Como funciona a ativação

A regra inteira vive em `src/admin/AdminAccess.ts` (com testes em
`AdminAccess.test.ts`) e é resolvida uma única vez em `src/main.ts`:

```ts
const adminEnabled = resolveAdminActivation({
  mode: import.meta.env.MODE,        // 'admin' em dev:admin / build:admin
  development: import.meta.env.DEV,  // true no servidor de desenvolvimento
  envValue: import.meta.env.VITE_ADMIN_MODE,
  adminParam: searchParams.get('admin'),
});
```

Ordem das regras:

1. `?admin=0` (ou `?admin=false`) desliga o ADM **sempre**, mesmo em modo admin;
2. `--mode admin` (`npm run dev:admin` / `npm run build:admin`) liga o ADM;
3. servidor de desenvolvimento (`npm run dev`) liga o ADM por padrão;
4. `.env.admin` com `VITE_ADMIN_MODE=true` liga o ADM onde ele for carregado;
5. fora disso (inclusive `npm run build` público) o painel **não é criado** e o
   `AdminCommandGate` recusa qualquer comando.

Para conferir no bundle: em `dist/assets/index-*.js`, o trecho fica
`adminEnabled: ... ` resolvendo para `!1` (false) no build público e
`!1||!0` (true) no build ADMIN.

## Página de teste

- **Preview/desenvolvimento:** `npm run dev:admin` e abra a URL do servidor
  (porta 5173). Já abre com o painel ADM e o botão **MODO ADM** no lobby.
- **Build local:** `npm run build:admin` e depois
  `npm run preview:admin -- --host 127.0.0.1 --port 4173`.
- **Atalho rápido (dev + navegador anônimo):** `Ligarserver-Admin-Incognito.bat`
  (`?admin=1`).
- **Desligar na mesma máquina:** acrescente `?admin=0` na URL.

## O que o painel ADM oferece

Recolhível (clique no botão **ADM** ou `F2`), arrastável pela tela e com
transparência ajustável:

- **Wave 1 a Wave 6** (total real de ondas regulares do jogo);
- **Ir para o Boss** — limpa a fase atual e entra na batalha final;
- **Hitkill Boss** — habilitado só com Boss vivo; usa a morte normal (drop,
  vitória e progressão passam pelo mesmo fluxo do combate);
- **Imortalidade** — `Player.takeDamage` ignora dano enquanto ativo;
- **Câmera ADM** — faixa de zoom ampliada;
- **Treino / Spawn** — adicionar monstro, mini-boss ou boss à cena;
- **Limpar monstros** — remove tudo que foi criado pelo painel de teste;
- **Adicionar item** — escolhe item do catálogo + quantidade e grava na mochila
  (com rollback se a persistência falhar).

No lobby, o botão **MODO ADM** liga a partida de treino: entra na dungeon sem
monstros, com skills livres (sem fadiga/cooldown) — útil para testar animações,
VFX e equipamentos.

Os controles de wave/spawn só são habilitados depois que a partida começa
(`setGameplayAvailable`); a injeção de itens funciona já no lobby.

## Publicar

Basta copiar **todo o conteúdo de `dist/`** para a hospedagem estática
(incluindo `models/`, `assets/`, `items/`, `ui/`, `vfx/`, `blacksmith/` e
`draco/`, que vêm de `public/`). São ~187 MB, a maior parte modelos `.glb`.

> Aviso: um build ADMIN publicado dá essas ferramentas a **qualquer pessoa** que
> abrir o site. Use-o para teste interno; para o público, gere com `npm run build`.
