import { loadSiteGate } from './lib/site-access.mjs';
import { createAnalytics } from './lib/analytics.mjs';
import { createContact } from './lib/contact.mjs';
import { buildTimeline } from './lib/timeline.mjs';
import { buildArrivalMap } from './lib/arrival-map.mjs';
import { latestReports } from './lib/audit.mjs';
import { startOfficeIndex, officeQuery } from './lib/offices.mjs';
import { loadAuth } from './lib/auth.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { publicTSE, resultURL, normalizeResult, sectionsURL, auxiliaryURL, bulletinLinks, uf, digits } from './lib/tse.mjs';
import { createDecodeQueue, createPublicAdmission } from './lib/resources.mjs';
const {fetchJSON, fetchBinary} = publicTSE;
const publicDecode = createDecodeQueue();
const admitPublic = createPublicAdmission();
import { initAudits, refreshCoverage, auditOverview, auditReport, startAudit, stopAudit, startCampaign, retryAudit, retryAllErrors, auditTimeline } from './lib/audit.mjs';

await initAudits();
const auth=await loadAuth();
const siteGate=await loadSiteGate();
const contact=createContact();
const analytics=createAnalytics(process.env.GOOGLE_ANALYTICS_ID);

const files = { '/contact.js':['contact.js','text/javascript'], '/header.js':['header.js','text/javascript'], '/mapa':['arrival-map.html','text/html'], '/arrival-map.js':['arrival-map.js','text/javascript'], '/arrival-map.css':['arrival-map.css','text/css'], '/geo/states.json':['geo/states.json','application/json'], '/geo/cities.json':['geo/cities.json','application/json'], '/geo/state-codes.json':['geo/state-codes.json','application/json'], '/cargos':['offices.html','text/html'], '/offices.js':['offices.js','text/javascript'], '/brand-mark.svg':['brand-mark.svg','image/svg+xml'], '/confere-voto-logo.svg':['confere-voto-logo.svg','image/svg+xml'], '/': ['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/audit.js':['audit.js','text/javascript'], '/timeline.js':['timeline.js','text/javascript'], '/style.css':['style.css','text/css'], '/brasil.css':['brasil.css','text/css'] };
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', analytics.csp);
  res.setHeader('Cache-Control', 'no-store');
  const json = (status, value) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); };
  let releasePublic;
  try {
    if(await siteGate(req,res))return;
    const { pathname, searchParams: p } = new URL(req.url, 'http://localhost');
    if(pathname==='/api/contact')return json(200,await contact(req));
    if(pathname==='/api/admin/session'&&req.method==='GET')return json(200,{authenticated:!!auth.session(req),username:auth.session(req)?.username});
    if(pathname.startsWith('/api/admin/')&&req.method==='POST'){
      if(!auth.sameOrigin(req))return json(403,{error:'Origem não permitida'});
      if(pathname==='/api/admin/logout'){res.setHeader('Set-Cookie',auth.logout(req));return json(200,{authenticated:false});}
      if(pathname==='/api/admin/login'){
        if(!req.headers['content-type']?.startsWith('application/json'))return json(415,{error:'Envie JSON'});
        let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return json(413,{error:'Requisição muito grande'});}
        let credentials;try{credentials=JSON.parse(body);}catch{return json(400,{error:'JSON inválido'});}
        const result=auth.login(req,credentials?.username,credentials?.password);
        if(result.cookie)res.setHeader('Set-Cookie',result.cookie);
        return json(result.status,result.error?{error:result.error}:{authenticated:true,username:result.username});
      }
    }
    if(req.method==='POST' && pathname.startsWith('/api/audit/')){
      if(!auth.session(req))return json(401,{error:'Entre como administrador para gerenciar a coleta.'});

      if(!auth.sameOrigin(req))return json(403,{error:'Origem não permitida'});
      if(pathname==='/api/audit/stop')return json(200,await stopAudit());
      try{
        if(pathname==='/api/audit/start')return json(202,await startAudit(p.get('uf'),p.get('city')||''));
        if(pathname==='/api/audit/retry-all')return json(202,await retryAllErrors());
        if(pathname==='/api/audit/retry')return json(202,await retryAudit(p.get('id'),p.get('zone'),p.get('section')));
        if(pathname==='/api/audit/batch')return json(202,await startCampaign(p.get('scope'),p.get('resume')==='true'));
      }catch(error){return json(409,{error:error.message});}
    }
    if (req.method !== 'GET') return json(405,{error:'Método não permitido'});
    if(pathname==='/analytics.js'){
      res.setHeader('Content-Type','text/javascript; charset=utf-8');
      return res.end(analytics.script);
    }
    if(pathname.startsWith('/api/')) {
      releasePublic = admitPublic(req.socket.remoteAddress || 'unknown');
    }
    if(pathname==='/api/offices/decode'){const hash=p.get('sha256');if(!/^[a-f0-9]{64}$/.test(hash||''))return json(400,{error:'Hash inválido'});return json(200,await officeQuery({action:'decode',hash,uf:uf(p.get('uf')),city:digits(p.get('city'),5),zone:digits(p.get('zone'),4),section:digits(p.get('section'),4)}));}
    if(pathname==='/api/offices/catalog')return json(200,await officeQuery({action:'catalog'}));
    if(pathname==='/api/offices/timeline'){
      const state=uf(p.get('uf')),office=p.get('office');if(!/^(?:[1-9][0-9]?|livre-[0-9]{1,2})$/.test(office||''))return json(400,{error:'Cargo inválido'});
      const records=await officeQuery({action:'timeline',uf:state,office,city:p.get('city')?digits(p.get('city'),5):'',selection:p.get('id')?digits(p.get('id'),5):''});
      return json(200,buildTimeline(records,Object.fromEntries(p)));
    }
    if(pathname==='/api/offices/summary'){
      const state=uf(p.get('uf')),office=p.get('office');if(!/^(?:[1-9][0-9]?|livre-[0-9]{1,2})$/.test(office||''))return json(400,{error:'Cargo inválido'});
      return json(200,await officeQuery({action:'summary',uf:state,office,city:p.get('city')?digits(p.get('city'),5):'',offset:Math.max(0,Math.min(1000000,Number(p.get('offset'))||0))}));
    }
    if(pathname==='/api/offices/section')return json(200,await officeQuery({action:'section',uf:uf(p.get('uf')),city:digits(p.get('city'),5),zone:digits(p.get('zone'),4),section:digits(p.get('section'),4)}));
    if(pathname==='/api/offices/reference'){
      const state=uf(p.get('uf')),office=p.get('office');if(!['3','5','6','7','8','livre-25'].includes(office)||state==='zz'||(office==='livre-25'&&state!=='pe'))return json(400,{error:'Referência indisponível para este cargo/UF'});
      const election=office==='livre-25'?'6261':'6259',code=office==='livre-25'?'25':office;
      const source=`https://resultados.tse.jus.br/oficial/ele2026/${election}/dados/${state}/${state}${office==='livre-25'?'30015':''}-c${code.padStart(4,'0')}-e${election.padStart(6,'0')}-u.json`;
      const r=await fetchJSON(source),raw=r.data;if(raw.f!=='o'||raw.ele!==election||raw.t!=='1'||raw.cdabr!==(office==='livre-25'?'30015':state))throw new Error('Referência de eleição/UF inesperada');
      const cargo=raw.carg?.find(c=>c.cd===code);if(!cargo)throw new Error('Cargo ausente na referência');
      return json(200,{source,sha256:r.sha256,generatedAt:`${raw.dg} ${raw.hg}`,candidates:cargo.agr.flatMap(a=>a.par.flatMap(p=>p.cand.map(c=>({number:c.n,name:c.nmu,party:p.sg,votes:c.vap,status:c.dvt}))))});
    }
    if(pathname==='/api/arrival-map')return json(200,buildArrivalMap(latestReports()));
    if(pathname==='/api/audits')return json(200,auditOverview(p.get('cursor')));
    if(pathname==='/api/timeline'){try{return json(200,auditTimeline(Object.fromEntries(p)));}catch(error){return json(400,{error:error.message});}}
    if(pathname==='/api/audit') {const report=auditReport(p.get('id'));return report?json(200,report):json(404,{error:'Contagem não encontrada'});}
    if(pathname==='/api/original'){
      const hash=p.get('sha256');
      if(!/^[a-f0-9]{64}$/.test(hash||''))return json(400,{error:'Identificador inválido'});
      const format=p.get('format')==='json'?'json':'dat';
      try {const bytes=await readFile(`data/snapshots/${hash}.${format}`);res.setHeader('Content-Type',format==='json'?'application/json; charset=utf-8':'application/octet-stream');res.setHeader('Content-Disposition',`attachment; filename="${hash}.${format}"`);return res.end(bytes);}catch(e){if(e.code==='ENOENT')return json(404,{error:'Original não encontrado'});throw e;}
    }
    if (files[pathname]) {
      const [file, type] = files[pathname];
      res.setHeader('Content-Type', `${type}; charset=utf-8`);
      const content=await readFile(new URL(`public/${file}`, import.meta.url));
      return res.end(type==='text/html'?analytics.inject(content.toString('utf8')):content);
    }
    if (pathname === '/api/results') {
      const {data,...meta} = await fetchJSON(resultURL);
      return json(200,{...meta,...normalizeResult(data)});
    }
    if (['/api/sections','/api/bulletin','/api/bulletin-decoded'].includes(pathname)) {
      let state, city, zone, section;
      try {
        state = uf(p.get('uf'));
        if (pathname !== '/api/sections') { city = digits(p.get('city') || '',5); zone = digits(p.get('zone') || '',4); section = digits(p.get('section') || '',4); }
      } catch { return json(400,{error:'Localidade inválida'}); }
      const {data,...meta} = await fetchJSON(sectionsURL(state));
      if (data.cdp !== '3220') throw new Error('Pleito inesperado');
      const cities = data.abr.find(a=>a.cd === state)?.mu;
      if (!cities) throw new Error('Catálogo de seções inválido');
      if (pathname === '/api/sections') return json(200,{...meta,cities});
      const sec = cities.find(m=>m.cd===city)?.zon.find(z=>z.cd===zone)?.sec.find(s=>s.ns===section);
      if (!sec) return json(404,{error:'Seção não consta no catálogo do TSE'});
      if (sec.nsp) return json(200,{aggregateTo:sec.nsp,files:[]});
      if (!sec.da) return json(200,{status:'Arquivo auxiliar ainda não disponível no catálogo',files:[]});
      const auxiliary = await fetchJSON(auxiliaryURL(state,city,zone,section));
      if(pathname==='/api/bulletin-decoded'){
        const file=bulletinLinks(auxiliary.data,auxiliary.source).find(f=>f.url===p.get('file'));
        if(!file)return json(404,{error:'BU não consta no catálogo desta seção'});
        const binary=await fetchBinary(file.url);
        const decoded=await publicDecode.decode(binary,{uf:state,city,zone,section});
        return json(200,{decoded,sha256:binary.sha256,source:file.url,fetchedAt:binary.fetchedAt});
      }
      return json(200,{source:auxiliary.source,sha256:auxiliary.sha256,fetchedAt:auxiliary.fetchedAt,status:auxiliary.data.st,files:bulletinLinks(auxiliary.data,auxiliary.source)});
    }
    return json(404,{error:'Não encontrado'});
  } catch (error) { console.error(error.message); if(error.status===429||error.status===503)res.setHeader('Retry-After',String(error.retryAfter||1)); return json(error.status||502,{error:error.message}); }
  finally { releasePublic?.(); }
});
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => console.log(`Confere Voto: http://${host}:${port}`));

refreshCoverage();
setInterval(refreshCoverage,3600000).unref();

startOfficeIndex();

