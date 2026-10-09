import test from 'node:test';
import assert from 'node:assert/strict';
import {regions,filterRegion} from '../lib/timeline.mjs';
test('regiões cobrem 27 UFs e exterior sem sobreposição',()=>{const ufs=Object.values(regions).flat();assert.equal(ufs.length,28);assert.equal(new Set(ufs).size,28);assert.ok(regions['centro-oeste'].includes('df'));});
test('recorte regional preserva apenas as UFs escolhidas e rejeita região inválida',()=>{const rows=[{uf:'ac'},{uf:'ba'},{uf:'df'},{uf:'zz'}];assert.deepEqual(filterRegion(rows,'norte'),[rows[0]]);assert.deepEqual(filterRegion(rows,'exterior'),[rows[3]]);assert.equal(filterRegion(rows,''),rows);assert.throws(()=>filterRegion(rows,'invalida'));});
