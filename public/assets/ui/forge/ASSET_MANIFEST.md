# Forja de Cinzafogo — assets vetoriais

Estes SVGs foram desenhados para a reconstrução visual da Forja, sem dependências externas, emojis ou texto embutido. A paleta usa ferro escuro, ouro envelhecido e um único acento de brasa para permanecer no mesmo universo do lobby.

| Arquivo | Integração prevista |
| --- | --- |
| `panel-ornate-frame.svg` | Camada decorativa com `pointer-events: none` sobre painéis de diálogo, equipamento e receitas. Use `background-size: 100% 100%`; o miolo transparente preserva a leitura do conteúdo. |
| `anvil-crest.svg` | Brasão para o cabeçalho da oficina, avatar/selo do ferreiro ou marcador de seção. Renderizar como imagem quadrada com `alt=""` se houver rótulo textual adjacente. |
| `forge-divider.svg` | Divisor horizontal entre diálogo, receitas e materiais. O `preserveAspectRatio="none"` permite ocupar toda a largura do painel. |
| `hammer-anvil-cta.svg` | Ícone do botão principal de forja. Colocar antes do texto do CTA; não substitui a frase de ação acessível. |

Todos os arquivos usam somente caminhos, gradientes e formas nativas de SVG. Eles são decorativos; a interação, os rótulos e os estados continuam sendo responsabilidade dos controles HTML existentes.
