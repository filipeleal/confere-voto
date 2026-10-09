export const regions={norte:['ac','ap','am','pa','ro','rr','to'],nordeste:['al','ba','ce','ma','pb','pe','pi','rn','se'],'centro-oeste':['df','go','mt','ms'],sudeste:['es','mg','rj','sp'],sul:['pr','rs','sc'],exterior:['zz']};
export function filterRegion(reports,region){
  if(!region)return reports;
  if(!Object.hasOwn(regions,region))throw new Error('Região inválida');
  return reports.filter(r=>regions[region].includes(r.uf));
}
// EA18 times have no timezone field. Keep their civil clock separate from local ISO times.
export function tseClock(value) {
  const m=/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value||'');
  if(!m)return null;
  const iso=`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}`;
  return validClock(iso)?iso:null;
}
function validClock(value) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value||''))return false;
  const time=Date.parse(value+'Z');
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,19)===value;
}
function localClock(value) {
  if(!value||!Number.isFinite(Date.parse(value)))return null;
  return new Date(Date.parse(value)-3*3600000).toISOString().slice(0,19);
}
export const timelineSources={
  received:{label:'Recebimento registrado pelo TSE',clock:'Horário civil do EA18; fuso não declarado no arquivo',field:'receivedAt'},
  auxiliary:{label:'Geração do catálogo da seção',clock:'Horário civil do EA18; não é a hora exata da totalização',field:'auxiliaryGeneratedAt'},
  counted:{label:'Contabilização no nosso sistema',clock:'Horário de Brasília (UTC−03:00)',field:'countedAt'},
  downloaded:{label:'Download na nossa coleta',clock:'Horário de Brasília (UTC−03:00)',field:'fetchedAt'}
};
export function buildTimeline(reports,{basis='received',minutes=5,threshold=45,from,to}={}) {
  if(!timelineSources[basis]||![5,15,30,60].includes(Number(minutes))||![30,45,60,90].includes(Number(threshold)))throw new Error('Parâmetros da linha do tempo inválidos');
  const parseBound=value=>{if(!value)return null;const v=value.length===16?value+':00':value;if(!validClock(v))throw new Error('Data da linha do tempo inválida');return Date.parse(v+'Z');};
  const requestedFrom=parseBound(from),requestedTo=parseBound(to);
  if(requestedFrom!==null&&requestedTo!==null&&requestedFrom>=requestedTo)throw new Error('O fim deve ser posterior ao início');
  const events=[],seen=new Set();let missing=0;
  for(const r of reports)for(const b of r.records){
    const key=`${b.uf}/${b.city}/${b.zone}/${b.section}`;
    if(seen.has(key))continue;seen.add(key);
    const raw=b[timelineSources[basis].field];
    const clock=['received','auxiliary'].includes(basis)?tseClock(raw):localClock(raw);
    if(!clock){missing++;continue;}
    events.push({time:Date.parse(clock+'Z'),clock,cityName:r.name||b.city,buSource:b.source,sha256:b.sha256,uf:b.uf,city:b.city,zone:b.zone,section:b.section,votes:b.votes,candidates:b.candidates||{},source:b.auxiliary?.source||b.source});
  }
  events.sort((a,b)=>a.time-b.time);
  const selected=events.filter(e=>(requestedFrom===null||e.time>=requestedFrom)&&(requestedTo===null||e.time<requestedTo));
  const width=Number(minutes)*60000;
  const start=requestedFrom??(selected.length?Math.floor(selected[0].time/width)*width:null);
  const end=requestedTo??(selected.length?Math.floor(selected.at(-1).time/width)*width+width:null);
  const buckets=[];
  if(start!==null&&end!==null){
    if(Math.ceil((end-start)/width)>2500)throw new Error('Intervalo muito amplo. Reduza o período ou use faixas de 60 minutos.');
    for(let at=start;at<end;at+=width)buckets.push({at:new Date(at).toISOString().slice(0,19),count:0,votes:0,candidates:{},until:new Date(Math.min(at+width,end)).toISOString().slice(0,19),events:[]});
    for(const e of selected){const b=buckets[Math.floor((e.time-start)/width)];if(b){b.count++;b.votes+=e.votes;b.events.push(e);for(const [n,v] of Object.entries(e.candidates))b.candidates[n]=(b.candidates[n]||0)+v;}}
  }
  const gaps=[];
  for(let i=1;i<selected.length;i++)if(selected[i].time-selected[i-1].time>=Number(threshold)*60000)gaps.push({from:selected[i-1].clock,to:selected[i].clock,minutes:Math.round((selected[i].time-selected[i-1].time)/60000),before:selected[i-1],after:selected[i]});
  return {basis,...timelineSources[basis],minutes:Number(minutes),threshold:Number(threshold),known:events.length,missing,totalRecords:seen.size,municipalities:reports.length,selected:selected.length,buckets,gaps,
    first:selected[0]?.clock||null,last:selected.at(-1)?.clock||null,
    caveat:'Amostra dos BUs coletados, não o fluxo nacional completo. Intervalos sem eventos não demonstram paralisação nem explicam sua causa. O EA18 não informa o instante exato de totalização de cada BU. Horários antigos de contabilização local não são inferidos a partir do download.'};
}
