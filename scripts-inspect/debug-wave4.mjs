import { WaveManager } from '../src/waves/WaveManager.js';
const manager = new WaveManager();
const mults = [];
manager.weaponSelected();
let first = manager.update(5)[0];
for (let wave = 1; wave <= 5; wave++) {
  const ids = [];
  for (let batch = 0; batch < 3; batch++) {
    let request;
    if (batch === 0 && first) { request = first; first = undefined; }
    else {
      for (let t = 0; t < 20 && !request; t++) { const [r] = manager.update(1); if (r) { request = r; break; } }
    }
    if (!request) { console.log(`wave${wave} batch${batch}: UNDEFINED`); break; }
    mults.push(request.hpMultiplier);
    ids.push(...Array.from({length: request.regularCount}, (_, i) => `w${wave}b${batch}-${i}`));
    manager.acknowledgeSpawn(request.requestId, ids.slice(-request.regularCount).map(id => ({ id, role: 'regular' })));
    if (batch === 2) {
      const pid = manager.snapshot.phaseId;
      ids.forEach(id => manager.enemyDefeated(id, pid));
    }
  }
  console.log(`wave${wave} end phase:`, manager.snapshot.phase);
  if (wave === 5) continue;
  manager.update(4.9);
  const [next] = manager.update(0.1);
  first = next;
  console.log(`wave${wave}-> next batch:`, first?.regularCount ?? 'UNDEF', 'mult:', first?.hpMultiplier);
}
console.log('mults:', JSON.stringify(mults));
