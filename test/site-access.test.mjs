import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createSiteGate} from '../lib/site-access.mjs';
import {passwordRecord} from '../lib/auth.mjs';

test('barreira protege páginas, APIs e arquivos; senha abre somente sessão de visitante',async()=>{
 const origin='https://example.test';
 const gate=createSiteGate(passwordRecord('visitante','test-password'),{origin});
 const server=createServer(async(req,res)=>{if(await gate(req,res))return;res.end('protected');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try {
  for(const path of ['/','/cargos','/mapa','/app.js','/geo/cities.json','/api/audits','/api/original','/api/admin/session','/api/contact']){
   const response=await fetch(base+path,{redirect:'manual'});
   assert.equal(response.status,path.startsWith('/api/')?401:303,path);
   assert.doesNotMatch(await response.text(),/protected/);
  }
  assert.equal((await fetch(base+'/acesso')).status,200);
  const login=(password,extra={})=>fetch(base+'/api/access/login',{method:'POST',headers:{origin,'x-requested-by':'urna-aberta','content-type':'application/json',...extra},body:JSON.stringify({password})});
  assert.equal((await login('test-password',{origin:'https://other.test'})).status,403);
  assert.equal((await login('wrong')).status,401);
  const response=await login('test-password');assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie');assert.match(cookie,/urna_access=/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);
  assert.equal(await (await fetch(base+'/api/audits',{headers:{cookie:cookie.split(';')[0]}})).text(),'protected');
  assert.equal((await fetch(base+'/api/audits',{headers:{cookie:cookie.replace('urna_access=','urna_admin=').split(';')[0]}})).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('sem senha configurada o site continua fechado',async()=>{
 const gate=createSiteGate(null);let status;
 const res={writeHead(value){status=value;},end(){}};
 assert.equal(await gate({url:'/api/audits',method:'GET',headers:{}},res),true);
 assert.equal(status,401);
});
