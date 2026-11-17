"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { boundedTrainingSample, learnedUsernameSale } = require("../scripts/refresh-identity-baselines");
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');

test('CLI preserves exact valuation writes by default and opts into prepared aggregates explicitly',async()=> {
  const calls=[];
  const server=http.createServer(async(request,response)=> {
    let raw='';for await(const part of request) raw+=part;
    const body=raw?JSON.parse(raw):{};
    calls.push({path:request.url,body});
    response.setHeader('content-type','application/json');
    if(request.url==='/identity/sales/read') {
      response.end(JSON.stringify({records:[{sale_id:'sale-1',asset_key:`${body.assetKind}:example`,normalized_name:body.assetKind==='dns'?'example.ton':'example',
        sold_at:Math.floor(Date.now()/1000)-100,price_usd:100,price_gram:100,historical_usd_rate:1,reliability_score:1,primary_route:'residual',length_bucket:'6-8',script:'Latin',scarcity_class:'standard'}],nextCursor:null}));
    } else if(request.url==='/identity/baseline-source/read') {
      response.statusCode=202;response.end(JSON.stringify({status:'partial',phase:'counts',ledgerSaleCount:500}));
    } else response.end(JSON.stringify({written:body.records?.length || 0}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const env={...process.env,D1_REGISTRY_URL:`http://127.0.0.1:${server.address().port}`,D1_INGEST_SECRET:'test'};
    await promisify(execFile)(process.execPath,['scripts/refresh-identity-baselines.js'],{env,timeout:15000});
    assert.equal(calls.filter(call=>call.path==='/ingest/valuations').length,2,'default CLI must keep DNS and Username exact valuation writes');
    assert.equal(calls.some(call=>call.path==='/identity/baseline-source/read'),false);
    calls.length=0;
    await promisify(execFile)(process.execPath,['scripts/refresh-identity-baselines.js','--prepared'],{env,timeout:15000});
    assert.equal(calls.filter(call=>call.path==='/identity/baseline-source/read').length,16);
    assert.equal(calls.some(call=>call.path==='/identity/sales/read' || call.path==='/ingest/valuations'),false);
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test('partial baseline source never publishes or advances a completed refresh', async () => {
  const {configureLedger,refreshKindFromAggregate}=require('../scripts/refresh-identity-baselines');
  const writes=[];
  configureLedger({baseUrl:'https://registry.test',secret:'test',fetch:async(url,init)=> {
    if(url.endsWith('/identity/baseline-source/read')) return Response.json({status:'partial',phase:'counts',ledgerSaleCount:500},{status:202});
    writes.push({url,init});return Response.json({written:0});
  }});
  const result=await refreshKindFromAggregate('username');
  assert.equal(result.status,'partial');
  assert.equal(writes.length,0);
});

test("bounds learned-model training while retaining rare high-value sales", () => {
  const rows = Array.from({ length: 5000 }, (_, index) => ({
    sale_id: `sale-${index}`,
    normalized_name: `name${index}`,
    sold_at: 1_700_000_000 + index,
    price_usd: index === 4999 ? 1_000_000 : 10 + (index % 100),
  }));
  const first = boundedTrainingSample(rows, 512);
  const second = boundedTrainingSample(rows, 512);

  assert.equal(first.length, 512);
  assert.ok(first.some((row) => row.sale_id === "sale-4999"));
  assert.deepEqual(first.map((row) => row.sale_id), second.map((row) => row.sale_id));
});

test("username baseline training keeps prepared D1 semantic knowledge", () => {
  const semantic = JSON.stringify({ schemaVersion: "username-knowledge-v5", dictionaryMatch: true });
  assert.deepEqual(learnedUsernameSale({
    normalized_name: "conviction",
    price_usd: "1555.31",
    sold_at: "1770000000",
    reliability_score: "0.95",
    semantic_json: semantic,
  }), {
    normalized_name: "conviction",
    price_usd: 1555.31,
    sold_at: 1770000000,
    reliability_score: 0.95,
    semantic_json: semantic,
  });
});
