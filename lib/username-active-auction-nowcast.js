"use strict";

function finite(value){const number=Number(value);return Number.isFinite(number)?number:0;}
function upperFactor(hoursToClose){
  if(hoursToClose<=1)return 1.05;
  if(hoursToClose<=6)return 1.8;
  if(hoursToClose<=24)return 2;
  return 4.7;
}
function quoteUsernameActiveAuction(state,{gramUsdRate,now=Date.now()}={}){
  const nowMs=Number(now),observedMs=Date.parse(state?.observedAt||""),staleMs=Date.parse(state?.staleAt||""),endMs=Date.parse(state?.endTime||""),bidGram=finite(state?.currentBidGram),rate=finite(gramUsdRate);
  if(state?.schemaVersion!=="username-verified-auction-state-v1"||state?.status!=="active"||state?.identityVerified!==true||state?.independentlyConfirmed!==true
    ||state?.nowcastEligible!==true||state?.portfolioEligible!==false||!(bidGram>0)||!(rate>0)||!Number.isFinite(nowMs)||!Number.isFinite(observedMs)
    ||!Number.isFinite(staleMs)||!Number.isFinite(endMs)||observedMs>nowMs||nowMs>=staleMs||nowMs>=endMs)
    return {status:"unavailable",reason:"verified-live-bid-unavailable",portfolioEligible:false};
  const hoursToClose=(endMs-nowMs)/36e5,factor=upperFactor(hoursToClose),estimateUsd=bidGram*rate;
  return {schemaVersion:"username-active-auction-nowcast-v1",status:"active-auction-nowcast",username:state.username,nftAddress:state.nftAddress,
    estimateGram:bidGram,estimateUsd,rangeLowUsd:estimateUsd,rangeHighUsd:estimateUsd*factor,currentBidGram:bidGram,gramUsdRate:rate,
    hoursToClose,upperFactor:factor,observedAt:state.observedAt,staleAt:state.staleAt,endTime:state.endTime,portfolioEligible:false,
    limitation:"Verified current bid is a short-lived active-auction nowcast, not an inactive resale floor or portfolio value"};
}
module.exports={quoteUsernameActiveAuction,upperFactor};
