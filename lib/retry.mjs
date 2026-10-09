export const sectionKey=s=>`${s.zone}/${s.section??s.ns}`;
export function classifyError(error) {
  const message=error.message||String(error);
  const timeout=error.name==='TimeoutError'||/timeout|timed out|tempo limite/i.test(message);
  const network=/fetch failed|ECONN|ENOTFOUND|socket|network/i.test(message);
  return {message,code:timeout?'TIMEOUT':network?'NETWORK_ERROR':'COLLECTION_ERROR',retryable:timeout||network||/HTTP (403|404|429|5\d\d)|temporariamente pausada/i.test(message)};
}
export function retryTargets(report,zone,section) {
  if(Boolean(zone)!==Boolean(section))throw new Error('Informe zona e seção juntas');
  const errors=report.issues.filter(i=>i.zone&&i.section);
  const keys=new Set(errors.map(sectionKey));
  if(zone){const key=sectionKey({zone,section});if(!keys.has(key))throw new Error('A seção não tem erro pendente neste relatório');return new Set([key]);}
  return keys;
}
export function sectionStamp(s){return JSON.stringify({zone:s.zone,ns:s.ns,nsp:s.nsp||null,nsa:[...(s.nsa||[])].sort(),da:s.da||null,ha:s.ha||null});}
export function replaceRecord(report,record) {
  const key=sectionKey(record);
  const index=report.records.findIndex(r=>sectionKey(r)===key);
  if(index>=0)report.records[index]=record;else report.records.push(record);
  report.issues=report.issues.filter(i=>!i.zone||sectionKey(i)!==key);
}

export function retryBatchTasks(latestReports){return latestReports.filter(r=>r.issues.length).map(r=>({uf:r.uf,city:r.city}));}
