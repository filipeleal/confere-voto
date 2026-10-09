export function createStartup(load, {onReady=()=>{}, onError=console.error}={}) {
  let state='loading',started=false;
  return {
    get state(){return state;},
    async start(){
      if(started)return;
      started=true;
      try{await load();await onReady();state='ready';}
      catch(error){state='failed';onError(error);}
    },
    async handle(req,res,pathname){
      const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
      if(pathname==='/api/startup'&&req.method==='GET'){json(200,{state});return true;}
      if(pathname==='/startup.js'){
        res.setHeader('Content-Type','text/javascript; charset=utf-8');
        res.end(`async function check(){try{const r=await fetch('/api/startup');if(r.status===401){location.reload();return;}if(!r.ok)throw new Error();const s=await r.json();if(s.state==='ready'){location.reload();return;}if(s.state==='failed'){document.querySelector('#status').textContent='Não foi possível carregar a base. Consulte o administrador.';return;}}catch{}setTimeout(check,5000);}setTimeout(check,2000);`);return true;
      }
      if(state==='ready')return false;
      if(pathname.startsWith('/api/')){
        res.setHeader('Retry-After','10');
        json(503,{state,error:state==='failed'?'Não foi possível carregar a base. Consulte o administrador.':'A base está sendo carregada. Aguarde.'});return true;
      }
      if(req.method!=='GET'){json(503,{state,error:'Base indisponível.'});return true;}
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confere Voto · Carregando</title><script src="/startup.js" defer></script></head><body><main><h1>Confere Voto</h1><p id="status" role="status">${state==='failed'?'Não foi possível carregar a base. Consulte o administrador.':'Carregando a base de contagens. Esta página será atualizada automaticamente quando estiver pronta.'}</p></main></body></html>`);return true;
    }
  };
}

