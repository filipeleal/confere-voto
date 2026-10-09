// Drain in-flight work before propagating a failure or finishing a pause.
export async function processPool(items, concurrency, process, cancelled = () => false) {
  let next = 0, failure;
  await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, async (_, worker) => {
    while (!failure && !cancelled() && next < items.length) {
      const item = items[next++];
      try { await process(item, worker); } catch (error) { failure ??= error; }
    }
  }));
  if (failure) throw failure;
}

export function createLimiter(concurrency) {
  let active = 0;
  const queue = [];
  function pump() {
    while (active < concurrency && queue.length) {
      const {task, resolve, reject} = queue.shift(); active++;
      Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; pump(); });
    }
  }
  return task => new Promise((resolve, reject) => { queue.push({task, resolve, reject}); pump(); });
}
