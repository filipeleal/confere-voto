import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const digest=v=>createHash('sha256').update(v).digest('hex');
export function passwordRecord(username,password){const salt=randomBytes(16).toString('hex');return {username,salt,hash:scryptSync(password,salt,64).toString('hex')};}
export function createAuth(account,{origin='http://localhost:3000',now=Date.now,cookieName='urna_admin'}={}){
 const sessions=new Map(),attempts=new Map();let globalAttempts=[];const duration=8*60*60*1000;
 const secure=new URL(origin).protocol==='https:';
 function token(req){return new RegExp('(?:^|;\\s*)'+cookieName+'=([a-f0-9]{64})(?:;|$)').exec(req.headers.cookie||'')?.[1];}
 function session(req){const value=token(req),s=value&&sessions.get(digest(value));if(!s)return null;if(s.expires<=now()){sessions.delete(digest(value));return null;}return s;}
 function cookie(value,age){return `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure?'; Secure':''}`;}
 function sameOrigin(req){return req.headers.origin===origin&&req.headers['x-requested-by']==='urna-aberta';}
 return {session,sameOrigin,
  login(req,username,password){
   const time=now(),ip=req.socket.remoteAddress||'unknown';for(const [key,list] of attempts)if(!list.some(t=>t>time-900000))attempts.delete(key);
   const recent=(attempts.get(ip)||[]).filter(t=>t>time-900000);globalAttempts=globalAttempts.filter(t=>t>time-900000);
   if(recent.length>=5||globalAttempts.length>=30)return {status:429,error:'Muitas tentativas. Aguarde 15 minutos.'};
   recent.push(time);attempts.set(ip,recent);globalAttempts.push(time);
   if(!account)return {status:503,error:'Administrador ainda não configurado no servidor.'};
   const supplied=typeof password==='string'&&password.length<=256?password:'';
   const valid=timingSafeEqual(scryptSync(supplied,account.salt,64),Buffer.from(account.hash,'hex'));
   if(!valid||username!==account.username)return {status:401,error:'Usuário ou senha inválidos.'};
   attempts.delete(ip);for(const [key,s] of sessions)if(s.expires<=time)sessions.delete(key);
   if(sessions.size>=20)sessions.delete(sessions.keys().next().value);
   const value=randomBytes(32).toString('hex'),s={username:account.username,expires:time+duration};sessions.set(digest(value),s);
   return {status:200,cookie:cookie(value,duration/1000),username:s.username};
  },logout(req){const value=token(req);if(value)sessions.delete(digest(value));return cookie('',0);}
 };
}
export async function loadAuth(){let account=null;try{account=JSON.parse(await readFile('data/admin/account.json','utf8'));if(!/^[a-f0-9]{128}$/.test(account.hash)||!/^[a-f0-9]{32}$/.test(account.salt)||!account.username)throw new Error('Configuração de administrador inválida');}catch(e){if(e.code!=='ENOENT')throw e;}return createAuth(account,{origin:process.env.PUBLIC_ORIGIN||`http://localhost:${process.env.PORT||3000}`});}

