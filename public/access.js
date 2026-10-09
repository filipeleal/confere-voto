const form=document.querySelector('form'),button=document.querySelector('button'),message=document.querySelector('#message');
form.addEventListener('submit',async event=>{
  event.preventDefault();button.disabled=true;message.textContent='';
  try {
    const response=await fetch('/api/access/login',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-By':'urna-aberta'},body:JSON.stringify({password:form.elements.password.value})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Não foi possível entrar.');
    location.replace('/');
  }catch(error){message.textContent=error.message;}finally{button.disabled=false;}
});
