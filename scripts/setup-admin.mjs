import {mkdir,writeFile,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {passwordRecord} from '../lib/auth.mjs';
const reset=process.argv.includes('--reset');
try{await access('data/admin/account.json');if(!reset)throw new Error('Administrador já existe. Use --reset para trocar a senha e reinicie o servidor.');}catch(e){if(e.code!=='ENOENT')throw e;}
const username='admin',password=randomBytes(24).toString('base64url');
await mkdir('data/admin',{recursive:true});
await writeFile('data/admin/account.json',JSON.stringify(passwordRecord(username,password)),{mode:0o600});
await writeFile('data/admin/credenciais.txt',`Usuário: ${username}\nSenha: ${password}\n\nAcesso: botão Administrador no site.\nGuarde a senha em um gerenciador e remova este arquivo após guardar.\nPara trocar: node scripts/setup-admin.mjs --reset; reinicie o servidor.\n`,{mode:0o600});
console.log('Administrador configurado. Credenciais em data/admin/credenciais.txt (não incluído no Git). Reinicie o servidor.');
