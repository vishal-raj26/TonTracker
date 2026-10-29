"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const {spawnSync}=require('node:child_process');
const measuredQueries={identity:[],compact:[],legacy:[]};

function sqliteD1(schema) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  const queries = [];
  return { sqlite, queries, prepare(sql) {
    const build = (args = []) => ({ bind: (...values) => build(values),
      async all() { queries.push({ sql, args }); return { results: sqlite.prepare(sql).all(...args) }; },
      async first() { queries.push({ sql, args }); return sqlite.prepare(sql).get(...args) || null; },
      async run() { queries.push({ sql, args }); return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
    });
    return build();
  }, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
}
const schema = () => fs.readFileSync('cloudflare/valuation-read-model-migrations/0002_valuation_read_model_bootstrap.sql', 'utf8');

test('identity maintenance advances bounded pages and never overwrites counters with partial totals', async () => {
  const { maintainIdentityStorage } = await import('../cloudflare/gift-registry-worker.mjs');
  assert.equal(typeof maintainIdentityStorage, 'function', 'maintenance must expose its real bounded entry point');
  const db = sqliteD1(schema());
  db.sqlite.exec(fs.readFileSync('cloudflare/valuation-read-model-migrations/0003_bounded_maintenance.sql', 'utf8'));
  const insert = db.sqlite.prepare("INSERT INTO identity_assets(asset_kind,asset_key,normalized_name,display_name,source_updated_at) VALUES ('username',?,?,?,'2026-01-01')");
  for (let i = 0; i < 1005; i++) insert.run(`key${i}`, `name${i}`, `name${i}`);
  db.sqlite.exec("UPDATE identity_storage_policy SET tracked_assets=1005 WHERE policy_key='primary'");
  const first = await maintainIdentityStorage({ VALUATION_READ_MODEL: db });
  assert.equal(first.reconciliation.identity_assets.status, 'partial');
  assert.equal(db.sqlite.prepare("SELECT tracked_assets FROM identity_storage_policy").get().tracked_assets, 1005);
  db.sqlite.exec("DELETE FROM identity_assets WHERE rowid=1");
  db.sqlite.exec("INSERT INTO identity_assets(rowid,asset_kind,asset_key,normalized_name,display_name,source_updated_at) VALUES(1,'username','replacement','replacement','replacement','2026-01-01')");
  for (let i = 0; i < 4; i++) await maintainIdentityStorage({ VALUATION_READ_MODEL: db });
  assert.equal(db.sqlite.prepare("SELECT tracked_assets FROM identity_storage_policy").get().tracked_assets, 1005);
  for (const { sql, args } of db.queries) {
    const plan = db.sqlite.prepare('EXPLAIN QUERY PLAN ' + sql).all(...args).map(row=>row.detail).join('\n');
    assert.doesNotMatch(plan, /SCAN identity_(assets|sales)\b/, 'identity pages must seek the primary key');
  }
  measuredQueries.identity.push(...db.queries);
  db.sqlite.close();
});

test('missing bounded schema fails closed instead of running legacy cleanup', async () => {
  const { maintainIdentityStorage } = await import('../cloudflare/gift-registry-worker.mjs');
  assert.equal(typeof maintainIdentityStorage, 'function');
  const db = sqliteD1(schema());
  const result = await maintainIdentityStorage({ VALUATION_READ_MODEL: db });
  assert.equal(result.status, 'migration-required');
  assert.equal(db.queries.some(({ sql }) => /DELETE FROM/.test(sql)), false);
  db.sqlite.close();
});

module.exports = { sqliteD1 };

test('compact cap pruning preserves newest sparse evidence and visits only an indexed page', async () => {
  const { pruneCompactSalesDatabase } = await import('../cloudflare/gift-registry-worker.mjs');
  const db = sqliteD1(fs.readFileSync('cloudflare/gift-sales-compact-schema.sql','utf8'));
  // Before the migration, cleanup must be disabled rather than falling back to COUNT/window scans.
  const pending = await pruneCompactSalesDatabase(db, { maxEvents: 10000 });
  assert.equal(pending.status, 'migration-required');
  db.sqlite.exec(fs.readFileSync('cloudflare/gift-sales-bounded-maintenance.sql','utf8'));
  db.sqlite.exec("INSERT INTO gift_sale_combos(combo_id,collection_key,collection_name,model_key,model_name,backdrop_key,backdrop_name) VALUES(1,'a','a','m','m','b','b'),(2,'a','a','n','n','b','b')");
  const put = db.sqlite.prepare("INSERT INTO gift_sale_events(sale_id,combo_id,marketplace,price_nano,price_usd_micros,ton_usd_micros,rate_at,sold_at,ingested_at) VALUES(?,?,'test',1,1,1,1,?,1)");
  put.run('sparse',2,0);
  for(let i=0;i<10020;i++) put.run(`sale${String(i).padStart(6,'0')}`,1,i+1);
  for(let i=0;i<24;i++) await pruneCompactSalesDatabase(db,{maxEvents:10000,batchLimit:500});
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM gift_sale_events').get().n,10000);
  assert.ok(db.sqlite.prepare("SELECT sale_id FROM gift_sale_events WHERE sale_id='sparse'").get());
  assert.ok(db.sqlite.prepare("SELECT sale_id FROM gift_sale_events WHERE sale_id='sale010019'").get());
  for(const {sql,args} of db.queries) {
    if(!/gift_sale_events/.test(sql)) continue;
    const plan = db.sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all(...args).map(row=>row.detail).join('\n');
    assert.doesNotMatch(plan,/SCAN (?:gift_sale_events|e)\b/,plan);
  }
  measuredQueries.compact.push(...db.queries);
  db.sqlite.close();
});

test('legacy retention preserves ten tied observations per exact identity across resumable pages', async () => {
  const { boundedLegacyRetention } = await import('../cloudflare/bounded-maintenance.mjs');
  const db=sqliteD1(fs.readFileSync('cloudflare/gift-sales-schema.sql','utf8'));
  db.sqlite.exec(fs.readFileSync('cloudflare/gift-sales-legacy-bounded-maintenance.sql','utf8'));
  const put=db.sqlite.prepare(`INSERT INTO gift_sales(sale_id,collection_key,collection_name,model_key,model_name,backdrop_key,backdrop_name,marketplace,price_ton,sold_at,ingested_at) VALUES(?,'a','a','m','m',?,?,'test',1,'2020-01-01','2020-01-01')`);
  for(let i=0;i<520;i++) put.run(`sale${String(i).padStart(5,'0')}`,'b','b');
  put.run('sparse','c','c');
  const first=await boundedLegacyRetention(db,'2021-01-01');
  assert.equal(first.examined,500);
  assert.equal(first.deletedEvents,500);
  await boundedLegacyRetention(db,'2021-01-01');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM gift_sales').get().n,11);
  assert.ok(db.sqlite.prepare("SELECT sale_id FROM gift_sales WHERE sale_id='sparse'").get());
  measuredQueries.legacy.push(...db.queries);
  db.sqlite.close();
});

test('baseline source prepares full exact quantiles and chronological training before publishing', async () => {
  const worker=await import('../cloudflare/gift-registry-worker.mjs');
  assert.equal(typeof worker.readIdentityBaselineSource,'function');
  const db=sqliteD1(schema());
  db.sqlite.exec(fs.readFileSync('cloudflare/valuation-read-model-migrations/0003_bounded_maintenance.sql','utf8'));
  const put=db.sqlite.prepare(`INSERT INTO identity_sales(sale_id,asset_kind,asset_key,normalized_name,sold_at,price_gram,historical_usd_rate,price_usd,marketplace,source) VALUES(?,'username',?,?,?,1,1,?,'test','test')`);
  for(let i=0;i<1100;i++) put.run(`s${String(i).padStart(5,'0')}`,`key${i}`,`name${i}`,i+1,i+1);
  const env={VALUATION_READ_MODEL:db,INGEST_SECRET:'secret'};
  const request=()=>new Request('http://local/identity/baseline-source/read',{method:'POST',headers:{authorization:'Bearer secret'},body:JSON.stringify({assetKind:'username',trainingLimit:256})});
  let result;
  for(let i=0;i<15;i++) {
    const response=await worker.readIdentityBaselineSource(request(),env);
    result=await response.json();
    if(result.status==='complete') break;
    assert.equal(response.status,202);
    assert.equal(result.groups,undefined,'partial corpus must not leak into published baselines');
  }
  assert.equal(result.status,'complete');
  assert.equal(result.ledgerSaleCount,1100);
  const global=result.groups.find(row=>row.scope==='global');
  assert.equal(global.evidence_count,1100);
  assert.deepEqual([global.range_low_usd,global.midpoint_usd,global.range_high_usd],[220,550,880]);
  assert.equal(result.training[0].price_usd,1100);
  assert.equal(result.training.length,256);
  const before=db.queries.length;
  await worker.readIdentityBaselineSource(request(),env);
  const repeated=db.queries.slice(before);
  assert.equal(repeated.filter(({sql})=>/FROM identity_sales.*ORDER BY/s.test(sql)).length,0,'fresh read must use prepared output');
  measuredQueries.identity.push(...db.queries);
  db.sqlite.close();
});

function measureQueries() {
  const selected={};
  for(const [kind,queries] of Object.entries(measuredQueries)) {
    const unique=new Map();
    for(const query of queries) if(/FROM (?:identity_sales|identity_assets|gift_sales|gift_sale_events|gift_sale_combos)/.test(query.sql)
      && !query.sql.includes('json_set') && !unique.has(query.sql)) unique.set(query.sql,query);
    selected[kind]=[...unique.values()];
    assert.ok(selected[kind].length>0);
  }
  const result=spawnSync('python',['scripts/measure-d1-bounded-queries.py'],{input:JSON.stringify(selected),encoding:'utf8',maxBuffer:4*1024*1024,timeout:60000});
  assert.equal(result.status,0,result.stderr || result.stdout);
  const report=JSON.parse(result.stdout);
  assert.ok(report.queries.length>10);
  for(const query of report.queries) {
    assert.ok(query.largeSteps<100000,JSON.stringify(query));
    assert.ok(query.largeSteps<=query.smallSteps*2+10000,JSON.stringify(query));
  }
  if(process.env.D1_SQL_METRICS_REPORT) fs.writeFileSync(process.env.D1_SQL_METRICS_REPORT,JSON.stringify(report,null,2)+'\n');
  console.log('[bounded D1 SQL measurement]',JSON.stringify({smallCorpus:report.smallCorpus,largeCorpus:report.largeCorpus,
    queries:report.queries.map(({kind,smallSteps,largeSteps})=>({kind,smallSteps,largeSteps}))}));
}

test('baseline preparation freezes a full corpus while subsequent ingestion continues', async () => {
  const {prepareIdentityBaselineSource}=await import('../cloudflare/identity-baseline-preparation.mjs');
  const db=sqliteD1(schema());
  db.sqlite.exec(fs.readFileSync('cloudflare/valuation-read-model-migrations/0003_bounded_maintenance.sql','utf8'));
  const put=db.sqlite.prepare(`INSERT INTO identity_sales(sale_id,asset_kind,asset_key,normalized_name,sold_at,price_gram,historical_usd_rate,price_usd,marketplace,source) VALUES(?,'username',?,?,?,1,1,?,'test','test')`);
  for(let i=0;i<10;i++) put.run(`s${i}`,`key${i}`,`name${i}`,i+1,i+1);
  // The one-page copy freezes all ten rows; subsequent ingestion must neither
  // restart forever nor mix fresh rows into a half-prepared generation.
  const started=Math.floor(Date.now()/1000);
  await prepareIdentityBaselineSource(db,'username',256,started);
  put.run('new','new','new',11,1000);
  let result;
  for(let i=0;i<10;i++) {
    result=await prepareIdentityBaselineSource(db,'username',256,started+1+i);
    if(result.status==='complete') break;
  }
  assert.equal(result.status,'complete');
  assert.equal(result.ledgerSaleCount,10);
  assert.equal(result.groups.find(row=>row.scope==='global').midpoint_usd,5);
  db.sqlite.close();
});

test('material corrections restart preparation but identical upserts do not', async()=> {
  const {prepareIdentityBaselineSource}=await import('../cloudflare/identity-baseline-preparation.mjs');
  const db=sqliteD1(schema());
  db.sqlite.exec(fs.readFileSync('cloudflare/valuation-read-model-migrations/0003_bounded_maintenance.sql','utf8'));
  const put=db.sqlite.prepare(`INSERT INTO identity_sales(sale_id,asset_kind,asset_key,normalized_name,sold_at,price_gram,historical_usd_rate,price_usd,marketplace,source) VALUES(?,'username',?,?,?,1,1,?,'test','test')`);
  for(let i=0;i<1100;i++) put.run(`s${String(i).padStart(5,'0')}`,`key${i}`,`name${i}`,i+1,i+1);
  await prepareIdentityBaselineSource(db,'username',256);
  db.sqlite.exec("UPDATE identity_sales SET price_usd=price_usd WHERE sale_id='s00000'");
  assert.equal(db.sqlite.prepare("SELECT revision FROM identity_source_revision WHERE asset_kind='username'").get().revision,0);
  db.sqlite.exec("UPDATE identity_sales SET price_usd=5000 WHERE sale_id='s00000'");
  assert.equal(db.sqlite.prepare("SELECT revision FROM identity_source_revision WHERE asset_kind='username'").get().revision,1);
  let result;
  for(let i=0;i<12;i++) {
    result=await prepareIdentityBaselineSource(db,'username',256);
    if(result.status==='complete') break;
  }
  assert.equal(result.status,'complete');
  assert.equal(result.ledgerSaleCount,1100);
  assert.equal(result.groups.find(row=>row.scope==='global').midpoint_usd,551);
  db.sqlite.close();
});

test('held baseline lease returns partial without examining source rows',async()=> {
  const {prepareIdentityBaselineSource}=await import('../cloudflare/identity-baseline-preparation.mjs');
  const db=sqliteD1(schema());
  db.sqlite.exec(fs.readFileSync('cloudflare/valuation-read-model-migrations/0003_bounded_maintenance.sql','utf8'));
  db.sqlite.prepare("INSERT INTO identity_baseline_preparation(asset_kind,lease_until,lease_token) VALUES('username',?,'other')").run(Math.floor(Date.now()/1000)+60);
  const result=await prepareIdentityBaselineSource(db,'username',256);
  assert.equal(result.status,'partial');
  assert.equal(result.reason,'lease-held');
  assert.equal(db.queries.some(({sql})=>/FROM identity_sales/.test(sql)),false);
  db.sqlite.close();
});

test('expired baseline lease cannot publish even when no replacement owner takes over',async()=> {
  const {prepareIdentityBaselineSource}=await import('../cloudflare/identity-baseline-preparation.mjs');
  const db=sqliteD1(schema());
  db.sqlite.exec(fs.readFileSync('cloudflare/valuation-read-model-migrations/0003_bounded_maintenance.sql','utf8'));
  await prepareIdentityBaselineSource(db,'username',256);
  await prepareIdentityBaselineSource(db,'username',256);
  // The real SQLite clock advances beyond the held lease during the final
  // training page. No competing invocation changes its token or checkpoint.
  const prepare=db.prepare.bind(db);
  const started=Math.floor(Date.now()/1000);
  db.prepare=(sql)=> {
    if(sql.includes('FROM identity_sales INDEXED BY')) {
      db.sqlite.function('unixepoch',()=>started+61);
    }
    return prepare(sql);
  };
  const result=await prepareIdentityBaselineSource(db,'username',256);
  assert.equal(result.status,'partial');
  assert.match(result.reason,/lease-expired/);
  assert.equal(db.sqlite.prepare("SELECT published_json FROM identity_baseline_preparation WHERE asset_kind='username'").get().published_json,null);
  db.sqlite.close();
});

test('empty source completes without invented baseline values',async()=> {
  const {prepareIdentityBaselineSource}=await import('../cloudflare/identity-baseline-preparation.mjs');
  const db=sqliteD1(schema());
  db.sqlite.exec(fs.readFileSync('cloudflare/valuation-read-model-migrations/0003_bounded_maintenance.sql','utf8'));
  let result;
  for(let i=0;i<3;i++) result=await prepareIdentityBaselineSource(db,'username',256);
  assert.equal(result.status,'complete');
  assert.deepEqual(result.groups,[]);
  assert.deepEqual(result.training,[]);
  db.sqlite.close();
});

test('automatic compact stats report unknown counts until bounded bootstrap completes',async()=> {
  const {compactSalesShardStats}=await import('../cloudflare/gift-registry-worker.mjs');
  assert.equal(typeof compactSalesShardStats,'function');
  const db=sqliteD1(fs.readFileSync('cloudflare/gift-sales-compact-schema.sql','utf8'));
  let stats=await compactSalesShardStats({GIFT_SALES_2025:db});
  assert.equal(stats[0].events,null);
  assert.equal(stats[0].combinations,null);
  assert.equal(stats[0].countsStatus,'migration-required');
  assert.equal(db.queries.some(({sql})=>/COUNT\(\*\).*gift_sale_events/s.test(sql)),false);
  db.sqlite.exec(fs.readFileSync('cloudflare/gift-sales-bounded-maintenance.sql','utf8'));
  stats=await compactSalesShardStats({GIFT_SALES_2025:db});
  assert.equal(stats[0].events,null);
  const {pruneCompactSalesDatabase}=await import('../cloudflare/gift-registry-worker.mjs');
  await pruneCompactSalesDatabase(db);
  stats=await compactSalesShardStats({GIFT_SALES_2025:db});
  assert.equal(stats[0].events,0);
  assert.equal(stats[0].combinations,0);
  assert.equal(stats[0].countsStatus,'complete');
  db.sqlite.close();
});

test('touched-combo compaction bounds a cold oversized identity without scanning its history',async()=> {
  const {pruneTouchedSaleCombos}=await import('../cloudflare/gift-registry-worker.mjs');
  assert.equal(typeof pruneTouchedSaleCombos,'function');
  const db=sqliteD1(fs.readFileSync('cloudflare/gift-sales-compact-schema.sql','utf8'));
  db.sqlite.exec(fs.readFileSync('cloudflare/gift-sales-bounded-maintenance.sql','utf8'));
  db.sqlite.exec("INSERT INTO gift_sale_combos(combo_id,collection_key,collection_name,model_key,model_name,backdrop_key,backdrop_name) VALUES(1,'a','a','m','m','b','b')");
  const put=db.sqlite.prepare("INSERT INTO gift_sale_events(sale_id,combo_id,marketplace,price_nano,price_usd_micros,ton_usd_micros,rate_at,sold_at,ingested_at) VALUES(?,1,'test',1,1,1,1,1,1)");
  for(let i=0;i<1000;i++) put.run(`sale${String(i).padStart(6,'0')}`);
  const deleted=await pruneTouchedSaleCombos(db,[{collectionKey:'a',modelKey:'m',backdropKey:'b'}],10);
  assert.equal(deleted,500);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM gift_sale_events').get().n,500);
  assert.ok(db.sqlite.prepare("SELECT 1 FROM gift_sale_events WHERE sale_id='sale000999'").get());
  measuredQueries.compact.push(...db.queries);
  db.sqlite.close();
});

test('counter bootstrap exposes durable progress and stops after its explicit page budget',async()=> {
  const {boundedCounterBootstrap}=await import('../cloudflare/bounded-maintenance.mjs');
  const db=sqliteD1(schema());
  db.sqlite.exec(fs.readFileSync('cloudflare/valuation-read-model-migrations/0003_bounded_maintenance.sql','utf8'));
  const put=db.sqlite.prepare("INSERT INTO identity_assets(asset_kind,asset_key,normalized_name,display_name,source_updated_at) VALUES('username',?,?,?,'2026-01-01')");
  for(let i=0;i<2500;i++) put.run(`key${i}`,`name${i}`,`name${i}`);
  const first=await boundedCounterBootstrap(db,'identity',1);
  assert.equal(first.status,'partial');
  assert.equal(first.counters.identity_assets.total,500);
  assert.equal(first.sourceRowBudget,4500);
  const final=await boundedCounterBootstrap(db,'identity',4);
  assert.equal(final.counters.identity_assets.total,2500);
  // A full page needs one final empty seek before readiness is certified.
  assert.equal(final.status,'partial');
  assert.equal((await boundedCounterBootstrap(db,'identity',1)).status,'complete');
  assert.equal(db.sqlite.prepare('SELECT tracked_assets FROM identity_storage_policy').get().tracked_assets,2500);
  db.sqlite.close();
});

test('operator bootstrap requires explicit row budget and execution opt-in before any network access',()=> {
  let result=spawnSync(process.execPath,['scripts/bootstrap-d1-maintenance.js','--scope','identity'],{encoding:'utf8'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/--row-budget/);
  result=spawnSync(process.execPath,['scripts/bootstrap-d1-maintenance.js','--scope','identity','--row-budget','10000'],{encoding:'utf8'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/--execute/);
});

test('real emitted SQL keeps VM work bounded when the corpus grows twentyfold',measureQueries);
