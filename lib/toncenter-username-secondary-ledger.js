"use strict";

const crypto=require("node:crypto");
const {classifyTelegramUsername}=require("./username-structural");
const {usernameLengthBucket}=require("./username-engine");
const {attributeHistoricalUsd}=require("./gram-usd-history");
const {canonicalTonAddress}=require("./ton-address");
const {USERNAME_COLLECTION}=require("./username-collection");

const PIPELINE_KEY="username-toncenter-secondary-sales-v1";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function saleContracts(page){
  return new Set(Object.entries(page?.address_book||{}).flatMap(([address,details])=>(details?.interfaces||[])
    .some(value=>String(value).startsWith("nft_sale_"))?[canonicalTonAddress(address)]:[]).filter(Boolean));
}
function usernameFromSale(sale){
  const domain=String(sale?.nft_item?.content?.domain||sale?.nft_item?.content?.name||"").trim().toLowerCase();
  const match=domain.match(/^([a-z0-9_]{1,32})(?:\.t\.me)?$/i);
  return match?.[1]||"";
}
function completedSecondarySales(transferPage,salesPage,{startUtime=0,endUtime=Infinity}={}){
  const contracts=saleContracts(transferPage),candidates=new Map();
  for(const transfer of transferPage?.nft_transfers||[]){
    if(transfer?.transaction_aborted===true)continue;
    const contract=canonicalTonAddress(transfer?.old_owner),nftAddress=canonicalTonAddress(transfer?.nft_address);
    const time=Number(transfer?.transaction_now||0);
    if(contract&&nftAddress&&contracts.has(contract)&&time>=startUtime&&time<endUtime)candidates.set(contract,{transfer,nftAddress});
  }
  const records=[];
  for(const sale of salesPage?.nft_sales||[]){
    const contract=canonicalTonAddress(sale?.address),candidate=candidates.get(contract),nftAddress=canonicalTonAddress(sale?.nft_address);
    const priceNano=Number(sale?.details?.full_price||0),username=usernameFromSale(sale);
    if(!candidate||sale?.details?.is_complete!==true||nftAddress!==candidate.nftAddress||!(priceNano>0)||!username)continue;
    let feature;try{feature=classifyTelegramUsername(username);}catch{continue;}
    const soldAt=Number(candidate.transfer.transaction_now),transactionHash=String(candidate.transfer.transaction_hash||"").trim();
    if(!transactionHash)continue;
    records.push({contract,nftAddress,username:feature.normalizedUsername,feature,soldAt,transactionHash,priceGram:priceNano/1e9,
      eventId:`toncenter-username-secondary:${crypto.createHash("sha256").update(`${contract}|${nftAddress}|${transactionHash}`).digest("hex")}`});
  }
  return records;
}

function createUsernameSecondaryLedger(options={}){
  if(!options.ledger)throw new TypeError("ledger is required");
  const ledger=options.ledger,historicalUsd=options.attributeHistoricalUsd||attributeHistoricalUsd,fetchImpl=options.fetch||fetch;
  const baseUrl=String(options.baseUrl||process.env.TONCENTER_API_BASE_URL||"https://toncenter.com/api/v3").replace(/\/+$/,"");
  const apiKey=String(options.apiKey??process.env.TONCENTER_API_KEY??"").trim(),delay=Math.max(0,Number(options.requestDelayMs??(apiKey?0:1100)));
  const pageLimit=Math.max(10,Math.min(500,Number(options.pageLimit||100))),startUtime=Math.floor(Number(options.historyStartUtime)||0);
  const endUtime=Number.isFinite(Number(options.historyEndUtime))?Math.floor(Number(options.historyEndUtime)):null;
  if(!(startUtime>0)||endUtime!==null&&endUtime<=startUtime)throw new Error("Valid increasing secondary-sale window required");
  let lastRequest=0;
  async function request(pathname,parameters,attempt=0){
    const wait=delay-(Date.now()-lastRequest);if(wait>0)await sleep(wait);lastRequest=Date.now();
    const query=new URLSearchParams();for(const [key,value]of parameters)query.append(key,String(value));
    const headers={accept:"application/json","user-agent":"TonTrack-Username-Secondary/1.0"};if(apiKey)headers["x-api-key"]=apiKey;
    const response=await fetchImpl(`${baseUrl}${pathname}?${query}`,{headers,signal:AbortSignal.timeout(30_000)});
    if((response.status===429||response.status>=500)&&attempt<3){await sleep(1000*2**attempt);return request(pathname,parameters,attempt+1);}
    const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`TON Center ${pathname} ${response.status}: ${payload.error||"unknown"}`);return payload;
  }
  async function runPage(){
    const saved=await ledger.readState(PIPELINE_KEY),cursor=saved?.state?.cursor||{absoluteOffset:0,caughtUp:false};
    const absoluteOffset=Math.max(0,Number(cursor.absoluteOffset)||0),parameters=[["collection_address",USERNAME_COLLECTION],["start_utime",startUtime],
      ["offset",absoluteOffset],["limit",pageLimit],["sort","asc"]];
    if(endUtime!==null)parameters.push(["end_utime",endUtime]);
    const transfers=await request("/nft/transfers",parameters),contracts=saleContracts(transfers);
    const sales=contracts.size?await request("/nft/sales",[...contracts].map(address=>["address",address])):{nft_sales:[]};
    const staged=completedSecondarySales(transfers,sales,{startUtime,endUtime:endUtime??Infinity});
    const priced=await historicalUsd(staged.map(row=>({eventId:row.eventId,nftAddress:row.nftAddress,username:row.username,eventTime:new Date(row.soldAt*1000).toISOString(),
      priceGram:row.priceGram,paymentAsset:"GRAM",finalized:true,marketplace:"Getgems",row})),{logger:console});
    const assets=staged.map(row=>({assetKind:"username",assetKey:row.nftAddress,normalizedName:row.username,displayName:`@${row.username}`,
      primaryRoute:row.feature.primaryRoute,lengthBucket:usernameLengthBucket(row.feature.characterLength),script:row.feature.primaryScript,
      scarcityClass:row.feature.scarcityClass,feature:row.feature,sourceUpdatedAt:new Date(row.soldAt*1000).toISOString()}));
    const output=priced.flatMap(event=>Number(event.priceUsd)>0&&Number(event.historicalUsdRate)>0?[{saleId:event.eventId,assetKind:"username",assetKey:event.nftAddress,
      normalizedName:event.username,soldAt:event.eventTime,priceGram:event.priceGram,historicalUsdRate:event.historicalUsdRate,priceUsd:event.priceUsd,
      marketplace:"Getgems",source:"toncenter-indexed-secondary-sale",reliabilityScore:1,qualityFlags:{verificationTier:"toncenter-completed-sale-contract",
        historicalUsdSource:event.historicalUsdSource,historicalUsdMethod:event.historicalUsdMethod,transactionHash:event.row.transactionHash,saleContract:event.row.contract},
      primaryRoute:event.row.feature.primaryRoute,lengthBucket:usernameLengthBucket(event.row.feature.characterLength),script:event.row.feature.primaryScript,
      scarcityClass:event.row.feature.scarcityClass}]:[]);
    const pendingHistoricalUsd=staged.length-output.length,messages=(transfers.nft_transfers||[]).length;
    const next=pendingHistoricalUsd?cursor:{absoluteOffset:absoluteOffset+messages,caughtUp:messages<pageLimit};
    const [assetsWritten,salesWritten]=await Promise.all([ledger.ingestAssets(assets),ledger.ingestSales(output)]);
    await ledger.writeState(PIPELINE_KEY,next,{transfers:messages,saleContracts:contracts.size,verifiedSales:staged.length,assets:assetsWritten,sales:salesWritten,
      pendingHistoricalUsd,processedAt:new Date().toISOString()});
    return{ok:true,pipeline:PIPELINE_KEY,transfers:messages,saleContracts:contracts.size,verifiedSales:staged.length,assets:assetsWritten,sales:salesWritten,
      pendingHistoricalUsd,caughtUp:Boolean(next.caughtUp)};
  }
  return{runPage};
}

module.exports={PIPELINE_KEY,USERNAME_COLLECTION,saleContracts,usernameFromSale,completedSecondarySales,createUsernameSecondaryLedger};
