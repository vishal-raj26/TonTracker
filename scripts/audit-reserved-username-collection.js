"use strict";
// Price-blind output: raw labels are hashed for integrity, never printed or summarized.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
function auditDirectory(directory,io=fs){
  const state=JSON.parse(io.readFileSync(path.join(directory,"state.json"),"utf8"));
  const names=io.readdirSync(directory).filter(name=>/^page-.*\.json$/.test(name)).sort();
  const events=new Map(),pages=[];
  let duplicates=0;
  for(const name of names){
    const bytes=io.readFileSync(path.join(directory,name)),page=JSON.parse(bytes),sha256=hash(bytes);
    if(name===state.latestPage&&sha256!==state.latestPageSha256)throw new Error("Latest page checksum mismatch");
    if(page.from!==state.from)throw new Error("Collection window mismatch");
    for(const sale of page.sales){
      if(!sale.saleId||sale.assetKind!=="username"||!sale.assetKey||!Number.isFinite(Date.parse(sale.soldAt)))throw new Error("Invalid reserved identity");
      if(Date.parse(sale.soldAt)<Date.parse(state.from))throw new Error("Event outside reserved window");
      const record={saleId:sale.saleId,assetKey:sale.assetKey,soldAt:sale.soldAt,recordSha256:hash(JSON.stringify(sale))};
      const prior=events.get(sale.saleId);
      if(prior){
        if(prior.recordSha256!==record.recordSha256)throw new Error("Conflicting duplicate reserved event");
        duplicates+=1;
      }else events.set(sale.saleId,record);
    }
    pages.push({name,sha256,eventCount:page.sales.length});
  }
  if(!names.includes(state.latestPage))throw new Error("Missing latest page");
  return {directory:path.basename(directory),from:state.from,cursor:state.cursor,pageCount:pages.length,
    uniqueEvents:events.size,uniqueAssets:new Set([...events.values()].map(row=>row.assetKey)).size,duplicateRows:duplicates,pages,events:[...events.values()]};
}
function main(){
  const root=path.resolve(__dirname,"../research/telegram-usernames/data");
  const directories=["current-username-settlements","current-username-settlements-september","current-username-settlements-september-late","current-username-settlements-forward"]
    .filter(name=>fs.existsSync(path.join(root,name,"state.json"))).map(name=>auditDirectory(path.join(root,name)));
  const combined=new Map();let overlap=0;
  for(const directory of directories)for(const event of directory.events){
    const prior=combined.get(event.saleId);
    if(prior){if(prior.recordSha256!==event.recordSha256)throw new Error("Cross-block conflicting event");overlap+=1;}
    else combined.set(event.saleId,event);
  }
  const report={qualification:false,pricesOpened:false,createdAt:new Date().toISOString(),
    limitation:"Integrity baseline, not retroactive provenance proof or sealed qualification manifest; no price/premium counts computed",
    uniqueEvents:combined.size,uniqueAssets:new Set([...combined.values()].map(row=>row.assetKey)).size,crossBlockDuplicateEvents:overlap,directories};
  const index=process.argv.indexOf("--output");
  if(index<0)throw new Error("--output required");
  fs.writeFileSync(path.resolve(process.argv[index+1]),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({...report,directories:directories.map(({events,pages,...summary})=>summary)},null,2));
}
if(require.main===module){try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={auditDirectory};
