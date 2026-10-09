import './contact.js';
const $=id=>document.getElementById(id);
export function setAdmin(value,username){
  document.body.classList.toggle('is-admin',value);
  $('admin-login-form').hidden=value;
  document.querySelector('.admin-login').hidden=value;
  $('admin-logout').hidden=!value;
  $('admin-identity').textContent=value?`${username||'admin'} · Administrador`:'Não conectado';
  $('admin-message').textContent='';
  if(value)document.querySelector('.admin-login').open=false;
  document.dispatchEvent(new Event('admin-change'));
}
async function api(path,body){
  const response=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Requested-By':'urna-aberta'},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Não foi possível acessar a sessão.');
  return data;
}
async function authState(){try{const data=await api('/api/admin/session');setAdmin(data.authenticated,data.username);}catch{setAdmin(false);}}
$('admin-login-form').onsubmit=async event=>{
  event.preventDefault();$('admin-enter').disabled=true;
  try{const data=await api('/api/admin/login',{username:$('admin-user').value,password:$('admin-password').value});setAdmin(true,data.username);}
  catch(error){$('admin-message').textContent=error.message;}
  finally{$('admin-password').value='';$('admin-enter').disabled=false;}
};
$('admin-logout').onclick=async()=>{try{await api('/api/admin/logout',{});setAdmin(false);}catch(error){$('admin-message').textContent=error.message;}};
if(location.pathname==='/')document.querySelector('#office-nav a').setAttribute('aria-current','page');
if(location.pathname==='/mapa')document.querySelector('.main-row a[href="/mapa"]').setAttribute('aria-current','page');
authState();
setInterval(authState,60000);
