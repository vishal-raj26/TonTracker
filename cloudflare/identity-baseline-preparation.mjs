import { maintenanceReady, MAINTENANCE_PAGE_SIZE } from './bounded-maintenance.mjs';

const FRESH_SECONDS=24*60*60;
const LEASE_SECONDS=60;
const MAX_STATE_BYTES=1_500_000;
const MAX_PREPARATION_SECONDS=24*60*60;

function groupKeys(row) {
  return [
    ['global','*','*','*','*'],
    ['route',row.primary_route,'*','*','*'],
    ['route-length',row.primary_route,row.length_bucket,'*','*'],
    ['archetype',row.primary_route,row.length_bucket,row.script,row.scarcity_class],
  ].map(parts=>JSON.stringify(parts));
}

function emptyState(revision,trainingLimit,now) {
  return {revision,trainingLimit,asOf:now,phase:'counts',cursor:[0,''],total:0,groups:{},premium:{},recentTotal:0,recentPremium:0,high:[],even:[],position:0};
}

function publicSource(state,kind,now) {
  const groups=Object.entries(state.groups).flatMap(([key,value])=> {
    if(value.count<3) return [];
    const [scope,primary_route,length_bucket,script,scarcity_class]=JSON.parse(key);
    return [{scope,primary_route,length_bucket,script,scarcity_class,evidence_count:value.count,
      range_low_usd:value.values[0],midpoint_usd:value.values[1],range_high_usd:value.values[2]}];
  });
  const unique=new Map();
  for(const row of [...state.high.reverse(),...state.even]) unique.set(row.sale_id,row);
  return {configured:true,status:'complete',assetKind:kind,groups,ledgerSaleCount:state.total,
    training:kind==='username'?[...unique.values()].slice(0,state.trainingLimit):[],
    premiumCohorts:Object.values(state.premium),marketPremiumRate:state.recentTotal?state.recentPremium/state.recentTotal:null,
    preparedAt:now,sourceAsOf:state.asOf,sourceRevision:state.revision,freshUntil:now+FRESH_SECONDS,
    aggregation:'full-corpus-exact-paged-quantiles'};
}

async function hydrateTraining(database,published) {
  const training=[];
  // Capture training semantics once when publishing. Repeated source reads must
  // not silently retrain the same generation with a different semantic cohort.
  for(let index=0;index<published.training.length;index+=100) {
    const chunk=published.training.slice(index,index+100);
    const names=[...new Set(chunk.map(row=>row.normalized_name))];
    const results=await database.prepare(`SELECT normalized_name,semantic_json FROM identity_assets
      WHERE asset_kind='username' AND normalized_name IN (${names.map(()=>'?').join(',')})`).bind(...names).all();
    const semantics=new Map((results.results || []).map(row=>[row.normalized_name,row.semantic_json]));
    training.push(...chunk.map(row=>({...row,semantic_json:semantics.get(row.normalized_name) || null})));
  }
  return {...published,training};
}

export async function prepareIdentityBaselineSource(database,kind,trainingLimit=2048,now=Math.floor(Date.now()/1000)) {
  if(!await maintenanceReady(database,'identity')) return {status:'migration-required'};
  await database.prepare('INSERT OR IGNORE INTO identity_baseline_preparation(asset_kind) VALUES(?1)').bind(kind).run();
  let current=await database.prepare('SELECT * FROM identity_baseline_preparation WHERE asset_kind=?1').bind(kind).first();
  let published=null;
  try { published=JSON.parse(current.published_json || 'null'); } catch { return {status:'failed',reason:'invalid-published-state'}; }
  if(published?.freshUntil>now && published.trainingLimit===trainingLimit) return published;
  const token=crypto.randomUUID();
  const lease=await database.prepare(`UPDATE identity_baseline_preparation SET lease_token=?2,lease_until=?3
    WHERE asset_kind=?1 AND lease_until<=?4`).bind(kind,token,now+LEASE_SECONDS,now).run();
  if(!lease.meta?.changes) return {status:'partial',reason:'lease-held',retryAfter:LEASE_SECONDS};
  try {
    // Another invocation may have completed between the first read and lease
    // acquisition. Never resume an earlier JS snapshot after acquiring a lease.
    current=await database.prepare('SELECT * FROM identity_baseline_preparation WHERE asset_kind=?1').bind(kind).first();
    const revisionRow=await database.prepare('SELECT revision FROM identity_source_revision WHERE asset_kind=?1').bind(kind).first();
    if(!revisionRow) return {status:'migration-required'};
    let state;
    try {state=JSON.parse(current.state_json || '{}');} catch {return {status:'failed',reason:'invalid-checkpoint'};}
    let highwater=Number(current.source_highwater || 0);
    if(state.revision!==revisionRow.revision || state.trainingLimit!==trainingLimit || !state.phase || state.phase==='complete' || now-Number(state.asOf)>MAX_PREPARATION_SECONDS) {
      state=emptyState(revisionRow.revision,trainingLimit,now);
      await database.prepare(`UPDATE identity_baseline_preparation SET
        source_highwater=COALESCE((SELECT rowid FROM identity_sales ORDER BY rowid DESC LIMIT 1),0),
        state_json=json_set(?3,'$.revision',(SELECT revision FROM identity_source_revision WHERE asset_kind=?1),
          '$.upperTime',json(COALESCE((SELECT json_array(sold_at,sale_id) FROM identity_sales INDEXED BY identity_sales_kind_time_bounded_idx
            WHERE asset_kind=?1 ORDER BY sold_at DESC,sale_id DESC LIMIT 1),'[0,""]')),
          '$.upperPrice',json(COALESCE((SELECT json_array(price_usd,sale_id) FROM identity_sales INDEXED BY identity_sales_kind_price_bounded_idx
            WHERE asset_kind=?1 ORDER BY price_usd DESC,sale_id DESC LIMIT 1),'[0,""]')))
        WHERE asset_kind=?1 AND lease_token=?2 AND lease_until>unixepoch()`)
        .bind(kind,token,JSON.stringify(state)).run();
      const frozen=await database.prepare('SELECT source_highwater,state_json FROM identity_baseline_preparation WHERE asset_kind=?1').bind(kind).first();
      highwater=Number(frozen.source_highwater);
      state=JSON.parse(frozen.state_json);
    }
    const pricePhase=state.phase==='prices';
    const order=pricePhase?'price_usd':'sold_at';
    const index=pricePhase?'identity_sales_kind_price_bounded_idx':'identity_sales_kind_time_bounded_idx';
    const page=await database.prepare(`SELECT rowid AS source_rowid,sale_id,normalized_name,price_usd,sold_at,reliability_score,primary_route,length_bucket,script,scarcity_class
      FROM identity_sales INDEXED BY ${index} WHERE asset_kind=?1 AND (${order},sale_id)>(?2,?3)
        AND (${order},sale_id)<=(?4,?5)
      ORDER BY ${order},sale_id LIMIT ${MAINTENANCE_PAGE_SIZE}`).bind(kind,...state.cursor,...(pricePhase?state.upperPrice:state.upperTime)).all();
    const highLimit=Math.min(160,Math.max(32,Math.floor(trainingLimit*0.08)));
    const evenLimit=trainingLimit-highLimit;
    for(const row of page.results || []) {
      // LIMIT applies BEFORE the watermark filter. Putting rowid<=highwater
      // inside this time/price query could examine arbitrarily many new rows
      // to return 500 frozen members. Always advance the RAW page cursor below.
      if(Number(row.source_rowid)>highwater) continue;
      if(state.phase==='counts') {
        state.total++;
        for(const key of groupKeys(row)) {
          const group=state.groups[key] || (state.groups[key]={count:0,seen:0,values:[]});
          group.count++;
        }
        if(kind==='username') {
          if(row.sold_at>=state.asOf-180*86400) {
            const key=JSON.stringify([row.primary_route,row.length_bucket,row.script]);
            const cohort=state.premium[key] || (state.premium[key]={primary_route:row.primary_route,length_bucket:row.length_bucket,script:row.script,total_count:0,premium_count:0});
            cohort.total_count++;if(row.price_usd>=100) cohort.premium_count++;
          }
          if(row.sold_at>=state.asOf-90*86400) {state.recentTotal++;if(row.price_usd>=100) state.recentPremium++;}
        }
      } else if(state.phase==='prices') {
        for(const key of groupKeys(row)) {
          const group=state.groups[key];
          if(!group) return {status:'partial',reason:'source-changed'};
          group.seen++;
          for(const [position,ratio] of [[0,0.2],[1,0.5],[2,0.8]]) {
            if(group.seen===Math.floor((group.count-1)*ratio)+1) group.values[position]=row.price_usd;
          }
        }
        if(kind==='username') {state.high.push(row);if(state.high.length>highLimit) state.high.shift();}
      } else {
        state.position++;
        if(state.position%Math.max(1,Math.floor(state.total/evenLimit))===0 && state.even.length<evenLimit) state.even.push(row);
      }
    }
    const last=page.results?.at(-1);
    if(last) state.cursor=[last[order],last.sale_id];
    const exhausted=(page.results || []).length<MAINTENANCE_PAGE_SIZE;
    if(exhausted) {
      state.cursor=[0,''];
      if(state.phase==='counts') state.phase='prices';
      else if(state.phase==='prices') state.phase=kind==='username'?'training':'complete';
      else state.phase='complete';
    }
    const serialized=JSON.stringify(state);
    if(new TextEncoder().encode(serialized).length>MAX_STATE_BYTES) return {status:'failed',reason:'checkpoint-size-budget-exceeded'};
    const ready=state.phase==='complete';
    // Material updates/deletes below the boundary invalidate this generation;
    // ordinary new rows above it never mix ranks or restart preparation.
    let output=null;
    let semanticRevision=null;
    if(ready) {
      const revision=await database.prepare('SELECT revision FROM identity_semantic_revision WHERE asset_kind=?1').bind(kind).first();
      if(!revision) return {status:'migration-required'};
      semanticRevision=revision.revision;
      output={...await hydrateTraining(database,publicSource(state,kind,now)),trainingLimit,semanticRevision};
      if(new TextEncoder().encode(JSON.stringify(output)).length>MAX_STATE_BYTES) return {status:'failed',reason:'published-size-budget-exceeded'};
    }
    const saved=await database.prepare(`UPDATE identity_baseline_preparation SET state_json=?3,
      published_json=CASE WHEN ?4 IS NOT NULL THEN ?4 ELSE published_json END,
      published_at=CASE WHEN ?4 IS NOT NULL THEN ?5 ELSE published_at END
      WHERE asset_kind=?1 AND lease_token=?2 AND lease_until>unixepoch()
        AND EXISTS(SELECT 1 FROM identity_source_revision WHERE asset_kind=?1 AND revision=?6)
        AND (?7 IS NULL OR EXISTS(SELECT 1 FROM identity_semantic_revision WHERE asset_kind=?1 AND revision=?7))`)
      .bind(kind,token,serialized,output?JSON.stringify(output):null,now,state.revision,semanticRevision).run();
    if(!saved.meta?.changes) return {status:'partial',reason:'source-changed-or-lease-expired'};
    return output || {status:'partial',phase:state.phase,examined:page.results?.length || 0,ledgerSaleCount:state.total,retryAfter:1};
  } finally {
    await database.prepare('UPDATE identity_baseline_preparation SET lease_until=0,lease_token=\'\' WHERE asset_kind=?1 AND lease_token=?2').bind(kind,token).run();
  }
}
