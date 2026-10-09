import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStartup} from '../lib/startup.mjs';
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(code,headers){this.status=code;Object.assign(this.headers,headers);},end(body){this.body=body;}};}
test('base lenta permite página e status, bloqueia leitura e mutação até concluir',async()=>{
 let finish;let ready=0;
 const startup=createStartup(()=>new Promise(resolve=>{finish=resolve;}),{onReady(){ready++;}});
 const loading=startup.start();
 for(const [method,path] of [['GET','/api/audits'],['POST','/api/audit/start'],['GET','/api/original'],['GET','/api/offices/summary']]){
  const res=response();assert.equal(await startup.handle({method},res,path),true);assert.equal(res.status,503);assert.equal(res.headers['Retry-After'],'10');
 }
 const page=response();await startup.handle({method:'GET'},page,'/cargos');assert.match(page.body,/Carregando a base/);
 const status=response();await startup.handle({method:'GET'},status,'/api/startup');assert.equal(JSON.parse(status.body).state,'loading');
 finish();await loading;assert.equal(ready,1);assert.equal(await startup.handle({method:'GET'},response(),'/api/audits'),false);
 await startup.start();assert.equal(ready,1);
});
test('falha não libera base parcial nem revela detalhes internos',async()=>{
 let logged;const startup=createStartup(async()=>{throw new Error('private/path');},{onError(error){logged=error;}});
 await startup.start();assert.equal(startup.state,'failed');assert.equal(logged.message,'private/path');
 const res=response();await startup.handle({method:'POST'},res,'/api/audit/start');assert.equal(res.status,503);assert.doesNotMatch(res.body,/private/);
});
