"use strict";

const {Address, Cell, toNano} = require("@ton/core");
const {canonicalTonAddress} = require("./ton-address");
const {USERNAME_COLLECTION} = require("./username-collection");
const {normalizeTelegramUsername} = require("./username-structural");

const DEFAULT_FRAGMENT_URL = "https://fragment.com";
const DEFAULT_TONCENTER_URL = "https://toncenter.com/api/v3";

function parseObservedAt(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) throw new Error("Invalid auction observation time");
  return time;
}
function section(html) {
  return String(html || "").match(/<section class="[^"]*tm-auction-section[^"]*">([\s\S]*?)<\/section>/i)?.[0] || "";
}
function textAmount(value) {
  const normalized = String(value || "").replace(/<[^>]*>/g, "").replace(/[,$\s]/g, "");
  return /^\d+(?:\.\d+)?$/.test(normalized) ? normalized : null;
}
function parseFragmentAuctionState(html, target, {observedAt} = {}) {
  const observedAtMs = parseObservedAt(observedAt), auction = section(html);
  if (!auction) return {status:"not-observed",source:"fragment-public-page"};
  if (!/tm-section-header-status[^>]*tm-status-avail[^>]*>\s*On auction\s*</i.test(auction))
    return {status:"not-active",source:"fragment-public-page"};
  const pageName = auction.match(/tm-section-header-domain[\s\S]*?<span class="subdomain">([^<]+)<\/span>/i)?.[1];
  let username;
  try { username = normalizeTelegramUsername(pageName); } catch { return {status:"identity-mismatch",source:"fragment-public-page"}; }
  if (username !== normalizeTelegramUsername(target.username)) return {status:"identity-mismatch",source:"fragment-public-page"};
  const bidSection = auction.match(/tm-section-bid-info[\s\S]*?<\/table>/i)?.[0] || "";
  if (!/Minimum Bid/i.test(bidSection)) return {status:"malformed",source:"fragment-public-page"};
  const minimumText = textAmount(bidSection.match(/icon-ton">([\s\S]*?)<\/div>/i)?.[1]);
  const endText = auction.match(/tm-countdown-timer[^>]*datetime="([^"]+)"/i)?.[1];
  const endMs = Date.parse(endText || "");
  if (!minimumText || !Number.isFinite(endMs)) return {status:"malformed",source:"fragment-public-page"};
  if (endMs <= observedAtMs) return {status:"expired",source:"fragment-public-page",username,endTime:new Date(endMs).toISOString()};
  let minimumBidNano;
  try { minimumBidNano = toNano(minimumText); } catch { return {status:"malformed",source:"fragment-public-page"}; }
  const buttonMinimum = textAmount(auction.match(/js-place-bid-btn"\s*data-bid-amount="([^"]+)"/i)?.[1]);
  if (buttonMinimum && toNano(buttonMinimum) !== minimumBidNano) return {status:"conflict",source:"fragment-public-page"};
  const buyNowText = textAmount(auction.match(/js-buy-now-btn"\s*data-bid-amount="([^"]+)"/i)?.[1]);
  return {schemaVersion:"username-fragment-auction-state-v1",status:"active",source:"fragment-public-page",username,
    observedAt:new Date(observedAtMs).toISOString(),minimumBidNano:minimumBidNano.toString(),
    buyNowNano:buyNowText?toNano(buyNowText).toString():null,endTime:new Date(endMs).toISOString(),identityVerified:true};
}
function stackBigInt(item) {
  if (item?.type !== "num" || !/^(?:-?0x[0-9a-f]+|-?\d+)$/i.test(String(item.value))) throw new Error("Invalid auction getter number");
  return BigInt(item.value);
}
function stackAddress(item) {
  if (item?.type === "list" && Array.isArray(item.value) && item.value.length === 0) return null;
  if (!item || !["slice","cell"].includes(item.type) || typeof item.value !== "string") throw new Error("Invalid auction getter address");
  const address = Cell.fromBoc(Buffer.from(item.value,"base64"))[0].beginParse().loadAddress();
  return canonicalTonAddress(address.toRawString());
}
function itemIdentity(item, target) {
  const address = canonicalTonAddress(item?.address), collection = canonicalTonAddress(item?.collection_address);
  const expectedAddress = canonicalTonAddress(target.nftAddress), expectedName = normalizeTelegramUsername(target.username);
  const domain = String(item?.content?.domain || "").toLowerCase().replace(/\.t\.me$/, "");
  const uriName = String(item?.content?.uri || "").match(/\/username\/([^/?#]+)\.json$/i)?.[1]?.toLowerCase();
  return address === expectedAddress && collection === USERNAME_COLLECTION && (domain === expectedName || uriName === expectedName);
}
function parseTonCenterAuctionState(payload, item, target, {observedAt} = {}) {
  const observedAtMs = parseObservedAt(observedAt);
  if (!itemIdentity(item,target)) return {status:"identity-mismatch",source:"toncenter-get-method"};
  if (Number(payload?.exit_code) !== 0 || !Array.isArray(payload?.stack) || payload.stack.length < 5)
    return {status:"not-active",source:"toncenter-get-method"};
  let bidder,currentBid,bidTime,minimumBid,endTime;
  try {
    [bidder,currentBid,bidTime,minimumBid,endTime]=[stackAddress(payload.stack[0]),stackBigInt(payload.stack[1]),stackBigInt(payload.stack[2]),stackBigInt(payload.stack[3]),stackBigInt(payload.stack[4])];
  } catch { return {status:"malformed",source:"toncenter-get-method"}; }
  if (currentBid < 0n || minimumBid <= 0n || endTime <= 0n || (currentBid === 0n)!==(bidder === null) || (currentBid === 0n)!==(bidTime === 0n)
    || (currentBid > 0n && minimumBid <= currentBid)) return {status:"malformed",source:"toncenter-get-method"};
  const endMs = Number(endTime)*1000;
  if (!Number.isSafeInteger(Number(endTime)) || !Number.isFinite(endMs)) return {status:"malformed",source:"toncenter-get-method"};
  if (endMs <= observedAtMs) return {status:"expired",source:"toncenter-get-method",endTime:new Date(endMs).toISOString()};
  const bidMs = Number(bidTime)*1000;
  if (currentBid > 0n && (!Number.isSafeInteger(Number(bidTime)) || bidMs<=0 || bidMs>observedAtMs)) return {status:"malformed",source:"toncenter-get-method"};
  return {schemaVersion:"username-chain-auction-state-v1",status:"active",source:"toncenter-get-method",
    nftAddress:canonicalTonAddress(target.nftAddress),collectionAddress:USERNAME_COLLECTION,username:normalizeTelegramUsername(target.username),
    observedAt:new Date(observedAtMs).toISOString(),currentBidNano:currentBid.toString(),bidderAddress:bidder,
    bidTime:currentBid>0n?new Date(bidMs).toISOString():null,minimumBidNano:minimumBid.toString(),endTime:new Date(endMs).toISOString(),identityVerified:true};
}
function verifyUsernameAuctionState(fragment,chain,{observedAt}={}) {
  const observedAtMs=parseObservedAt(observedAt);
  if(fragment?.status!=="active"||chain?.status!=="active"||fragment.username!==chain.username
    ||fragment.minimumBidNano!==chain.minimumBidNano||fragment.endTime!==chain.endTime)return {status:"unavailable",reason:"independent-auction-state-mismatch"};
  const endMs=Date.parse(chain.endTime),staleMs=Math.min(endMs,observedAtMs+60_000);
  const hasBid=BigInt(chain.currentBidNano)>0n;
  return {schemaVersion:"username-verified-auction-state-v1",status:"active",username:chain.username,nftAddress:chain.nftAddress,
    currentBidNano:chain.currentBidNano,currentBidGram:Number(BigInt(chain.currentBidNano))/1e9,bidderAddress:chain.bidderAddress,bidTime:chain.bidTime,
    minimumBidNano:chain.minimumBidNano,minimumBidGram:Number(BigInt(chain.minimumBidNano))/1e9,buyNowNano:fragment.buyNowNano,
    endTime:chain.endTime,observedAt:new Date(observedAtMs).toISOString(),staleAt:new Date(staleMs).toISOString(),
    identityVerified:true,independentlyConfirmed:true,nowcastEligible:hasBid,portfolioEligible:false,
    limitation:"Current bid is active-auction evidence only and expires at closure; it is not an inactive resale floor"};
}
function createUsernameAuctionStateSource(options={}) {
  const fetchImpl=options.fetch||fetch,fragmentUrl=String(options.fragmentUrl||DEFAULT_FRAGMENT_URL).replace(/\/+$/,""),
    toncenterUrl=String(options.toncenterUrl||DEFAULT_TONCENTER_URL).replace(/\/+$/,""),apiKey=String(options.apiKey??process.env.USERNAME_TONCENTER_API_KEY??process.env.TONCENTER_API_KEY??"").trim();
  const headers={accept:"application/json","user-agent":"TonTrack-Username-Auction-State/1.0",...(apiKey?{"x-api-key":apiKey}:{})};
  const tonDelayMs=Math.max(0,Number(options.tonDelayMs??(apiKey?0:1050))),fragmentDelayMs=Math.max(0,Number(options.fragmentDelayMs??500));
  let lastTonRequestAt=0,lastFragmentRequestAt=0;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function paced(url,init,kind,attempt=0){
    const isTon=kind==="ton",delay=isTon?tonDelayMs:fragmentDelayMs,last=isTon?lastTonRequestAt:lastFragmentRequestAt;
    const wait=delay-(Date.now()-last);if(wait>0)await sleep(wait);
    if(isTon)lastTonRequestAt=Date.now();else lastFragmentRequestAt=Date.now();
    const response=await fetchImpl(url,init);
    if((response.status===429||response.status>=500)&&attempt<2){await sleep(Math.min(5000,750*2**attempt));return paced(url,init,kind,attempt+1);}
    return response;
  }
  async function load(target,{item:knownItem}={}){
    const observedAt=new Date(options.now?options.now():Date.now()).toISOString(),nftAddress=canonicalTonAddress(target.nftAddress),username=normalizeTelegramUsername(target.username);
    if(!nftAddress) return {status:"unavailable",reason:"invalid-nft-address"};
    const pagePromise=paced(`${fragmentUrl}/username/${encodeURIComponent(username)}`,{headers:{accept:"text/html","user-agent":headers["user-agent"]},signal:AbortSignal.timeout(15_000)},"fragment");
    const itemResponse=knownItem?null:await paced(`${toncenterUrl}/nft/items?${new URLSearchParams({address:nftAddress,limit:"2"})}`,{headers,signal:AbortSignal.timeout(15_000)},"ton");
    const items=knownItem?[knownItem]:itemResponse.ok?(await itemResponse.json()).nft_items||[]:[];
    if(items.length!==1) return {status:"unavailable",reason:"nft-identity-unavailable"};
    const getterResponse=await paced(`${toncenterUrl}/runGetMethod`,{method:"POST",headers:{...headers,"content-type":"application/json"},
      body:JSON.stringify({address:nftAddress,method:"get_telemint_auction_state",stack:[]}),signal:AbortSignal.timeout(15_000)},"ton");
    const page=await pagePromise;
    if(!page.ok||!getterResponse.ok)return {status:"unavailable",reason:"auction-provider-unavailable"};
    const fragment=parseFragmentAuctionState(await page.text(),{username},{observedAt});
    const chain=parseTonCenterAuctionState(await getterResponse.json(),items[0],{username,nftAddress},{observedAt});
    return verifyUsernameAuctionState(fragment,chain,{observedAt});
  }
  return {load};
}

module.exports={createUsernameAuctionStateSource,parseFragmentAuctionState,parseTonCenterAuctionState,verifyUsernameAuctionState};
