import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedTimelineRange} from '../public/timeline.js';
test('seleção abrange faixas inteiras, funciona invertida e limita às bordas',()=>{const b=[{at:'a',until:'b'},{at:'b',until:'c'},{at:'c',until:'d'}];assert.deepEqual(selectedTimelineRange(b,400,900),{from:'b',to:'d'});assert.deepEqual(selectedTimelineRange(b,900,400),{from:'b',to:'d'});assert.deepEqual(selectedTimelineRange(b,-100,2000),{from:'a',to:'d'});assert.equal(selectedTimelineRange([],0,100),null);});
