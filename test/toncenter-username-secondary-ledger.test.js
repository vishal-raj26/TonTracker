"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {USERNAME_COLLECTION,completedSecondarySales,createUsernameSecondaryLedger}=require("../lib/toncenter-username-secondary-ledger");
const contract=`0:${"a".repeat(64)}`,nft=`0:${"b".repeat(64)}`,tx="verified-tx";
function pages(overrides={}){return{transfers:{nft_transfers:[{old_owner:contract,nft_address:nft,transaction_now:200,transaction_lt:50,transaction_hash:tx,...overrides.transfer}],
  address_book:{[contract]:{interfaces:["nft_sale_getgems_v4"]}}},sales:{nft_sales:[{address:contract,nft_address:nft,
    details:{is_complete:true,full_price:"169000000000",...overrides.details},nft_item:{content:{domain:"goldenpay.t.me"}},...overrides.sale}]}};}
test("accepts only exact completed Username NFT secondary sale contracts",()=>{
  const value=pages(),rows=completedSecondarySales(value.transfers,value.sales,{startUtime:100,endUtime:300});
  assert.equal(rows.length,1);assert.equal(rows[0].username,"goldenpay");assert.equal(rows[0].priceGram,169);assert.match(rows[0].eventId,/^toncenter-username-secondary:/);
  for(const changed of [{details:{is_complete:false}},{details:{full_price:"0"}},{sale:{nft_address:`0:${"c".repeat(64)}`}},{transfer:{transaction_aborted:true}},
    {sale:{nft_item:{content:{domain:"not-a-username.ton"}}}},{transfer:{transaction_hash:""}}]){
    const bad=pages(changed);assert.equal(completedSecondarySales(bad.transfers,bad.sales,{startUtime:100,endUtime:300}).length,0);
  }
});
test("secondary ledger persists verified historical-USD sales with a durable offset",async()=>{
  const value=pages(),writes={assets:[],sales:[],state:null},ledger={readState:async()=>null,ingestAssets:async rows=>(writes.assets.push(...rows),rows.length),
    ingestSales:async rows=>(writes.sales.push(...rows),rows.length),writeState:async(_key,cursor,metadata)=>{writes.state={cursor,metadata};}};
  const fetch=async url=>new Response(JSON.stringify(new URL(url).pathname.endsWith("/nft/transfers")?value.transfers:value.sales),{status:200,headers:{"content-type":"application/json"}});
  const runtime=createUsernameSecondaryLedger({ledger,fetch,requestDelayMs:0,pageLimit:10,historyStartUtime:100,historyEndUtime:300,
    attributeHistoricalUsd:async events=>events.map(event=>({...event,historicalUsdRate:2,priceUsd:event.priceGram*2,historicalUsdSource:"test",historicalUsdMethod:"exact"}))});
  const result=await runtime.runPage();assert.equal(result.sales,1);assert.equal(writes.sales[0].priceUsd,338);assert.equal(writes.sales[0].marketplace,"Getgems");
  assert.equal(writes.sales[0].source,"toncenter-indexed-secondary-sale");assert.deepEqual(writes.state.cursor,{absoluteOffset:1,caughtUp:true});
  assert.equal(new URL(`https://example.test/?collection=${USERNAME_COLLECTION}`).searchParams.get("collection"),USERNAME_COLLECTION);
});
