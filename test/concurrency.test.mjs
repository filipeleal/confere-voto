import test from 'node:test';
import assert from 'node:assert/strict';
import {processPool,createLimiter} from '../lib/concurrency.mjs';
const tick=()=>new Promise(r=>setTimeout(r,5));
test('25 workers processam cada BU uma vez e aguardam todos',async()=>{
 let active=0,peak=0;const seen=[];
 await processPool(Array.from({length:73},(_,i)=>i),25,async i=>{active++;peak=Math.max(peak,active);await tick();seen.push(i);active--;});
 assert.equal(peak,25);assert.equal(active,0);assert.equal(new Set(seen).size,73);
});
test('pausa e falha drenam BUs em voo sem iniciar novos',async()=>{
 for(const fail of [false,true]){let cancelled=false,active=0,started=0;
 const job=processPool(Array.from({length:80}),25,async()=>{started++;active++;await tick();active--;cancelled=true;if(fail)throw new Error('stop');},()=>cancelled);
 if(fail)await assert.rejects(job,/stop/);else await job;
 assert.equal(started,25);assert.equal(active,0);}
});
test('limite global permanece 25 e libera vaga após erro',async()=>{
 const limit=createLimiter(25);let active=0,peak=0;
 const results=await Promise.allSettled(Array.from({length:76},(_,i)=>limit(async()=>{active++;peak=Math.max(peak,active);await tick();active--;if(i===0)throw new Error('failed');return i;})));
 assert.equal(peak,25);assert.equal(active,0);assert.equal(results.filter(r=>r.status==='fulfilled').length,75);
});
