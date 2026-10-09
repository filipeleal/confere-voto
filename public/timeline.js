export function mergeOverview(previous, update) {
  const reports = new Map((update.reset ? [] : previous?.reports || []).map(r=>[`${r.uf}/${r.city}`,r]));
  for (const report of update.reports) reports.set(`${report.uf}/${report.city}`,report);
  return {...update,reports:[...reports.values()]};
}

export function selectedTimelineRange(buckets,x1,x2){
  if(!buckets.length)return null;
  const index=x=>Math.min(buckets.length-1,Math.max(0,Math.floor((x-65)/900*buckets.length)));
  return {from:buckets[index(Math.min(x1,x2))].at,to:buckets[index(Math.max(x1,x2))].until};
}
export function encodeTimelineCSV(rows){
  return '\uFEFF'+rows.map(row=>row.map(value=>{
    let text=String(value??'');
    if(typeof value==='string'&&/^[\s]*[=+@-]/.test(text))text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  }).join(',')).join('\r\n')+'\r\n';
}
export function cumulativeCandidates(buckets){
  const totals={};return buckets.map(b=>{for(const [number,votes] of Object.entries(b.candidates||{}))totals[number]=(totals[number]||0)+votes;return {...b,accumulated:{...totals}};});
}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
const fmt=n=>new Intl.NumberFormat('pt-BR').format(n);
const clock=value=>value?`${value.slice(8,10)}/${value.slice(5,7)} ${value.slice(11,19)}`:'—';
export function createTimeline(root,options={}){
  const form=el('form',undefined,'timeline-controls');
  function select(name,label,options){const wrap=el('label',label),node=el('select');node.name=name;for(const [value,text] of options)node.append(new Option(text,value));wrap.append(node);form.append(wrap);return node;}
  const region=select('region','Região',[['','Todas as regiões e exterior'],['norte','Norte'],['nordeste','Nordeste'],['centro-oeste','Centro-Oeste'],['sudeste','Sudeste'],['sul','Sul'],['exterior','Exterior']]);
  const state=select('uf','UF',[['','Todas as UFs']]);
  if(options.uf){region.parentElement.hidden=true;state.parentElement.hidden=true;}
  const scope=select('id','Amostra',[['','Todos os municípios na base']]);
  const basis=select('basis','Evento',[['received','Recebimento no TSE'],['auxiliary','Geração do catálogo'],['counted','Contabilização local'],['downloaded','Download local']]);
  if(options.office){for(const option of [...basis.options])if(option.value!=='received')option.remove();}
  const minutes=select('minutes','Agrupar por',[['5','5 minutos'],['15','15 minutos'],['30','30 minutos'],['60','1 hora']]);
  const chartType=select('chart','Tipo de gráfico',[['bar','Barras'],['line','Linhas']]);
  const metric=select('metric','Mostrar',[['bus','Quantidade de BUs'],['candidates','Votos por candidato'],['cumulative','Votos acumulados por candidato']]);
  const threshold=select('threshold','Destacar lacunas de',[['45','45 minutos ou mais'],['30','30 minutos ou mais'],['60','1 hora ou mais'],['90','90 minutos ou mais']]);
  function input(name,label,value){const wrap=el('label',label),node=el('input');node.type='datetime-local';node.name=name;node.value=value;wrap.append(node);form.append(wrap);return node;}
  const from=input('from','Início (incluído)','2026-10-04T19:00'),to=input('to','Fim (excluído)','2026-10-04T21:00');
  const submit=el('button','Aplicar período','primary');submit.type='submit';form.append(submit);
  const all=el('button','Todos os horários','secondary');all.type='button';all.onclick=()=>{from.value='';to.value='';load();};form.append(all);
  const preset=el('button','4/10 · 19h–21h','secondary');preset.type='button';preset.onclick=()=>{from.value='2026-10-04T19:00';to.value='2026-10-04T21:00';load();};form.append(preset);
  let csvSnapshot=null;
  const exportButton=el('button','Exportar CSV','secondary');exportButton.type='button';exportButton.disabled=true;form.append(exportButton);
  exportButton.onclick=()=>{if(!csvSnapshot)return;const url=URL.createObjectURL(new Blob([csvSnapshot.text],{type:'text/csv;charset=utf-8'}));const a=el('a');a.href=url;a.download=csvSnapshot.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);};
  const status=el('p','Carregando horários…','intro');status.setAttribute('role','status');const content=el('div');root.append(form,status,content);
  const regionUfs={norte:'ac ap am pa ro rr to',nordeste:'al ba ce ma pb pe pi rn se','centro-oeste':'df go mt ms',sudeste:'es mg rj sp',sul:'pr rs sc',exterior:'zz'};
  function updateStates(){const selected=state.value;const states=region.value?regionUfs[region.value].split(' '):Object.values(regionUfs).flatMap(value=>value.split(' ')).sort();state.replaceChildren(new Option('Todas as UFs',''),...states.map(uf=>new Option(uf==='zz'?'Exterior':uf.toUpperCase(),uf)));state.value=states.includes(selected)?selected:'';}
  updateStates();
  let reports=[];
  let scopeOptionsKey='';
  function updateScopes(){
    const selected=scope.value;
    const available=reports.filter(r=>(!region.value||regionUfs[region.value].split(' ').includes(r.uf))&&(!state.value||r.uf===state.value));
    const key=JSON.stringify(available.map(r=>[r.id,r.name,r.uf]));
    if(key===scopeOptionsKey)return;
    const locality=scope.selectedOptions[0]?.dataset.locality;
    scope.replaceChildren(new Option('Todos os municípios na base',''));
    available.forEach(r=>{const option=new Option(`${r.name} / ${r.uf.toUpperCase()}`,r.id);option.dataset.locality=`${r.uf}/${r.city}`;scope.append(option);});
    scope.value=available.find(r=>r.id===selected)?.id||available.find(r=>`${r.uf}/${r.city}`===locality)?.id||'';
    scopeOptionsKey=key;
  }
  const panelState=new Map();
  content.addEventListener('toggle',e=>{if(e.target.tagName==='DETAILS')panelState.set(e.target.querySelector('summary')?.textContent,e.target.open);},true);

  let periodSelected=false,buListLimit=50;
  let dragging=false;
  let sequence=0,signature=null,candidateNames=new Map(),candidateParties=new Map(),selectedBar=null,drillPath=[];
  const disclosure=root.closest('details');
  let refreshTimer, lastLoad=0, dirty=false, inFlight=false;
  function scheduleRefresh(){
    dirty=true;
    if(document.hidden || (disclosure&&!disclosure.open) || refreshTimer || inFlight)return;
    refreshTimer=setTimeout(()=>{refreshTimer=null;if(dirty)load();},Math.max(0,30000-(Date.now()-lastLoad)));
  }
  disclosure?.addEventListener('toggle',()=>{if(disclosure.open&&dirty)scheduleRefresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&dirty)scheduleRefresh();});
  async function load(){
    if(dragging){scheduleRefresh();return;}
    if(document.hidden || (disclosure&&!disclosure.open)){dirty=true;return;}
    clearTimeout(refreshTimer);refreshTimer=null;dirty=false;lastLoad=Date.now();inFlight=true;
    const seq=++sequence;submit.disabled=true;exportButton.disabled=true;status.textContent='Analisando os horários disponíveis…';
    const params=new URLSearchParams(new FormData(form));for(const [k,v] of [...params])if(!v)params.delete(k);
    if(options.uf)params.set('uf',options.uf());
    if(options.city&&options.city())params.set('city',options.city());
    const exportState=options.uf?options.uf().toUpperCase():state.selectedOptions[0].textContent,exportRegion=region.selectedOptions[0].textContent,exportScope=scope.selectedOptions[0].textContent;
    try{
      const response=await fetch(`${options.endpoint||'/api/timeline'}?${params}${options.office?'&office='+encodeURIComponent(options.office):''}`),data=await response.json();if(!response.ok)throw new Error(data.error);if(seq!==sequence||dragging)return;
      status.textContent=`${data.label} · ${data.clock}. ${fmt(data.selected)} eventos neste período, de ${fmt(data.known)} com horário conhecido. ${fmt(data.missing)} BUs sem esse horário. Amostra: ${fmt(data.totalRecords)} BUs / ${fmt(data.municipalities)} municípios.`;
      for(const panel of content.querySelectorAll('details'))panelState.set(panel.querySelector('summary')?.textContent,panel.open);
      content.replaceChildren();
      if(['received','auxiliary'].includes(data.basis))content.append(el('p','O recorte 19h–21h usa os valores de relógio do arquivo. Sem confirmação do fuso do EA18, não se presume equivalência exata com Brasília.','metadata'));
      const chosen=el('p','Arraste no gráfico para filtrar um período. Clique em uma barra ou ponto para explorar UF → município → zona → seção.','metadata');
      const drill=el('section',undefined,'timeline-drill');drill.hidden=true;
      const periodBucket={at:data.buckets[0]?.at,until:data.buckets.at(-1)?.until,count:data.selected,votes:data.buckets.reduce((sum,b)=>sum+b.votes,0),events:data.buckets.flatMap(b=>b.events||[]),wholePeriod:true};
      function explore(b,path=[]){
        selectedBar=b.wholePeriod?'period':b.at;drillPath=path;drill.hidden=false;drill.replaceChildren();
        chosen.textContent=`${clock(b.at)} até ${clock(b.until)} (fim excluído): ${fmt(b.count)} BUs de seções principais · ${fmt(b.votes)} votos.`;
        const fields=['uf','city','zone','section'];
        const events=(b.events||[]).filter(e=>path.every((value,i)=>e[fields[i]]===value));
        const nav=el('nav',undefined,'drill-breadcrumb');nav.setAttribute('aria-label','Navegação do intervalo');
        function crumb(label,next){const button=el('button',label,'secondary');button.type='button';button.onclick=()=>explore(b,next);nav.append(button);}
        if(periodSelected&&!b.wholePeriod){const back=el('button','Todos os BUs do período','secondary');back.type='button';back.onclick=()=>{buListLimit=50;explore(periodBucket);};nav.append(back);}
        crumb('Todas as UFs',[]);path.forEach((value,i)=>crumb(i===1?(events[0]?.cityName||value):i===0?value.toUpperCase():`${i===2?'Zona':'Seção'} ${value}`,path.slice(0,i+1)));drill.append(nav);
        drill.append(el('h3',`${fmt(events.length)} BUs · ${fmt(events.reduce((sum,e)=>sum+e.votes,0))} votos neste recorte`));
        if(!events.length){drill.append(el('p','Nenhum BU neste intervalo e localidade.'));return;}
        if(path.length===4){
          const e=events[0];drill.append(el('p',`${data.label}: ${clock(e.clock)} · ${data.clock}`));
          const open=el('button','Ver este BU em Documentos de origem','primary');open.type='button';open.onclick=()=>window.dispatchEvent(new CustomEvent('open-bulletin',{detail:{uf:e.uf,city:e.city,zone:e.zone,section:e.section,source:e.buSource}}));drill.append(open,el('br'));
          for(const [label,url] of [['Abrir BU original no TSE',e.buSource],['Baixar cópia coletada',e.sha256?`/api/original?sha256=${e.sha256}&format=dat`:null],['Consultar registro de recebimento',e.source]])if(url){const a=el('a',label);a.href=url;a.target='_blank';a.rel='noopener';drill.append(a,el('br'));}
          return;
        }
        const field=fields[path.length],groups=new Map();for(const e of events){const key=e[field];if(!groups.has(key))groups.set(key,{count:0,votes:0,label:field==='city'?`${e.cityName} (${key})`:field==='uf'?key.toUpperCase():key});const group=groups.get(key);group.count++;group.votes+=e.votes;}
        const wrap=el('div',undefined,'table-wrap'),table=el('table'),head=el('tr');['UF / município / zona / seção','BUs','Votos'].forEach(v=>head.append(el('th',v)));const thead=el('thead');thead.append(head);table.append(thead);const tbody=el('tbody');
        for(const [key,g] of [...groups].sort((a,b)=>a[1].label.localeCompare(b[1].label,'pt-BR'))){const row=el('tr'),cell=el('td'),button=el('button',`${g.label} →`,'secondary');button.type='button';button.onclick=()=>explore(b,[...path,key]);cell.append(button);row.append(cell,el('td',fmt(g.count)),el('td',fmt(g.votes)));tbody.append(row);}table.append(tbody);wrap.append(table);drill.append(wrap);
        const list=el('section');list.append(el('h4',`Boletins deste recorte (${fmt(events.length)})`));
        const listWrap=el('div',undefined,'table-wrap'),listTable=el('table'),listHead=el('thead'),listHeader=el('tr');
        ['UF','Município','Zona','Seção','Horário','Votos','BU'].forEach(label=>listHeader.append(el('th',label)));listHead.append(listHeader);listTable.append(listHead);
        const listBody=el('tbody');
        for(const e of events.slice(0,buListLimit)){const row=el('tr'),action=el('td'),open=el('button','Abrir BU','secondary');open.type='button';open.onclick=()=>window.dispatchEvent(new CustomEvent('open-bulletin',{detail:{uf:e.uf,city:e.city,zone:e.zone,section:e.section,source:e.buSource}}));action.append(open);[e.uf.toUpperCase(),e.cityName,e.zone,e.section,clock(e.clock),fmt(e.votes)].forEach(value=>row.append(el('td',value)));row.append(action);listBody.append(row);}
        listTable.append(listBody);listWrap.append(listTable);list.append(listWrap,el('p',`Mostrando ${fmt(Math.min(buListLimit,events.length))} de ${fmt(events.length)} BUs.`,'metadata'));
        if(events.length>buListLimit){const more=el('button','Mostrar mais BUs do recorte','secondary');more.type='button';more.onclick=()=>{buListLimit+=50;explore(b,path);};list.append(more);}drill.append(list);
        drill.append(el('p','Contamos um BU por seção principal na base coletada. Seções agregadas estão no BU principal; retransmissões não são contadas como novas urnas.','metadata'));
      }

      const cumulative=metric.value==='cumulative',byCandidate=metric.value!=='bus';
      if(cumulative)data.buckets=cumulativeCandidates(data.buckets);
      const values=b=>cumulative?b.accumulated:b.candidates;
      const candidateTotals=new Map();for(const b of data.buckets)for(const [n,v] of Object.entries(b.candidates||{}))candidateTotals.set(n,(candidateTotals.get(n)||0)+v);
      const numbers=[...candidateTotals.keys()].sort((a,b)=>candidateTotals.get(b)-candidateTotals.get(a)||Number(a)-Number(b));
      const leading=numbers.slice(0,5),others=numbers.slice(5);
      const partyColors={'PT':'#d71920','PL':'#005bbb','NOVO':'#e87500','AVANTE':'#e85d04','PSD':'#168447','MISSÃO':'#222222','UP':'#a81022','PSTU':'#b51b27','PCB':'#8f1820','PCO':'#851828','DC':'#1672ad','DEMOCRATA':'#54742a'};
      const colorFor=n=>n==='13'?'#d71920':n==='22'?'#005bbb':partyColors[candidateParties.get(n)]||'#687384';
      const series=byCandidate?leading.map(n=>({key:n,label:candidateNames.has(n)?`${candidateNames.get(n)} · ${candidateParties.get(n)||n}`:`Número ${n}`,color:colorFor(n),value:b=>values(b)?.[n]||0})):[{key:'bus',label:'BUs',color:'#084baf',value:b=>b.count}];
      if(byCandidate&&others.length)series.push({key:'others',label:'Outros',color:'#687384',value:b=>others.reduce((sum,n)=>sum+(values(b)?.[n]||0),0)});
      if(byCandidate){
        const legend=el('div',undefined,'timeline-legend');
        series.forEach(s=>{const item=el('span',s.label);const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 14 14');icon.setAttribute('width','14');icon.setAttribute('height','14');const dot=document.createElementNS(icon.namespaceURI,'circle');dot.setAttribute('cx','7');dot.setAttribute('cy','7');dot.setAttribute('r','6');dot.setAttribute('fill',s.color);icon.append(dot);item.prepend(icon);legend.append(item);});content.append(legend,el('p',`Cinco maiores somas de votos no período e na amostra selecionados; demais números em Outros. ${cumulative?'Acumulado desde o início do período selecionado até o fim de cada faixa; não inclui votos anteriores ao recorte. O clique detalha apenas os BUs da faixa.':'Valores por intervalo, sem acumular.'} Brancos e nulos ficam fora dessas séries.`,'metadata'));
        if(others.length){const details=el('details');details.append(el('summary','Quem está em Outros?'),el('p',others.map(n=>`${candidateNames.get(n)||'Número '+n}: ${fmt(candidateTotals.get(n))} votos`).join(' · ')));content.append(details);}
      }
      if(data.buckets.length){
        const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 1000 250');svg.setAttribute('class','timeline-chart');svg.setAttribute('role','group');svg.setAttribute('aria-label',`${cumulative?'Votos acumulados por candidato':byCandidate?'Votos por candidato':'Quantidade de BUs'} por ${data.minutes} minutos — ${chartType.value==='line'?'linhas':'barras'}`);
        let max=1;for(const b of data.buckets)for(const s of series)max=Math.max(max,s.value(b));const width=900/data.buckets.length;
        function text(x,y,value){const t=document.createElementNS(ns,'text');t.setAttribute('x',x);t.setAttribute('y',y);t.textContent=value;svg.append(t);}
        text(8,22,`${fmt(max)} ${byCandidate?'votos':'BUs'}`);text(8,188,'0');
        for(const [si,s] of series.entries()){
          if(chartType.value==='line'){const line=document.createElementNS(ns,'polyline');line.setAttribute('points',data.buckets.map((b,i)=>`${65+(i+.5)*width},${180-s.value(b)/max*150}`).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke',s.color);line.setAttribute('stroke-width','2');svg.append(line);}
          data.buckets.forEach((b,i)=>{
            const value=s.value(b),h=value/max*150,isLine=chartType.value==='line',shape=document.createElementNS(ns,isLine?'circle':'rect');
            if(isLine){shape.setAttribute('cx',65+(i+.5)*width);shape.setAttribute('cy',180-h);shape.setAttribute('r','4');}
            else{shape.setAttribute('x',65+i*width+si*width/Math.max(1,series.length));shape.setAttribute('y',180-Math.max(2,h));shape.setAttribute('width',Math.max(.2,width/Math.max(1,series.length)-1));shape.setAttribute('height',Math.max(2,h));}
            shape.setAttribute('fill',s.color);shape.setAttribute('class','timeline-mark');shape.setAttribute('tabindex','0');shape.setAttribute('role','button');
            const message=`${clock(cumulative?b.until:b.at)} · ${s.label}: ${fmt(value)} ${cumulative?'votos acumulados':byCandidate?'votos':'BUs'} · ${fmt(b.count)} BUs no intervalo`;shape.setAttribute('aria-label',message);const title=document.createElementNS(ns,'title');title.textContent=message;shape.append(title);
            function choose(){buListLimit=50;drillPath=[];explore(b);chosen.textContent=message+`. Intervalo até ${clock(b.until)} (fim excluído).`;}
            shape.onclick=choose;shape.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};svg.append(shape);
          });
        }
        data.buckets.forEach((b,i)=>{if(i%Math.max(1,Math.ceil(data.buckets.length/7))===0)text(65+i*width,220,(cumulative?b.until:b.at).slice(11,16));});
        const selection=document.createElementNS(ns,'rect');selection.setAttribute('class','timeline-selection');selection.setAttribute('y','25');selection.setAttribute('height','160');selection.setAttribute('visibility','hidden');svg.append(selection);
        let anchor=null,suppressClick=false;
        function position(e){const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());return point;}
        function cancelSelection(){anchor=null;dragging=false;selection.setAttribute('visibility','hidden');}
        svg.addEventListener('pointerdown',e=>{const p=position(e);if(e.button!==0||p.x<65||p.x>965||p.y<25||p.y>185)return;svg.focus({preventScroll:true});anchor={x:p.x,clientX:e.clientX,id:e.pointerId};dragging=true;suppressClick=false;});
        svg.addEventListener('pointermove',e=>{if(!anchor||e.pointerId!==anchor.id)return;const x=Math.max(65,Math.min(965,position(e).x));if(Math.abs(e.clientX-anchor.clientX)<6&&!suppressClick)return;suppressClick=true;svg.setPointerCapture(e.pointerId);selection.setAttribute('x',Math.min(x,anchor.x));selection.setAttribute('width',Math.abs(x-anchor.x));selection.setAttribute('visibility','visible');const range=selectedTimelineRange(data.buckets,anchor.x,x);chosen.textContent=`Selecionado: ${clock(range.from)} até ${clock(range.to)}. Solte para aplicar; Esc cancela.`;});
        svg.addEventListener('pointerup',e=>{if(!anchor||e.pointerId!==anchor.id)return;const range=suppressClick?selectedTimelineRange(data.buckets,anchor.x,position(e).x):null;cancelSelection();if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);if(range){from.value=range.from.slice(0,19);to.value=range.to.slice(0,19);resetDrill();periodSelected=true;selectedBar='period';load();}setTimeout(()=>{suppressClick=false;},0);});
        svg.addEventListener('pointercancel',cancelSelection);
        svg.addEventListener('pointerleave',()=>{if(anchor&&!suppressClick)cancelSelection();});
        svg.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopPropagation();}},true);
        svg.setAttribute('tabindex','0');svg.addEventListener('keydown',e=>{if(e.key==='Escape'){cancelSelection();chosen.textContent='Seleção cancelada. Arraste para selecionar outro período.';}});
        content.append(svg,chosen,drill);const current=selectedBar==='period'?periodBucket:data.buckets.find(b=>b.at===selectedBar);if(current)explore(current,drillPath);
      }
      if(!data.selected)content.append(el('p','Nenhum evento com horário conhecido neste recorte. Isso não demonstra interrupção no TSE.','notice'));
      const gaps=el('div',undefined,'timeline-gaps');gaps.append(el('h3',`Intervalos entre eventos ≥ ${data.threshold} minutos`));
      if(!data.gaps.length)gaps.append(el('p','Nenhum intervalo desse tamanho entre os eventos conhecidos do recorte. Não é uma conclusão sobre toda a apuração.','metadata'));
      for(const g of data.gaps){const p=el('p',`${clock(g.from)} → ${clock(g.to)} · ${g.minutes} minutos sem eventos intermediários nesta amostra. `);for(const [label,e] of [['Anterior',g.before],['Seguinte',g.after]]){const a=el('a',`${label}: ${e.uf.toUpperCase()} / ${e.zone}/${e.section} `);a.href=e.source;a.target='_blank';a.rel='noopener';p.append(a);}gaps.append(p);}content.append(gaps);
      const tableDetails=el('details');tableDetails.append(el('summary','Ver valores do gráfico em tabela'));const tableExport=el('button','Exportar tabela em CSV','secondary timeline-export');tableExport.type='button';tableDetails.append(tableExport);const wrap=el('div',undefined,'table-wrap'),table=el('table'),head=el('thead'),tr=el('tr');['Início da faixa','BUs','Votos nesses BUs',...(byCandidate?series.map(s=>s.label+(cumulative?' (acumulado)':'')):[])].forEach(t=>tr.append(el('th',t)));head.append(tr);table.append(head);const body=el('tbody');for(const b of data.buckets){const row=el('tr');[clock(b.at),fmt(b.count),fmt(b.votes),...(byCandidate?series.map(s=>fmt(s.value(b))):[])].forEach(v=>row.append(el('td',v)));body.append(row);}table.append(body);wrap.append(table);tableDetails.append(wrap);content.append(tableDetails,el('p',data.caveat,'metadata'));
      const headers=['Região','UF','Amostra','Evento','Referência de horário','Agrupamento (min)','Modo','Início da faixa (incluído)','Fim da faixa (excluído)','BUs','Votos nesses BUs',...(byCandidate?series.map(s=>s.label+(cumulative?' (acumulado)':'')):[])];
      const rows=data.buckets.map(b=>[exportRegion,exportState,exportScope,data.label,data.clock,data.minutes,cumulative?'Acumulado desde o início do período':byCandidate?'Votos por intervalo':'BUs por intervalo',b.at,b.until,b.count,b.votes,...(byCandidate?series.map(s=>s.value(b)):[])]);
      csvSnapshot={text:encodeTimelineCSV([headers,...rows]),filename:`confere-voto-horarios-${params.get('uf')||params.get('region')||'brasil'}-${data.basis}-${params.get('metric')||'bus'}.csv`};
      const tableSnapshot=csvSnapshot;tableExport.onclick=()=>{const url=URL.createObjectURL(new Blob([tableSnapshot.text],{type:'text/csv;charset=utf-8'}));const a=el('a');a.href=url;a.download=tableSnapshot.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);};
      exportButton.disabled=false;
      for(const panel of content.querySelectorAll('details'))panel.open=panelState.get(panel.querySelector('summary')?.textContent)===true;
    }catch(error){if(seq===sequence){status.textContent=`Não foi possível atualizar: ${error.message}. Mantendo a última visualização.`;}}
    finally{if(seq===sequence){submit.disabled=false;inFlight=false;if(dirty)scheduleRefresh();}}
  }
  chartType.onchange=()=>load();metric.onchange=()=>{if(metric.value==='cumulative')chartType.value='line';chartType.disabled=metric.value==='cumulative';load();};minutes.onchange=()=>{selectedBar=null;drillPath=[];load();};
  function resetDrill(){selectedBar=null;drillPath=[];periodSelected=false;buListLimit=50;}form.onsubmit=e=>{e.preventDefault();resetDrill();periodSelected=true;selectedBar='period';load();};basis.onchange=()=>{resetDrill();load();};scope.onchange=()=>{resetDrill();load();};state.onchange=()=>{scope.value='';updateScopes();resetDrill();load();};region.onchange=()=>{scope.value='';updateStates();updateScopes();resetDrill();load();};
  return {select(id){region.value='';state.value='';updateStates();updateScopes();scope.value=id;resetDrill();load();},update(overview){candidateParties=new Map(overview.reports.flatMap(r=>(r.official?.candidates||[]).map(c=>[c.number,c.party])));candidateNames=new Map(overview.reports.flatMap(r=>(r.official?.candidates||[]).map(c=>[c.number,c.name])));const next=overview.reports.map(r=>`${r.id}:${r.updatedAt}`).join('|');if(next===signature)return;signature=next;reports=overview.reports;updateScopes();scheduleRefresh();}};
}
