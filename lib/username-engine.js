"use strict";

// Own sales are evidence anchors, never price floors. Versioned projections
// prevent previously floored estimates surviving this valuation change.
const USERNAME_ESTIMATOR_VERSION = "username-market-v25";
const USERNAME_FEATURE_VERSION = "username-structural-v2";
const USERNAME_CALIBRATION_VERSION = "username-calibration-v5";

function usernameLengthBucket(length) {
  const value = Math.max(0, Number(length) || 0);
  if (value <= 3) return "1-3";
  if (value <= 5) return "4-5";
  if (value <= 8) return "6-8";
  if (value <= 12) return "9-12";
  return "13+";
}

function usernameBaselineKey(scope, route = "*", lengthBucket = "*", script = "*", scarcityClass = "*") {
  return [scope, route, lengthBucket, script, scarcityClass].join("|");
}

module.exports = {
  USERNAME_CALIBRATION_VERSION,
  USERNAME_ESTIMATOR_VERSION,
  USERNAME_FEATURE_VERSION,
  usernameBaselineKey,
  usernameLengthBucket,
};
