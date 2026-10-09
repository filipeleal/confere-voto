import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

export function createDecoder() {
  const python = process.env.PYTHON || resolve(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
  const child = spawn(python, ['-u','scripts/decode_bu.py'], { windowsHide: true, stdio:['pipe','pipe','pipe'] });
  let pending, stderr='';
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-2000);});
  const fail = error => { if(pending){clearTimeout(pending.timer);pending.reject(error);pending=undefined;} };
  child.on('error',fail);
  child.stdin.on('error',fail);
  child.on('exit',()=>fail(new Error(`Decodificador indisponível. Instale requirements.txt. ${stderr}`)));
  createInterface({input:child.stdout}).on('line',line=>{
    if(!pending)return;
    const p=pending;pending=undefined;clearTimeout(p.timer);
    try { const output=JSON.parse(line);if(output.error)p.reject(new Error(output.error));else p.resolve(output.result); } catch(error){p.reject(error);}
  });
  return {
    decode(path,expected){
      if(pending)throw new Error('Decodificador ocupado');
      if(child.exitCode!==null)throw new Error('Decodificador encerrado');
      return new Promise((resolve,reject)=>{
        pending={resolve,reject,timer:setTimeout(()=>{fail(new Error('Tempo limite ao decodificar BU'));child.kill();},20000)};
        child.stdin.write(JSON.stringify({path,expected})+'\n',error=>{if(error)fail(error);});
      });
    }, close(){child.stdin.end();}
  };
}
