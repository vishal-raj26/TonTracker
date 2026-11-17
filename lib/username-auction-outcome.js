"use strict";

const {postObservationBids}=require("./username-auction-bid-evidence");

function settlementCandidate(events,{observedAt,endTime}){
  const after=Date.parse(observedAt||""),end=Date.parse(endTime||"");
  if(!Number.isFinite(after)||!Number.isFinite(end)||end<=after)throw new Error("Invalid auction outcome window");
  return (events||[]).filter(event=>{
    const time=Date.parse(event?.eventTime||event?.soldAt||"");
    return Number.isFinite(time)&&time>after&&time<=end+15*60_000&&Number(event?.priceGram)>0;
  }).sort((a,b)=>Date.parse(a.eventTime||a.soldAt)-Date.parse(b.eventTime||b.soldAt)).at(-1)||null;
}

function classifyUsernameAuctionOutcome(snapshot,{events=[],transactions=[],settlementVerification=null,providersComplete=false,observedAt}={}){
  const state=snapshot?.state;
  if(!state||state.status!=="active")return {status:"indeterminate",reason:"frozen-active-state-unavailable"};
  const capturedAt=state.observedAt,endTime=state.endTime,checkedAt=observedAt||new Date().toISOString();
  if(Date.parse(checkedAt)<=Date.parse(endTime))return {status:"indeterminate",reason:"auction-not-closed"};
  const candidate=settlementCandidate(events,{observedAt:capturedAt,endTime});
  if(candidate&&settlementVerification?.verified===true)return {status:"sold",sale:candidate,verification:settlementVerification};
  if(!providersComplete)return {status:"indeterminate",reason:"outcome-provider-incomplete"};
  const laterBids=postObservationBids(transactions,{nftAddress:snapshot.nftAddress},{after:capturedAt,before:endTime});
  if(candidate)return {status:"indeterminate",reason:"unverified-sale-observed",sale:candidate,laterBids};
  if(BigInt(state.currentBidNano||"0")===0n&&laterBids.length===0)
    return {status:"unsold-no-bid-observed",reason:"verified-zero-bid-snapshot-no-later-chain-bids-and-no-fragment-sale",laterBids};
  return {status:"indeterminate",reason:"bid-observed-without-verified-settlement",laterBids};
}

module.exports={classifyUsernameAuctionOutcome,settlementCandidate};
