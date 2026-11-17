// Every page is limited before filtering or joining. No schema creation or broad
// fallback is allowed here: migrations are an explicit operator rollout step.
export const MAINTENANCE_PAGE_SIZE = 500;

export async function withMaintenanceLease(database,job,work) {
  const token=crypto.randomUUID();
  const now=Math.floor(Date.now()/1000);
  await database.prepare('INSERT OR IGNORE INTO bounded_maintenance_state(job_key) VALUES(?1)').bind(job).run();
  const lease=await database.prepare(`UPDATE bounded_maintenance_state SET lease_token=?2,lease_until=?3
    WHERE job_key=?1 AND lease_until<=?4`).bind(job,token,now+60,now).run();
  if(!lease.meta?.changes) return {status:'partial',reason:'lease-held',deletedEvents:0,deletedCombos:0};
  try {return await work({job,token});} finally {
    await database.prepare("UPDATE bounded_maintenance_state SET lease_token='',lease_until=0 WHERE job_key=?1 AND lease_token=?2").bind(job,token).run();
  }
}

export async function maintenanceReady(database, kind) {
  try {
    const row = await database.prepare("SELECT status FROM bounded_maintenance_state WHERE job_key=?1")
      .bind(`schema:${kind}:v1`).first();
    return row?.status === 'complete';
  } catch { return false; }
}

export async function advanceCounter(database, table) {
  // table comes exclusively from the allowlist below; never from a request.
  if (!['gift_sale_events','gift_sale_combos'].includes(table)) throw new Error('Unsupported counter');
  const key = table === 'gift_sale_events' ? 'sale_id' : 'rowid';
  const cursor=key==='rowid'?'CAST(cursor AS INTEGER)':'cursor';
  await database.prepare(`UPDATE bounded_maintenance_state SET
    total=total+(SELECT COUNT(*) FROM (SELECT ${key} FROM ${table} WHERE ${key}>${cursor} ORDER BY ${key} LIMIT ${MAINTENANCE_PAGE_SIZE})),
    status=CASE WHEN (SELECT COUNT(*) FROM (SELECT ${key} FROM ${table} WHERE ${key}>${cursor} ORDER BY ${key} LIMIT ${MAINTENANCE_PAGE_SIZE}))<${MAINTENANCE_PAGE_SIZE} THEN 'complete' ELSE 'partial' END,
    cursor=COALESCE((SELECT MAX(${key}) FROM (SELECT ${key} FROM ${table} WHERE ${key}>${cursor} ORDER BY ${key} LIMIT ${MAINTENANCE_PAGE_SIZE})),cursor),
    updated_at=CURRENT_TIMESTAMP WHERE job_key=?1 AND status='partial'`)
    .bind(`count:${table}`).run();
  return database.prepare('SELECT cursor,total,status FROM bounded_maintenance_state WHERE job_key=?1').bind(`count:${table}`).first();
}

async function state(database, key) {
  const row = await database.prepare('SELECT data_json FROM bounded_maintenance_state WHERE job_key=?1').bind(key).first();
  try { return JSON.parse(row?.data_json || '{}'); } catch { throw new Error('Invalid maintenance checkpoint'); }
}

async function saveState(database,key,value,lease) {
  const result=await database.prepare(`INSERT INTO bounded_maintenance_state(job_key,data_json) SELECT ?1,?2
    WHERE EXISTS(SELECT 1 FROM bounded_maintenance_state WHERE job_key=?3 AND lease_token=?4 AND lease_until>unixepoch())
    ON CONFLICT(job_key) DO UPDATE SET data_json=excluded.data_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(key,JSON.stringify(value),lease.job,lease.token).run();
  if(!result.meta?.changes) throw new Error('Maintenance lease expired; checkpoint preserved');
}

export async function boundedOrphanSweep(database,lease) {
  if(!lease) return withMaintenanceLease(database,'maintenance:compact',held=>boundedOrphanSweep(database,held));
  const key='orphan:gift_sale_combos';
  const cursor=Number((await state(database,key)).cursor || 0);
  // Materialize the bounded candidate page BEFORE probing events. A LIMIT on
  // an outer anti-join would still walk every non-orphan combo on an idle shard.
  const page=await database.prepare(`SELECT combo_id FROM gift_sale_combos WHERE combo_id>?1 ORDER BY combo_id LIMIT ${MAINTENANCE_PAGE_SIZE}`).bind(cursor).all();
  let deleted=0;
  for(let index=0;index<(page.results || []).length;index+=90) {
    const ids=page.results.slice(index,index+90).map(row=>row.combo_id);
    const result=await database.prepare(`DELETE FROM gift_sale_combos WHERE combo_id IN (${ids.map(()=>'?').join(',')}) AND NOT EXISTS
      (SELECT 1 FROM gift_sale_events INDEXED BY gift_sale_events_combo_bounded_idx WHERE combo_id=gift_sale_combos.combo_id LIMIT 1)`).bind(...ids).run();
    deleted+=Number(result.meta?.changes || 0);
  }
  await saveState(database,key,{cursor:page.results?.length===MAINTENANCE_PAGE_SIZE ? page.results.at(-1).combo_id : 0},lease);
  return deleted;
}

export async function boundedCompactPrune(database, options={}) {
  if(!await maintenanceReady(database,'compact')) return {status:'migration-required',deletedEvents:0,deletedCombos:0};
  return withMaintenanceLease(database,'maintenance:compact',async(lease)=> {
  const counter=await advanceCounter(database,'gift_sale_events');
  await advanceCounter(database,'gift_sale_combos');
  if(counter?.status!=='complete') return {status:'partial',reconciliation:counter,deletedEvents:0,deletedCombos:0};
  const maxEvents=Math.max(10000,Number(options.maxEvents || 400000));
  const limit=Math.max(1,Math.min(MAINTENANCE_PAGE_SIZE,Number(options.batchLimit || MAINTENANCE_PAGE_SIZE)));
  let deletedEvents=0;
  const job='prune:gift_sale_events';
  if(counter.total>maxEvents) {
    const cursor=await state(database,job);
    const page=await database.prepare(`SELECT sale_id,combo_id,sold_at FROM gift_sale_events INDEXED BY gift_sale_events_time_bounded_idx
      WHERE (sold_at,sale_id)>(?1,?2) ORDER BY sold_at,sale_id LIMIT ?3`)
      .bind(Number(cursor.soldAt ?? -1),String(cursor.saleId || ''),limit).all();
    for(let index=0;index<(page.results || []).length;index+=90) {
      const ids=page.results.slice(index,index+90).map(row=>row.sale_id);
      const result=await database.prepare(`DELETE FROM gift_sale_events WHERE sale_id IN (
        SELECT candidate.sale_id FROM gift_sale_events AS candidate WHERE candidate.sale_id IN (${ids.map(()=>'?').join(',')})
        AND (EXISTS(SELECT 1 FROM gift_sale_events AS newer INDEXED BY gift_sale_events_combo_bounded_idx
          WHERE newer.combo_id=candidate.combo_id AND newer.sold_at=candidate.sold_at AND newer.sale_id>candidate.sale_id LIMIT 1)
          OR EXISTS(SELECT 1 FROM gift_sale_events AS newer INDEXED BY gift_sale_events_combo_bounded_idx
          WHERE newer.combo_id=candidate.combo_id AND newer.sold_at>candidate.sold_at LIMIT 1))
        LIMIT MAX(0,MIN(?,(SELECT total FROM bounded_maintenance_state WHERE job_key='count:gift_sale_events')-?)))`)
        .bind(...ids,limit-deletedEvents,maxEvents).run();
      deletedEvents+=Number(result.meta?.changes || 0);
    }
    if((page.results || []).length<limit) {
      // Only after a complete duplicate-first traversal may sparse newest
      // evidence be removed to enforce the shard hard cap.
      const result=await database.prepare(`DELETE FROM gift_sale_events WHERE sale_id IN
        (SELECT sale_id FROM gift_sale_events INDEXED BY gift_sale_events_time_bounded_idx ORDER BY sold_at,sale_id
          LIMIT MAX(0,MIN(?1,(SELECT total FROM bounded_maintenance_state WHERE job_key='count:gift_sale_events')-?2)))`)
        .bind(limit-deletedEvents,maxEvents).run();
      deletedEvents+=Number(result.meta?.changes || 0);
      await saveState(database,job,{},lease);
    } else {
      const last=page.results.at(-1);
      await saveState(database,job,{soldAt:last.sold_at,saleId:last.sale_id},lease);
    }
  }
  const deletedCombos=options.forceOrphanSweep || deletedEvents ? await boundedOrphanSweep(database,lease) : 0;
  return {status:'complete',before:counter.total,after:counter.total-deletedEvents,deletedEvents,deletedCombos};
  });
}

export async function boundedCompactStats(database) {
  if(!await maintenanceReady(database,'compact')) return {events:null,combinations:null,countsStatus:'migration-required'};
  const rows=await database.prepare("SELECT job_key,total,status FROM bounded_maintenance_state WHERE job_key IN ('count:gift_sale_events','count:gift_sale_combos')").all();
  const counters=new Map((rows.results || []).map(row=>[row.job_key,row]));
  const events=counters.get('count:gift_sale_events');
  const combos=counters.get('count:gift_sale_combos');
  const bounds=await database.prepare(`SELECT
    (SELECT sold_at FROM gift_sale_events INDEXED BY gift_sale_events_time_bounded_idx ORDER BY sold_at,sale_id LIMIT 1) AS earliest_sold_at,
    (SELECT sold_at FROM gift_sale_events INDEXED BY gift_sale_events_time_bounded_idx ORDER BY sold_at DESC,sale_id DESC LIMIT 1) AS latest_sold_at,
    (SELECT ingested_at FROM gift_sale_events INDEXED BY gift_sale_events_ingested_bounded_idx ORDER BY ingested_at DESC LIMIT 1) AS latest_ingested_at`).first();
  return {...bounds,events:events?.status==='complete'?events.total:null,combinations:combos?.status==='complete'?combos.total:null,
    countsStatus:events?.status==='complete' && combos?.status==='complete'?'complete':'partial'};
}

export async function boundedCounterBootstrap(database,scope,requestedSteps=1) {
  if(scope!=='compact') throw new Error('Unsupported bootstrap scope');
  if(!await maintenanceReady(database,scope)) return {status:'migration-required'};
  const tables=['gift_sale_events','gift_sale_combos'];
  const steps=Math.max(1,Math.min(4,Math.floor(Number(requestedSteps)||1)));
  return withMaintenanceLease(database,`maintenance:${scope}`,async()=> {
    const counters={};
    let completedSteps=0;
    for(let step=0;step<steps;step++) {
      for(const table of tables) counters[table]=await advanceCounter(database,table);
      completedSteps++;
      if(tables.every(table=>counters[table]?.status==='complete')) break;
    }
    return {status:tables.every(table=>counters[table]?.status==='complete')?'complete':'partial',scope,counters,
      steps:completedSteps,sourceRowBudget:completedSteps*tables.length*MAINTENANCE_PAGE_SIZE*3};
  });
}

export async function boundedCompactRetention(database,cutoff) {
  if(!await maintenanceReady(database,'compact')) return {status:'migration-required'};
  return withMaintenanceLease(database,'maintenance:compact',async(lease)=> {
  const result=await database.prepare(`DELETE FROM gift_sale_events WHERE sale_id IN
    (SELECT sale_id FROM gift_sale_events INDEXED BY gift_sale_events_time_bounded_idx WHERE sold_at<?1 ORDER BY sold_at,sale_id LIMIT ${MAINTENANCE_PAGE_SIZE})`).bind(cutoff).run();
  return {status:'complete',deletedEvents:Number(result.meta?.changes || 0),deletedCombos:await boundedOrphanSweep(database,lease)};
  });
}

export async function boundedLegacyRetention(database,cutoff) {
  if(!await maintenanceReady(database,'legacy')) return {status:'migration-required'};
  return withMaintenanceLease(database,'maintenance:legacy',async(lease)=> {
  const job='retention:gift_sales';
  const cursor=await state(database,job);
  const page=await database.prepare(`SELECT sale_id,collection_key,model_key,backdrop_key,sold_at FROM gift_sales INDEXED BY gift_sales_time_bounded_idx
    WHERE sold_at<?1 AND (sold_at,sale_id)>(?2,?3) ORDER BY sold_at,sale_id LIMIT ${MAINTENANCE_PAGE_SIZE}`)
    .bind(cutoff,String(cursor.soldAt || ''),String(cursor.saleId || '')).all();
  let deletedEvents=0;
  for(let index=0;index<(page.results || []).length;index+=90) {
    const ids=page.results.slice(index,index+90).map(row=>row.sale_id);
    // At most ten indexed newer peers are examined. Keep ten exact-combo
    // observations, including ties, without a global ROW_NUMBER partition.
    const result=await database.prepare(`DELETE FROM gift_sales WHERE sale_id IN (
      SELECT candidate.sale_id FROM gift_sales AS candidate WHERE candidate.sale_id IN (${ids.map(()=>'?').join(',')}) AND
      (SELECT COUNT(*) FROM (SELECT sale_id FROM (SELECT sale_id FROM gift_sales INDEXED BY gift_sales_exact_bounded_idx
        WHERE collection_key=candidate.collection_key AND model_key=candidate.model_key AND backdrop_key=candidate.backdrop_key
          AND sold_at=candidate.sold_at AND sale_id>candidate.sale_id ORDER BY sale_id LIMIT 10)
        UNION ALL SELECT sale_id FROM (SELECT sale_id FROM gift_sales INDEXED BY gift_sales_exact_bounded_idx
        WHERE collection_key=candidate.collection_key AND model_key=candidate.model_key AND backdrop_key=candidate.backdrop_key
          AND sold_at>candidate.sold_at ORDER BY sold_at,sale_id LIMIT 10) LIMIT 10))=10)`)
      .bind(...ids).run();
    deletedEvents+=Number(result.meta?.changes || 0);
  }
  const last=page.results?.at(-1);
  await saveState(database,job,page.results?.length===MAINTENANCE_PAGE_SIZE ? {soldAt:last.sold_at,saleId:last.sale_id} : {},lease);
  return {status:'complete',examined:page.results?.length || 0,deletedEvents};
  });
}
