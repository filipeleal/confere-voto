export const specification='https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/divulgacao-de-resultados/tse-ea20-arquivo-de-resultado-unificado';
const labels={van:'Votos anulados',vansj:'Votos anulados sub judice',vsan:'Votos de seções anuladas',vscv:'Votos sem candidato para votar'};
const display=v=>v===undefined?'ausente':JSON.stringify(v);
export function comparisonDiagnostics(report,raw,stable){
  const checks=[];
  function add(field,label,actual,expected,pass,action,source='official'){
    checks.push({field,label,present:actual!==undefined,actual:actual??null,expected,pass,action:pass?'Regra satisfeita.':action,source,
      message:`${label}: ${field} = ${display(actual)}; exigido pelo comparador: ${display(expected)}. ${pass?'Regra satisfeita.':action}`});
  }
  add('counted','Cobertura dos BUs',report.counted,report.expected,report.counted===report.expected,'Concluir as seções faltantes antes de comparar.','report');
  add('issues.length','Erros de coleta ou validação',report.issues.length,0,report.issues.length===0,'Consulte abaixo cada erro, zona e seção; tente novamente os erros de coleta.','report');
  add('snapshots.stable','Estabilidade das cópias',stable,true,stable===true,'Confira as cópias anteriores e posteriores e refaça a coleta para comparar versões estáveis.','snapshots');
  add('tpabr','Abrangência',raw.tpabr,'mu',raw.tpabr==='mu','Usar o resultado municipal correspondente.');
  add('cdabr','Código do município',raw.cdabr,report.city,raw.cdabr===report.city,'Usar o resultado do município desta contagem.');
  add('and','Andamento da totalização',raw.and,'f',raw.and==='f','Consultar novamente após a totalização municipal finalizar.');
  for(const [field,label,expected] of [['snt','Seções não totalizadas',0],['sa','Seções apuradas',report.expected],['si','Seções instaladas',report.expected],['sni','Seções não instaladas',0],['sna','Seções não apuradas',0]]){
    const value=raw.s?.[field];add(`s.${field}`,label,value,expected,/^\d+$/.test(value)&&Number(value)===expected,'Conferir a cobertura e a situação das seções no resultado municipal e no catálogo.');
  }
  for(const [field,label] of Object.entries(labels)){
    const value=raw.v?.[field],valid=/^\d+$/.test(value)&&Number.isSafeInteger(Number(value));
    const action=value===undefined?'O campo não foi publicado nesta cópia. Ausência não foi convertida em zero. É necessário verificar sua aplicabilidade no EA20 antes de liberar a comparação.':!valid?'O valor não é um inteiro não negativo válido para esta regra. Verificar o arquivo original.':'Esta versão do comparador exige zero neste campo: ainda não reconcilia esta categoria entre BU e totalização. Um novo download, sozinho, não resolve essa limitação. Este valor não é uma diferença de votos calculada.';
    add(`v.${field}`,label,value,0,valid&&Number(value)===0,action);
  }
  const validCount=value=>(typeof value==='string'||typeof value==='number')&&/^\d+$/.test(value)&&Number.isSafeInteger(Number(value));
  for(const [key,label] of [['vn','Nulos publicados'],['vnt','Nulos técnicos publicados'],['tvn','Total de nulos publicado']])add(`v.${key}`,label,raw.v?.[key],'inteiro não negativo',validCount(raw.v?.[key]),'Campo ausente ou inválido: não é possível conferir a composição dos nulos.');
  const valid=['vn','vnt','tvn'].every(k=>validCount(raw.v?.[k]));
  add('v.tvn = v.vn + v.vnt','Composição dos nulos no TSE',valid?Number(raw.v.tvn):undefined,valid?Number(raw.v.vn)+Number(raw.v.vnt):'vn + vnt',valid&&Number.isSafeInteger(Number(raw.v.vn)+Number(raw.v.vnt))&&Number(raw.v.tvn)===Number(raw.v.vn)+Number(raw.v.vnt),'A composição publicada não pôde ser confirmada. Conferir vn, vnt e tvn na cópia do resultado.');
  for(const [ci,cargo] of (raw.carg||[]).entries())if(cargo.cd==='1')for(const [ai,group] of cargo.agr.entries())for(const [pi,party] of group.par.entries())for(const [ni,candidate] of party.cand.entries()){
    add(`carg[${ci}].agr[${ai}].par[${pi}].cand[${ni}].dvt`,`Destinação do candidato ${candidate.n} — ${candidate.nmu}`,candidate.dvt,'Válido',candidate.dvt==='Válido','A reconciliação desta destinação ainda não está implementada no comparador.');
  }
  return {version:3,specification,checks,rawVotes:raw.v,rawSections:raw.s};
}
