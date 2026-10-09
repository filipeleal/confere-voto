import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// Windows sync clients and scanners can briefly lock either side of a rename.
export function createAtomicWriter(fs = { mkdir, writeFile, rename }, sleep = delay) {
  const pending = new Map();
  async function retry(action) {
    for (let attempt = 0; ; attempt++) {
      try { return await action(); }
      catch (error) {
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 10) throw error;
        await sleep(Math.min(100 * 2 ** attempt, 2000));
      }
    }
  }
  return function atomic(path, data) {
    const target = resolve(path);
    const contents = JSON.stringify(data);
    const previous = pending.get(target) || Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      await retry(() => fs.mkdir(dirname(target), { recursive: true }));
      const temporary = `${target}.${randomUUID()}.tmp`;
      await retry(() => fs.writeFile(temporary, contents));
      // Never delete or overwrite the last valid report as a fallback.
      // If retries fail, retain the temporary snapshot for recovery.
      await retry(() => fs.rename(temporary, target));
    });
    pending.set(target, operation);
    operation.then(cleanup, cleanup);
    function cleanup() { if (pending.get(target) === operation) pending.delete(target); }
    return operation;
  };
}

export const atomic = createAtomicWriter();
