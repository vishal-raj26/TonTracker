"""Local SQLite VM/EXPLAIN probe of SQL emitted by the real worker tests.

No Cloudflare calls. The input is captured production SQL plus bound parameters,
not a hand-maintained copy of its queries. VM instructions are a scan regression
proxy, not a claim about Cloudflare D1 billed row metrics.
"""
import json
import sqlite3
import sys
from pathlib import Path

QUERIES=json.load(sys.stdin)
ROOT=Path(__file__).resolve().parent.parent

def database(kind,size):
    db=sqlite3.connect(':memory:')
    if kind=='identity':
        for path in ['cloudflare/valuation-read-model-migrations/0002_valuation_read_model_bootstrap.sql','cloudflare/valuation-read-model-migrations/0003_bounded_maintenance.sql']:
            db.executescript((ROOT/path).read_text())
        db.executemany("INSERT INTO identity_sales(sale_id,asset_kind,asset_key,normalized_name,sold_at,price_gram,historical_usd_rate,price_usd,marketplace,source) VALUES(?,'username',?,?,?,1,1,?,'test','test')",
            ((f's{i:05}',f'key{i}',f'name{i}',i+1,i+1) for i in range(size)))
        db.executemany("INSERT INTO identity_assets(asset_kind,asset_key,normalized_name,display_name,source_updated_at) VALUES('username',?,?,?,'2026-01-01')",
            ((f'key{i}',f'name{i}',f'name{i}') for i in range(size)))
    elif kind=='compact':
        for path in ['cloudflare/gift-sales-compact-schema.sql','cloudflare/gift-sales-bounded-maintenance.sql']:
            db.executescript((ROOT/path).read_text())
        db.execute("INSERT INTO gift_sale_combos(combo_id,collection_key,collection_name,model_key,model_name,backdrop_key,backdrop_name) VALUES(1,'a','a','m','m','b','b')")
        db.executemany("INSERT INTO gift_sale_events(sale_id,combo_id,marketplace,price_nano,price_usd_micros,ton_usd_micros,rate_at,sold_at,ingested_at) VALUES(?,1,'test',1,1,1,1,?,1)",
            ((f'sale{i:06}',1) for i in range(size)))
    else:
        for path in ['cloudflare/gift-sales-schema.sql','cloudflare/gift-sales-legacy-bounded-maintenance.sql']:
            db.executescript((ROOT/path).read_text())
        db.executemany("INSERT INTO gift_sales(sale_id,collection_key,collection_name,model_key,model_name,backdrop_key,backdrop_name,marketplace,price_ton,sold_at,ingested_at) VALUES(?,'a','a','m','m','b','b','test',1,'2020-01-01','2020-01-01')",
            ((f'sale{i:05}',) for i in range(size)))
    return db

report={'smallCorpus':10000,'largeCorpus':200000,'queries':[]}
for kind,queries in QUERIES.items():
    small=database(kind,report['smallCorpus'])
    large=database(kind,report['largeCorpus'])
    for query in queries:
        sql,args=query['sql'],query['args']
        plan=[row[3] for row in large.execute('EXPLAIN QUERY PLAN '+sql,args)]
        counts=[]
        for db in [small,large]:
            if kind=='compact' and sql.lstrip().startswith('DELETE FROM gift_sale_events'):
                total=db.execute('SELECT COUNT(*) FROM gift_sale_events').fetchone()[0]
                db.execute("UPDATE bounded_maintenance_state SET total=?,status='complete' WHERE job_key='count:gift_sale_events'",(total,))
            steps=[0]
            def progress():
                steps[0]+=100
                return 1 if steps[0]>1000000 else 0
            db.set_progress_handler(progress,100)
            try:
                db.execute(sql,args).fetchall()
            except sqlite3.OperationalError as error:
                raise RuntimeError(f'{kind} query exceeded VM budget: {sql}') from error
            finally:
                db.set_progress_handler(None,0)
            counts.append(steps[0])
        report['queries'].append({'kind':kind,'query':sql.strip().split('\n')[0], 'smallSteps':counts[0], 'largeSteps':counts[1], 'plan':plan})
    small.close()
    large.close()
print(json.dumps(report))
