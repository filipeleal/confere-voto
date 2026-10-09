import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareAudit, chooseBulletin, primarySections, sumRecords } from '../lib/audit.mjs';

const official=()=>({f:'o',ele:'6257',t:'1',tpabr:'mu',cdabr:'01066',and:'f',
  s:{st:'1',ts:'1',snt:'0',sa:'1',si:'1',sni:'0',sna:'0'},
  v:{tv:'10',vb:'1',tvn:'2',vn:'2',vnt:'0',van:'0',vansj:'0',vsan:'0',vscv:'0'},
  carg:[{cd:'1',agr:[{par:[{sg:'TESTE',cand:[{n:'99',nmu:'FICTÍCIO',vap:'7',pvap:'100,00',dvt:'Válido'}]}]}]}]});
const report=()=>({city:'01066',counted:1,expected:1,issues:[],totals:{candidates:{99:7},votes:10,blank:1,null:2}});

test('diagnóstico distingue zero, ausente, inválido e destinação não reconciliada',()=>{
  for(const [value,present,pass] of [['0',true,true],[undefined,false,false],['1',true,true],['?',true,false]]){
    const raw=official();raw.v.vnt=value;const result=compareAudit(report(),raw,true);
    const check=result.diagnostics.checks.find(c=>c.field==='v.vnt');
    assert.equal(check.present,present);assert.equal(check.pass,pass);assert.equal(check.actual,value??null);
    if(!pass){assert.equal(result.status,'pending');assert.match(result.reasons.join(' '),/v\.vnt/);}
  }
});
test('diagnóstico identifica cobertura, candidato e snapshot sem ocultar outras causas',()=>{
  const raw=official();raw.s.sa='2';raw.carg[0].agr[0].par[0].cand[0].dvt='Anulado';
  const result=compareAudit({...report(),counted:0},raw,false),failed=result.diagnostics.checks.filter(c=>!c.pass);
  assert.ok(failed.some(c=>c.field==='counted'&&c.actual===0&&c.expected===1));
  assert.ok(failed.some(c=>c.field==='s.sa'&&c.actual==='2'));
  assert.ok(failed.some(c=>c.field.endsWith('.dvt')&&c.label.includes('99')));
  assert.ok(failed.some(c=>c.source==='snapshots'));
});
test('compara cada categoria quando conjuntos estão completos e estáveis',()=>{
  const result=compareAudit(report(),official(),true);assert.equal(result.status,'match');assert.ok(result.rows.every(r=>r.delta===0));
});

test('reconcilia vnt positivo sem fingir confirmação da destinação',()=>{
 const raw=official();raw.v.vnt='1';raw.v.tvn='3';raw.v.tv='11';
 const r=report();r.totals.candidates['28']=1;r.totals.votes=11;
 const result=compareAudit(r,raw,true);
 assert.equal(result.status,'match');assert.ok(result.rows.every(r=>r.delta===0));
 assert.equal(result.reconciliation.inferredTechnical,1);assert.equal(result.reconciliation.destinationConfirmed,false);
 assert.equal(r.totals.null,2);assert.equal(r.totals.candidates['28'],1);
});
test('não mascara erro de vnt nem inconsistência no total publicado',()=>{
 const raw=official();raw.v.vnt='1';raw.v.tvn='3';
 assert.equal(compareAudit(report(),raw,true).status,'discrepancy');
 raw.v.tvn='2';assert.equal(compareAudit(report(),raw,true).status,'pending');
 delete raw.v.vn;assert.equal(compareAudit(report(),raw,true).status,'pending');
});
test('sinaliza um voto de diferença e candidato ausente no consolidado',()=>{
  const r=report();r.totals.candidates[99]=6;r.totals.candidates[98]=1;
  const result=compareAudit(r,official(),true);assert.equal(result.status,'discrepancy');assert.equal(result.rows.find(r=>r.key==='99').delta,-1);assert.equal(result.rows.find(r=>r.key==='technical').delta,1);assert.equal(result.reconciliation.unlisted[0].number,'98');
});
test('diferenças em brancos e nulos também são sinalizadas',()=>{
  const r=report();r.totals.blank=0;r.totals.null=3;
  assert.equal(compareAudit(r,official(),true).status,'discrepancy');
});
test('coleta incompleta, mudança de snapshot ou problemas nunca viram discrepância',()=>{
  const r=report();r.counted=0;r.totals.votes=0;
  for(const [value,stable] of [[r,true],[report(),false],[{...report(),issues:[{message:'Arquivo inválido'}]},true]]){
    const result=compareAudit(value,official(),stable);assert.equal(result.status,'pending');assert.equal(result.rows.length,0);
  }
});
test('pendente para escopo errado, seções não apuradas ou destinações especiais',()=>{
  const cases=[{tpabr:'br'},{cdabr:'99999'},{and:'p'},{s:{...official().s,sni:'1'}},{s:{...official().s,sa:'2'}},{v:{...official().v,vnt:'1'}}];
  for(const patch of cases)assert.equal(compareAudit(report(),{...official(),...patch},true).status,'pending');
  const raw=official();raw.carg[0].agr[0].par[0].cand[0].dvt='Anulado';assert.equal(compareAudit(report(),raw,true).status,'pending');
});
test('não soma duas vezes uma mesma seção, inclusive versões diferentes',()=>{
  const r={uf:'ac',city:'01066',zone:'0004',section:'0077',...report().totals};
  assert.equal(sumRecords([r]).votes,10);assert.throws(()=>sumRecords([r,{...r,sha256:'outro'}]),/duplicada/);
});
test('agregadas não entram novamente e referência principal é verificada',()=>{
  const c={zon:[{cd:'0001',sec:[{ns:'0001'},{ns:'0002',nsp:'0001'}]}]};
  assert.equal(primarySections(c).length,1);c.zon[0].sec[1].nsp='9999';assert.throws(()=>primarySections(c),/sem principal/);
});
test('só aceita um BU marcado Totalizado; não escolhe rejeitado nem versão ambígua',()=>{
  const h={hash:'abc',st:'Totalizado',arq:[{tp:'bu',nm:'bu.dat'}]};
  const raw={f:'o',st:'Totalizada',hashes:[{...h,hash:'old',st:'Rejeitado'},h]};
  assert.match(chooseBulletin(raw,'https://resultados.tse.jus.br/oficial/aux.json').url,/abc\/bu.dat$/);
  assert.throws(()=>chooseBulletin({...raw,hashes:[h,h]},'https://example.com/aux.json'));
  assert.throws(()=>chooseBulletin({...raw,st:'Anulada'},'https://example.com/aux.json'));
});
