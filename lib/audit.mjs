import { createOverviewFeed } from './overview.mjs';
import { processPool } from './concurrency.mjs';
import { reconcileNulls } from './reconciliation.mjs';
import { comparisonDiagnostics } from './diagnostics.mjs';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { atomic } from './storage.mjs';
import { randomUUID } from 'node:crypto';
import { fetchJSON, fetchBinary, sectionsURL, auxiliaryURL, bulletinLinks, BASE, uf, digits, normalizeResult, UFS } from './tse.mjs';
import { createDecoder } from './decoder.mjs';
import { buildTimeline, filterRegion } from './timeline.mjs';
import { classifyError, retryBatchTasks, retryTargets, sectionKey, sectionStamp, replaceRecord } from './retry.mjs';

export function emptyTotals() { return { candidates: {}, blank:0, null:0, votes:0 }; }
export function sumRecords(records) {
  const result = emptyTotals(), seen = new Set();
  for (const r of records) {
    const key = `${r.uf}/${r.city}/${r.zone}/${r.section}`;
    if(seen.has(key)) throw new Error('Seção duplicada na contagem');
    seen.add(key);
    for(const field of ['votes','blank','null']) {
      if(!Number.isSafeInteger(r[field]) || r[field]<0)throw new Error('Contagem inválida');
      result[field] += r[field];
    }
    for(const [number,votes] of Object.entries(r.candidates)) {
      if(!/^\d{2}$/.test(number) || !Number.isSafeInteger(votes) || votes<0)throw new Error('Voto nominal inválido');
      result.candidates[number]=(result.candidates[number]||0)+votes;
    }
  }
  return result;
}
export function chooseBulletin(raw, source) {
  if(raw.st!=='Totalizada') {
    const statuses=[...new Set((raw.hashes??[]).filter(h=>h.arq?.some(a=>a.tp==='bu')).map(h=>h.st||'não informado'))];
    throw new Error(`Totalização não confirmada no arquivo do TSE: seção ${raw.st||'não informado'}; boletim ${statuses.join(', ')||'não informado'}.`);
  }
  const accepted=bulletinLinks(raw,source).filter(f=>f.status==='Totalizado');
  if(accepted.length!==1)throw new Error(`Esperado um BU totalizado; encontrados ${accepted.length}`);
  return accepted[0];
}
export function primarySections(city) {
  const all=city.zon.flatMap(z=>z.sec.map(s=>({...s,zone:z.cd}))), seen=new Set();
  for(const s of all){
    const key=`${s.zone}/${s.ns}`;
    if(seen.has(key))throw new Error('Seção duplicada no catálogo');
    seen.add(key);
    if(s.nsp && !all.some(p=>p.zone===s.zone&&p.ns===s.nsp&&!p.nsp))throw new Error('Seção agregada sem principal');
  }
  return all.filter(s=>!s.nsp);
}
export function compareAudit(report, raw, stable) {
  const diagnostics=comparisonDiagnostics(report,raw,stable);
  const reasons=diagnostics.checks.filter(c=>!c.pass).map(c=>c.message);
  const official=normalizeResult(raw);
  if(reasons.length)return {status:'pending',label:'Comparação pendente',reasons,rows:[],diagnostics};
  const reconciliation=reconcileNulls(report,official,raw);
  const rows=official.candidates.map(c=>({key:c.number,label:c.name,own:report.totals.candidates[c.number]||0,official:c.votes}));
  for(const [key,label,own,value] of [
    ['blank','Brancos',report.totals.blank,official.blank],
    ['null','Nulos registrados nos BUs / vn',reconciliation.ordinary,reconciliation.published.ordinary],
    ['technical','Nominais fora da lista / vnt (destinação inferida)',reconciliation.inferredTechnical,reconciliation.published.technical],
    ['totalNull','Nulos + nominais fora da lista / tvn',reconciliation.total,reconciliation.published.total],
    ['votes','Total de votos',report.totals.votes,official.votes]
  ])rows.push({key,label,own,official:value});
  for(const row of rows)row.delta=row.own-row.official;
  const different=rows.some(r=>r.delta!==0);
  const status=different?'discrepancy':'match';
  reasons.push(...rows.filter(r=>r.delta!==0).map(r=>`${r.label} (${r.key}): soma dos BUs = ${r.own}; TSE = ${r.official}; diferença (BUs − TSE) = ${r.delta}. Causa ainda não determinada.`));
  if(!reconciliation.destinationConfirmed)reasons.push('A comparação usa a hipótese de destinar a nulos técnicos os votos nominais em números ausentes da lista municipal. A igualdade numérica não confirma a destinação de cada número. Veja abaixo os números e BUs de origem.');
  return {diagnostics,reconciliation,status,label:status==='discrepancy'?'Discrepância numérica':'Valores coincidem',reasons,rows};
}

const reports = new Map();
let active = null;
let campaign = null;
let coverage={expected:null,state:"loading"};
export async function refreshCoverage(){try{const counts=await Promise.all(UFS.map(async state=>{const catalog=await fetchJSON(sectionsURL(state));if(catalog.data.cdp!=="3220")throw new Error("Pleito inesperado");const cities=catalog.data.abr.find(a=>a.cd===state)?.mu;if(!cities)throw new Error("Catálogo sem UF");return [state,cities.reduce((sum,c)=>sum+primarySections(c).length,0)];}));coverage={byUf:Object.fromEntries(counts),expected:counts.reduce((a,[,b])=>a+b,0),state:"ready",updatedAt:new Date().toISOString()};}catch(error){coverage={expected:null,state:"unavailable",error:error.message};}}
let retryBatch = null;
const pendingComparison = () => ({status:'pending',label:'Comparação pendente',reasons:['Coleta em andamento.'],rows:[]});
async function save(report) {report.updatedAt=new Date().toISOString();await atomic(`data/audits/${report.id}.json`,report);}
function event(report,type,details={}){(report.events??=[]).push({at:new Date().toISOString(),type,...details});}
async function hydrateTiming(report) {
  let city;
  try {const raw=JSON.parse(await readFile(`data/snapshots/${report.catalog?.sha256}.json`,'utf8'));city=raw.abr.find(a=>a.cd===report.uf)?.mu.find(m=>m.cd===report.city);} catch { /* Older or unavailable evidence stays unknown. */ }
  const stamps=new Map(city?primarySections(city).map(s=>[`${s.zone}/${s.ns}`,sectionStamp(s)]):[]);
  for(const record of report.records){
    record.catalogStamp??=stamps.get(sectionKey(record));
    if(record.receivedAt)continue;
    try {
      const raw=JSON.parse(await readFile(`data/snapshots/${record.auxiliary.sha256}.json`,'utf8'));
      const file=bulletinLinks(raw,record.auxiliary.source).find(f=>f.url===record.source);
      if(file){record.receivedAt=file.receivedAt;record.auxiliaryGeneratedAt=`${raw.dg} ${raw.hg}`;record.timingOrigin='saved-ea18';}
    }catch { /* Never invent missing historical timestamps. */ }
  }
  report.issues=report.issues.map(i=>({...classifyError(i),...i}));
}
export async function initAudits() {
  await mkdir('data/audits',{recursive:true});
  for(const file of await readdir('data/audits')){
    if(!/^[a-f0-9-]{36}\.json$/.test(file))continue;
    const report=JSON.parse(await readFile(`data/audits/${file}`,'utf8'));
    await hydrateTiming(report);
    if(report.state==='completed'&&report.official?.sha256){
      try{
        const raw=JSON.parse(await readFile(`data/snapshots/${report.official.sha256}.json`,'utf8'));
        const updated=compareAudit(report,raw,report.snapshots?.stable);
        report.comparison={...updated,explanationOrigin:'Reavaliado a partir das mesmas cópias salvas, sem nova coleta',previousStatus:report.comparison.status};
      }catch(error){report.comparison.evidenceError=`Não foi possível detalhar a comparação salva: ${error.message}`;}
    }
    if(report.state==='running'){report.state='interrupted';report.comparison={...pendingComparison(),reasons:['Coleta interrompida. Execute novamente para atualizar os arquivos.']};await save(report);}
    reports.set(report.id,report);
  }
  try{retryBatch=JSON.parse(await readFile('data/audits/retries.json','utf8'));if(retryBatch.state==='running'){retryBatch.state='paused';await atomic('data/audits/retries.json',retryBatch);}}catch(e){if(e.code!=='ENOENT')throw e;}
  try {campaign=JSON.parse(await readFile('data/audits/campaign.json','utf8'));if(campaign.state==='running'){campaign.state='paused';await atomic('data/audits/campaign.json',campaign);}}catch(e){if(e.code!=='ENOENT')throw e;}
}
function publicReport(report,detail=false) {
  const {records,events,plan,...rest}=report;
  return detail ? {...rest, records,events:events||[]} : rest;
}
export function auditReport(id) { const r=reports.get(id);return r?publicReport(r,true):null; }
export function latestReports(){
  const latest=new Map();
  for(const r of reports.values()){const key=`${r.uf}/${r.city}`;if(!latest.has(key)||r.startedAt>=latest.get(key).startedAt)latest.set(key,r);}
  return [...latest.values()];
}
export function auditTimeline(options={}) {
  const selected=options.id ? [reports.get(options.id)].filter(Boolean) : latestReports();
  if(options.id&&!selected.length)throw new Error('Contagem não encontrada');
  if(options.uf)uf(options.uf);
  return buildTimeline(filterRegion(selected,options.region).filter(r=>!options.uf||r.uf===options.uf),options);
}
const overviewFeed=createOverviewFeed();
export function auditOverview(cursor) {
  const selected=latestReports();
  const totals=emptyTotals();
  for(const r of selected){for(const f of ['votes','blank','null'])totals[f]+=r.totals[f];for(const [n,v] of Object.entries(r.totals.candidates))totals.candidates[n]=(totals.candidates[n]||0)+v;}
  const campaignSummary=campaign?{...campaign,tasks:undefined,total:campaign.tasks.length}:null;
  return {coverage,retryBatch:retryBatch?{...retryBatch,tasks:undefined}:null,errorMunicipalities:selected.filter(r=>r.issues.length).length,activeId:active?.id||null,campaign:campaignSummary,totals,counted:selected.reduce((s,r)=>s+r.counted,0),municipalities:selected.length,discrepancies:selected.filter(r=>r.comparison.status==='discrepancy').length,
    ...overviewFeed(selected,cursor)};
}
export async function startAudit(state,city,fromCampaign=false) {
  if(retryBatch?.state==='running')throw new Error('Aguarde ou pause o retry de todos os erros.');
  uf(state);city=digits(city,5);
  if(active)throw new Error('Já existe uma contagem em andamento.');
  if(!fromCampaign && campaign?.state==='running')throw new Error('Pause a coleta em lote antes de iniciar outra contagem.');
  const report={id:randomUUID(),uf:state,city,name:city,state:'running',startedAt:new Date().toISOString(),expected:0,counted:0,processed:0,aggregated:0,records:[],issues:[],totals:emptyTotals(),comparison:pendingComparison(),signatureVerified:false};
  await launch(report);
  return publicReport(report);
}
async function launch(report,targets=null){
  active=report;reports.set(report.id,report);event(report,report.parentId?'retry-started':'started',{targets:targets?[...targets]:null});
  try {await save(report);}catch(error){active=null;reports.delete(report.id);throw error;}
  runAudit(report,targets).catch(async error=>{report.state='failed';const issue={...classifyError(error),phase:report.phase,at:new Date().toISOString()};report.issues.push(issue);event(report,'failed',issue);report.comparison={...pendingComparison(),reasons:[error.message]};await save(report);}).catch(error=>console.error('Falha ao salvar contagem:',error.message)).finally(()=>{active=null;});
}
export async function retryAudit(id,zone,section,fromRetryBatch=false) {
  if(retryBatch?.state==='running'&&!fromRetryBatch)throw new Error('Aguarde ou pause o retry de todos os erros.');
  if(active||campaign?.state==='running')throw new Error('Pause a coleta atual antes de tentar novamente.');
  const original=reports.get(id);
  if(!original)throw new Error('Contagem não encontrada');
  if(!latestReports().some(r=>r.id===id))throw new Error('Use a contagem mais recente do município para tentar novamente');
  if(!original.issues.length)throw new Error('Não há erros pendentes nessa contagem');
  if(zone)zone=digits(zone,4);if(section)section=digits(section,4);
  const targets=retryTargets(original,zone,section);
  const report=structuredClone(original);
  report.id=randomUUID();report.parentId=id;report.startedAt=new Date().toISOString();report.state='running';report.cancel=false;report.comparison=pendingComparison();report.mode='retry';report.retryTargets=[...targets];report.preserved=report.records.length;
  // Keep unrelated section errors. Global failures are retried by the metadata/finalization steps.
  report.issues=report.issues.filter(i=>i.zone&&i.section);
  report.events=[];
  await launch(report,targets.size?targets:(original.records.length===0?null:new Set()));
  return publicReport(report);
}
async function runAudit(report,targets=null) {
  const decoders=[];
  try {
    report.phase='catalog';
    const catalog=await fetchJSON(sectionsURL(report.uf),{fresh:true});
    if(catalog.data.cdp!=='3220')throw new Error('Pleito inesperado no catálogo');
    const city=catalog.data.abr.find(a=>a.cd===report.uf)?.mu.find(m=>m.cd===report.city);
    if(!city)throw new Error('Município não encontrado no catálogo');
    report.name=city.nm;
    const sections=primarySections(city);
    const existing=new Map(report.records.map(r=>[sectionKey(r),r]));
    const retainedStable=[...existing.values()].every(r=>sections.some(s=>sectionKey(s)===sectionKey(r)&&r.catalogStamp===sectionStamp(s)));
    report.expected=sections.length;report.aggregated=city.zon.reduce((sum,z)=>sum+z.sec.filter(s=>s.nsp).length,0);
    report.catalog={source:catalog.source,sha256:catalog.sha256,fetchedAt:catalog.fetchedAt};
    const url=`${BASE}/ele2026/6257/dados/${report.uf}/${report.uf}${report.city}-c0001-e006257-u.json`;
    report.phase='baseline';
    const before=await fetchJSON(url,{fresh:true});
    normalizeResult(before.data);
    report.resultObservations=[{generatedAt:`${before.data.dg} ${before.data.hg}`,totalizedAt:`${before.data.dt} ${before.data.ht}`,observedAt:before.fetchedAt,sha256:before.sha256,source:url}];
    const work=sections.filter(s=>targets?targets.has(sectionKey(s)):!existing.has(sectionKey(s)));
    report.attemptTotal=work.length;report.attemptProcessed=0;
    report.plan=sections.map(s=>({zone:s.zone,section:s.ns}));
    await save(report);
    await processPool(work,25,async (s,worker)=>{
      const decoder=decoders[worker]??=createDecoder();
      const identity={uf:report.uf,city:report.city,zone:s.zone,section:s.ns};
      report.phase='section';event(report,'section-started',identity);
      try {
        if(!s.da)throw new Error('Arquivo auxiliar ainda não disponível');
        const aux=await fetchJSON(auxiliaryURL(report.uf,report.city,s.zone,s.ns),{fresh:true});
        const file=chooseBulletin(aux.data,aux.source);
        const binary=await fetchBinary(file.url);
        const decoded=await decoder.decode(binary.path,identity);
        const countedAt=new Date().toISOString();
        replaceRecord(report,{...decoded,source:file.url,sha256:binary.sha256,fetchedAt:binary.fetchedAt,countedAt,receivedAt:file.receivedAt,auxiliaryGeneratedAt:`${aux.data.dg} ${aux.data.hg}`,catalogStamp:sectionStamp(s),auxiliary:{source:aux.source,sha256:aux.sha256,fetchedAt:aux.fetchedAt},status:file.status});
        event(report,'counted',{...identity,sha256:binary.sha256});
        report.counted=report.records.length;
        report.totals=sumRecords(report.records);
      }catch(error){
        const issue={...identity,...classifyError(error),at:new Date().toISOString()};
        report.issues=report.issues.filter(i=>!i.zone||sectionKey(i)!==sectionKey(identity));report.issues.push(issue);event(report,'section-error',issue);
        if(/HTTP (403|429)|temporariamente pausada|Decodificador indisponível/.test(error.message))throw error;
      }
      report.attemptProcessed++;
      report.processed=report.records.length+report.issues.filter(i=>i.zone&&i.section).length;
      await save(report);
    },()=>report.cancel);
    if(report.cancel){report.state='interrupted';event(report,'paused');report.comparison={...pendingComparison(),reasons:['Coleta pausada pelo usuário. Inicie nova contagem para comparar.']};await save(report);return;}
    report.phase='comparison';
    const after=await fetchJSON(url,{fresh:true});
    const catalogAfter=await fetchJSON(sectionsURL(report.uf),{fresh:true});
    const cityAfter=catalogAfter.data.abr.find(a=>a.cd===report.uf)?.mu.find(m=>m.cd===report.city);
    const stable=retainedStable&&before.sha256===after.sha256 && JSON.stringify(city)===JSON.stringify(cityAfter);
    report.resultObservations.push({generatedAt:`${after.data.dg} ${after.data.hg}`,totalizedAt:`${after.data.dt} ${after.data.ht}`,observedAt:after.fetchedAt,sha256:after.sha256,source:url});
    report.official={...normalizeResult(after.data),source:url,sha256:after.sha256,fetchedAt:after.fetchedAt};
    report.snapshots={before:before.sha256,after:after.sha256,catalogAfter:catalogAfter.sha256,stable,retainedStable};
    report.comparison=compareAudit(report,after.data,stable);
    report.state='completed';
    event(report,'completed',{counted:report.counted,issues:report.issues.length});
    await save(report);
  }finally{decoders.forEach(decoder=>decoder.close());}
}
export async function stopAudit() {
  if(retryBatch?.state==='running'){retryBatch.state='paused';await atomic('data/audits/retries.json',retryBatch);}
  if(campaign?.state==='running'){campaign.state='paused';await atomic('data/audits/campaign.json',campaign);}
  if(active)active.cancel=true;
  return {message:'Pausa solicitada. A requisição em curso será concluída.'};
}
export async function startCampaign(scope, resume=false) {
  if(retryBatch?.state==='running')throw new Error('Aguarde ou pause o retry de todos os erros.');
  if(active || campaign?.state==='running')throw new Error('Já existe uma contagem em andamento.');
  if(!resume){
    if(scope!=='br')uf(scope);
    campaign={scope,state:'running',tasks:[],next:0,completed:0,startedAt:new Date().toISOString(),discovering:true};
  }else{
    if(!campaign)throw new Error('Nenhuma coleta para retomar');
    campaign.state='running';
  }
  await atomic('data/audits/campaign.json',campaign);
  runCampaign().catch(async error=>{campaign.state='failed';campaign.error=error.message;await atomic('data/audits/campaign.json',campaign);});
  return {state:campaign.state,scope:campaign.scope};
}
async function runCampaign() {
  if(campaign.discovering){
    const tasks=[];
    for(const state of campaign.scope==='br'?UFS:[campaign.scope]){
      if(campaign.state!=='running')return;
      const catalog=await fetchJSON(sectionsURL(state),{fresh:true});
      if(catalog.data.cdp!=='3220')throw new Error('Pleito inesperado');
      for(const city of catalog.data.abr.find(a=>a.cd===state).mu)tasks.push({uf:state,city:city.cd});
    }
    campaign.tasks=tasks;campaign.discovering=false;
  }
  while(campaign.next<campaign.tasks.length && campaign.state==='running'){
    const task=campaign.tasks[campaign.next];
    const report=await startAudit(task.uf,task.city,true);
    while(active)await new Promise(resolve=>setTimeout(resolve,500));
    const finished=reports.get(report.id);
    if(finished.state!=='completed'){
      if(campaign.state==='running'){campaign.state='failed';campaign.error=finished.issues.at(-1)?.message||'Município interrompido';}
      break;
    }
    campaign.next++;campaign.completed++;await atomic('data/audits/campaign.json',campaign);
  }
  if(campaign.next===campaign.tasks.length)campaign.state='completed';
  await atomic('data/audits/campaign.json',campaign);
}

export async function retryAllErrors(){
  if(active||campaign?.state==='running'||retryBatch?.state==='running')throw new Error('Pause a coleta atual antes de tentar todos os erros.');
  const tasks=retryBatchTasks(latestReports());
  if(!tasks.length)throw new Error('Não há erros de coleta para tentar novamente.');
  retryBatch={state:'running',tasks,total:tasks.length,completed:0,remainingErrors:0,startedAt:new Date().toISOString()};
  await atomic('data/audits/retries.json',retryBatch);
  runRetryBatch().catch(async error=>{retryBatch.state='failed';retryBatch.error=error.message;await atomic('data/audits/retries.json',retryBatch);});
  return {state:retryBatch.state,total:retryBatch.total};
}
async function runRetryBatch(){
  for(const task of retryBatch.tasks){
    if(retryBatch.state!=='running')break;
    const original=latestReports().find(r=>r.uf===task.uf&&r.city===task.city);
    if(original?.issues.length){
      const report=await retryAudit(original.id,null,null,true);
      while(active)await new Promise(resolve=>setTimeout(resolve,500));
      const finished=reports.get(report.id);
      if(finished.state==='interrupted')break;
      retryBatch.remainingErrors+=finished.issues.length;
      if(finished.state==='failed')throw new Error(finished.issues.at(-1)?.message||'Retry interrompido');
    }
    retryBatch.completed++;await atomic('data/audits/retries.json',retryBatch);
  }
  if(retryBatch.completed===retryBatch.total)retryBatch.state='completed';
  await atomic('data/audits/retries.json',retryBatch);
}
