"use strict";

const CATEGORY_TERMS = Object.freeze({
  ecosystem: ["telegram", "fragment", "toncoin", "blockchain", "crypto", "jetton", "web3", "wallet", "sticker", "gift", "nft", "gram", "ton", "tg", "defi", "dao", "dapp", "airdrop", "staking", "validator", "whale", "degen", "hodl", "wagmi", "ngmi", "fomo", "fud", "rekt", "gm", "alpha", "token", "mint", "chain"],
  finance: ["finance", "invest", "trading", "trade", "market", "price", "bank", "fund", "cash", "coin", "bull", "bear", "pay"],
  commerce: ["commerce", "business", "store", "shop", "sale", "seller", "buyer", "spend", "deal", "buy", "sell"],
  technology: ["technology", "software", "digital", "cyber", "cloud", "data", "robot", "agent", "labs", "lab", "tech", "app", "bot", "ai"],
  media: ["avatar", "movie", "cinema", "video", "music", "media", "news", "game", "gaming", "meme"],
  community: ["community", "network", "social", "group", "club", "team", "veteran", "intern", "hub", "chat"],
  authority: ["official", "founder", "director", "admin", "chief", "president", "leader", "expert", "cmo", "ceo"],
  geography: ["africa", "america", "europe", "asia", "india", "china", "arab", "global", "world"],
  aspirational: ["conviction", "freedom", "liberty", "justice", "courage", "wisdom", "victory", "loyalty", "future", "power", "trust", "truth", "glory", "faith", "hope"],
  lifestyle: ["nomad", "travel", "life", "luxury", "fashion", "sport", "fitness", "food"],
  personality: ["wolf", "lion", "tiger", "dragon", "king", "queen", "hero", "legend", "chad", "ape", "punk", "pepe", "maxi", "anon"],
  risk: ["scammer", "fraud", "fake", "scam"],
});

const CATEGORY_NAMES = Object.freeze(Object.keys(CATEGORY_TERMS));
const profileCache = new Map();

function normalize(input) {
  return String(input?.normalizedUsername || input || "").toLowerCase().replace(/^@/, "");
}

function matchedTerms(name, terms) {
  return terms.filter((term) => name === term || (term.length >= 3 && name.includes(term)));
}

function usernameSemanticProfile(input) {
  const name = normalize(input);
  const cached = profileCache.get(name);
  if (cached) return cached;
  const categories = [];
  const terms = [];
  const exactTerms = [];
  for (const category of CATEGORY_NAMES) {
    const matches = matchedTerms(name, CATEGORY_TERMS[category]);
    if (!matches.length) continue;
    categories.push(category);
    terms.push(...matches.map((term) => `${category}:${term}`));
    exactTerms.push(...matches.filter((term) => name === term).map((term) => `${category}:${term}`));
  }
  const profile = Object.freeze({
    name,
    categories: Object.freeze(categories),
    terms: Object.freeze([...new Set(terms)]),
    exactTerms: Object.freeze([...new Set(exactTerms)]),
    hasMeaningSignal: categories.length > 0,
    popularityTier: exactTerms.length ? "exact-term" : terms.length >= 2 ? "multi-signal" : terms.length ? "related-term" : "none",
    popularityScore: Math.min(1, exactTerms.length * 0.7 + Math.min(3, terms.length) * 0.15),
  });
  if (profileCache.size >= 8_000) profileCache.delete(profileCache.keys().next().value);
  profileCache.set(name, profile);
  return profile;
}

function overlap(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size || !b.size) return 0;
  const shared = [...a].filter((value) => b.has(value)).length;
  return shared / (a.size + b.size - shared);
}

function usernameSemanticSimilarity(leftInput, rightInput) {
  const left = usernameSemanticProfile(leftInput);
  const right = usernameSemanticProfile(rightInput);
  if (!left.hasMeaningSignal || !right.hasMeaningSignal) return 0;
  const termScore = overlap(left.terms, right.terms);
  const categoryScore = overlap(left.categories, right.categories);
  const riskMismatch = left.categories.includes("risk") !== right.categories.includes("risk");
  if (riskMismatch) return 0;
  return Math.min(1, termScore * 0.65 + categoryScore * 0.55);
}

module.exports = { CATEGORY_NAMES, CATEGORY_TERMS, usernameSemanticProfile, usernameSemanticSimilarity };
