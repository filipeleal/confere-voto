import unittest,sys,tempfile,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from all_offices import decode_all
from decode_bu import CODEC
FIXTURE=Path(__file__).parent/'fixtures/ac-01066-0004-0077.dat'
EXPECTED={'uf':'ac','city':'01066','zone':'0004','section':'0077'}
class AllOfficesTests(unittest.TestCase):
 def test_real_offices_and_legend(self):
  r=decode_all(FIXTURE,EXPECTED);o={x['office']:x for x in r['offices']}
  self.assertEqual(set(o),{'1','3','5','6','7'})
  self.assertEqual(o['5']['votes'],468);self.assertEqual(o['5']['turnout'],234)
  self.assertEqual(o['6']['votes'],234);self.assertGreater(sum(o['6']['legend'].values()),0)
  for cargo in o.values():self.assertEqual(cargo['votes'],sum(cargo['candidates'].values())+sum(cargo['legend'].values())+cargo['blank']+cargo['null']+cargo['noCandidate'])
 def changed(self,fn):
  env=CODEC.decode('EntidadeEnvelopeGenerico',FIXTURE.read_bytes());bu=CODEC.decode('EntidadeBoletimUrna',env['conteudo']);fn(bu);env['conteudo']=CODEC.encode('EntidadeBoletimUrna',bu)
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'bu.dat';p.write_bytes(CODEC.encode('EntidadeEnvelopeGenerico',env));return decode_all(p,EXPECTED)
 def test_state_vote_sum_is_validated(self):
  def change(b):b['resultadosVotacaoPorEleicao'][1]['resultadosVotacao'][0]['totaisVotosCargo'][0]['votosVotaveis'][0]['quantidadeVotos']+=1
  with self.assertRaisesRegex(ValueError,'Soma diverge'):self.changed(change)
 def test_missing_office_is_not_synthesized(self):
  def change(b):b['resultadosVotacaoPorEleicao']=b['resultadosVotacaoPorEleicao'][:1]
  self.assertEqual([o['office'] for o in self.changed(change)['offices']],['1'])
 def test_duplicate_office_rejected(self):
  def change(b):g=b['resultadosVotacaoPorEleicao'][1]['resultadosVotacao'][0];g['totaisVotosCargo'].append(copy.deepcopy(g['totaisVotosCargo'][0]))
  with self.assertRaisesRegex(ValueError,'duplicado'):self.changed(change)
 def test_wrong_identity_rejected(self):
  with self.assertRaisesRegex(ValueError,'Identificação'):decode_all(FIXTURE,{**EXPECTED,'section':'0001'})
if __name__=='__main__':unittest.main()
