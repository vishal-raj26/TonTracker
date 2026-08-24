"use strict";

const { Address } = require("@ton/core");

function canonicalTonAddress(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    return Address.parse(text).toRawString().toLowerCase();
  } catch {
    return text.toLowerCase();
  }
}

module.exports = {
  canonicalTonAddress,
};
