"use strict";

function normalizedAddress(value) { return String(value || "").trim().toLowerCase(); }

function assessUsernameMarketEvent(event, recentEvents = []) {
  const flags = [];
  const seller = normalizedAddress(event.sellerAddress);
  const buyer = normalizedAddress(event.buyerAddress);
  if (seller && buyer && seller === buyer) flags.push("self_sale");
  const samePair = recentEvents.filter((row) => {
    const a = normalizedAddress(row.sellerAddress);
    const b = normalizedAddress(row.buyerAddress);
    return (a === seller && b === buyer) || (a === buyer && b === seller);
  });
  if (samePair.length >= 2) flags.push("repeated_counterparty_loop");
  const observedPrices = samePair.map((row) => Number(row.priceGram || 0)).filter((value) => value > 0);
  const price = Number(event.priceGram || 0);
  if (observedPrices.length >= 2 && price > 0) {
    const median = observedPrices.sort((a, b) => a - b)[Math.floor(observedPrices.length / 2)];
    if (median > 0 && (price > median * 20 || price < median / 20)) flags.push("counterparty_price_outlier");
  }
  const fatal = flags.includes("self_sale") || flags.includes("repeated_counterparty_loop");
  return { flags, reliabilityScore: fatal ? 0 : flags.length ? 0.45 : 1, excluded: fatal };
}

module.exports = { assessUsernameMarketEvent };
