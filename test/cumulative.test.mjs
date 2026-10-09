import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cumulativeCandidates} from '../public/timeline.js';
test('acumulado mantém lacunas, soma cada candidato e preserva dados do drill down',()=>{
 const original=[{count:1,candidates:{13:10,22:5}},{count:0,candidates:{}},{count:2,candidates:{13:3,22:7,28:1}}];
 const before=structuredClone(original),result=cumulativeCandidates(original);
 assert.deepEqual(result.map(b=>b.accumulated),[{13:10,22:5},{13:10,22:5},{13:13,22:12,28:1}]);
 assert.deepEqual(original,before);assert.deepEqual(result.map(b=>b.count),[1,0,2]);
 assert.deepEqual(cumulativeCandidates([]),[]);
});
