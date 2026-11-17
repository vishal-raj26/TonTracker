"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const {spawnSync}=require('node:child_process');
const measuredQueries={compact:[],legacy:[]};

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

test('operator bootstrap requires explicit row budget and execution opt-in before any network access',()=> {
  let result=spawnSync(process.execPath,['scripts/bootstrap-d1-maintenance.js','--scope','compact'],{encoding:'utf8'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/--row-budget/);
  result=spawnSync(process.execPath,['scripts/bootstrap-d1-maintenance.js','--scope','compact','--row-budget','10000'],{encoding:'utf8'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/--execute/);
});

test('real emitted SQL keeps VM work bounded when the corpus grows twentyfold',measureQueries);
