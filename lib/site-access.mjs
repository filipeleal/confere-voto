import {readFile} from 'node:fs/promises';
import {createAuth} from './auth.mjs';

export async function loadSiteGate() {
  let account;
  try { account=JSON.parse(await readFile('data/access/account.json','utf8')); }
  catch(error) { if(error.code!=='ENOENT')throw error; }
  if(account && (!/^[a-f0-9]{128}$/.test(account.hash)||!/^[a-f0-9]{32}$/.test(account.salt)||account.username!=='visitante'))throw new Error('Configuração de acesso inválida');
  return createSiteGate(account,{origin:process.env.PUBLIC_ORIGIN||`http://localhost:${process.env.PORT||3000}`});
}

export function createSiteGate(account,options={}) {
  const auth=createAuth(account,{...options,cookieName:'urna_access'});
  return async function gate(req,res) {
    const path=new URL(req.url,'http://localhost').pathname;
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    if(path==='/acesso' && req.method==='GET') {
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(await readFile(new URL('../public/access.html',import.meta.url)));return true;
    }
    if(['/access.js','/access.css'].includes(path)&&req.method==='GET') {
      res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');
      res.end(await readFile(new URL('../public'+path,import.meta.url)));return true;
    }
    if(path==='/api/access/login' && req.method==='POST') {
      if(!auth.sameOrigin(req)){json(403,{error:'Origem não permitida.'});return true;}
      if(!req.headers['content-type']?.startsWith('application/json')){json(415,{error:'Envie JSON.'});return true;}
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096){json(413,{error:'Requisição muito grande.'});return true;}}
      let value;try{value=JSON.parse(body);}catch{json(400,{error:'JSON inválido.'});return true;}
      const result=auth.login(req,'visitante',value?.password);
      if(result.cookie)res.setHeader('Set-Cookie',result.cookie);
      json(result.status,{authenticated:result.status===200,...(result.error?{error:result.status===503?'Acesso ainda não configurado.':result.status===401?'Senha incorreta.':result.error}:{})});return true;
    }
    if(auth.session(req))return false;
    if(path.startsWith('/api/'))json(401,{error:'Informe a senha de acesso ao site.'});
    else {res.writeHead(303,{Location:'/acesso'});res.end();}
    return true;
  };
}
