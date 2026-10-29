"use strict";

const test=require("node:test"),assert=require("node:assert/strict");
const {Address,beginCell}=require("@ton/core");
const {USERNAME_COLLECTION}=require("../lib/username-collection");
const {parseFragmentAuctionState,parseTonCenterAuctionState,verifyUsernameAuctionState}=require("../lib/username-auction-state");

const nftAddress=`0:${"a".repeat(64)}`,bidder=`0:${"b".repeat(64)}`,observedAt="2026-09-19T15:00:00.000Z",endTime="2026-09-19T20:00:00.000Z";
function html({name="rare",minimum="105",end=endTime,status="On auction"}={}){return `<section class="tm-section tm-auction-section"><span class="tm-section-header-domain"><span class="subdomain">${name}</span><span class="domain">.t.me</span></span><span class="tm-section-header-status tm-status-avail">${status}</span><div class="tm-section-bid-info"><table><th>Minimum Bid</th><div class="icon-ton">${minimum}</div></table></div><time class="tm-countdown-timer" datetime="${end}"></time><button class="js-place-bid-btn" data-bid-amount="${minimum}">Place bid</button></section>`;}
function payload({current=100n,bidTime=Date.parse("2026-09-19T14:00:00Z")/1000,minimum=105n,end=Date.parse(endTime)/1000}={}){
  const address=current?{type:"slice",value:beginCell().storeAddress(Address.parse(bidder)).endCell().toBoc().toString("base64")}:{type:"list",value:[]};
  return {exit_code:0,stack:[address,{type:"num",value:`0x${current.toString(16)}`},{type:"num",value:`0x${BigInt(bidTime).toString(16)}`},{type:"num",value:`0x${minimum.toString(16)}`},{type:"num",value:`0x${BigInt(end).toString(16)}`}]};
}
function item(name="rare"){return {address:nftAddress,collection_address:USERNAME_COLLECTION,content:{domain:`${name}.t.me`}};}

test("independent current auction states produce a short-lived bid signal",()=>{
  const fragment=parseFragmentAuctionState(html(),{username:"rare"},{observedAt});
  const chain=parseTonCenterAuctionState(payload({current:100_000_000_000n,minimum:105_000_000_000n}),item(),{username:"rare",nftAddress},{observedAt});
  const verified=verifyUsernameAuctionState(fragment,chain,{observedAt});
  assert.equal(verified.status,"active");
  assert.equal(verified.currentBidGram,100);
  assert.equal(verified.minimumBidGram,105);
  assert.equal(verified.nowcastEligible,true);
  assert.equal(verified.portfolioEligible,false);
  assert.equal(verified.staleAt,"2026-09-19T15:01:00.000Z");
});

test("minimum bid without an actual bid is not nowcast evidence",()=>{
  const fragment=parseFragmentAuctionState(html({minimum:"7"}),{username:"rare"},{observedAt});
  const chain=parseTonCenterAuctionState(payload({current:0n,bidTime:0,minimum:7_000_000_000n}),item(),{username:"rare",nftAddress},{observedAt});
  const verified=verifyUsernameAuctionState(fragment,chain,{observedAt});
  assert.equal(verified.currentBidGram,0);
  assert.equal(verified.nowcastEligible,false);
});

test("expired, mismatched and wrong-identity auction states fail closed",()=>{
  assert.equal(parseFragmentAuctionState(html({end:"2026-09-19T14:59:59Z"}),{username:"rare"},{observedAt}).status,"expired");
  assert.equal(parseTonCenterAuctionState(payload(),item("other"),{username:"rare",nftAddress},{observedAt}).status,"identity-mismatch");
  const fragment=parseFragmentAuctionState(html(),{username:"rare"},{observedAt});
  const chain=parseTonCenterAuctionState(payload({current:100_000_000_000n,minimum:106_000_000_000n}),item(),{username:"rare",nftAddress},{observedAt});
  assert.equal(verifyUsernameAuctionState(fragment,chain,{observedAt}).status,"unavailable");
});
