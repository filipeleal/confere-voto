import { tseClock } from './timeline.mjs';

export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p, lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}
export function buildArrivalMap(reports) {
  const cities = [], seen = new Set();
  for (const r of reports) {
    if (r.uf === 'zz') continue;
    const times = []; let missing = 0;
    for (const b of r.records) {
      const key = `${b.uf}/${b.city}/${b.zone}/${b.section}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const clock = tseClock(b.receivedAt);
      if (clock) times.push(Date.parse(clock + 'Z')); else missing++;
    }
    times.sort((a,b) => a-b);
    cities.push({uf:r.uf, city:r.city, name:r.name || r.city, count:times.length, missing,
      first:times[0] ?? null, median:quantile(times,.5), p90:quantile(times,.9), last:times.at(-1) ?? null});
  }
  return {cities, generatedAt:new Date().toISOString()};
}
