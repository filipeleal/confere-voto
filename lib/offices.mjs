import { BusyError, createDecodeQueue } from './resources.mjs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
let child,sequence=0;
const pending=new Map();
export function startOfficeIndex(){
 if(child)return;
 child=spawn(process.env.PYTHON||resolve(process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python'),['-u','scripts/offices_service.py'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 child.stderr.on('data',data=>console.error('Índice de cargos:',String(data).slice(-1500)));
 function failed(error){for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();child=null;}
 child.on('error',failed);child.stdin.on('error',failed);child.on('exit',()=>failed(new Error('Índice de cargos indisponível; tente novamente.')));
 createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line),p=pending.get(r.id);if(!p)return;pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(new Error(r.error)):p.resolve(r.result);}catch(error){console.error(error.message);}});
}
function rawOfficeQuery(query){
 startOfficeIndex();
 if(pending.size>=20)return Promise.reject(new BusyError());
 return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Tempo limite ao consultar cargos'));},60000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({...query,id})+'\n');});
}

const publicDecode=createDecodeQueue({concurrency:1,maxQueued:8,factory:()=>({
 decode:(_path,query)=>rawOfficeQuery(query),close(){}
})});
export function officeQuery(query){
 return query.action==='decode' ? publicDecode.decode({sha256:query.hash},query) : rawOfficeQuery(query);
}
