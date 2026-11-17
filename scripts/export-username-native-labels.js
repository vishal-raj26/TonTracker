"use strict";
const fs=require("node:fs"),path=require("node:path");
const {readCsv}=require("./evaluate-username-rebuild");
const {sha256}=require("./audit-username-evaluation-exposure");
async function main(){
  const dir=path.resolve(__dirname,"../research/telegram-usernames/data"),file=path.join(dir,"dune_username_sales.part");
  const sourceSha256=await sha256(file);
  if(sourceSha256!=="6d724b74f727a797d553190cb72e408d3c70d6069202636a60f7ea2b2850682f")throw new Error("Source changed");
  const records=[],rates=new Map();
  await readCsv(file,row=>{
    const native=Number(row.price_native),rate=Number(row.event_usd_rate),usd=Number(row.price_usd),time=Number(row.sale_timestamp)*1000;
    if(![native,rate,usd,time].every(Number.isFinite)||native<=0||rate<=0||usd<=0)return;
    if(Math.abs(native*rate-usd)>Math.max(1e-6,usd*1e-9))throw new Error("Native/USD label mismatch");
    const eventTime=new Date(time).toISOString(),day=eventTime.slice(0,10);
    if(rates.has(day)&&Math.abs(rates.get(day)-rate)>1e-9)throw new Error("Conflicting daily rates");
    rates.set(day,rate);
    records.push({eventId:`${row.nft_item_address}:${row.sale_timestamp}:${row.price_native}`,nftAddress:row.nft_item_address,eventTime,actualUsd:usd,actualNative:native});
  });
  if(await sha256(file)!==sourceSha256)throw new Error("Source changed while reading");
  const report={sourceSha256,ratePolicy:"Retrospective daily source labels; use only rates at least48h after rate-day midnight and at most7days old; no claim of exact historical publication timestamps",
    rates:[...rates].sort((a,b)=>a[0].localeCompare(b[0])).map(([day,usd])=>({day,usd})),records};
  fs.writeFileSync(path.join(dir,"username-native-labels-2026-09-09.json"),JSON.stringify(report)+"\n",{flag:"wx"});
  console.log(JSON.stringify({records:records.length,days:rates.size}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
