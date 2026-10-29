"use strict";
const { toNano } = require("@ton/core");
const { canonicalTonAddress } = require("./ton-address");
const { USERNAME_COLLECTION } = require("./username-collection");
// Historical source evidence only. A bid is NOT a completed sale or floor.
function parseBidHistory(html, cutoff) {
  if (!Number.isFinite(cutoff)) throw new Error("Invalid bid cutoff");
  const section = String(html).match(/<h3[^>]*>Bid History<\/h3>([\s\S]*?)<\/section>/i)?.[1];
  if (!section) return { status: "not-exposed", bids: [] };
  const bids = [];
  for (const match of section.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const row = match[1];
    const price = row.match(/icon-ton">([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, "").replace(/[,\s]/g, "");
    const time = row.match(/<time datetime="([^"]+)"/)?.[1];
    const bidder = row.match(/https:\/\/tonviewer\.com\/([^"/?#]+)/)?.[1];
    const amount = Number(price), timestamp = Date.parse(time || "");
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(timestamp) || timestamp >= cutoff || !bidder) continue;
    bids.push({ eventType: "bid", eventTime: new Date(timestamp).toISOString(), priceNative: amount, bidderAddress: bidder,
      provenance: "fragment-public-bid-history", settlementVerified: false });
  }
  bids.sort((a, b) => Date.parse(b.eventTime) - Date.parse(a.eventTime));
  return { status: bids.length ? "prior-bids-observed" : "no-prior-bids-observed", bids };
}
function initialBidEvidence(transaction, target, { cutoff, observedAt } = {}) {
  const time = Number(transaction?.now) * 1000;
  const message = transaction?.in_msg, decoded = message?.message_content?.decoded;
  const description = transaction?.description;
  const address = canonicalTonAddress(target?.nftAddress);
  if (!/^0:[0-9a-f]{64}$/.test(address) || !Number.isFinite(cutoff) || !Number.isFinite(time) || time <= 0 || time >= cutoff
    || !Number.isFinite(Date.parse(observedAt || "")) || !transaction?.hash
    || canonicalTonAddress(transaction.account) !== address || canonicalTonAddress(message?.destination) !== address
    || canonicalTonAddress(message?.source) !== USERNAME_COLLECTION || message?.bounced === true
    || description?.aborted !== false || description?.compute_ph?.success !== true || description?.action?.success !== true
    || message?.opcode !== "0x299a3e15" || decoded?.["@type"] !== "teleitem_msg_deploy") return null;
  const nameHex = decoded.token_info?.name?.text;
  if (typeof nameHex !== "string" || !/^(?:[0-9a-f]{2})+$/i.test(nameHex)) return null;
  const username = Buffer.from(nameHex,"hex").toString("utf8");
  if (username !== target.username || !/^[a-z0-9_]{1,32}$/.test(username)) return null;
  const sender = decoded.sender_address;
  if (sender?.["@type"] !== "addr_std" || !/^[0-9a-f]{64}$/i.test(sender.address || "")) return null;
  const bidderAddress = canonicalTonAddress(`${sender.workchain_id}:${sender.address}`);
  const rawAmount = decoded.bid?.amount?.value;
  if (!/^\d+$/.test(String(rawAmount))) return null;
  let nano;
  try { nano = BigInt(rawAmount); } catch { return null; }
  if (nano <= 0n) return null;
  const duration = Number(decoded.auction_config?.duration);
  const scheduledEnd = time + duration * 1000;
  if (!(duration > 0) || !Number.isSafeInteger(duration) || !Number.isFinite(new Date(scheduledEnd).getTime())) return null;
  if (target.bid) {
    try {
      if (Date.parse(target.bid.eventTime) !== time || canonicalTonAddress(target.bid.bidderAddress) !== bidderAddress
        || toNano(String(target.bid.priceNative)) !== nano) return null;
    } catch { return null; }
  }
  return { schemaVersion:"username-initial-bid-evidence-v1", eventType:"bid", nftAddress:address,
    collectionAddress:USERNAME_COLLECTION, username, bidderAddress, eventTime:new Date(time).toISOString(),
    amountNano:nano.toString(), paymentAsset:"TON", txHash:transaction.hash, observedAt,
    initialScheduledEnd:new Date(scheduledEnd).toISOString(), auctionStatus:"unknown-after-initial-bid",
    identityVerified:true, initialBidAccepted:true, settlementVerified:false,
    valuationEligible:false, portfolioEligible:false,
    limitation:"Successful initial bid proves neither current auction status nor a completed sale or present resale value" };
}
function bidLifecycleEvidence(transactions, target, {cutoff, observedAt} = {}) {
  const initial = transactions.map(transaction => initialBidEvidence(transaction, target, {cutoff, observedAt})).find(Boolean);
  if (!initial) return {status:"initial-bid-unavailable", bids:[]};
  const address = canonicalTonAddress(target.nftAddress);
  const bids = [{eventType:"bid", eventTime:initial.eventTime, amountNano:initial.amountNano,
    bidderAddress:initial.bidderAddress, txHash:initial.txHash, kind:"initial", identityVerified:true}];
  for (const transaction of transactions) {
    const time = Number(transaction?.now) * 1000, message = transaction?.in_msg, decoded = message?.message_content?.decoded;
    if (!(time > Date.parse(initial.eventTime) && time < cutoff) || !transaction?.hash
      || canonicalTonAddress(transaction.account) !== address || canonicalTonAddress(message?.destination) !== address
      || !canonicalTonAddress(message?.source) || message?.opcode != null || decoded?.["@type"] !== "empty_cell"
      || transaction?.description?.aborted !== false || transaction?.description?.compute_ph?.success !== true
      || transaction?.description?.action?.success !== true || !/^\d+$/.test(String(message?.value))) continue;
    const amount = BigInt(message.value);
    if (amount <= 0n) continue;
    bids.push({eventType:"bid",eventTime:new Date(time).toISOString(),amountNano:amount.toString(),
      bidderAddress:canonicalTonAddress(message.source),txHash:transaction.hash,kind:"subsequent",identityVerified:true});
  }
  bids.sort((a,b)=>Date.parse(a.eventTime)-Date.parse(b.eventTime));
  for (let index=1;index<bids.length;index+=1) if(BigInt(bids[index].amountNano)<=BigInt(bids[index-1].amountNano))
    throw new Error("Verified auction bids are not strictly increasing");
  return {status:"verified-bid-lifecycle",bids,latestBid:bids.at(-1),settlementVerified:false,
    limitation:"Bid lifecycle proves auction demand before cutoff, not settlement or present inactive resale value"};
}
function postObservationBids(transactions, target, {after, before} = {}) {
  const address=canonicalTonAddress(target?.nftAddress),afterMs=Date.parse(after||""),beforeMs=Date.parse(before||"");
  if(!/^0:[0-9a-f]{64}$/.test(address)||!Number.isFinite(afterMs)||!Number.isFinite(beforeMs)||beforeMs<=afterMs)
    throw new Error("Invalid post-observation bid window");
  const bids=[];
  for(const transaction of transactions||[]){
    const time=Number(transaction?.now)*1000,message=transaction?.in_msg,decoded=message?.message_content?.decoded;
    if(!(time>afterMs&&time<=beforeMs)||!transaction?.hash||canonicalTonAddress(transaction.account)!==address
      ||canonicalTonAddress(message?.destination)!==address||!canonicalTonAddress(message?.source)||message?.opcode!=null
      ||decoded?.["@type"]!=="empty_cell"||transaction?.description?.aborted!==false
      ||transaction?.description?.compute_ph?.success!==true||transaction?.description?.action?.success!==true
      ||!/^[0-9]+$/.test(String(message?.value)))continue;
    const amount=BigInt(message.value);if(amount<=0n)continue;
    bids.push({eventType:"bid",eventTime:new Date(time).toISOString(),amountNano:amount.toString(),
      bidderAddress:canonicalTonAddress(message.source),txHash:transaction.hash,kind:"post-observation",identityVerified:true});
  }
  return bids.sort((a,b)=>Date.parse(a.eventTime)-Date.parse(b.eventTime));
}
module.exports = { parseBidHistory, initialBidEvidence, bidLifecycleEvidence, postObservationBids };
