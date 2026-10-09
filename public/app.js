const $ = id => document.getElementById(id);
const number = n => new Intl.NumberFormat('pt-BR').format(n);
const names = {ac:'Acre',al:'Alagoas',ap:'Amapá',am:'Amazonas',ba:'Bahia',ce:'Ceará',df:'Distrito Federal',es:'Espírito Santo',go:'Goiás',ma:'Maranhão',mt:'Mato Grosso',ms:'Mato Grosso do Sul',mg:'Minas Gerais',pa:'Pará',pb:'Paraíba',pr:'Paraná',pe:'Pernambuco',pi:'Piauí',rj:'Rio de Janeiro',rn:'Rio Grande do Norte',rs:'Rio Grande do Sul',ro:'Rondônia',rr:'Roraima',sc:'Santa Catarina',sp:'São Paulo',se:'Sergipe',to:'Tocantins',zz:'Exterior'};
function el(tag,text,className) { const e = document.createElement(tag); if(text!==undefined)e.textContent=text; if(className)e.className=className; return e; }
function link(text,url) { const a=el('a',text);a.href=url;a.target='_blank';a.rel='noopener';return a; }
function decodedView(data){
  const d=data.decoded,view=el('div',undefined,'decoded-bu');
  view.append(el('h4','BU decodificado · Presidente · 1º turno de 2026'));
  const issued=d.issuedAt.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/, '$3/$2/$1 $4:$5:$6');
  view.append(el('p',`UF: ${d.uf.toUpperCase()} · Município (código TSE): ${d.city} · Zona: ${d.zone} · Seção: ${d.section}`),el('p',`Emissão no BU: ${issued} · Horário conforme o arquivo`));
  const stats=el('div',undefined,'stats bu-stats');
  for(const [label,value] of [['Eleitores aptos',d.eligibleVoters],['Comparecimento',d.turnout],['Votos em branco',d.blank],['Votos nulos',d.null]]){const item=el('article');item.append(el('span',label),el('strong',number(value)));stats.append(item);}view.append(stats);
  const wrap=el('div',undefined,'table-wrap'),table=el('table'),head=el('thead'),row=el('tr');
  table.append(el('caption','Votos por número de candidato registrados neste BU'));
  ['Número do candidato','Votos'].forEach(label=>{const th=el('th',label);th.scope='col';row.append(th);});head.append(row);table.append(head);
  const body=el('tbody');for(const [candidate,votes] of Object.entries(d.candidates).sort((a,b)=>b[1]-a[1])){const tr=el('tr');tr.append(el('td',candidate),el('td',number(votes)));body.append(tr);}table.append(body);
  const foot=el('tfoot'),total=el('tr');total.append(el('th','Total, incluindo brancos e nulos'),el('td',number(d.votes)));foot.append(total);table.append(foot);wrap.append(table);view.append(wrap);
  view.append(el('p','Identificação e soma conferidas pelo decodificador. Assinatura digital não verificada. Esta consulta exibe o cargo Presidente e não adiciona votos à contagem própria.','metadata'),link('Baixar a cópia exata decodificada ↗',`/api/original?sha256=${data.sha256}&format=dat`),el('p',`SHA-256 do BU: ${data.sha256}`,'metadata'));
  const other=el('a','Ver todos os cargos deste BU →','secondary');other.href=`/cargos?uf=${d.uf}&city=${d.city}&zone=${d.zone}&section=${d.section}&sha256=${data.sha256}`;view.append(other);
  return view;
}
async function showDecoded(card,file,params,current){
  const output=el('div');output.setAttribute('aria-live','polite');card.append(output);
  async function load(){
    output.replaceChildren(el('p','Baixando e decodificando este BU…'));
    try{const query=new URLSearchParams(params);query.set('file',file.url);const data=await api(`/api/bulletin-decoded?${query}`);if(version!==current)return;output.replaceChildren(decodedView(data));}
    catch(error){if(version!==current)return;const retry=el('button','Tentar decodificar novamente','secondary admin-only');retry.type='button';retry.onclick=load;output.replaceChildren(el('p',`Não foi possível exibir os dados: ${error.message}`,'error'),retry);}
  }
  await load();
}
async function api(path) { const response=await fetch(path);const data=await response.json();if(!response.ok)throw new Error(data.error);return data; }
async function results(){
  $('refresh').disabled=true;$('result-status').textContent='Consultando a fonte…';$('result-status').className='';
  try{
    const d=await api('/api/results');
    for(const key of ['sections','votes','blank','null'])$(key).textContent=number(d[key]);
    $('coverage').textContent=`de ${number(d.expectedSections)} seções informadas pelo TSE`;
    $('candidates').replaceChildren(...d.candidates.map(c=>{const row=el('tr');const title=el('td');title.append(el('strong',c.name),el('small',`${c.party} · ${c.voteStatus}`));row.append(title,el('td',c.number),el('td',number(c.votes)),el('td',`${c.percent}%`));return row;}));
    $('result-meta').replaceChildren(el('span',`Gerado pelo TSE: ${d.generatedAt} · Coletado: ${new Date(d.fetchedAt).toLocaleString('pt-BR')} (horário local) · `),link('Abrir JSON original ↗',d.source));
    $('result-status').textContent=`${d.final?'Totalização final informada pelo TSE.':'Arquivo ainda não sinalizado como totalização final pelo TSE.'} Consultas reutilizam dados por até 5 minutos.`;
    $('result-content').hidden=false;
  }catch(e){$('result-status').textContent=`Não foi possível atualizar: ${e.message} ${$('result-content').hidden?'':'Os números abaixo são da consulta anterior.'}`;$('result-status').className='error';}
  finally{$('refresh').disabled=false;}
}
$('refresh').addEventListener('click',results);
Object.entries(names).forEach(([code,name])=>$('uf').append(new Option(name,code)));
let cities=[],version=0,selectedBulletinSource=null;
function reset(id,label){$(id).replaceChildren(new Option(label,''));$(id).disabled=true;}
function fill(id,items,label){reset(id,label);for(const [value,text] of items)$(id).append(new Option(text,value));$(id).disabled=false;}
function clearBulletin(){version++;selectedBulletinSource=null;$('search').disabled=!$('section').value;$('bulletin').replaceChildren(el('h3','Consulte uma seção'),el('p','Selecione a localidade e clique em Consultar boletim.'));}
window.addEventListener('open-bulletin',async({detail:d})=>{
  $('uf').value=d.uf;reset('city','Carregando municípios…');reset('zone','Selecione o município');reset('section','Selecione a zona');clearBulletin();
  const current=version;location.hash='boletins';$('boletins').scrollIntoView({behavior:'smooth'});$('bulletin').replaceChildren(el('p','Abrindo o BU selecionado no gráfico…'));
  try{
    const data=await api(`/api/sections?uf=${encodeURIComponent(d.uf)}`);if(current!==version)return;cities=data.cities;
    fill('city',cities.map(c=>[c.cd,c.nm]).sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')),'Selecione o município');
    const city=cities.find(c=>c.cd===d.city),zone=city?.zon.find(z=>z.cd===d.zone);
    if(!zone?.sec.some(s=>s.ns===d.section))throw new Error('A seção selecionada não consta no catálogo atual.');
    $('city').value=d.city;fill('zone',city.zon.map(z=>[z.cd,z.cd]),'Selecione a zona');$('zone').value=d.zone;
    fill('section',zone.sec.map(s=>[s.ns,`${s.ns}${s.nsp?' · agregada à '+s.nsp:''}`]),'Selecione a seção');$('section').value=d.section;
    selectedBulletinSource=d.source;$('search').disabled=false;$('search-form').requestSubmit();
  }catch(error){if(current===version)$('bulletin').replaceChildren(el('p',error.message,'error'));}
});
$('uf').addEventListener('change',async()=>{
  reset('city','Carregando municípios…');reset('zone','Selecione o município');reset('section','Selecione a zona');clearBulletin();cities=[];
  const current=version;
  if(!$('uf').value){reset('city','Selecione a UF primeiro');return;}
  try{const d=await api(`/api/sections?uf=${$('uf').value}`);if(version!==current)return;cities=d.cities;fill('city',cities.map(c=>[c.cd,c.nm]).sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')),'Selecione o município');}
  catch(e){if(version!==current)return;reset('city','Consulta indisponível');$('bulletin').replaceChildren(el('p',e.message,'error'));}
});
$('city').addEventListener('change',()=>{reset('zone','Selecione o município');reset('section','Selecione a zona');clearBulletin();const c=cities.find(c=>c.cd===$('city').value);if(c)fill('zone',c.zon.map(z=>[z.cd,z.cd]),'Selecione a zona');});
$('zone').addEventListener('change',()=>{reset('section','Selecione a zona');clearBulletin();const z=cities.find(c=>c.cd===$('city').value)?.zon.find(z=>z.cd===$('zone').value);if(z)fill('section',z.sec.map(s=>[s.ns,`${s.ns}${s.nsp?' · agregada à '+s.nsp:''}`]),'Selecione a seção');});
$('section').addEventListener('change',clearBulletin);
$('search-form').addEventListener('submit',async event=>{
  event.preventDefault();const current=++version;$('search').disabled=true;$('bulletin').replaceChildren(el('p','Consultando os arquivos da seção…'));
  const params=new URLSearchParams({uf:$('uf').value,city:$('city').value,zone:$('zone').value,section:$('section').value});
  const requestedSource=selectedBulletinSource;selectedBulletinSource=null;
  try{
    const d=await api(`/api/bulletin?${params}`);if(version!==current)return;
    const title=el('h3',`${names[params.get('uf')]} · Zona ${params.get('zone')} · Seção ${params.get('section')}`);
    $('bulletin').replaceChildren(title);
    if(d.aggregateTo){$('bulletin').append(el('p',`Esta seção foi agregada à seção ${d.aggregateTo}. Seus votos estão no boletim da seção principal.`));const button=el('button','Consultar seção principal','secondary');button.type='button';button.onclick=()=>{$('section').value=d.aggregateTo;$('search-form').requestSubmit();};$('bulletin').append(button);return;}
    $('bulletin').append(el('p',`Situação informada pelo TSE: ${d.status}`));
    if(!d.files.length)$('bulletin').append(el('p','Nenhum BU disponível nesta consulta.'));
    const files=requestedSource?d.files.filter(file=>file.url===requestedSource):d.files;
    if(requestedSource&&!files.length)$('bulletin').append(el('p','O BU escolhido no gráfico não consta mais no catálogo atual. A cópia usada na contagem continua disponível no gráfico. Consulte a seção novamente para ver os arquivos atuais.','error'));
    if(requestedSource&&files.length)$('bulletin').append(el('p','BU selecionado na linha do tempo.','metadata'));
    for(const file of files){const card=el('article',undefined,'file-card');card.append(link(`Baixar BU original ↗ · ${file.name}`,file.url),el('p',`Situação do arquivo: ${file.status} · Recebido pelo TSE: ${file.receivedAt}`));$('bulletin').append(card);showDecoded(card,file,params,current);}
    if(d.source)$('bulletin').append(link('Consultar catálogo de arquivos da seção ↗',d.source),el('p',`Coletado em ${new Date(d.fetchedAt).toLocaleString('pt-BR')} · SHA-256 do catálogo: ${d.sha256}`,'metadata'));
  }catch(e){if(version===current)$('bulletin').replaceChildren(el('p',e.message,'error'));}
  finally{if(version===current)$('search').disabled=false;}
});
results();
