import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAuth,passwordRecord} from '../lib/auth.mjs';
const record=passwordRecord('admin','test-password-not-for-production');
const req=()=>({headers:{origin:'https://example.test','x-requested-by':'urna-aberta'},socket:{remoteAddress:'127.0.0.1'}});
test('sessão requer senha correta, cookie seguro, expira e é revogada no logout',()=>{
 let time=0;const auth=createAuth(record,{origin:'https://example.test',now:()=>time}),r=req();
 assert.equal(auth.session(r),null);assert.equal(auth.login(r,'admin','wrong').status,401);
 const result=auth.login(r,'admin','test-password-not-for-production');assert.equal(result.status,200);assert.match(result.cookie,/HttpOnly/);assert.match(result.cookie,/SameSite=Strict/);assert.match(result.cookie,/Secure/);
 r.headers.cookie=result.cookie.split(';')[0];assert.equal(auth.session(r).username,'admin');time=8*3600000;assert.equal(auth.session(r),null);
 const next=auth.login(r,'admin','test-password-not-for-production');r.headers.cookie=next.cookie.split(';')[0];auth.logout(r);assert.equal(auth.session(r),null);
});
test('tentativas são limitadas e origem externa é rejeitada',()=>{
 const auth=createAuth(record,{origin:'https://example.test'}),r=req();assert.equal(auth.sameOrigin(r),true);r.headers.origin='https://attacker.test';assert.equal(auth.sameOrigin(r),false);
 for(let i=0;i<5;i++)assert.equal(auth.login(r,'admin','wrong').status,401);
 assert.equal(auth.login(r,'admin','test-password-not-for-production').status,429);
});
test('sem configuração falha fechado e cookie inventado não autentica',()=>{
 const auth=createAuth(null),r=req();r.headers.cookie='urna_admin='+'a'.repeat(64);assert.equal(auth.session(r),null);assert.equal(auth.login(r,'admin','anything').status,503);
});
