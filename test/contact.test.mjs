import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createContact } from '../lib/contact.mjs';

const valid={subject:'problema',message:'Encontrei um problema na contagem.',page:'/cargos?cargo=3&uf=ba&token=segredo',email:'visitante@example.com'};
function request(data=valid,{headers={},ip='127.0.0.1',raw,method='POST'}={}){
  const req=Readable.from([raw??JSON.stringify(data)]);
  req.method=method;req.headers={origin:'http://localhost:3000','x-requested-by':'urna-aberta','content-type':'application/json',...headers};req.socket={remoteAddress:ip};return req;
}
const accepted={accepted:['conferevoto@outlook.com']};
test('encaminha somente ao destinatário fixo com resposta opcional e contexto filtrado',async()=>{
  const sent=[];const contact=createContact({env:{CONTACT_FROM:'site@example.com'},transport:{sendMail:async data=>{sent.push(data);return accepted;}}});
  const result=await contact(request({...valid,to:'attacker@example.com',from:'attacker@example.com'}));
  assert.equal(sent[0].to,'conferevoto@outlook.com');assert.equal(sent[0].from.address,'site@example.com');
  assert.equal(sent[0].replyTo.address,valid.email);assert.match(sent[0].text,/cargo=3&uf=ba/);assert.doesNotMatch(sent[0].text,/segredo/);
  assert.doesNotMatch(JSON.stringify(result),/outlook|site@example/);
  await contact(request({...valid,email:''}));assert.equal(sent[1].replyTo,undefined);
});
test('rejeita spam, campos inválidos e injeção sem enviar e-mail',async()=>{
  let sends=0;
  const contact=createContact({env:{},transport:{sendMail:async()=>{sends++;return accepted;}}});
  const cases=[{...valid,website:'bot'}, {...valid,email:'x@example.com\r\nBcc:other@example.com'}, {...valid,subject:'toString'}, {...valid,message:'curta'}, {...valid,page:'https://external.example/'}, {...valid,message:'a'.repeat(4001)}];
  for(const [i,data] of cases.entries())await assert.rejects(contact(request(data,{ip:String(i)})),{status:400});
  assert.equal(sends,0);
});
test('exige origem, método, JSON e limita tamanho antes do envio',async()=>{
  const contact=createContact({env:{}});
  for(const [opts,status] of [[{headers:{origin:'https://external.example'}},403],[{method:'GET'},405],[{headers:{'content-type':'text/plain'}},415],[{raw:'{'},400],[{raw:'x'.repeat(16001)},413]])await assert.rejects(contact(request(valid,opts)),{status});
});
test('configuração ausente, rejeição SMTP e erro do provedor não confirmam envio nem vazam endereço',async()=>{
  await assert.rejects(createContact({env:{}})(request()),{status:503});
  for(const sendMail of [async()=>{throw new Error('SMTP conferevoto@outlook.com password=secret');},async()=>({accepted:[]})]){
    await assert.rejects(createContact({env:{},transport:{sendMail}})(request()),error=>{assert.equal(error.status,502);assert.doesNotMatch(error.message,/outlook|secret|SMTP/);return true;});
  }
});
test('limita envios e libera o limite após 15 minutos, sem confiar em IP encaminhado',async()=>{
  let time=0,sends=0;
  const contact=createContact({env:{},now:()=>time,transport:{sendMail:async()=>{sends++;return accepted;}}});
  for(let i=0;i<5;i++)await contact(request());
  await assert.rejects(contact(request(valid,{headers:{'x-forwarded-for':'1.2.3.4'}})),{status:429});
  assert.equal(sends,5);time=900001;await contact(request());assert.equal(sends,6);
});
