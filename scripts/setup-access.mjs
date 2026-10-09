import {mkdir,writeFile,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {passwordRecord} from '../lib/auth.mjs';
try{await access('data/access/account.json');if(!process.argv.includes('--reset'))throw new Error('Senha já configurada. Use --reset para trocar.');}catch(error){if(error.code!=='ENOENT')throw error;}
const password=randomBytes(18).toString('base64url');
await mkdir('data/access',{recursive:true});
await writeFile('data/access/account.json',JSON.stringify(passwordRecord('visitante',password)),{mode:0o600});
await writeFile('data/access/credenciais.txt',`Senha de acesso ao site: ${password}\n\nCompartilhe apenas com os visitantes autorizados. Guarde em um gerenciador e remova este arquivo após guardar.\nPara trocar: node scripts/setup-access.mjs --reset e reinicie o servidor.\n`,{mode:0o600});
console.log('Senha de acesso salva em data/access/credenciais.txt. Reinicie o servidor para ativar.');
