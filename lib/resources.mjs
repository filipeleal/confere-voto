import { createDecoder } from './decoder.mjs';

export class BusyError extends Error {
  constructor(status=503, retryAfter=1) {
    super('Muitas consultas. Tente novamente em instantes.');
    this.status=status; this.retryAfter=retryAfter;
  }
}

// Fixed-size admission table; never trust client-supplied forwarding headers.
export function createPublicAdmission({limit=120, globalLimit=1200, windowMs=60000, concurrency=32, maxClients=4096, now=Date.now}={}) {
  const clients=new Map(); let active=0, total=0, reset=0;
  return ip => {
    const time=now();
    if(time>=reset){clients.clear();total=0;reset=time+windowMs;}
    const count=clients.get(ip)||0;
    if(count>=limit||total>=globalLimit||(!clients.has(ip)&&clients.size>=maxClients))throw new BusyError(429,Math.max(1,Math.ceil((reset-time)/1000)));
    clients.set(ip,count+1);total++;
    if(active>=concurrency)throw new BusyError();
    active++;let released=false;
    return ()=>{if(!released){released=true;active--;}};
  };
}

// Only admitted jobs can spawn Python. Duplicate requests share work, including
// while queued. Expected identity is part of the cache key to preserve validation.
export function createDecodeQueue({concurrency=2, maxQueued=8, cacheSize=256, ttl=300000, factory=createDecoder, now=Date.now}={}) {
  const cache=new Map(), pending=new Map(), queue=[];let active=0;
  function pump(){
    while(active<concurrency&&queue.length){
      const job=queue.shift();active++;
      Promise.resolve().then(async()=>{
        const decoder=factory();
        try{return await decoder.decode(job.binary.path,job.expected);}
        finally{decoder.close();}
      }).then(value=>{
        cache.set(job.key,{value,expires:now()+ttl});
        while(cache.size>cacheSize)cache.delete(cache.keys().next().value);
        job.resolve(value);
      },job.reject).finally(()=>{pending.delete(job.key);active--;pump();});
    }
  }
  return {decode(binary,expected){
    const key=JSON.stringify([binary.sha256,...Object.entries(expected).sort(([a],[b])=>a.localeCompare(b))]);
    const hit=cache.get(key);
    if(hit){cache.delete(key);if(hit.expires>now()){cache.set(key,hit);return Promise.resolve(hit.value);}}
    if(pending.has(key))return pending.get(key);
    if(active>=concurrency&&queue.length>=maxQueued)return Promise.reject(new BusyError());
    const promise=new Promise((resolve,reject)=>queue.push({key,binary,expected,resolve,reject}));
    pending.set(key,promise);pump();return promise;
  }};
}
