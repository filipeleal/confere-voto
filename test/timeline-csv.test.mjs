import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeTimelineCSV} from '../public/timeline.js';
test('CSV preserva acentos, números, separadores e aspas e neutraliza fórmulas',()=>{
 const result=encodeTimelineCSV([['Região','Votos'],['Nordeste',1234],['Nome, "teste"',0],['=1+1',2]]);
 assert.ok(result.startsWith('\uFEFF'));
 assert.ok(result.includes('"Nordeste","1234"\r\n'));
 assert.ok(result.includes('"Nome, ""teste""","0"'));
 assert.ok(result.includes('"\'=1+1","2"'));
});
