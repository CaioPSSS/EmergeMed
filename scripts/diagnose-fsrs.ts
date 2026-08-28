import { calculateFSRSUpdate } from '../lib/learning-engine';

let currentStat: any = {
  stability: 7.0,
  difficulty: 5.0,
  ease_factor: 2.5,
  times_reviewed: 0,
  last_evidence_at: '2026-08-01T00:00:00Z',
};

const tStart = new Date('2026-08-01T00:00:00Z');

console.log('--- Tracing calculateFSRSUpdate over 15 reviews at 7-day intervals ---');
for (let review = 1; review <= 15; review++) {
  const reviewDate = new Date(tStart.getTime() + review * 7 * 24 * 60 * 60 * 1000);
  const updated = calculateFSRSUpdate(currentStat, 9.5, reviewDate);
  console.log(`Review #${review}: prev S=${currentStat.stability}d -> new S=${updated.stability}d, D=${updated.difficulty}, growthFactor=${(updated.stability / currentStat.stability).toFixed(4)}`);
  currentStat = updated;
}
