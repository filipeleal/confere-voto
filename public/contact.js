const dialog=document.createElement('dialog');
dialog.className='contact-dialog';
dialog.setAttribute('aria-labelledby','contact-title');
dialog.innerHTML=`<div class="contact-heading"><h2 id="contact-title">Contato / Reportar problema</h2><button type="button" class="secondary" id="contact-close" aria-label="Fechar contato">Fechar</button></div>
<p class="intro">Envie sua dúvida, sugestão ou relato de um problema nos dados.</p>
<form id="contact-form">
<label for="contact-subject">Assunto</label><select id="contact-subject" name="subject" required><option value="duvida">Dúvida</option><option value="sugestao">Sugestão</option><option value="problema">Problema nos dados</option></select>
<label for="contact-message">Mensagem</label><textarea id="contact-message" name="message" rows="6" minlength="10" maxlength="4000" required placeholder="Conte o que aconteceu ou como podemos ajudar."></textarea>
<label for="contact-email">E-mail para resposta (opcional)</label><input id="contact-email" name="email" type="email" autocomplete="email" maxlength="254" placeholder="Seu e-mail">
<div hidden aria-hidden="true"><label>Deixe vazio<input name="website" tabindex="-1" autocomplete="off"></label></div>
<p class="metadata">A página e o cargo consultado serão incluídos para ajudar na análise. Sua mensagem e seu e-mail serão usados para atender ao contato. Não envie senhas, documentos ou dados pessoais sensíveis.</p>
<button class="primary" id="contact-submit">Enviar mensagem</button></form><p id="contact-status" role="status" aria-live="polite"></p>`;
document.body.append(dialog);
let footer=document.querySelector('footer');
if(!footer){footer=document.createElement('footer');footer.textContent='Confere Voto · Projeto independente';document.body.append(footer);}
const open=document.createElement('button');open.type='button';open.className='secondary';open.textContent='Contato / Reportar problema';footer.append(open);
const form=dialog.querySelector('form'),status=dialog.querySelector('#contact-status'),submit=dialog.querySelector('#contact-submit');
let page='';
open.onclick=()=>{
  const url=new URL(location.pathname,location.origin),params=new URLSearchParams(location.search);
  for(const key of ['cargo','uf','city'])if(params.has(key))url.searchParams.set(key,params.get(key));
  page=url.pathname+url.search;dialog.showModal();
};
dialog.querySelector('#contact-close').onclick=()=>dialog.close();
form.onsubmit=async event=>{
  event.preventDefault();if(submit.disabled)return;
  submit.disabled=true;submit.textContent='Enviando…';status.textContent='Enviando sua mensagem…';status.classList.remove('error');
  try{
    const response=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-By':'urna-aberta'},body:JSON.stringify({...Object.fromEntries(new FormData(form)),page})});
    const data=await response.json();
    if(!response.ok)throw new Error(response.status===429?'Muitos envios. Aguarde 15 minutos antes de tentar novamente.':data.error||'Não foi possível enviar a mensagem.');
    status.textContent=data.message;form.reset();
  }catch(error){status.textContent=error instanceof TypeError?'Falha de conexão. Sua mensagem foi mantida; tente novamente.':error.message;status.classList.add('error');}
  finally{submit.disabled=false;submit.textContent='Enviar mensagem';}
};
