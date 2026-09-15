import { WaveManager } from '../src/waves/WaveManager.js';
const manager = new WaveManager();
manager.weaponSelected();
let first = manager.update(5)[0];
manager.acknowledgeSpawn(first.requestId, Array.from({length: 5}, (_, i) => ({ id: 'a'+i, role: 'regular' })));
let second;
for (let t = 0; t < 20 && !second; t++) { const [r] = manager.update(1); if (r) second = r; }
manager.acknowledgeSpawn(second.requestId, Array.from({length: 5}, (_, i) => ({ id: 'b'+i, role: 'regular' })));
let third;
for (let t = 0; t < 20 && !third; t++) { const [r] = manager.update(1); if (r) third = r; }
manager.acknowledgeSpawn(third.requestId, Array.from({length: 5}, (_, i) => ({ id: 'c'+i, role: 'regular' })));
const phaseId = manager.snapshot.phaseId;
for (const p of ['a','b','c']) for (let j = 0; j < 5; j++) manager.enemyDefeated(p+j, phaseId);
manager.update(4.9);
console.log('after 4.9:', manager.snapshot.phase);
// 0.1 deve zerar countdown e chamar startRegularWave (batchDelay=0)
// MAS o update(0.1): countdown intermission vai a 0, startRegularWave seta batchDelay=0
// depois cai no if regular-wave e deveria emitir!
const [r] = manager.update(0.1);
console.log('request imediato:', r?.regularCount ?? 'vazio');
