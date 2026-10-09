import test from 'node:test';
import assert from 'node:assert/strict';
import { createAtomicWriter } from '../lib/storage.mjs';

test('gravação aguarda bloqueio temporário e serializa versões do mesmo relatório', async () => {
  const files = new Map(); const published = []; const waits = [];
  let attempts = 0;
  const writer = createAtomicWriter({
    mkdir: async () => {},
    writeFile: async (path, value) => files.set(path, value),
    rename: async (from, to) => {
      if (++attempts <= 3) throw Object.assign(new Error('locked'), {code:'EPERM'});
      published.push(JSON.parse(files.get(from))); files.set(to, files.get(from)); files.delete(from);
    }
  }, async ms => waits.push(ms));
  const value = {counted:1};
  const first = writer('report.json', value); value.counted = 2;
  await Promise.all([first, writer('report.json', value)]);
  assert.deepEqual(published, [{counted:1}, {counted:2}]);
  assert.deepEqual(waits, [100,200,400]);
  assert.equal(files.size, 1);
});

test('falha persistente preserva original e snapshot e permite nova gravação', async () => {
  const files = new Map(); let locked = false; let attempts = 0;
  const writer = createAtomicWriter({
    mkdir: async () => {}, writeFile: async (p,v) => files.set(p,v),
    rename: async (from,to) => { attempts++; if(locked) throw Object.assign(new Error('locked'),{code:'EPERM'}); files.set(to,files.get(from));files.delete(from); }
  }, async () => {});
  await writer('report.json',{counted:1}); locked=true;
  await assert.rejects(writer('report.json',{counted:2}),{code:'EPERM'});
  assert.equal(attempts,12);
  assert.deepEqual([...files.values()].map(JSON.parse),[{counted:1},{counted:2}]);
  locked=false; await writer('report.json',{counted:3});
  assert.ok([...files.values()].includes('{"counted":3}'));
});
