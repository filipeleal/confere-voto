import nodemailer from 'nodemailer';
import { createPublicAdmission } from './resources.mjs';

const recipient='conferevoto@outlook.com';
const subjects={duvida:'Dúvida',sugestao:'Sugestão',problema:'Problema nos dados'};
const fail=(status,message)=>Object.assign(new Error(message),{status});
const emailPattern=/^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/;

export function createContact({env=process.env,transport,now=Date.now}={}){
  const origin=new URL(env.PUBLIC_ORIGIN||`http://localhost:${env.PORT||3000}`).origin;
  const port=Number(env.SMTP_PORT||587);
  const configured=Boolean(env.SMTP_HOST&&env.SMTP_USER&&env.SMTP_PASSWORD&&emailPattern.test(env.CONTACT_FROM||'')&&[465,587].includes(port));
  const mailer=transport||(configured?nodemailer.createTransport({
    host:env.SMTP_HOST,port,secure:port===465,requireTLS:true,
    auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,
    disableFileAccess:true,disableUrlAccess:true,
  }):null);
  const admit=createPublicAdmission({limit:5,globalLimit:30,windowMs:900000,concurrency:2,now});
  return async function contact(req){
    if(req.method!=='POST')throw fail(405,'Método não permitido');
    if(req.headers.origin!==origin||req.headers['x-requested-by']!=='urna-aberta')throw fail(403,'Origem não permitida');
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw fail(415,'Envie JSON');
    const release=admit(req.socket.remoteAddress||'unknown');
    try{
      const chunks=[];let size=0;
      for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>16000)throw fail(413,'Mensagem muito grande');chunks.push(Buffer.from(chunk));}
      let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail(400,'JSON inválido');}
      if(!data||typeof data!=='object'||Array.isArray(data))throw fail(400,'Formulário inválido');
      if(data.website)throw fail(400,'Não foi possível enviar este formulário.');
      if(typeof data.subject!=='string'||!Object.hasOwn(subjects,data.subject)||typeof data.message!=='string'||data.message.trim().length<10||data.message.length>4000)throw fail(400,'Escolha o assunto e escreva uma mensagem entre 10 e 4.000 caracteres.');
      const reply=data.email===undefined?'':data.email;
      if(typeof reply!=='string'||reply.length>254||(reply&&!emailPattern.test(reply)))throw fail(400,'Informe um e-mail válido ou deixe o campo vazio.');
      let context='Não informada';
      if(data.page!==undefined){
        if(typeof data.page!=='string'||data.page.length>500)throw fail(400,'Página inválida');
        let url;try{url=new URL(data.page,origin);}catch{throw fail(400,'Página inválida');}
        if(url.origin!==origin||!['/','/cargos','/mapa'].includes(url.pathname))throw fail(400,'Página inválida');
        const safe=new URL(url.pathname,origin);
        for(const key of ['cargo','uf','city']){const value=url.searchParams.get(key);if(value&&/^[a-z0-9-]{1,20}$/i.test(value))safe.searchParams.set(key,value);}
        context=safe.href;
      }
      if(!mailer)throw fail(503,'O contato está temporariamente indisponível. Tente novamente mais tarde.');
      try{
        const result=await mailer.sendMail({
          from:{name:'Confere Voto',address:env.CONTACT_FROM},to:recipient,
          ...(reply?{replyTo:{address:reply}}:{}),
          subject:`[Confere Voto] ${subjects[data.subject]}`,
          text:`Assunto: ${subjects[data.subject]}\nPágina consultada: ${context}\nE-mail para resposta: ${reply||'Não informado'}\n\n${data.message.trim()}`,
        });
        if(!result.accepted?.some(address=>address.toLowerCase()===recipient))throw new Error('Recipient rejected');
      }catch{throw fail(502,'Não foi possível encaminhar a mensagem. Tente novamente mais tarde.');}
      return {message:'Mensagem encaminhada. Obrigado pelo contato!'};
    }finally{release();}
  };
}
