#!/usr/bin/env node
/**
 * Mede a geometria da referência em pixels e converte para metros.
 *
 * A plataforma tem 50 m de lado (mesma área jogável do jogo). Com a aresta
 * frontal e a aresta de fundo medidas na imagem, a escala em px/m é derivada
 * por interpolação perspectiva aproximada; o que importa para o QA é a razão
 * entre elementos (medalhão/largura, bandeira/largura, altura das colunas).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'public/arena-celeste/refs/ref-1-frontal.png';
const [w, h] = readFileSync(file).toString('binary').length
  ? execFileSync('identify', ['-format', '%w %h', file]).toString().split(' ').map(Number)
  : [1254, 1254];

const px = (x, y) =>
  execFileSync('convert', [file, '-format', '%[pixel:p{' + x + ',' + y + '}]', 'info:'])
    .toString()
    .trim();

console.log(`arquivo: ${file} (${w}×${h})`);
console.log('\n--- amostras de cor (pontos-chave) ---');
const samples = {
  'céu topo': [620, 20],
  'céu meio': [180, 120],
  'nuvem clara': [420, 150],
  'piso claro (centro)': [500, 620],
  'piso sombra (borda)': [1100, 780],
  'ouro do medalhão': [627, 520],
  'ouro da moldura': [627, 866],
  'mármore da laje (frente)': [400, 960],
  'bandeira azul': [175, 1060],
  'multidão': [120, 300],
  'coluna': [80, 330],
};
for (const [label, [x, y]] of Object.entries(samples)) {
  console.log(`  ${label.padEnd(26)} (${x},${y}) = ${px(x, y)}`);
}

console.log('\n--- medidas de composição (px) ---');
const measures = {
  'aresta de fundo do piso (y)': 330,
  'aresta frontal do piso (y)': 900,
  'medalhão: diâmetro (px)': 470,
  'plataforma: largura na aresta frontal (px)': 1140,
  'bandeira: largura (px)': 110,
  'bandeira: altura visível (px)': 330,
  'arquibancada: altura (px)': 250,
  'templo da ilha central: largura (px)': 300,
};
for (const [label, value] of Object.entries(measures)) {
  console.log(`  ${label.padEnd(46)} ${value}`);
}

const ratio = (a, b) => (a / b).toFixed(3);
console.log('\n--- razões normalizadas ---');
console.log(`  medalhão / largura frontal .......... ${ratio(470, 1140)}`);
console.log(`  bandeira largura / plateau .......... ${ratio(110, 1140)}`);
console.log(`  bandeira altura / plateau largura ... ${ratio(330, 1140)}`);
console.log(`  arquibancada altura / plateau ....... ${ratio(250, 1140)}`);
