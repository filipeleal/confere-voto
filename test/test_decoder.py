import copy
import sys
import unittest
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from decode_bu import CODEC, decode, extract

FIXTURE = Path(__file__).parent / 'fixtures/ac-01066-0004-0077.dat'
EXPECTED = {'uf':'ac', 'city':'01066', 'zone':'0004', 'section':'0077'}

class DecoderTest(unittest.TestCase):
    def setUp(self):
        self.envelope = CODEC.decode('EntidadeEnvelopeGenerico', FIXTURE.read_bytes())
        self.bu = CODEC.decode('EntidadeBoletimUrna', self.envelope['conteudo'])

    def test_real_bu(self):
        result=decode(FIXTURE, EXPECTED)
        self.assertEqual(result['votes'],234)
        self.assertEqual(result['candidates'],{'13':99,'14':4,'22':103,'55':5,'70':6})
        self.assertEqual((result['blank'],result['null']),(4,13))
        self.assertFalse(result['signatureVerified'])

    def test_wrong_section(self):
        with self.assertRaisesRegex(ValueError,'Identificação'):
            extract(self.envelope,self.bu,{**EXPECTED,'section':'0078'})

    def test_simulation_and_election(self):
        self.bu['fase']=1
        with self.assertRaisesRegex(ValueError,'fase oficial'):extract(self.envelope,self.bu,EXPECTED)
        self.bu['fase']=2
        self.bu['resultadosVotacaoPorEleicao'][0]['idEleicao']=6258
        with self.assertRaisesRegex(ValueError,'ausente'):extract(self.envelope,self.bu,EXPECTED)

    def test_sum_and_duplicate(self):
        votes=self.bu['resultadosVotacaoPorEleicao'][0]['resultadosVotacao'][0]['totaisVotosCargo'][0]['votosVotaveis']
        votes[0]['quantidadeVotos']+=1
        with self.assertRaisesRegex(ValueError,'comparecimento'):extract(self.envelope,self.bu,EXPECTED)
        votes[0]['quantidadeVotos']-=1
        votes.append(copy.deepcopy(votes[0]))
        with self.assertRaisesRegex(ValueError,'duplicada'):extract(self.envelope,self.bu,EXPECTED)

    def test_negative_vote(self):
        self.bu['resultadosVotacaoPorEleicao'][0]['resultadosVotacao'][0]['totaisVotosCargo'][0]['votosVotaveis'][0]['quantidadeVotos']=-1
        with self.assertRaisesRegex(ValueError,'inválida'):extract(self.envelope,self.bu,EXPECTED)

    def test_truncated_and_trailing_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'invalid.dat'
            for data in (FIXTURE.read_bytes()[:-10], FIXTURE.read_bytes()+b'EXTRA'):
                path.write_bytes(data)
                with self.assertRaises(Exception):decode(path,EXPECTED)

if __name__=='__main__': unittest.main()
