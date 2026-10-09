import unittest,tempfile,subprocess,os,json,time,hashlib,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class IndexTests(unittest.TestCase):
 def test_latest_report_replaces_old_and_scopes_uf_and_office(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'data/audits').mkdir(parents=True);(root/'data/snapshots').mkdir()
   raw=(ROOT/'test/fixtures/ac-01066-0004-0077.dat').read_bytes();sha=hashlib.sha256(raw).hexdigest();(root/'data/snapshots'/f'{sha}.dat').write_bytes(raw)
   def report(id,stamp):return {'id':id,'uf':'ac','city':'01066','name':'PORTO WALTER','startedAt':stamp,'updatedAt':stamp,'expected':1,'records':[{'uf':'ac','city':'01066','zone':'0004','section':'0077','sha256':sha,'source':'https://example.test/bu','receivedAt':'04/10/2026 19:00:00','countedAt':'2026-10-05T00:00:00Z'}]}
   for id,stamp in [('a'*36,'2026-10-05'),('b'*36,'2026-10-06')]: (root/'data/audits'/f'{id}.json').write_text(json.dumps(report(id,stamp)))
   proc=subprocess.Popen([sys.executable,'-u',str(ROOT/'scripts/offices_service.py')],cwd=ROOT,env={**os.environ,'OFFICE_DATA_ROOT':folder},stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
   def query(**q):proc.stdin.write(json.dumps({'id':1,**q})+'\n');proc.stdin.flush();r=json.loads(proc.stdout.readline());self.assertNotIn('error',r);return r['result']
   try:
    for _ in range(100):
     c=query(action='catalog')
     if c['status']['state']=='ready':break
     time.sleep(.02)
    self.assertEqual(c['status']['state'],'ready')
    r=query(action='summary',uf='ac',office='5');self.assertEqual(r['totals']['bus'],1);self.assertEqual(r['totals']['votes'],468)
    self.assertEqual(query(action='summary',uf='am',office='5')['totals']['votes'],0)
    self.assertEqual(query(action='summary',uf='ac',office='6')['totals']['votes'],234)
    self.assertEqual(query(action='section',uf='ac',city='01066',zone='0004',section='0077')['hash'],sha)
    t=query(action='timeline',uf='ac',office='5');self.assertEqual(t[0]['records'][0]['votes'],468)
   finally:
    proc.stdin.close();proc.wait(timeout=10);proc.stdout.close();proc.stderr.close()
if __name__=='__main__':unittest.main()
