import { randomUUID } from 'node:crypto';

// Explicit allowlist: evidence and diagnostics belong only in the detail endpoint.
export function reportSummary(r) {
  const summary = {};
  for (const key of ['id','uf','city','name','state','startedAt','updatedAt','expected','counted','processed','mode','attemptProcessed','attemptTotal','preserved']) summary[key] = r[key];
  summary.issueCount = r.issues.length;
  summary.totals = { ...r.totals, candidates: { ...r.totals.candidates } };
  summary.comparison = { status:r.comparison.status, label:r.comparison.label };
  if (r.official) summary.official = { candidates:(r.official.candidates || []).map(({number,name,party})=>({number,name,party})) };
  return summary;
}

export function createOverviewFeed() {
  let epoch = randomUUID();
  let revision = 0, current = new Map();
  return (reports, cursor) => {
    const next = new Map(), changed = [];
    for (const report of reports) {
      const summary = reportSummary(report), key = `${report.uf}/${report.city}`;
      const fingerprint = JSON.stringify(summary), previous = current.get(key);
      const entry = previous?.fingerprint === fingerprint ? previous : {summary,fingerprint,revision:0};
      next.set(key,entry);
      if (entry !== previous) changed.push(entry);
    }
    // A failed launch can remove a report before it is saved. Force a reset
    // instead of leaving that municipality in a client's merged snapshot.
    if ([...current.keys()].some(key=>!next.has(key))) epoch = randomUUID();
    if (changed.length || next.size !== current.size) {
      revision++;
      for (const entry of changed) entry.revision = revision;
    }
    // A fresh server or invalid cursor always returns a complete snapshot.
    const [clientEpoch, rawRevision] = String(cursor || '').split(':');
    const since = Number(rawRevision);
    const reset = clientEpoch !== epoch || !/^\d+$/.test(rawRevision || '') || since > revision;
    current = next;
    return {cursor:`${epoch}:${revision}`,reset,reports:[...current.values()].filter(e=>reset || e.revision>since).map(e=>e.summary)};
  };
}
