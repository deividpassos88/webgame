# Boss final, câmera e limite de inimigos

## Escopo

Adicionar um controlador próprio ao boss final, afastar ligeiramente a câmera e limitar as ondas regulares a oito inimigos vivos simultaneamente. O total de cada onda permanece 25 e os mini-bosses continuam substituindo os inimigos 10 e 20.

## Câmera e ondas

- Zoom padrão do jogador: `1.30`.
- Máximo de oito entidades vivas durante ondas regulares, incluindo mini-bosses.
- O primeiro grupo preenche até oito vagas.
- Depois que duas entidades morrerem, duas novas entidades são solicitadas imediatamente.
- Se restar apenas uma entidade para completar a onda, nasce somente uma.
- Nunca ultrapassar oito vivos, inclusive durante repetição de uma solicitação de spawn que falhou.
- A batalha final mantém sua composição própria: um boss e quatro mini-bosses.

## Controlador do boss

O boss final mantém `700 HP`, `11` de dano no ataque comum e passa a ter alcance comum de `1.9 m`. Um controlador por estados executa:

1. `resting`: persegue/caminha por cinco segundos, sem lançar habilidades.
2. `telegraph`: escolhe aleatoriamente uma habilidade diferente da anterior e mostra sua área vermelha transparente por três segundos, sem texto ou contador.
3. `impact`: executa o efeito e aplica dano uma única vez aos jogadores dentro da área.
4. Retorna a `resting`.

O boss interrompe e descarta a habilidade ativa ao morrer ou ao reiniciar a partida.

## Habilidades

### Explosão circular

- Círculo centralizado na posição capturada do jogador no início do aviso.
- Aviso vermelho transparente durante três segundos.
- Explosão de fogo ao terminar.
- Dano: `23`, uma vez, se o jogador estiver dentro do círculo no impacto.

### Linha retangular

- Retângulo grande orientado do boss em direção à posição capturada do jogador.
- Aviso vermelho transparente durante três segundos.
- Onda de fogo percorre o retângulo no impacto.
- Dano: `24`, uma vez, se o jogador estiver dentro do retângulo.

### Chuva de meteoros

- Seis círculos pequenos, sem sobreposição intencional, distribuídos ao redor da posição do jogador.
- Avisos vermelhos transparentes durante três segundos.
- Meteoros de fogo descem visualmente e explodem nos pontos.
- Dano: `9`, uma vez, se o jogador estiver dentro de qualquer ponto no impacto.

### Dash

- O boss sinaliza a direção com uma faixa vermelha transparente.
- Após três segundos, avança rapidamente até próximo da posição marcada.
- Dano: `13`, uma vez, se tocar o jogador durante o avanço.

## Efeitos e desempenho

- Construir avisos com geometrias simples e materiais transparentes sem sombras.
- Construir fogo, meteoros e explosões com partículas leves inspiradas no plasma existente, sem duplicar sua lógica de cura.
- Reutilizar materiais e geometrias dentro de cada efeito quando possível.
- Remover e liberar todos os objetos temporários após o impacto, morte do boss ou reinício.
- Não registrar mensagens por frame; registrar somente início da habilidade, impacto e descarte por erro.

## Integração e dano

- O controlador recebe posição do boss, posição atual do jogador, `delta` e uma função de dano.
- O dano continua passando pelas regras atuais de morte e invulnerabilidade do jogador.
- As áreas usam testes matemáticos 2D no plano X/Z, independentes do visual.
- O sistema de ondas contabiliza regulares e mini-bosses pela mesma capacidade de oito.

## Testes

- O gerenciador nunca solicita mais inimigos que as vagas disponíveis.
- Duas mortes liberam e repõem duas vagas imediatamente.
- As posições 10 e 20 continuam sendo mini-bosses.
- Cada aviso dura três segundos e o descanso dura cinco.
- A habilidade não repete imediatamente quando houver alternativas.
- Círculo, retângulo, meteoros e dash aplicam os danos definidos somente quando acertam.
- Morte/reset do boss remove avisos e efeitos.
- Zoom padrão e alcance comum do boss usam os valores aprovados.
