# Arena Gótica — Especificação de reconstrução e aceite visual

**Escopo:** reconstruir em Three.js a arena gótica circular da imagem de referência enviada no chat, preservando o MMORPG, a iluminação do herói e as seis waves. **Não alterar `master`, não criar PR ou merge sem autorização.**

## Diagnóstico comparativo (referência vs. captura anterior)
- A referência mostra pedra azul-chumbo desgastada, piso com juntas e marcas irregulares. A captura do jogo mostrava uma textura quadriculada com manchas vermelhas repetitivas e bordas uniformes.
- A referência possui um centro circular de pedra ampla, 2–3 frisos concêntricos entalhados, curso radial de ladrilhos e oito nervuras de orientação. A captura representava poucos círculos e raios planos, com grandes crescentes artificiais.
- O palco do boss está no quadrante superior direito: o disco elevado tem quatro degraus semicirculares e pequenas divisões de cantaria. Na captura ele parecia uma roda de raios com altura pouco aparente.
- A referência contém arcadas lancetadas profundas, capitéis, molduras, relevos e várias camadas de pedra. A captura tinha suportes quase exclusivamente retangulares, fachadas lisas e fundos sem profundidade.
- O céu e a névoa da referência mostram gradientes azuis e ruínas distantes; a captura tinha fundo azul quase chapado.

## Frentes de trabalho, com responsabilidades independentes
1. **Materiais:** `GothicMaterials.ts`. Pedra PBR com albedo, relevo e rugosidade, tons diferentes para piso, centro, frisos e arcada. Quebrar a repetição de manchas vermelhas. Nunca reduzir a luz do herói para esconder falta de detalhe.
2. **Geometria de piso:** `GothicArena.ts` e `GothicRefinement.ts`. Anéis reais, com bordas de altura mensurável, ladrilhos em setores com juntas e simbolismo esculpido. Evitar geometrias coplanares e z-fighting. Manter plano jogável separado do acabamento decorativo.
3. **Palco do boss:** `GothicBossFinish.ts`. Quatro degraus progressivos, peças independentes, beiradas e juntas, disco superior com incisões discretas. Nenhum espeto alto deve parecer uma roda no piso.
4. **Arquitetura e distância:** `GothicRefinement.ts`, `GothicSky.ts`. Vãos ogivais com arcos em profundidade, capitéis, reentrâncias, piers e ruínas sob névoa. Evitar repetição de cubos escalados.
5. **Integração do jogo:** `Level.ts`, `CameraController.ts`. Preservar 162 × 162 m, cursor/raycast no piso, os spawns, HUD e skills. Não introduzir obstáculos dentro da zona de combate.
6. **Orquestração/QA:** conferir testes e frame real do jogo; reprovar diferenças visuais importantes, mesmo se o Vercel disser READY.

## Critérios objetivos de aceite
- [x] Malha jogável 162 × 162 m preservada e independente dos ornamentos.
- [x] Centro, anéis e nervuras com relevos físicos e materiais distintos.
- [x] Três cursos de pedras radiais com 96 setores cada.
- [x] Vãos do fundo com pelo menos doze arcadas góticas trabalhadas.
- [x] Quatro cursos de degraus do boss, com peças segmentadas e frisos.
- [x] Preservar os oito pontos de spawn de waves e o layout do boss.
- [x] Compilação com TypeScript + Vite no Vercel.
- [ ] Renderizar frame da versão publicada no navegador, na mesma proporção da referência (16:9).
- [ ] Sobrepor frame real e referência sem distorcer escala; comparar enquadramento do círculo, palco do boss, juntas, altura das escadas, iluminação e silhueta da arquitetura.
- [ ] Jogar até a wave 6 e confirmar câmera, VFX, clique no chão, colisões e desempenho.
- [ ] Se a fotografia de referência exigir escultura e acabamento superiores ao procedural, substituir por malhas GLB/Tripo3D com UV e PBR, em vez de afirmar falsamente equivalência fotográfica.

**Condição de aceite final:** a comparação *visual* é obrigatória. Compilação e testes de malha não provam correspondência pixel a pixel. O acesso automatizado ao navegador Vercel estava bloqueado neste ambiente; a checagem visual deve ser retomada assim que possível.