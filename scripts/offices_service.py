"""Persistent local BU index. One background writer, read-only JSON-line queries."""
import json, sqlite3, threading, time, sys, traceback, os
from pathlib import Path
from all_offices import decode_all
ROOT=Path(os.environ.get('OFFICE_DATA_ROOT',Path(__file__).resolve().parents[1]))
DB=Path(os.environ.get('OFFICE_DB_PATH', ROOT/'data/offices.sqlite'))
stop=threading.Event()
status={'state':'loading','processed':0,'total':0,'errors':0}

def connect():
    c=sqlite3.connect(DB,timeout=30);c.row_factory=sqlite3.Row;c.execute('PRAGMA journal_mode=WAL');return c
c=connect()
c.executescript('CREATE TABLE IF NOT EXISTS decoded(hash TEXT PRIMARY KEY, payload TEXT, error TEXT);\nCREATE TABLE IF NOT EXISTS cities(uf TEXT,city TEXT,name TEXT,report TEXT,updated TEXT,expected INTEGER,records INTEGER,errors INTEGER,PRIMARY KEY(uf,city));\nCREATE TABLE IF NOT EXISTS sections(uf TEXT,city TEXT,zone TEXT,section TEXT,hash TEXT,source TEXT,received TEXT,counted TEXT,PRIMARY KEY(uf,city,zone,section));\nCREATE TABLE IF NOT EXISTS totals(uf TEXT,city TEXT,office TEXT,name TEXT,election INTEGER,bus INTEGER,payload TEXT,PRIMARY KEY(uf,city,office));\nCREATE INDEX IF NOT EXISTS totals_filter ON totals(office,uf);\n');c.commit();c.close()

def scan():
    db=connect();metadata={}
    while not stop.is_set():
        try:
            latest={}
            for p in (ROOT/'data/audits').glob('*.json'):
                if len(p.stem)!=36:continue
                try:
                    stamp=p.stat().st_mtime_ns
                    if p not in metadata or metadata[p]['stamp']!=stamp:
                        r=json.loads(p.read_text(encoding='utf-8'))
                        metadata[p]={'path':p,'stamp':stamp,'uf':r['uf'],'city':r['city'],'startedAt':r['startedAt'],'count':len(r['records'])}
                    m=metadata[p];key=(m['uf'],m['city'])
                    if key not in latest or m['startedAt']>latest[key]['startedAt']:latest[key]=m
                except (OSError,ValueError):continue
            status.update(state='indexing',total=sum(m['count'] for m in latest.values()),processed=0,errors=0)
            for m in sorted(latest.values(),key=lambda m:m['count']):
                if stop.is_set():return
                try:r=json.loads(m['path'].read_text(encoding='utf-8'))
                except (OSError,ValueError):continue
                uf,city=r['uf'],r['city'];old=db.execute('SELECT * FROM cities WHERE uf=? AND city=?',(uf,city)).fetchone()
                if old and old['report']==r['id'] and old['updated']==r['updatedAt']:
                    status['processed']+=len(r['records']);status['errors']+=old['errors'];continue
                totals={};sections=[];errors=0
                for b in r['records']:
                    sha=b['sha256'];cached=db.execute('SELECT payload,error FROM decoded WHERE hash=?',(sha,)).fetchone()
                    if cached:payload,error=cached['payload'],cached['error']
                    else:
                        try:payload=json.dumps(decode_all(ROOT/'data/snapshots'/f'{sha}.dat',b),ensure_ascii=False);error=None
                        except Exception as e:payload=None;error=str(e)
                        db.execute('INSERT OR REPLACE INTO decoded VALUES(?,?,?)',(sha,payload,error))
                    sections.append((uf,city,b['zone'],b['section'],sha,b['source'],b.get('receivedAt'),b.get('countedAt')))
                    if error:errors+=1
                    else:
                        for o in json.loads(payload)['offices']:
                            key=o['office']
                            if key not in totals:totals[key]={'office':key,'name':o['name'],'election':o['election'],'bus':0,'candidates':{},'legend':{},'votes':0,'blank':0,'null':0,'noCandidate':0,'turnout':0,'eligibleVoters':0}
                            t=totals[key];t['bus']+=1
                            for f in ('votes','blank','null','noCandidate','turnout','eligibleVoters'):t[f]+=o[f]
                            for f in ('candidates','legend'):
                                for n,v in o[f].items():t[f][n]=t[f].get(n,0)+v
                    status['processed']+=1
                    if status['processed']%100==0:db.commit()
                # Publish complete municipality snapshots atomically; no doubled retries.
                db.execute('DELETE FROM sections WHERE uf=? AND city=?',(uf,city))
                db.executemany('INSERT INTO sections VALUES(?,?,?,?,?,?,?,?)',sections)
                db.execute('DELETE FROM totals WHERE uf=? AND city=?',(uf,city))
                for key,t in totals.items():db.execute('INSERT INTO totals VALUES(?,?,?,?,?,?,?)',(uf,city,key,t['name'],t['election'],t['bus'],json.dumps(t,ensure_ascii=False)))
                db.execute('INSERT OR REPLACE INTO cities VALUES(?,?,?,?,?,?,?,?)',(uf,city,r['name'],r['id'],r['updatedAt'],r['expected'],len(r['records']),errors));db.commit();status['errors']+=errors
            status.update(state='ready',updatedAt=time.time())
        except Exception as e:
            db.rollback();status.update(state='error',error=str(e));traceback.print_exc(file=sys.stderr)
        stop.wait(60)

def query(q):
    db=connect()
    try:
        if q['action']=='decode':
            return decode_all(ROOT/'data/snapshots'/(q['hash']+'.dat'),q)
        if q['action']=='catalog':
            rows=db.execute('SELECT office,name,election,uf,SUM(bus) bus FROM totals GROUP BY office,uf ORDER BY office,uf').fetchall()
            return {'status':dict(status),'offices':[dict(r) for r in rows]}
        if q['action']=='section':
            row=db.execute('SELECT s.*,d.payload,d.error FROM sections s JOIN decoded d ON d.hash=s.hash WHERE uf=? AND city=? AND zone=? AND section=?',(q['uf'],q['city'],q['zone'],q['section'])).fetchone()
            if not row:raise ValueError('BU ainda não indexado')
            result=dict(row);result['decoded']=json.loads(result.pop('payload') or 'null');return result
        if q['action']=='timeline':
            args=[q['uf']];city=q.get('city') or q.get('selection')
            sql='SELECT s.*,c.name,d.payload FROM sections s JOIN cities c ON c.uf=s.uf AND c.city=s.city JOIN decoded d ON d.hash=s.hash WHERE s.uf=? AND d.error IS NULL'
            if city:sql+=' AND s.city=?';args.append(city)
            reports={}
            for r in db.execute(sql,args):
                o=next((o for o in json.loads(r['payload'])['offices'] if o['office']==q['office']),None)
                if o is None:continue
                key=r['city']
                if key not in reports:reports[key]={'id':key,'uf':r['uf'],'city':key,'name':r['name'],'records':[]}
                reports[key]['records'].append({'uf':r['uf'],'city':key,'zone':r['zone'],'section':r['section'],'source':r['source'],'sha256':r['hash'],'receivedAt':r['received'],'countedAt':r['counted'],'votes':o['votes'],'candidates':o['candidates']})
            return list(reports.values())
        office,uf=q['office'],q['uf'];city=q.get('city','')
        where='t.office=? AND t.uf=?';args=[office,uf]
        if city:where+=' AND t.city=?';args.append(city)
        rows=db.execute('SELECT t.*,c.name cityName,c.errors,c.records,c.expected,c.updated FROM totals t JOIN cities c ON c.uf=t.uf AND c.city=t.city WHERE '+where+' ORDER BY c.name',args).fetchall()
        total={'candidates':{},'legend':{},'votes':0,'blank':0,'null':0,'noCandidate':0,'turnout':0,'eligibleVoters':0,'bus':0}
        cities=[]
        for r in rows:
            t=json.loads(r['payload'])
            for f in ('votes','blank','null','noCandidate','turnout','eligibleVoters','bus'):total[f]+=t[f]
            for f in ('candidates','legend'):
                for n,v in t[f].items():total[f][n]=total[f].get(n,0)+v
            cities.append({'city':r['city'],'name':r['cityName'],'bus':r['bus'],'votes':t['votes'],'errors':r['errors'],'sourceRecords':r['records'],'updatedAt':r['updated']})
        allcities=[dict(r) for r in db.execute('SELECT city,name,records,errors FROM cities WHERE uf=? ORDER BY name',(uf,))]
        offset=max(0,int(q.get('offset',0)));limit=50
        filterCity=' AND s.city=?' if city else ''
        sectionargs=[office,uf]+([city] if city else [])
        sections=db.execute("SELECT s.uf,s.city,s.zone,s.section,s.hash,s.source,c.name cityName,d.error FROM sections s JOIN cities c ON c.uf=s.uf AND c.city=s.city JOIN decoded d ON d.hash=s.hash WHERE (d.error IS NOT NULL OR EXISTS(SELECT 1 FROM json_each(d.payload,'$.offices') j WHERE json_extract(j.value,'$.office')=?)) AND s.uf=?"+filterCity+' ORDER BY c.name,s.zone,s.section LIMIT ? OFFSET ?',sectionargs+[limit,offset]).fetchall()
        return {'status':dict(status),'office':office,'uf':uf,'totals':total,'cities':cities,'allCities':allcities,'sections':[dict(r) for r in sections],'offset':offset,'nextOffset':offset+limit if len(sections)==limit else None}
    finally:db.close()

threading.Thread(target=scan,daemon=True).start()
for line in sys.stdin:
    try:
        request=json.loads(line);result=query(request);out={'id':request['id'],'result':result}
    except Exception as e:out={'id':request.get('id'),'error':str(e)}
    print(json.dumps(out,ensure_ascii=True),flush=True)
stop.set()
