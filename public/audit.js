import { setAdmin } from './header.js';
import { createTimeline, mergeOverview } from './timeline.js';
const $=id=>document.getElementById(id);
const fmt=n=>new Intl.NumberFormat('pt-BR').format(n);
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
function panelKey(node){const text=node.querySelector('summary')?.textContent||'';return text.startsWith('Zona ')?text.split(' · ').slice(0,2).join(' · '):text.replace(/\d[\d.,]*/g,'#');}
function link(text,url){const node=el('a',text);node.href=url;node.target='_blank';node.rel='noopener';return node;}
async function api(url,method='GET'){const response=await fetch(url,{method,headers:method==='POST'?{'X-Requested-By':'urna-aberta'}:{}});const data=await response.json();if(response.status===401)setAdmin(false);if(!response.ok)throw new Error(data.error);return data;}
let isAdmin=false;
let overview,selectedId,detailVersion,timer,loading=false,action=false;
const timeline=createTimeline($('timeline'));
function retryButton(r,issue){
  const button=el('button',issue?'Tentar novamente esta seção':`Retry dos erros (${r.issues.length})`,'secondary retry-button admin-only');
  button.disabled=action||Boolean(overview?.activeId)||(overview?.campaign?.state==='running'||overview?.retryBatch?.state==='running');
  button.onclick=()=>mutate(`/api/audit/retry?id=${r.id}${issue?`&zone=${issue.zone}&section=${issue.section}`:''}`);
  return button;
}
function controls(){const busy=action||Boolean(overview?.activeId)||(overview?.campaign?.state==='running'||overview?.retryBatch?.state==='running');$('audit-retry-all').disabled=!isAdmin||busy||!overview?.errorMunicipalities;$('audit-retry-all').textContent=`Tentar todos os erros (${overview?.errorMunicipalities||0} municípios)`;const scope=$('audit-scope').value;$('audit-uf-label').hidden=scope==='br';$('audit-city-label').hidden=scope!=='city';$('audit-start').disabled=!isAdmin||busy||(scope!=='br'&&!$('audit-uf').value)||(scope==='city'&&!$('audit-city').value);$('audit-stop').disabled=!isAdmin||!busy||action;$('audit-resume').hidden=!overview?.campaign||!['paused','failed'].includes(overview.campaign.state);$('audit-resume').disabled=!isAdmin||busy;document.querySelectorAll('.retry-button').forEach(button=>button.disabled=!isAdmin||busy);}
for(const id of ['audit-uf','audit-city','audit-scope'])$(id).addEventListener('change',controls);
const collectionStates={ac:'Acre',al:'Alagoas',ap:'Amapá',am:'Amazonas',ba:'Bahia',ce:'Ceará',df:'Distrito Federal',es:'Espírito Santo',go:'Goiás',ma:'Maranhão',mt:'Mato Grosso',ms:'Mato Grosso do Sul',mg:'Minas Gerais',pa:'Pará',pb:'Paraíba',pr:'Paraná',pe:'Pernambuco',pi:'Piauí',rj:'Rio de Janeiro',rn:'Rio Grande do Norte',rs:'Rio Grande do Sul',ro:'Rondônia',rr:'Roraima',sc:'Santa Catarina',sp:'São Paulo',se:'Sergipe',to:'Tocantins',zz:'Exterior'};
Object.entries(collectionStates).forEach(([value,label])=>$('audit-uf').append(new Option(label,value)));
let filterVersion=0;
async function loadCollectionCities(){
 const current=++filterVersion,state=$('audit-uf').value,city=$('audit-city');
 city.replaceChildren(new Option(state?'Carregando municípios…':'Selecione a UF primeiro',''));city.disabled=true;$('audit-filter-retry').hidden=true;$('audit-filter-status').textContent='';controls();
 if(!state)return;
 try{const data=await api(`/api/sections?uf=${state}`);if(current!==filterVersion)return;
 city.replaceChildren(new Option('Selecione o município',''));data.cities.sort((a,b)=>a.nm.localeCompare(b.nm,'pt-BR')).forEach(c=>city.append(new Option(c.nm,c.cd)));city.disabled=false;
 }catch(error){if(current!==filterVersion)return;city.replaceChildren(new Option('Não foi possível carregar',''));$('audit-filter-status').textContent=error.message;$('audit-filter-retry').hidden=false;}
 finally{if(current===filterVersion)controls();}
}
$('audit-uf').addEventListener('change',loadCollectionCities);
$('audit-filter-retry').onclick=loadCollectionCities;
let listLimit=25,listOptionsKey='';
Object.entries(collectionStates).forEach(([value,label])=>$('list-uf').append(new Option(`${value.toUpperCase()} · ${label}`,value)));
function renderMunicipalityList(){
  const state=$('list-uf').value;
  const available=(overview?.reports||[]).filter(r=>!state||r.uf===state).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')||a.uf.localeCompare(b.uf));
  const optionsKey=JSON.stringify(available.map(r=>[r.uf,r.city,r.name]));
  if(optionsKey!==listOptionsKey){
    const selected=$('list-city').value;
    $('list-city').replaceChildren(new Option('Todos os municípios',''),...available.map(r=>new Option(`${r.name} / ${r.uf.toUpperCase()}`,`${r.uf}/${r.city}`)));
    if(available.some(r=>`${r.uf}/${r.city}`===selected))$('list-city').value=selected;
    listOptionsKey=optionsKey;
  }
  const city=$('list-city').value;
  const result=$('list-result').value;
  const matches=available.filter(r=>(!city||`${r.uf}/${r.city}`===city)&&(!result||(r.state==='running'?'running':r.comparison.status)===result));
  const visible=matches.slice(0,listLimit);
  $('list-status').textContent=matches.length?`${fmt(matches.length)} ${matches.length===1?'município encontrado':'municípios encontrados'} · mostrando ${fmt(visible.length)}.`:'Nenhuma contagem encontrada para os filtros selecionados.';
  $('list-rows').replaceChildren(...visible.map(r=>{
    const row=el('tr'),status=el('td'),action=el('td');
    status.append(el('span',r.state==='running'?'Contagem em andamento':r.comparison.label,`status ${r.state==='running'?'running':r.comparison.status}`));
    const button=el('button','Conferir contagem','secondary');button.setAttribute('aria-label',`Conferir ${r.name} / ${r.uf.toUpperCase()}`);
    button.onclick=async()=>{selectedId=r.id;await detail();$('audit-detail').scrollIntoView({behavior:'smooth',block:'start'});};action.append(button);
    row.append(el('td',r.uf.toUpperCase()),el('td',r.name),el('td',`${fmt(r.counted)} de ${fmt(r.expected)}`),el('td',fmt(r.totals.votes)),status,action);return row;
  }));
  $('list-more').hidden=matches.length<=listLimit;
}
$('list-uf').onchange=()=>{$('list-city').value='';listLimit=25;renderMunicipalityList();};
$('list-city').onchange=()=>{listLimit=25;renderMunicipalityList();};
$('list-result').onchange=()=>{listLimit=25;renderMunicipalityList();};
$('list-clear').onclick=()=>{$('list-uf').value='';$('list-city').value='';$('list-result').value='';listLimit=25;renderMunicipalityList();};
$('list-more').onclick=()=>{listLimit+=25;renderMunicipalityList();};
function renderStateProgress(d){
  const counts=new Map();
  for(const r of d.reports)counts.set(r.uf,(counts.get(r.uf)||0)+r.counted);
  $('state-progress-rows').replaceChildren(...Object.entries(collectionStates).map(([uf,name])=>{
    const count=counts.get(uf)||0,expected=d.coverage?.byUf?.[uf],row=el('tr'),progressCell=el('td'),actions=el('td');
    if(Number.isSafeInteger(expected)&&expected>0){
      progressCell.append(el('span',`${new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(count/expected*100)}%`));
      const bar=el('progress');bar.max=expected;bar.value=count;bar.setAttribute('aria-label',`Progresso de ${name}`);progressCell.append(bar);
    }else progressCell.textContent=d.coverage?.state==='unavailable'?'Total indisponível':'Carregando total…';
    const button=el('button','Ver municípios','secondary');button.setAttribute('aria-label',`Ver municípios de ${name}`);
    button.onclick=()=>{$('list-uf').value=uf;$('list-city').value='';$('list-result').value='';listLimit=25;renderMunicipalityList();$('municipality-list').open=true;$('municipality-list').scrollIntoView({behavior:'smooth',block:'start'});};actions.append(button);
    row.append(el('td',`${uf.toUpperCase()} · ${name}`),progressCell,el('td',fmt(count)),el('td',expected===undefined?'—':fmt(expected)),actions);return row;
  }));
}
const paceSamples=[];
function renderEstimate(d){
  const node=$('own-eta'),expected=d.coverage?.expected,now=Date.now();
  node.title='Projeção para atingir o total de BUs esperados, usando o aumento da nossa base nos últimos 10 minutos observados nesta página. Inclui intervalos entre municípios; pode variar com erros e pausas.';
  if(expected&&d.counted>=expected){node.textContent='Todos os BUs esperados contabilizados';paceSamples.length=0;return;}
  if(d.campaign?.state!=='running'||d.campaign.scope!=='br'){
    paceSamples.length=0;node.textContent='Estimativa nacional disponível durante a coleta de Brasil e exterior';return;
  }
  if(paceSamples.length&&d.counted<paceSamples.at(-1).count)paceSamples.length=0;
  paceSamples.push({time:now,count:d.counted});
  while(paceSamples.length>1&&paceSamples[0].time<now-600000)paceSamples.shift();
  const first=paceSamples[0],elapsed=(now-first.time)/1000,gained=d.counted-first.count;
  if(!expected){node.textContent='Estimativa aguardando o total esperado';return;}
  if(elapsed<30){node.textContent='Calculando ritmo de coleta…';return;}
  if(gained<=0){node.textContent='Estimativa indisponível: sem avanço recente';return;}
  const lastAdvance=paceSamples.findLastIndex((s,i)=>i>0&&s.count>paceSamples[i-1].count);
  if(lastAdvance<0||now-paceSamples[lastAdvance].time>60000){node.textContent='Estimativa aguardando novos BUs';return;}
  const minutes=Math.ceil((expected-d.counted)/(gained/elapsed)/60);
  const days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),mins=minutes%60;
  const duration=[days?`${days} d`:'',hours?`${hours} h`:'',mins?`${mins} min`:''].filter(Boolean).join(' ')||'menos de 1 min';
  node.textContent=`Tempo restante estimado: ${duration}`;
  node.title+=` Ritmo observado: ${fmt(Math.round(gained/elapsed*60))} BUs/min em ${Math.round(elapsed)} segundos. Não garante conclusão de seções com erros.`;
}
function render(){
  const d=overview;
  renderEstimate(d);
  renderStateProgress(d);
  const expected=d.coverage?.expected;
  $('own-percent').textContent=expected?`${new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(d.counted/expected*100)}%`:'—';
  $('own-percent-detail').textContent=expected?`${fmt(d.counted)} de ${fmt(expected)} BUs esperados · Brasil e exterior`:d.coverage?.state==='unavailable'?'Total esperado indisponível; aguardando nova consulta.':'Calculando total de seções principais…';
  $('own-count').textContent=fmt(d.counted);$('own-votes').textContent=fmt(d.totals.votes);$('own-cities').textContent=fmt(d.municipalities);$('own-flags').textContent=fmt(d.discrepancies);
  const candidateNames=new Map(d.reports.flatMap(r=>(r.official?.candidates||[]).map(c=>[c.number,c.name])));
  const nominalTotal=Object.values(d.totals.candidates).reduce((sum,v)=>sum+v,0);
  $('own-candidates').replaceChildren(...Object.entries(d.totals.candidates).sort((a,b)=>b[1]-a[1]).map(([n,v])=>{const row=el('tr');row.append(el('td',candidateNames.has(n)?`${candidateNames.get(n)} · ${n}`:`Número ${n} · não listado no resultado consultado`),el('td',fmt(v)),el('td',nominalTotal>0?new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2}).format(v/nominalTotal):'—'));return row;}));
  $('own-other').textContent=`Percentuais sobre os ${fmt(nominalTotal)} votos nominais da nossa base parcial, sem brancos e nulos. Brancos: ${fmt(d.totals.blank)} · Nulos: ${fmt(d.totals.null)} · Cobertura parcial; inclui municípios cuja comparação ainda está pendente.`;
  renderMunicipalityList();
  const active=d.reports.find(r=>r.id===d.activeId);
  $('audit-progress').hidden=!active;$('audit-progress').max=active?.expected||1;$('audit-progress').value=active?.processed||0;
  const batch=d.campaign;
  $('audit-status').textContent=active?`${active.name}: ${active.processed}/${active.expected} seções processadas, ${active.issueCount ?? active.issues?.length ?? 0} pendências.${active.mode==='retry'?` Retry: ${active.attemptProcessed||0}/${active.attemptTotal??'…'} tentativas; ${active.preserved} BUs preservados.`:''}`:batch?.state==='running'?'Preparando a próxima contagem…':'Contagens salvas no servidor. Uma nova contagem substitui a anterior no acumulado, sem duplicar votos.';
  if(batch)$('audit-status').textContent+=` Lote ${batch.scope.toUpperCase()}: ${batch.completed}/${batch.total} municípios concluídos · ${({running:'em andamento',paused:'pausado',failed:'interrompido por erro',completed:'concluído'})[batch.state]}. ${batch.error||''}`;
  if(d.retryBatch)$('audit-status').textContent+=` Retry dos erros: ${d.retryBatch.completed}/${d.retryBatch.total} municípios · ${d.retryBatch.state} · ${d.retryBatch.remainingErrors} erros remanescentes.${d.retryBatch.error?' '+d.retryBatch.error:''}`;
  controls();
  timeline.update(d);
}
async function detail(){
  const id=selectedId;if(!id)return;
  try{
    const r=await api(`/api/audit?id=${encodeURIComponent(id)}`);if(selectedId!==id)return;
    detailVersion=r.updatedAt;const box=$('audit-detail');const opened=box.dataset.report===id?[...box.querySelectorAll('details[open]')].map(panelKey):[];const shownBefore=box.dataset.report===id?box.querySelectorAll('.evidence details').length:0;box.dataset.report=id;box.hidden=false;const heading=el('div',undefined,'detail-head');heading.append(el('h3',`${r.name} / ${r.uf.toUpperCase()}`),el('span',r.comparison.label,`status ${r.comparison.status}`));
    box.replaceChildren(heading,el('p',`${r.counted}/${r.expected} BUs contabilizados · ${r.aggregated} seções agregadas incluídas nas principais`,'intro'));
    const timing=el('button','Ver linha do tempo deste município','secondary');timing.onclick=()=>{timeline.select(r.id);$('timeline-disclosure').open=true;$('linha-temporal').scrollIntoView({behavior:'smooth'});};box.append(timing);
    if(r.parentId)box.append(el('p',`Retry seletivo · ${r.preserved} BUs preservados · ${r.attemptProcessed||0}/${r.attemptTotal??'…'} tentativas nesta execução`,'metadata'),link('Relatório anterior ↗',`/api/audit?id=${r.parentId}`));
    if(r.comparison.reasons.length){const ul=el('ul');r.comparison.reasons.forEach(reason=>ul.append(el('li',reason)));box.append(ul);}
    const diagnostics=r.comparison.diagnostics;
    if(diagnostics){
      const panel=el('details',undefined,'comparison-diagnostics');panel.open=false;
      panel.append(el('summary',`Regras da comparação: ${diagnostics.checks.filter(c=>!c.pass).length} bloqueios / ${diagnostics.checks.length} verificações`));
      panel.append(el('p','“Exigido” descreve a regra desta versão do nosso comparador. Um bloqueio não é uma discrepância numérica. Campos ausentes não são tratados como zero.','metadata'));
      if(r.comparison.explanationOrigin)panel.append(el('p',r.comparison.explanationOrigin,'metadata'));
      const wrap=el('div',undefined,'table-wrap'),table=el('table'),head=el('tr');
      ['Verificação / campo','Valor encontrado','Exigido','Resultado / próximo passo','Evidência'].forEach(t=>head.append(el('th',t)));const thead=el('thead');thead.append(head);table.append(thead);const body=el('tbody');
      for(const check of diagnostics.checks){const row=el('tr'),source=el('td');
        row.append(el('td',`${check.label} · ${check.field}`),el('td',check.present?JSON.stringify(check.actual):'AUSENTE'),el('td',JSON.stringify(check.expected)),el('td',`${check.pass?'Atendida':'Bloqueia'} · ${check.action}`));
        if(check.source==='official'&&r.official?.sha256)source.append(link('JSON municipal usado',`/api/original?sha256=${r.official.sha256}&format=json`));
        else if(check.source==='snapshots'){for(const [label,hash] of [['Resultado antes',r.snapshots?.before],['Resultado depois',r.snapshots?.after],['Catálogo antes',r.catalog?.sha256],['Catálogo depois',r.snapshots?.catalogAfter]])if(hash)source.append(link(label,`/api/original?sha256=${hash}&format=json`),el('br'));}
        else source.append(link('Relatório desta contagem',`/api/audit?id=${r.id}`));row.append(source);body.append(row);
      }table.append(body);wrap.append(table);panel.append(wrap,link('Dicionário oficial dos campos — EA20 ↗',diagnostics.specification));
      const raw=el('details');raw.append(el('summary','Valores brutos de votos e seções do resultado usado'),el('pre',JSON.stringify({v:diagnostics.rawVotes,s:diagnostics.rawSections},null,2)));panel.append(raw);
      if(r.snapshots)panel.append(el('p',`Mesma versão nas seções preservadas pelo retry: ${r.snapshots.retainedStable===undefined?'não registrado':r.snapshots.retainedStable?'sim':'não'}. SHA-256 do resultado anterior: ${r.snapshots.before}; posterior: ${r.snapshots.after}.`,'metadata'));
      box.append(panel);
    }
    if(r.comparison.evidenceError)box.append(el('p',r.comparison.evidenceError,'error'));
    if(r.comparison.reconciliation){
      const n=r.comparison.reconciliation,panel=el('section',undefined,'comparison-diagnostics');
      panel.append(el('h3','Reconciliação dos nulos'),el('p',n.explanation),el('p',`Reconstruído dos BUs: ${fmt(n.ordinary)} nulos + ${fmt(n.inferredTechnical)} nominais fora da lista = ${fmt(n.total)}. Publicado pelo TSE: vn ${fmt(n.published.ordinary)} + vnt ${fmt(n.published.technical)} = tvn ${fmt(n.published.total)}.`));
      for(const candidate of n.unlisted){const item=el('details');item.open=false;item.append(el('summary',`Número ${candidate.number}: ${fmt(candidate.votes)} votos nominais fora da lista municipal`));
        for(const b of candidate.sections)item.append(el('p',`Zona ${b.zone} / seção ${b.section}: ${fmt(b.votes)} voto(s)`),link('BU que contém esses votos',`/api/original?sha256=${b.sha256}&format=dat`));
        if(!candidate.sections.length)item.append(el('p','Vínculo por seção indisponível neste relatório.'));panel.append(item);
      }box.append(panel);
    }
    if(r.comparison.rows.length){const wrap=el('div',undefined,'table-wrap'),table=el('table'),head=el('tr');['Candidato / categoria','Nossa soma','TSE municipal','Diferença'].forEach(t=>head.append(el('th',t)));const thead=el('thead');thead.append(head);table.append(thead);const body=el('tbody');for(const row of r.comparison.rows){const tr=el('tr');tr.append(el('td',`${/^\d/.test(row.key)?row.key+' · ':''}${row.label}`),el('td',fmt(row.own)),el('td',fmt(row.official)),el('td',`${row.delta>0?'+':''}${fmt(row.delta)}`,row.delta?'delta':''));body.append(tr);}table.append(body);wrap.append(table);box.append(wrap);}
    box.append(el('p',`Votos lidos: ${fmt(r.totals.votes)} · Brancos: ${fmt(r.totals.blank)} · Nulos: ${fmt(r.totals.null)}`,'metadata'));
    if(r.official)box.append(el('p',`Resultado TSE gerado em ${r.official.generatedAt} · Coletado em ${new Date(r.official.fetchedAt).toLocaleString('pt-BR')}`,'metadata'),link('Cópia do resultado usado na comparação',`/api/original?sha256=${r.official.sha256}&format=json`),el('span',' · '),link('Resultado municipal no TSE ↗',r.official.source));
    box.append(el('p','Assinaturas digitais não verificadas. A comparação é dos valores nas cópias coletadas.','metadata'),link('Abrir relatório completo (JSON) ↗',`/api/audit?id=${r.id}`));
    if(r.issues.length){const issues=el('details');issues.open=false;issues.append(el('summary',`${r.issues.length} pendências de coleta ou validação`));const ul=el('ul');r.issues.forEach(i=>{const li=el('li',`${i.zone?'Zona '+i.zone+' / seção '+i.section+': ':''}${i.code==='TIMEOUT'?'Tempo limite excedido. ':''}${i.message}`);if(i.zone&&i.section&&r.state!=='running')li.append(retryButton(r,i));ul.append(li);});issues.append(ul);if(r.state!=='running')issues.append(retryButton(r));box.append(issues);}
    const evidence=el('div',undefined,'evidence');evidence.append(el('h3','BUs que sustentam esta soma'));
    let shown=0;const more=el('button','Mostrar mais boletins','secondary');function addRecords(){for(const b of r.records.slice(shown,shown+30)){const item=el('details');item.append(el('summary',`Zona ${b.zone} · Seção ${b.section} · ${fmt(b.votes)} votos`),el('p',`Votos nominais: ${Object.entries(b.candidates).map(([n,v])=>`${n}: ${fmt(v)}`).join(' · ')}. Brancos: ${b.blank}. Nulos: ${b.null}.`),link('Baixar cópia usada na soma',`/api/original?sha256=${b.sha256}`),link('Original no TSE ↗',b.source),el('p',`SHA-256: ${b.sha256}`,'metadata'));evidence.insertBefore(item,more);}shown+=30;more.hidden=shown>=r.records.length;}
    more.onclick=addRecords;evidence.append(more);addRecords();while(shown<Math.min(shownBefore,r.records.length))addRecords();box.append(evidence);
    const clocks=el('details');clocks.append(el('summary','Horários de cada BU: recebimento, download e contagem'));
    const wrap=el('div',undefined,'table-wrap'),table=el('table'),thead=el('thead'),head=el('tr');['Zona / seção','Recebimento TSE¹','Catálogo gerado¹','Download local²','Contabilizado aqui²'].forEach(t=>head.append(el('th',t)));thead.append(head);table.append(thead);const tbody=el('tbody');
    const localTime=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Não registrado (legado)';
    for(const b of r.records){const row=el('tr');[`${b.zone}/${b.section}`,b.receivedAt||'Não disponível',b.auxiliaryGeneratedAt||'Não disponível',localTime(b.fetchedAt),localTime(b.countedAt)].forEach(t=>row.append(el('td',t)));tbody.append(row);}table.append(tbody);wrap.append(table);clocks.append(wrap,el('p','¹ Horário civil informado no EA18, sem fuso declarado. Geração do catálogo não é totalização. ² Horário de Brasília. Download não substitui a hora de contagem.','metadata'));box.append(clocks);
    if(r.events?.length){const log=el('details');log.append(el('summary','Histórico desta tentativa (horário de Brasília)'));const list=el('ul');const labels={started:'Coleta iniciada','retry-started':'Retry iniciado','section-started':'Tentativa de leitura',counted:'BU contabilizado','section-error':'Erro na seção',failed:'Falha da execução',paused:'Coleta pausada',completed:'Execução concluída'};for(const e of r.events)list.append(el('li',`${localTime(e.at)} · ${labels[e.type]||e.type}${e.section?' · '+e.zone+'/'+e.section:''}${e.message?' · '+e.message:''}`));log.append(list);box.append(log);}
    const technical=el('details',undefined,'disclosure');technical.append(el('summary','Entender o resultado e consultar evidências'));
    for(const child of [...box.children])if(child!==heading&&!child.classList.contains('intro')&&!child.classList.contains('table-wrap'))technical.append(child);
    box.append(technical);
    const close=el('button','Fechar município','secondary');close.onclick=()=>{box.hidden=true;selectedId=null;detailVersion=null;};heading.append(close);
    for(const node of box.querySelectorAll('details'))if(opened.includes(panelKey(node)))node.open=true;
  }catch(e){$('audit-status').textContent=e.message;}
}
async function refresh(){
  if(loading)return;loading=true;clearTimeout(timer);
  try{const update=await api('/api/audits'+(overview?.cursor?'?cursor='+encodeURIComponent(overview.cursor):''));overview=mergeOverview(overview,update);render();if(selectedId&&overview.reports.find(r=>r.id===selectedId)?.updatedAt!==detailVersion)await detail();}
  catch(e){$('audit-status').textContent=`Não foi possível atualizar as contagens: ${e.message}`;}
  finally{loading=false;timer=setTimeout(refresh,overview?.activeId||(overview?.campaign?.state==='running'||overview?.retryBatch?.state==='running')?2500:15000);}
}
async function mutate(url){if(!isAdmin)return;action=true;controls();try{const result=await api(url,'POST');if(result.id)selectedId=result.id;await refresh();await detail();}catch(e){$('audit-status').textContent=e.message;}finally{action=false;controls();}}
$('audit-start').onclick=()=>{const scope=$('audit-scope').value;mutate(scope==='city'?`/api/audit/start?uf=${$('audit-uf').value}&city=${$('audit-city').value}`:`/api/audit/batch?scope=${scope==='br'?'br':$('audit-uf').value}`);};
$('audit-retry-all').onclick=()=>mutate('/api/audit/retry-all');
$('audit-stop').onclick=()=>mutate('/api/audit/stop');
$('audit-resume').onclick=()=>mutate('/api/audit/batch?resume=true');

refresh();

document.addEventListener('admin-change',()=>{isAdmin=document.body.classList.contains('is-admin');controls();});
isAdmin=document.body.classList.contains('is-admin');
controls();
