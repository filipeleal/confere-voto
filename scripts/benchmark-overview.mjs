// Read-only benchmark against saved reports; never starts or pauses collection.
import { readdir, readFile } from 'node:fs/promises';
import { createOverviewFeed, reportSummary } from '../lib/overview.mjs';
const latest = new Map();
for (const file of await readdir('data/audits')) {
  if (!/^[a-f0-9-]{36}\.json$/.test(file)) continue;
  const r = JSON.parse(await readFile(`data/audits/${file}`, 'utf8'));
  const key = `${r.uf}/${r.city}`;
  if (latest.has(key) && latest.get(key).startedAt > r.startedAt) continue;
  const { records, events, plan, ...old } = r;
  const summary = reportSummary(r);
  latest.set(key, {...summary,issues:{length:summary.issueCount},oldBytes:Buffer.byteLength(JSON.stringify(old))});
}
const rows = [...latest.values()], feed = createOverviewFeed();
const start = performance.now(), first = feed(rows), elapsed = performance.now()-start;
const unchanged = feed(rows, first.cursor);
if (rows.length) { rows[0].counted++; rows[0].totals.votes++; }
const changed = feed(rows, first.cursor);
const bytes = value=>Buffer.byteLength(JSON.stringify(value));
console.log(JSON.stringify({municipalities:rows.length,previousReportBytes:rows.reduce((sum,r)=>sum+r.oldBytes,0),initialSummaryBytes:bytes(first),unchangedReportBytes:bytes(unchanged),oneChangedReportBytes:bytes(changed),summaryMilliseconds:Math.round(elapsed)},null,2));
