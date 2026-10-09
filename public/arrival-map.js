const $=id=>document.getElementById(id), ns='http://www.w3.org/2000/svg';
const fmt=n=>new Intl.NumberFormat('pt-BR').format(n);
const clock=t=>t==null?'Sem horário':new Date(t).toISOString().slice(0,19).replace(/^(\d{4})-(\d{2})-(\d{2})T/,'$3/$2/$1 ');
const normal=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const median=a=>{a=a.slice().sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null;};
function el(tag,text){const e=document.createElement(tag);if(text!=null)e.textContent=text;return e;}
function svg(tag,attrs){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;}
function distance(a,b){const r=Math.PI/180,dlat=(b.latitude-a.latitude)*r,dlon=(b.longitude-a.longitude)*r;const h=Math.sin(dlat/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(dlon/2)**2;return 12742*Math.asin(Math.sqrt(Math.min(1,h)));}
let states,shapes,places,rows=[],limit=80;
async function get(url){const r=await fetch(url);if(!r.ok)throw new Error(`Falha ao carregar dados (${r.status}).`);return r.json();}
function enrich(data){const codes=new Map(states.map(s=>[s.codigo_uf,s.uf.toLowerCase()])), index=new Map(),capitals=new Map();for(const p of places){const uf=codes.get(p.codigo_uf),key=uf+'/'+normal(p.nome);if(!index.has(key))index.set(key,[]);index.get(key).push(p);if(p.capital)capitals.set(uf,p);}return data.cities.map(c=>{const matches=index.get(c.uf+'/'+normal(c.name))||[],p=matches.length===1?matches[0]:null;return {...c,place:p,distance:p&&capitals.has(c.uf)?distance(p,capitals.get(c.uf)):null};});}
function selectState(uf){resetZoom();$('state').value=uf;limit=80;const url=new URL(location.href);if(uf)url.searchParams.set('uf',uf);else url.searchParams.delete('uf');history.replaceState(null,'',url);$('detail').textContent='Selecione um município no mapa ou na tabela para ver os horários.';render();}
function detail(c){const root=$('detail');root.replaceChildren(el('h3',`${c.name} · ${c.uf.toUpperCase()}`));const dl=el('dl');for(const [label,value] of [['BUs com horário',fmt(c.count)],['BUs sem horário',fmt(c.missing)],['Primeiro recebimento',clock(c.first)],['Mediana',clock(c.median)],['90% recebidos (P90)',clock(c.p90)],['Último recebimento',clock(c.last)],['Distância da capital',c.distance==null?'Sem coordenadas':`${fmt(Math.round(c.distance))} km`]])dl.append(el('dt',label),el('dd',value));root.append(dl,el('p','Horário civil do EA18; fuso não declarado. Amostra da coleta.'));}
function color(t,min,max){if(t==null)return '#adb5bf';const f=max===min?.5:Math.max(0,Math.min(1,(t-min)/(max-min))),stops=[[35,101,175],[255,224,129],[183,25,53]],i=f<=.5?0:1,u=f<=.5?f*2:(f-.5)*2;return `rgb(${stops[i].map((v,j)=>Math.round(v+(stops[i+1][j]-v)*u)).join(',')})`;}
function rings(feature){return feature.geometry.type==='Polygon'?feature.geometry.coordinates:feature.geometry.coordinates.flat();}
function render(){const uf=$('state').value,metric=$('metric').value,selected=rows.filter(c=>!uf||c.uf===uf),values=rows.map(c=>c[metric]).filter(v=>v!=null).sort((a,b)=>a-b),min=values.length?values[Math.floor((values.length-1)*.05)]:null,max=values.length?values[Math.ceil((values.length-1)*.95)]:null;
$('early').textContent='≤ '+clock(min);$('late').textContent='≥ '+clock(max);$('map-title').textContent=uf?states.find(s=>s.uf.toLowerCase()===uf).nome:'Brasil';
$('stats').replaceChildren();for(const [label,value] of [['Municípios na base',selected.length],['BUs com horário',selected.reduce((s,c)=>s+c.count,0)],['BUs sem horário',selected.reduce((s,c)=>s+c.missing,0)],['Municípios sem coordenadas',selected.filter(c=>!c.place).length]]){const a=el('article');a.append(el('span',label),el('strong',fmt(value)));$('stats').append(a);}
const stateByCode=new Map(states.map(s=>[String(s.codigo_uf),s])),features=shapes.features.filter(f=>!uf||stateByCode.get(f.properties.codarea)?.uf.toLowerCase()===uf);const coords=features.flatMap(rings).flat();const xs=coords.map(c=>c[0]),ys=coords.map(c=>-c[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),scale=Math.min(740/(x1-x0),590/(y1-y0)),project=([x,y])=>[400+(x-(x0+x1)/2)*scale,325+(-y-(y0+y1)/2)*scale];
const map=$('map');map.replaceChildren();for(const f of features){const state=stateByCode.get(f.properties.codarea),path=svg('path',{d:rings(f).map(r=>'M'+r.map(p=>project(p).join(',')).join('L')+'Z').join(''),class:'state-shape',tabindex:0,role:'button','aria-label':`Ver ${state.nome}`,'fill-rule':'evenodd'});path.append(elTitle(state.nome));path.onclick=()=>selectState(state.uf.toLowerCase());path.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectState(state.uf.toLowerCase());}};map.append(path);}
for(const c of selected.filter(c=>c.place).sort((a,b)=>(a[metric]??-Infinity)-(b[metric]??-Infinity))){const [cx,cy]=project([c.place.longitude,c.place.latitude]),point=svg('circle',{cx,cy,r:uf?5:2.8,fill:color(c[metric],min,max),class:'city-point',tabindex:uf?0:-1,role:'button','aria-label':`${c.name}: ${clock(c[metric])}`});point.append(elTitle(`${c.name} (${c.uf.toUpperCase()}) · ${clock(c[metric])} · ${c.count} BUs`));point.onclick=()=>{if(!uf)selectState(c.uf);detail(c);};point.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();detail(c);}};map.append(point);}
if(!uf)for(const f of features){const state=stateByCode.get(f.properties.codarea),[x,y]=project([state.longitude,state.latitude]),label=svg('text',{x,y,class:'state-label','text-anchor':'middle'});label.textContent=state.uf;map.append(label);}
const bands=[['Capital',c=>!!c.place.capital],['Até 100 km (exceto capital)',c=>!c.place.capital&&c.distance<=100],['100–300 km',c=>c.distance>100&&c.distance<=300],['Mais de 300 km',c=>c.distance>300]];const usable=selected.filter(c=>c.distance!=null&&c[metric]!=null),stats=bands.map(([label,predicate])=>{const members=usable.filter(predicate);return [label,members.length,median(members.map(c=>c[metric]))];});table($('groups'),['Distância da capital','Municípios com horário','Mediana da métrica municipal'],stats.map(r=>[r[0],fmt(r[1]),clock(r[2])]));const near=stats[1],far=stats[3];$('comparison').textContent=near[2]!=null&&far[2]!=null?`Nesta amostra, municípios a mais de 300 km têm ${$('metric').selectedOptions[0].text.toLowerCase()} ${fmt(Math.round(Math.abs(far[2]-near[2])/60000))} min ${far[2]>=near[2]?'mais tarde':'mais cedo'} que os municípios até 100 km (exceto capitais). Comparação descritiva entre ${far[1]} e ${near[1]} municípios; não é uma conclusão sobre todo o interior.`:'Ainda não há municípios com horário e coordenadas nas duas faixas (até 100 km e mais de 300 km) para esta comparação.';renderTable();}
function elTitle(text){const t=svg('title',{});t.textContent=text;return t;}
function table(root,headers,rows){const t=el('table'),head=el('thead'),tr=el('tr');headers.forEach(h=>{const th=el('th',h);th.scope='col';tr.append(th);});head.append(tr);t.append(head);const body=el('tbody');rows.forEach(row=>{const tr=el('tr');row.forEach(v=>{const td=el('td');if(v instanceof Node)td.append(v);else td.textContent=v;tr.append(td);});body.append(tr);});t.append(body);root.replaceChildren(t);}
function renderTable(){const uf=$('state').value,metric=$('metric').value,q=normal($('search').value),list=rows.filter(c=>(!uf||uf===c.uf)&&normal(c.name).includes(q)).sort((a,b)=>(b[metric]??-Infinity)-(a[metric]??-Infinity)||a.name.localeCompare(b.name));table($('cities'),['Município','UF','Horário selecionado','BUs com / sem horário','Distância da capital'],list.slice(0,limit).map(c=>{const b=el('button',c.name);b.className='secondary';b.onclick=()=>detail(c);return [b,c.uf.toUpperCase(),clock(c[metric]),`${fmt(c.count)} / ${fmt(c.missing)}`,c.distance==null?'Sem coordenadas':`${fmt(Math.round(c.distance))} km`];}));if(!list.length)$('cities').append(el('p','Nenhum município neste recorte.'));$('more').hidden=list.length<=limit;}
async function load(){const button=$('refresh');button.disabled=true;$('status').textContent='Carregando mapa e recebimentos…';try{if(!states){[states,shapes,places]=await Promise.all([get('/geo/state-codes.json'),get('/geo/states.json'),get('/geo/cities.json')]);states.sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));for(const s of states){const option=el('option',s.nome);option.value=s.uf.toLowerCase();$('state').append(option);}const requested=new URL(location.href).searchParams.get('uf');if(states.some(s=>s.uf.toLowerCase()===requested))$('state').value=requested;}const data=await get('/api/arrival-map');rows=enrich(data);$('content').hidden=false;render();$('status').textContent=`Base parcial · consulta atualizada em ${new Date(data.generatedAt).toLocaleString('pt-BR')}. Clique nos estados para filtrar e nos municípios para consultar os horários.`;}catch(error){$('status').textContent=error.message+' Use Atualizar dados para tentar novamente.';}finally{button.disabled=false;}}
let zoom=1, centerX=400, centerY=325, drag=null, suppressMapClick=false;
function applyZoom(){
  const width=800/zoom,height=650/zoom;
  centerX=Math.max(width/2,Math.min(800-width/2,centerX));
  centerY=Math.max(height/2,Math.min(650-height/2,centerY));
  $('map').setAttribute('viewBox',`${centerX-width/2} ${centerY-height/2} ${width} ${height}`);
  $('map').classList.toggle('zoomed',zoom>1);
  $('zoom-level').textContent=`${Math.round(zoom*100)}%`;
  $('zoom-in').disabled=zoom>=8;$('zoom-out').disabled=zoom<=1;
}
function resetZoom(){zoom=1;centerX=400;centerY=325;applyZoom();}
$('zoom-in').onclick=()=>{zoom=Math.min(8,zoom*1.5);applyZoom();};
$('zoom-out').onclick=()=>{zoom=Math.max(1,zoom/1.5);applyZoom();};
$('zoom-reset').onclick=resetZoom;
const mapSurface=$('map');
mapSurface.addEventListener('pointerdown',e=>{
  if(zoom<=1||e.button!==0)return;
  const matrix=mapSurface.getScreenCTM();
  if(!matrix)return;
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,cx:centerX,cy:centerY,scale:matrix.a,moved:false};
  suppressMapClick=false;
});
mapSurface.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.moved&&Math.hypot(dx,dy)<5)return;
  drag.moved=true;suppressMapClick=true;
  mapSurface.setPointerCapture(e.pointerId);mapSurface.classList.add('dragging');
  centerX=drag.cx-dx/drag.scale;centerY=drag.cy-dy/drag.scale;applyZoom();
});
function endDrag(e){
  if(!drag||drag.id!==e.pointerId)return;
  drag=null;mapSurface.classList.remove('dragging');
  if(mapSurface.hasPointerCapture(e.pointerId))mapSurface.releasePointerCapture(e.pointerId);
  setTimeout(()=>{suppressMapClick=false;},0);
}
mapSurface.addEventListener('pointerup',endDrag);
mapSurface.addEventListener('pointercancel',endDrag);
mapSurface.addEventListener('pointerleave',e=>{if(drag&&!drag.moved)endDrag(e);});
mapSurface.addEventListener('click',e=>{if(suppressMapClick){e.preventDefault();e.stopPropagation();}},true);
applyZoom();
$('state').onchange=()=>selectState($('state').value);$('metric').onchange=render;$('back').onclick=()=>selectState('');$('refresh').onclick=load;$('search').oninput=()=>{limit=80;renderTable();};$('more').onclick=()=>{limit+=80;renderTable();};load();
