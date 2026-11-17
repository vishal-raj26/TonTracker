"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {createUsernameSecondaryLedger}=require("../lib/toncenter-username-secondary-ledger");
const FROM="2026-09-20T14:00:00Z",DIRECTORY="current-username-secondary-forward";
function until(argv){const index=argv.indexOf("--until"),value=index<0?"":argv[index+1],time=Date.parse(value);
  if(!Number.isFinite(time)||time<=Date.parse(FROM)||time>Date.now())throw new Error("--until must be after the sealed start and no later than now");return Math.floor(time/1000);}
function pageSize(argv){const index=argv.indexOf("--page-size"),value=index<0?100:Number(argv[index+1]);
  if(!Number.isInteger(value)||value<10||value>200)throw new Error("--page-size must be an integer from10 through200");return value;}
async function main(){
  const historyEndUtime=until(process.argv),limit=pageSize(process.argv),directory=path.resolve(__dirname,`../research/telegram-usernames/data/${DIRECTORY}`);
  fs.mkdirSync(directory,{recursive:true});const statePath=path.join(directory,"state.json"),saved=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,"utf8")):null;
  if(saved&&(saved.schemaVersion!=="username-secondary-local-v1"||saved.from!==FROM))throw new Error("Incompatible secondary collection checkpoint");
  const captured={assets:[],sales:[]},ledger={readState:async()=>saved?{state:{cursor:saved.cursor}}:null,
    ingestAssets:async rows=>(captured.assets.push(...rows),rows.length),ingestSales:async rows=>(captured.sales.push(...rows),rows.length),
    writeState:async(pipeline,cursor,metadata)=>{const report={schemaVersion:"username-secondary-local-v1",from:FROM,pipeline,collectedAt:new Date().toISOString(),cursor,metadata,...captured};
      const bytes=JSON.stringify(report,null,2)+"\n",file=`page-${Date.now()}-${crypto.randomUUID()}.json`;fs.writeFileSync(path.join(directory,file),bytes,{flag:"wx"});
      const next={schemaVersion:report.schemaVersion,from:FROM,cursor,metadata,latestPage:file,latestPageSha256:crypto.createHash("sha256").update(bytes).digest("hex")},temporary=`${statePath}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(temporary,JSON.stringify(next,null,2)+"\n",{flag:"wx"});fs.renameSync(temporary,statePath);}};
  const collector=createUsernameSecondaryLedger({ledger,historyStartUtime:Date.parse(FROM)/1000,historyEndUtime,pageLimit:limit});
  console.log(JSON.stringify(await collector.runPage()));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={FROM,DIRECTORY,until,pageSize};
