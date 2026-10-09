import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArrivalMap } from '../lib/arrival-map.mjs';
const record=(section,receivedAt)=>({uf:'ac',city:'1',zone:'1',section,receivedAt});
test('arrival map uses civil receipt dates, excludes duplicates and counts missing timestamps',()=>{
  const {cities:[c]}=buildArrivalMap([{uf:'ac',city:'1',name:'Cidade',records:[
    record('1','04/10/2026 23:00:00'),record('2','05/10/2026 01:00:00'),
    record('2','05/10/2026 01:00:00'),record('3',null),record('4','31/02/2026 19:00:00')]}]);
  assert.equal(c.count,2); assert.equal(c.missing,2);
  assert.equal(c.median,Date.parse('2026-10-05T00:00:00Z'));
  assert.equal(c.last-c.first,7200000);
  assert.equal(c.p90,c.first+6480000);
});
test('missing receipt stays unknown, exterior excluded, empty base supported',()=>{
  const {cities}=buildArrivalMap([{uf:'zz',records:[record('1','04/10/2026 12:00:00')]},{uf:'ac',city:'1',records:[record('1',null)]}]);
  assert.equal(cities.length,1);assert.equal(cities[0].median,null);assert.equal(cities[0].last,null);
  assert.deepEqual(buildArrivalMap([]).cities,[]);
});
