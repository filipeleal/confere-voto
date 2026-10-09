"""Decode every office without changing the presidential audit."""
from decode_bu import CODEC, extract, require, integer
from pathlib import Path

NAMES={1:'Presidente',3:'Governador',5:'Senador',6:'Deputado federal',7:'Deputado estadual',8:'Deputado distrital'}

def decode_all(path, expected):
    data=Path(path).read_bytes()
    require(0<len(data)<=5_000_000,'Tamanho de BU inválido')
    env,used=CODEC.decode_with_length('EntidadeEnvelopeGenerico',data,check_constraints=True)
    require(used==len(data),'Bytes extras após envelope')
    bu,used=CODEC.decode_with_length('EntidadeBoletimUrna',env['conteudo'],check_constraints=True)
    require(used==len(env['conteudo']),'Bytes extras após BU')
    extract(env,bu,expected)  # Same official phase, identity and presidential checks.
    result=[];seen=set()
    for election in bu['resultadosVotacaoPorEleicao']:
        require(election['idEleicao'] in (6257,6259,6261),'Eleição inesperada no BU')
        for group in election['resultadosVotacao']:
            for office in group['totaisVotosCargo']:
                kind,code=office['codigoCargo'];key=str(code) if kind=='cargoConstitucional' else 'livre-'+str(code)
                require((election['idEleicao'],key) not in seen,'Cargo duplicado no BU');seen.add((election['idEleicao'],key))
                total={'office':key,'name':NAMES.get(code,'Cargo/consulta '+str(code)) if kind=='cargoConstitucional' else ('Conselheiro distrital' if election['idEleicao']==6261 and code==25 else 'Cargo/consulta '+str(code)),'election':election['idEleicao'],'candidates':{},'legend':{},'blank':0,'null':0,'noCandidate':0,'votes':0,'turnout':integer(group['qtdComparecimento']),'eligibleVoters':integer(election['qtdEleitoresAptos'])}
                tuples=set()
                for vote in office['votosVotaveis']:
                    vkind=vote['tipoVoto'];count=integer(vote['quantidadeVotos']);candidate=vote.get('identificacaoVotavel')
                    require(vkind in (1,2,3,4,5),'Tipo de voto desconhecido')
                    require((vkind in (1,4))==(candidate is not None),'Identificação de votável inválida')
                    number=str(candidate['codigo']) if candidate else None
                    require((vkind,number) not in tuples,'Tupla duplicada');tuples.add((vkind,number))
                    if vkind in (1,4):
                        require(vkind!=4 or group['tipoCargo']==2,'Legenda em cargo majoritário')
                        total['candidates' if vkind==1 else 'legend'][number]=count
                    else:total[{2:'blank',3:'null',5:'noCandidate'}[vkind]]+=count
                    total['votes']+=count
                require(total['turnout']<=total['eligibleVoters'],'Comparecimento excede aptos')
                multiplier=2 if key=='5' else 1
                require(total['votes']==total['turnout']*multiplier,'Soma diverge do comparecimento no cargo '+key)
                result.append(total)
    return {'offices':result,'issuedAt':bu['dataHoraEmissao'],'signatureVerified':False}
