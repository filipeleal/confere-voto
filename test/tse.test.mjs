import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auxiliaryURL, sectionsURL, bulletinLinks, normalizeResult, createTSEClient } from '../lib/tse.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('URLs preservam zeros à esquerda e fixam pleito e ambiente',()=>{
  assert.equal(auxiliaryURL('ac','1066','4','77'),'https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220/dados/ac/01066/0004/0077/p003220-ac-m01066-z0004-s0077-aux.json');
  assert.match(sectionsURL('zz'),/zz-p003220-cs.json$/);
  assert.throws(()=>auxiliaryURL('ac','../x','4','77'));
  assert.throws(()=>sectionsURL('xx'));
});
test('catálogo mantém todos os estados de recebimento sem contar versões',()=>{
  const data={f:'o',hashes:[{hash:'abc123',st:'Rejeitado',dr:'04/10/2026',hr:'18:00',arq:[{tp:'bu',nm:'original-bu.dat'},{tp:'rdv',nm:'rdv.dat'}]},{hash:'def456',st:'Totalizado',dr:'04/10/2026',hr:'19:00',arq:[{tp:'bu',nm:'original-bu.dat'}]}]};
  const links=bulletinLinks(data,auxiliaryURL('ac','1066','4','77'));
  assert.equal(links.length,2);assert.equal(links[0].status,'Rejeitado');assert.match(links[1].url,/def456\/original-bu.dat$/);
  data.hashes[0].arq[0].nm='../other';assert.throws(()=>bulletinLinks(data,'https://example.com/aux.json'));
});
const sample=()=>({f:'o',ele:'6257',t:'1',s:{st:'2',ts:'3'},v:{tv:'10',vb:'1',tvn:'2'},carg:[{cd:'1',agr:[{par:[{sg:'TESTE',cand:[{n:'99',nmu:'CANDIDATO FICTÍCIO',vap:'7',pvap:'100,00',dvt:'Válido'}]}]}]}]});
test('resultado mantém inteiros e usa total de nulos incluindo técnicos',()=>{
  const r=normalizeResult(sample());assert.equal(r.votes,10);assert.equal(r.null,2);assert.equal(r.candidates[0].votes,7);assert.equal(r.expectedSections,3);
});
test('rejeita simulado, outro turno e contagens ausentes ou fracionárias',()=>{
  for(const patch of [{f:'s'},{t:'2'},{ele:'6259'},{v:{tv:'1.2',vb:'1',tvn:'2'}}])assert.throws(()=>normalizeResult({...sample(),...patch}));
});

test('ambiente oficial aceita ambas as grafias na coleta e nas validações',async()=>{
  const originalCwd=process.cwd();
  const temporary=await mkdtemp(join(tmpdir(),'tse-environment-'));
  process.chdir(temporary);
  try {
    for(const f of ['o','O','s','S',undefined,null,0,{},' o ']) {
      const raw={...sample(),f,hashes:[{hash:'abc123',st:'Recebido',dr:'06/10/2026',hr:'13:26:35',arq:[{tp:'bu',nm:'original-bu.dat'}]}]};
      const client=createTSEClient({interval:0,fetchImpl:async()=>new Response(JSON.stringify(raw))});
      const url=auxiliaryURL('pa','04057','0016','0006');
      if(f==='o'||f==='O') {
        const response=await client.fetchJSON(url);
        assert.equal(response.data.f,f);
        assert.equal(bulletinLinks(response.data,url).length,1);
        assert.equal(normalizeResult(response.data).votes,10);
      } else {
        await assert.rejects(client.fetchJSON(url),/Dados fora do ambiente oficial/);
        assert.throws(()=>bulletinLinks(raw,url),/Arquivo auxiliar inválido/);
        assert.throws(()=>normalizeResult(raw),/Eleição ou ambiente inesperado/);
      }
    }
  } finally {
    process.chdir(originalCwd);
    await rm(temporary,{recursive:true,force:true});
  }
});
