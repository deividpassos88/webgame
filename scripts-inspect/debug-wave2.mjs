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
console.log('phase:', manager.snapshot.phase, 'batchDelay?');
manager.update(4.9);
console.log('after 4.9:', manager.snapshot.phase);
manager.update(0.1);
console.log('after 0.1:', manager.snapshot.phase);
// agora regular-wave; batchDelayRemaining deveria ser 0
for (let t = 0; t < 8; t++) {
  const [r] = manager.update(1);
  console.log(`tick ${t}:`, r ? `request ${r.regularCount}` : 'vazio');
}
