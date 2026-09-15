// Debug do fluxo de ondas para achar onde o request não vem
import { WaveManager } from '../src/waves/WaveManager.js';

const manager = new WaveManager();
manager.weaponSelected();
let first = manager.update(5)[0];
console.log('wave1 batch0:', first?.regularCount);
// ack completo
manager.acknowledgeSpawn(first.requestId, Array.from({length: 5}, (_, i) => ({ id: 'a'+i, role: 'regular' })));
console.log('phase:', manager.snapshot.phase);

// espera 6s
let second;
for (let t = 0; t < 20 && !second; t++) {
  const [r] = manager.update(1);
  if (r) second = r;
}
console.log('wave1 batch1:', second?.regularCount);
if (second) {
  manager.acknowledgeSpawn(second.requestId, Array.from({length: 5}, (_, i) => ({ id: 'b'+i, role: 'regular' })));
}
let third;
for (let t = 0; t < 20 && !third; t++) {
  const [r] = manager.update(1);
  if (r) third = r;
}
console.log('wave1 batch2:', third?.regularCount);
if (third) {
  manager.acknowledgeSpawn(third.requestId, Array.from({length: 5}, (_, i) => ({ id: 'c'+i, role: 'regular' })));
}
console.log('snapshot:', JSON.stringify(manager.snapshot));

// mata todos
const phaseId = manager.snapshot.phaseId;
for (let i = 0; i < 15; i++) manager.enemyDefeated(['a','b','c'].flatMap(p => [0,1,2,3,4].map(j => p+j))[i], phaseId);
console.log('after kills phase:', manager.snapshot.phase);

// intermission countdown 5s
manager.update(4.9);
console.log('phase before 0.1:', manager.snapshot.phase);
manager.update(0.1); // termina countdown -> regular wave
console.log('phase after 0.1:', manager.snapshot.phase, 'spawned:', manager.snapshot.spawned);
let next;
for (let t = 0; t < 20 && !next; t++) {
  const [r] = manager.update(1);
  if (r) next = r;
}
console.log('wave2 batch0:', next?.regularCount ?? 'UNDEFINED');
