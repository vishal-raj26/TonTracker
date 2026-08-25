"use strict";

// v3 rejects route/length-only comparables for textual labels. A domain needs
// its own sale evidence or a separately verified semantic relationship before
// it can receive a portfolio estimate.
const DNS_ESTIMATOR_VERSION = "dns-market-v4";
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
