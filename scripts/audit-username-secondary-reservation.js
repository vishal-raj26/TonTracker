"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
function main(){const directory=path.resolve(__dirname,"../research/telegram-usernames/data/current-username-secondary-forward"),state=JSON.parse(fs.readFileSync(path.join(directory,"state.json"),"utf8"));
  const pages=[],events=new Map();let duplicates=0;for(const name of fs.readdirSync(directory).filter(value=>/^page-.*\.json$/.test(value)).sort()){
    const bytes=fs.readFileSync(path.join(directory,name)),page=JSON.parse(bytes),sha256=hash(bytes);if(name===state.latestPage&&sha256!==state.latestPageSha256)throw new Error("Latest page checksum mismatch");
    if(page.from!==state.from)throw new Error("Secondary window mismatch");for(const sale of page.sales||[]){if(!sale.saleId||sale.assetKind!=="username"||sale.source!=="toncenter-indexed-secondary-sale")throw new Error("Invalid secondary event");
      const record={saleId:sale.saleId,assetKey:sale.assetKey,soldAt:sale.soldAt,recordSha256:hash(JSON.stringify(sale))},prior=events.get(sale.saleId);
      if(prior){if(prior.recordSha256!==record.recordSha256)throw new Error("Conflicting duplicate secondary event");duplicates+=1;}else events.set(sale.saleId,record);}
    pages.push({name,sha256,eventCount:(page.sales||[]).length});}
  const report={qualification:false,pricesOpened:false,createdAt:new Date().toISOString(),directory:path.basename(directory),from:state.from,cursor:state.cursor,
    uniqueEvents:events.size,uniqueAssets:new Set([...events.values()].map(row=>row.assetKey)).size,duplicateRows:duplicates,pages,events:[...events.values()],
    limitation:"Price-blind integrity audit only; no outcome values or premium counts computed"};
  const index=process.argv.indexOf("--output");if(index<0)throw new Error("--output required");fs.writeFileSync(path.resolve(process.argv[index+1]),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({...report,pages:pages.length,events:undefined},null,2));}
if(require.main===module)try{main();}catch(error){console.error(error.message);process.exitCode=1;}
