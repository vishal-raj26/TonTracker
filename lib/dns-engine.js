"use strict";

// v5 keeps the verified-evidence rule and adds cached dictionary/entity
// knowledge plus related-concept comparable retrieval for textual domains.
// v7 invalidates estimates that treated generic encyclopedia title matches as
// market-relevant entities.
const DNS_ESTIMATOR_VERSION = "dns-market-v7";
const DNS_CALIBRATION_VERSION = "dns-calibration-v1";
const DNS_FEATURE_VERSION = "dns-structural-v1";

function dnsLengthBucket(length) {
  const value = Math.max(0, Number(length) || 0);
  if (value <= 3) return "1-3";
  if (value <= 5) return "4-5";
  if (value <= 8) return "6-8";
  if (value <= 12) return "9-12";
  return "13+";
}

function dnsBaselineKey(scope, route = "*", lengthBucket = "*", script = "*", scarcityClass = "*") {
  return [scope, route, lengthBucket, script, scarcityClass].join("|");
}

module.exports = {
  DNS_CALIBRATION_VERSION,
  DNS_ESTIMATOR_VERSION,
  DNS_FEATURE_VERSION,
  dnsBaselineKey,
  dnsLengthBucket,
};
