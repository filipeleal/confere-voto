export function reconcileNulls(report,official,raw){
  const listed=new Set(official.candidates.map(c=>c.number));
  const unlisted=Object.entries(report.totals.candidates).filter(([number,votes])=>!listed.has(number)&&votes>0).map(([number,votes])=>({number,votes,
    sections:(report.records||[]).filter(r=>r.candidates[number]>0).map(r=>({zone:r.zone,section:r.section,votes:r.candidates[number],sha256:r.sha256,source:r.source}))}));
  const inferredTechnical=unlisted.reduce((sum,c)=>sum+c.votes,0);
  return {method:'unlisted-nominal-v1',unlisted,ordinary:report.totals.null,inferredTechnical,total:report.totals.null+inferredTechnical,
    published:{ordinary:Number(raw.v.vn),technical:Number(raw.v.vnt),total:Number(raw.v.tvn)},
    destinationConfirmed:unlisted.length===0,
    explanation:'Nulos do BU são comparados com vn. Votos nominais em números ausentes da lista municipal são somados separadamente e confrontados com vnt; sua destinação é uma hipótese, não uma classificação oficial comprovada. O total reconstruído soma os nulos do BU e esses votos nominais, sem alterar os registros originais.'};
}
