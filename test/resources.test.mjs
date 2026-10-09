import test from 'node:test';
import assert from 'node:assert/strict';
import {createDecodeQueue,createPublicAdmission} from '../lib/resources.mjs';
import {createTSEClient, resultURL} from '../lib/tse.mjs';
const tick=()=>new Promise(r=>setImmediate(r));

test('decoding bounds running and queued jobs, coalesces duplicates and recovers after failure',async()=>{
  const tasks=[];let closed=0;
  const pool=createDecodeQueue({concurrency:1,maxQueued:1,factory:()=>({decode:()=>new Promise((resolve,reject)=>tasks.push({resolve,reject})),close:()=>closed++})});
  const a=pool.decode({sha256:'a'}, {city:'1'});
  assert.equal(pool.decode({sha256:'a'}, {city:'1'}),a);
  const b=pool.decode({sha256:'b'}, {city:'1'});
  await assert.rejects(pool.decode({sha256:'c'},{}),e=>e.status===503);
  await tick();assert.equal(tasks.length,1);
  tasks[0].resolve('ok');assert.equal(await a,'ok');await tick();
  assert.equal(tasks.length,2);
  const rejection=assert.rejects(b,/invalid/);tasks[1].reject(new Error('invalid'));await rejection;await tick();
  assert.equal(closed,2);
  assert.equal(await pool.decode({sha256:'a'},{city:'1'}),'ok');
  const retry=pool.decode({sha256:'b'},{city:'1'});await tick();tasks[2].resolve('retry');assert.equal(await retry,'retry');
});

test('cache validates identity, expires and evicts least recently used values',async()=>{
  let calls=0,time=0;
  const pool=createDecodeQueue({cacheSize:1,ttl:10,now:()=>time,factory:()=>({decode:async()=>++calls,close(){}})});
  const read=async(hash,city)=>{const result=await pool.decode({sha256:hash},{city});await tick();return result;};
  assert.equal(await read('a','1'),1);assert.equal(await read('a','1'),1);
  assert.equal(await read('a','2'),2);assert.equal(await read('a','1'),3);
  time=11;assert.equal(await read('a','1'),4);
});

test('public admission bounds IP rate, global rate, concurrent work and resets',()=>{
  let time=0;
  const admit=createPublicAdmission({limit:2,globalLimit:3,concurrency:1,windowMs:1000,now:()=>time});
  const release=admit('a');assert.throws(()=>admit('b'),e=>e.status===503);
  release();release();admit('a')();
  assert.throws(()=>admit('a'),e=>e.status===429&&e.retryAfter===1);
  assert.throws(()=>admit('c'),e=>e.status===429);
  time=1000;admit('a')();
});

test('public upstream saturation and cooldown do not occupy collection resources',async()=>{
  let finish;
  const publicClient=createTSEClient({maxPending:1,interval:0,fetchImpl:()=>new Promise(r=>finish=r)});
  let calls=0;
  const collection=createTSEClient({interval:0,fetchImpl:async()=>{calls++;return {ok:false,status:418};}});
  const pending=publicClient.fetchJSON(resultURL);
  await assert.rejects(publicClient.fetchJSON(resultURL+'?other'),e=>e.status===503);
  await assert.rejects(collection.fetchJSON(resultURL),/418/);assert.equal(calls,1);
  finish({ok:false,status:429});await assert.rejects(pending,/429/);await tick();
  await assert.rejects(publicClient.fetchJSON(resultURL),/pausada/);
  await assert.rejects(collection.fetchJSON(resultURL),/418/);assert.equal(calls,2);
});
