"""Strict presidential extraction using the unmodified TSE 2026 ASN.1 schema."""
import json
import sys
from pathlib import Path
import asn1tools

ROOT = Path(__file__).resolve().parents[1]
CODEC = asn1tools.compile_files(str(ROOT / 'vendor/tse/spec/spec/bu.asn1'), codec='ber', numeric_enums=True)

def require(condition, message):
    if not condition:
        raise ValueError(message)

def integer(value):
    require(type(value) is int and 0 <= value <= 9999, 'Quantidade de votos inválida')
    return value

def extract(envelope, bu, expected):
    require(envelope['fase'] == 2 and bu['fase'] == 2, 'BU fora da fase oficial')
    require(envelope['tipoEnvelope'] == 1 and 'seguranca' not in envelope, 'Envelope não suportado')
    for entity in (envelope, bu):
        require(entity['cabecalho']['idEleitoral'] == ('idPleito', 3220), 'Pleito diferente de 3220')
    identity = bu['identificacaoSecao']
    require(identity['municipioZona']['municipio'] == int(expected['city']) and
            identity['municipioZona']['zona'] == int(expected['zone']) and
            identity['secao'] == int(expected['section']), 'Identificação do BU diverge da seção consultada')
    require(bu['dataHoraEmissao'].startswith('20261004T'), 'Data de emissão não suportada para o primeiro turno')
    elections = [e for e in bu['resultadosVotacaoPorEleicao'] if e['idEleicao'] == 6257]
    require(len(elections) == 1, 'Eleição presidencial ausente ou duplicada')
    election = elections[0]
    offices = [(group, office) for group in election['resultadosVotacao'] for office in group['totaisVotosCargo']
               if office['codigoCargo'] == ('cargoConstitucional', 1)]
    require(len(offices) == 1, 'Cargo presidente ausente ou duplicado')
    group, office = offices[0]
    require(group['tipoCargo'] == 1, 'Tipo de cargo inesperado')
    total = {'candidates': {}, 'blank': 0, 'null': 0, 'votes': 0}
    seen = set()
    for vote in office['votosVotaveis']:
        kind, count = vote['tipoVoto'], integer(vote['quantidadeVotos'])
        require(kind in (1, 2, 3), 'Tipo de voto presidencial não suportado')
        candidate = vote.get('identificacaoVotavel')
        require((kind == 1) == (candidate is not None), 'Identificação de votável inválida')
        key = (kind, candidate['codigo'] if candidate else None)
        require(key not in seen, 'Tupla de votos duplicada')
        seen.add(key)
        if kind == 1:
            require(10 <= candidate['codigo'] <= 99, 'Número de candidato presidencial inválido')
            total['candidates'][str(candidate['codigo'])] = count
        else:
            total['blank' if kind == 2 else 'null'] += count
        total['votes'] += count
    require(total['votes'] == integer(group['qtdComparecimento']), 'Soma dos votos diverge do comparecimento do cargo')
    require(total['votes'] <= integer(election['qtdEleitoresAptos']), 'Votos excedem eleitores aptos')
    return {**expected, **total, 'eligibleVoters': election['qtdEleitoresAptos'],
            'turnout': group['qtdComparecimento'], 'issuedAt': bu['dataHoraEmissao'], 'signatureVerified': False}

def decode(path, expected):
    data = Path(path).read_bytes()
    require(0 < len(data) <= 5_000_000, 'Tamanho de BU inválido')
    envelope, used = CODEC.decode_with_length('EntidadeEnvelopeGenerico', data, check_constraints=True)
    require(used == len(data), 'Bytes extras após o envelope')
    bu, used = CODEC.decode_with_length('EntidadeBoletimUrna', envelope['conteudo'], check_constraints=True)
    require(used == len(envelope['conteudo']), 'Bytes extras após o BU')
    return extract(envelope, bu, expected)

if __name__ == '__main__':
    for line in sys.stdin:
        try:
            request = json.loads(line)
            response = {'result': decode(request['path'], request['expected'])}
        except Exception as error:
            response = {'error': str(error)}
        print(json.dumps(response, ensure_ascii=True), flush=True)
