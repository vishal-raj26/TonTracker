"use strict";

// Evidence labels are not probabilities. Low-confidence values remain visible
// as indicative estimates, but must not silently become priced holdings.
function usernamePortfolioEligible(valuation) {
  return valuation?.portfolioEligible !== false
    && Number.isFinite(Number(valuation?.estimateUsd)) && Number(valuation.estimateUsd) > 0
    && (valuation.valuationStatus || valuation.status) === "estimated"
    && ["medium", "high"].includes(String(valuation.confidenceBand || "").toLowerCase());
}
module.exports = { usernamePortfolioEligible };
