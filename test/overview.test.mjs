import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOverviewFeed, reportSummary } from '../lib/overview.mjs';
import { mergeOverview } from '../public/timeline.js';

const report = (city='00001') => ({id:city,uf:'ac',city,name:'Cidade',state:'running',startedAt:'2026-10-04',updatedAt:'same',expected:2,counted:1,processed:1,issues:[],totals:{votes:10,blank:1,null:2,candidates:{99:7}},comparison:{status:'pending',label:'Pendente',diagnostics:{large:'evidence'},reconciliation:{sections:['evidence']}},records:['binary evidence'],events:['history'],plan:['sections'],official:{candidates:[{number:'99',name:'Teste',party:'T',votes:7}],raw:'large'}});

test('painel aceita resposta do servidor anterior sem cursor',()=>{
  const a=report(),first=mergeOverview(undefined,{reports:[a],counted:1});
  const updated={...a,counted:2,issues:[{message:'erro'}]};
  const merged=mergeOverview(first,{reports:[updated],counted:2});
  assert.equal(merged.reports.length,1);
  assert.equal(merged.reports[0].counted,2);
  assert.equal(merged.reports[0].issues.length,1);
});

test('resumo exclui evidências e conserva contagens, nomes e pendências',()=>{
  const r=report();r.issues.push({message:'error'});
  const s=reportSummary(r);
  assert.equal(s.issueCount,1);assert.deepEqual(s.totals,r.totals);
  for(const key of ['records','events','plan','issues'])assert.equal(s[key],undefined);
  assert.deepEqual(s.comparison,{status:'pending',label:'Pendente'});
  assert.deepEqual(s.official.candidates,[{number:'99',name:'Teste',party:'T'}]);
  r.totals.candidates[99]++;assert.equal(s.totals.candidates[99],7);
});

test('delta detecta progresso mesmo com timestamp igual, sem perder atualizações entre clientes',()=>{
  const feed=createOverviewFeed(),a=report(),b=report('00002');
  const first=feed([a,b]);assert.equal(first.reset,true);assert.equal(first.reports.length,2);
  const unchanged=feed([a,b],first.cursor);assert.deepEqual(unchanged.reports,[]);
  a.counted=2;a.totals.votes=20;
  const update=feed([a,b],first.cursor);assert.deepEqual(update.reports.map(r=>r.id),[a.id]);
  assert.deepEqual(feed([a,b],first.cursor).reports,update.reports);
  assert.equal(mergeOverview(first,update).reports.length,2);
  assert.equal(mergeOverview(first,update).reports[0].totals.votes,20);
});

test('retry substitui município; cursor inválido e reinício refazem snapshot',()=>{
  const feed=createOverviewFeed(),a=report(),first=feed([a]);
  a.id='retry';a.counted=0;
  const update=feed([a],first.cursor),merged=mergeOverview(first,update);
  assert.equal(merged.reports.length,1);assert.equal(merged.reports[0].id,'retry');
  assert.equal(feed([a],'bad').reset,true);
  const restart=createOverviewFeed()([a],update.cursor);
  assert.equal(restart.reset,true);assert.equal(mergeOverview(first,restart).reports[0].id,'retry');
});

test('relatório removido após falha não fica preso no navegador',()=>{
  const feed=createOverviewFeed(),a=report(),first=feed([a]);
  const removed=feed([],first.cursor);
  assert.equal(removed.reset,true);
  assert.deepEqual(mergeOverview(first,removed).reports,[]);
});
