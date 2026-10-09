import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildTimeline,tseClock} from '../lib/timeline.mjs';
import {retryBatchTasks,retryTargets,replaceRecord,classifyError,sectionStamp} from '../lib/retry.mjs';
const record=(section,receivedAt,extra={})=>({uf:'ac',city:'01074',zone:'0004',section,receivedAt,votes:10,...extra});
test('recebimento civil mantém zeros, limites e lacunas observadas',()=>{
 const records=[record('1','04/10/2026 19:00:00'),record('2','04/10/2026 20:00:00'),record('3','04/10/2026 21:00:00'),record('4',null)];
 const t=buildTimeline([{records}],{minutes:15,from:'2026-10-04T19:00',to:'2026-10-04T21:00'});
 assert.equal(t.buckets.length,8);assert.equal(t.selected,2);assert.equal(t.missing,1);assert.equal(t.buckets[1].count,0);assert.equal(t.gaps[0].minutes,60);assert.equal(t.buckets[4].votes,10);
});
test('horário de download não substitui contabilização ausente e ISO vira Brasília',()=>{
 const records=[record('1',null,{fetchedAt:'2026-10-05T00:30:00Z'}),record('2',null,{countedAt:'2026-10-05T00:30:00Z'})];
 const t=buildTimeline([{records}],{basis:'counted'});assert.equal(t.missing,1);assert.equal(t.first,'2026-10-04T21:30:00');
});
test('datas inválidas e filtros invertidos são rejeitados',()=>{
 assert.equal(tseClock('31/02/2026 19:00:00'),null);assert.equal(tseClock('04/10/2026 25:00:00'),null);
 assert.throws(()=>buildTimeline([],{from:'2026-10-04T21:00',to:'2026-10-04T19:00'}));assert.throws(()=>buildTimeline([],{basis:'inventado'}));
});
test('mesma seção não duplica os eventos',()=>{
 const r=record('1','04/10/2026 19:00:00');assert.equal(buildTimeline([{records:[r]},{records:[r]}]).known,1);
});
test('padrão de cinco minutos soma candidatos sem duplicar seções ou incluir brancos e nulos',()=>{
 const a=record('1','04/10/2026 19:00:00',{candidates:{13:4,22:3}}),b=record('2','04/10/2026 19:04:59',{candidates:{13:2,22:6}}),c=record('3','04/10/2026 19:05:00',{candidates:{22:8}});
 const result=buildTimeline([{records:[a,b,c,a]}],{from:'2026-10-04T19:00',to:'2026-10-04T19:15'});
 assert.equal(result.minutes,5);assert.deepEqual(result.buckets.map(b=>b.count),[2,1,0]);
 assert.deepEqual(result.buckets[0].candidates,{13:6,22:9});assert.deepEqual(result.buckets[1].candidates,{22:8});assert.deepEqual(result.buckets[2].candidates,{});
});
test('detalhes de cada barra fecham com a contagem e preservam a hierarquia e limites',()=>{
 const a=record('0001','04/10/2026 19:00:00'),b=record('0002','04/10/2026 19:14:59'),c=record('0003','04/10/2026 19:15:00');
 const t=buildTimeline([{name:'Cidade teste',records:[a,b,c,a]}],{minutes:15,from:'2026-10-04T19:00',to:'2026-10-04T19:20'});
 assert.deepEqual(t.buckets.map(b=>b.count),[2,1]);assert.equal(t.buckets[1].until,'2026-10-04T19:20:00');
 for(const bucket of t.buckets){assert.equal(bucket.count,bucket.events.length);assert.equal(bucket.votes,bucket.events.reduce((s,e)=>s+e.votes,0));}
 assert.equal(t.buckets[0].events[0].cityName,'Cidade teste');assert.equal(t.buckets[0].events[0].zone,'0004');
});
test('retry individual seleciona apenas o erro solicitado e preserva demais evidências',()=>{
 const good=record('0001',null,{sha256:'preservado'}),r={records:[good],issues:[{zone:'0004',section:'0002'},{zone:'0004',section:'0003'}]};
 assert.deepEqual([...retryTargets(r,'0004','0002')],['0004/0002']);assert.throws(()=>retryTargets(r,'0004','0001'));assert.throws(()=>retryTargets(r,'0004'));
 replaceRecord(r,record('0002',null));assert.equal(r.records[0],good);assert.equal(r.issues.length,1);assert.equal(r.issues[0].section,'0003');
 replaceRecord(r,record('0002',null));assert.equal(r.records.length,2);
});
test('timeout antigo é reconhecido e alteração no catálogo invalida estabilidade',()=>{
 assert.equal(classifyError({message:'The operation was aborted due to timeout'}).code,'TIMEOUT');assert.equal(classifyError({message:'BU inválido'}).retryable,false);
 assert.notEqual(sectionStamp({zone:'0004',ns:'0001',ha:'19:00'}),sectionStamp({zone:'0004',ns:'0001',ha:'20:00'}));
});

test('lote de retry inclui apenas erros, preserva relatórios e não trata pendência de comparação como erro de coleta',()=>{
 const reports=[{uf:'ac',city:'01066',issues:[],comparison:{status:'pending'}},{uf:'ce',city:'13404',issues:[{zone:'0001',section:'0002'}]}];
 const original=structuredClone(reports);assert.deepEqual(retryBatchTasks(reports),[{uf:'ce',city:'13404'}]);assert.deepEqual(reports,original);
});
