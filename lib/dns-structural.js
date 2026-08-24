"use strict";

const ROUTES = Object.freeze({
  NUMERIC: "numeric",
  SHORT_LETTERS: "short-letters",
  ALPHANUMERIC: "alphanumeric",
  DICTIONARY_COMPOUND: "dictionary-compound",
  ACRONYM: "acronym",
  ENTITY: "entity",
  CRYPTO_TON: "crypto-ton",
  INVENTED_BRANDABLE: "invented-brandable",
  MULTILINGUAL: "multilingual",
  PATTERN: "pattern",
  UNUSUAL_VALID: "unusual-valid",
  RESIDUAL: "residual",
});

const DEFAULT_CRYPTO_TERMS = Object.freeze([
  "bitcoin",
  "blockchain",
  "crypto",
  "dao",
  "defi",
  "dex",
  "getgems",
  "gram",
  "jetton",
  "nft",
  "staking",
  "telegram",
  "ton",
  "toncoin",
  "validator",
  "wallet",
  "web3",
]);

const DEFAULT_DICTIONARY_WORDS = Object.freeze([
  "ai",
  "app",
  "art",
  "bank",
  "book",
  "bot",
  "box",
  "cash",
  "chain",
  "chat",
  "club",
  "coin",
  "data",
  "diary",
  "digital",
  "finance",
  "game",
  "group",
  "hub",
  "lab",
  "market",
  "media",
  "money",
  "nova",
  "pay",
  "shop",
  "space",
  "star",
  "store",
  "studio",
  "super",
  "swap",
  "tech",
  "trade",
  "world",
]);

const SCRIPT_TESTS = Object.freeze([
  ["Latin", /\p{Script=Latin}/u],
  ["Cyrillic", /\p{Script=Cyrillic}/u],
  ["Greek", /\p{Script=Greek}/u],
  ["Arabic", /\p{Script=Arabic}/u],
  ["Hebrew", /\p{Script=Hebrew}/u],
  ["Devanagari", /\p{Script=Devanagari}/u],
  ["Bengali", /\p{Script=Bengali}/u],
  ["Han", /\p{Script=Han}/u],
  ["Hiragana", /\p{Script=Hiragana}/u],
  ["Katakana", /\p{Script=Katakana}/u],
  ["Hangul", /\p{Script=Hangul}/u],
  ["Thai", /\p{Script=Thai}/u],
  ["Armenian", /\p{Script=Armenian}/u],
  ["Georgian", /\p{Script=Georgian}/u],
]);

const LETTER_RE = /^\p{Letter}+$/u;
const NUMBER_RE = /^\p{Number}+$/u;
const LETTER_OR_NUMBER_RE = /^[\p{Letter}\p{Number}]+$/u;
const ASCII_LETTERS_RE = /^[a-z]+$/;
const ASCII_ALPHANUMERIC_RE = /^[a-z0-9]+$/;
const CONTROL_OR_SPACE_RE = /[\p{Control}\p{Separator}\s]/u;

const segmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("und", { granularity: "grapheme" })
  : null;

function splitGraphemes(value) {
  const text = String(value ?? "").normalize("NFC");
  if (!segmenter) return Array.from(text);
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

function normalizeTonDnsLabel(input) {
  if (typeof input !== "string") {
    throw new TypeError("TON DNS name must be a string");
  }

  let value = input
    .normalize("NFKC")
    .replace(/[\u3002\uff0e\uff61]/g, ".")
    .trim()
    .replace(/\.+$/u, "")
    .toLocaleLowerCase("und");

  if (value.endsWith(".ton")) value = value.slice(0, -4);
  value = value.replace(/\.+$/u, "").normalize("NFC");

  if (!value) throw new RangeError("TON DNS label cannot be empty");
  return value;
}

function normalizeTonDnsName(input) {
  return `${normalizeTonDnsLabel(input)}.ton`;
}

function buildPatternSignature(input) {
  const graphemes = Array.isArray(input) ? input : splitGraphemes(input);
  const symbols = new Map();
  let next = 0;

  return graphemes.map((grapheme) => {
    if (!symbols.has(grapheme)) {
      symbols.set(grapheme, patternSymbol(next));
      next += 1;
    }
    return symbols.get(grapheme);
  }).join("");
}

function patternSymbol(index) {
  let number = index;
  let symbol = "";
  do {
    symbol = String.fromCharCode(65 + (number % 26)) + symbol;
    number = Math.floor(number / 26) - 1;
  } while (number >= 0);
  return symbol;
}

function buildShapeSignature(graphemes) {
  return graphemes.map((grapheme) => {
    if (/^\p{Letter}$/u.test(grapheme)) return "L";
    if (/^\p{Number}$/u.test(grapheme)) return "N";
    if (grapheme === "-") return "H";
    if (/^\p{Extended_Pictographic}$/u.test(grapheme)) return "E";
    return "O";
  }).join("");
}

function detectScripts(graphemes) {
  const scripts = new Set();
  for (const grapheme of graphemes) {
    if (!/\p{Letter}/u.test(grapheme)) continue;
    const match = SCRIPT_TESTS.find(([, expression]) => expression.test(grapheme));
    scripts.add(match ? match[0] : "Other");
  }
  return Array.from(scripts).sort();
}

function repeatedSubstring(graphemes) {
  const length = graphemes.length;
  for (let width = 1; width <= Math.floor(length / 2); width += 1) {
    if (length % width !== 0) continue;
    const unit = graphemes.slice(0, width);
    let matches = true;
    for (let index = width; index < length; index += 1) {
      if (graphemes[index] !== unit[index % width]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return {
        unit: unit.join(""),
        repeats: length / width,
      };
    }
  }
  return null;
}

function sequenceDirection(graphemes) {
  if (graphemes.length < 3) return null;
  const points = graphemes.map(sequenceCodePoint);
  if (points.some((point) => point === null)) return null;

  const difference = points[1] - points[0];
  if (difference !== 1 && difference !== -1) return null;
  for (let index = 2; index < points.length; index += 1) {
    if (points[index] - points[index - 1] !== difference) return null;
  }
  return difference === 1 ? "ascending" : "descending";
}

function sequenceCodePoint(grapheme) {
  if (!/^[a-z0-9]$/u.test(grapheme)) return null;
  return grapheme.codePointAt(0);
}

function runStats(graphemes) {
  let maxRunLength = graphemes.length ? 1 : 0;
  const runs = [];
  let start = 0;

  for (let index = 1; index <= graphemes.length; index += 1) {
    if (index < graphemes.length && graphemes[index] === graphemes[start]) continue;
    const length = index - start;
    if (length > 1) runs.push({ value: graphemes[start], length, start });
    maxRunLength = Math.max(maxRunLength, length);
    start = index;
  }

  return { maxRunLength, runs };
}

function nearPalindromeDistance(graphemes) {
  let mismatches = 0;
  for (let left = 0, right = graphemes.length - 1; left < right; left += 1, right -= 1) {
    if (graphemes[left] !== graphemes[right]) mismatches += 1;
  }
  return mismatches;
}

function toHintSet(value, defaults = []) {
  const result = new Set(defaults.map((item) => normalizeHint(item)).filter(Boolean));
  if (!value) return result;

  const entries = value instanceof Map
    ? value.keys()
    : value instanceof Set || Array.isArray(value)
      ? value
      : typeof value === "object"
        ? Object.keys(value)
        : [value];

  for (const entry of entries) {
    const normalized = normalizeHint(entry);
    if (normalized) result.add(normalized);
  }
  return result;
}

function normalizeHint(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").trim().toLocaleLowerCase("und").replace(/\.ton$/u, "");
}

function explicitTokens(label) {
  return label.split(/[-_.]+/u).filter(Boolean);
}

function findCompoundTokens(label, words) {
  const separated = explicitTokens(label);
  if (separated.length > 1 && separated.every((token) => words.has(token))) return separated;
  if (!ASCII_LETTERS_RE.test(label) || label.length > 48) return [];

  const memo = new Map();
  function visit(index) {
    if (index === label.length) return [];
    if (memo.has(index)) return memo.get(index);

    let best = null;
    for (let end = index + 2; end <= label.length; end += 1) {
      const token = label.slice(index, end);
      if (!words.has(token)) continue;
      const rest = visit(end);
      if (rest === null) continue;
      const candidate = [token, ...rest];
      if (!best || candidate.length < best.length) best = candidate;
    }
    memo.set(index, best);
    return best;
  }

  const tokens = visit(0);
  return tokens && tokens.length >= 2 ? tokens : [];
}

function matchesEmbeddedTerm(label, terms) {
  for (const term of terms) {
    if (label === term) return term;
    if (term.length >= 3 && label.length > term.length) {
      if (label.startsWith(term) || label.endsWith(term)) return term;
    }
  }
  return null;
}

function pronounceability(label) {
  if (!ASCII_LETTERS_RE.test(label) || !label.length) return 0;
  const vowels = new Set(["a", "e", "i", "o", "u", "y"]);
  let vowelCount = 0;
  let transitions = 0;
  let consonantRun = 0;
  let maxConsonantRun = 0;
  let previousType = null;

  for (const letter of label) {
    const type = vowels.has(letter) ? "vowel" : "consonant";
    if (type === "vowel") {
      vowelCount += 1;
      consonantRun = 0;
    } else {
      consonantRun += 1;
      maxConsonantRun = Math.max(maxConsonantRun, consonantRun);
    }
    if (previousType && previousType !== type) transitions += 1;
    previousType = type;
  }

  const vowelRatio = vowelCount / label.length;
  const transitionRatio = label.length > 1 ? transitions / (label.length - 1) : 0;
  const vowelScore = Math.max(0, 1 - Math.abs(vowelRatio - 0.42) / 0.42);
  const runPenalty = Math.max(0, (maxConsonantRun - 2) * 0.18);
  return clamp((vowelScore * 0.55) + (transitionRatio * 0.45) - runPenalty, 0, 1);
}

function extractStructuralFeatures(input, options = {}) {
  const original = String(input);
  const label = normalizeTonDnsLabel(original);
  const normalizedDomain = `${label}.ton`;
  const graphemes = splitGraphemes(label);
  const scripts = detectScripts(graphemes);
  const lettersOnly = LETTER_RE.test(label);
  const numbersOnly = NUMBER_RE.test(label);
  const letterOrNumberOnly = LETTER_OR_NUMBER_RE.test(label);
  const asciiAlphanumeric = ASCII_ALPHANUMERIC_RE.test(label);
  const containsLetters = /\p{Letter}/u.test(label);
  const containsNumbers = /\p{Number}/u.test(label);
  const containsEmoji = /\p{Extended_Pictographic}/u.test(label);
  const lexicalValidity = !CONTROL_OR_SPACE_RE.test(label) && !label.includes(".");
  const { maxRunLength, runs } = runStats(graphemes);
  const palindromeDistance = nearPalindromeDistance(graphemes);
  const repetition = repeatedSubstring(graphemes);
  const sequence = sequenceDirection(graphemes);
  const uniqueCharacterCount = new Set(graphemes).size;
  const patternSignature = buildPatternSignature(graphemes);
  const shapeSignature = buildShapeSignature(graphemes);
  const repeated = maxRunLength > 1 || Boolean(repetition);
  const palindrome = graphemes.length > 1 && palindromeDistance === 0;
  const nearPalindrome = graphemes.length > 3 && palindromeDistance === 1;
  const hasPattern = repeated || palindrome || nearPalindrome || Boolean(sequence);
  const characterClass = numbersOnly
    ? "numeric"
    : lettersOnly
      ? "letters"
      : containsLetters && containsNumbers && letterOrNumberOnly
        ? "alphanumeric"
        : "mixed";
  const scarcityClass = numbersOnly
    ? `${graphemes.length}N`
    : lettersOnly
      ? `${graphemes.length}L`
      : asciiAlphanumeric
        ? `${graphemes.length}A`
        : `${graphemes.length}U`;

  const dictionaryWords = toHintSet(options.dictionaryWords, DEFAULT_DICTIONARY_WORDS);
  const entityHints = toHintSet(options.entityHints);
  const acronymHints = toHintSet(options.acronymHints);
  const cryptoTerms = toHintSet(options.cryptoTerms, DEFAULT_CRYPTO_TERMS);
  const dictionaryMatch = dictionaryWords.has(label);
  const compoundTokens = findCompoundTokens(label, dictionaryWords);
  const entityMatch = entityHints.has(label);
  const acronymMatch = acronymHints.has(label);
  const cryptoTerm = matchesEmbeddedTerm(label, cryptoTerms);
  const originalLabel = original.normalize("NFKC").trim().replace(/\.ton\.?$/iu, "");
  const uppercaseAcronym = /^[A-Z]{4,6}$/u.test(originalLabel);
  const pronounceabilityScore = pronounceability(label);
  const brandabilityScore = ASCII_LETTERS_RE.test(label) && label.length >= 4 && label.length <= 14
    ? clamp((pronounceabilityScore * 0.7) + ((1 - Math.abs(label.length - 7) / 10) * 0.3), 0, 1)
    : 0;

  return {
    original,
    label,
    normalizedDomain,
    graphemes,
    characterLength: graphemes.length,
    codePointLength: Array.from(label).length,
    byteLength: Buffer.byteLength(label, "utf8"),
    characterClass,
    scarcityClass,
    patternSignature,
    shapeSignature,
    uniqueCharacterCount,
    maxRunLength,
    repeatedRuns: runs,
    repeatedSubstring: repetition,
    sequence,
    palindrome,
    nearPalindrome,
    palindromeDistance,
    hasPattern,
    leadingZero: /^0/u.test(label),
    trailingZero: /0$/u.test(label),
    lettersOnly,
    numbersOnly,
    alphanumeric: containsLetters && containsNumbers && letterOrNumberOnly,
    containsLetters,
    containsNumbers,
    containsEmoji,
    containsSeparator: /[-_.]/u.test(label),
    scripts,
    primaryScript: scripts.length === 1 ? scripts[0] : scripts.length ? "Mixed" : "Common",
    mixedScript: scripts.length > 1,
    multilingual: scripts.some((script) => script !== "Latin"),
    lexicallyValid: lexicalValidity,
    dictionaryMatch,
    compoundTokens,
    entityMatch,
    acronymMatch: acronymMatch || uppercaseAcronym,
    cryptoTerm,
    pronounceabilityScore,
    brandabilityScore,
  };
}

function classifyTonDns(input, options = {}) {
  const features = extractStructuralFeatures(input, options);
  const routes = [];

  if (features.numbersOnly) routes.push(ROUTES.NUMERIC);
  if (
    features.lettersOnly
    && features.characterLength <= 3
    && features.primaryScript === "Latin"
  ) routes.push(ROUTES.SHORT_LETTERS);
  if (features.alphanumeric) routes.push(ROUTES.ALPHANUMERIC);
  if (features.dictionaryMatch || features.compoundTokens.length > 1) routes.push(ROUTES.DICTIONARY_COMPOUND);
  if (features.acronymMatch) routes.push(ROUTES.ACRONYM);
  if (features.entityMatch) routes.push(ROUTES.ENTITY);
  if (features.cryptoTerm) routes.push(ROUTES.CRYPTO_TON);
  if (features.multilingual) routes.push(ROUTES.MULTILINGUAL);
  if (features.hasPattern) routes.push(ROUTES.PATTERN);

  const canBeBrandable = features.lettersOnly
    && features.primaryScript === "Latin"
    && features.characterLength >= 4
    && features.characterLength <= 14
    && features.brandabilityScore >= 0.52
    && !features.dictionaryMatch
    && !features.entityMatch
    && !features.cryptoTerm;
  if (canBeBrandable) routes.push(ROUTES.INVENTED_BRANDABLE);

  const unusual = features.lexicallyValid
    && (!features.lettersOnly && !features.numbersOnly && !features.alphanumeric)
    && (features.containsEmoji || features.containsSeparator || features.characterClass === "mixed");
  if (unusual) routes.push(ROUTES.UNUSUAL_VALID);
  if (!routes.length) routes.push(ROUTES.RESIDUAL);

  const priority = [
    ROUTES.NUMERIC,
    ROUTES.SHORT_LETTERS,
    ROUTES.ALPHANUMERIC,
    ROUTES.CRYPTO_TON,
    ROUTES.ENTITY,
    ROUTES.ACRONYM,
    ROUTES.DICTIONARY_COMPOUND,
    ROUTES.MULTILINGUAL,
    ROUTES.INVENTED_BRANDABLE,
    ROUTES.UNUSUAL_VALID,
    ROUTES.PATTERN,
    ROUTES.RESIDUAL,
  ];
  const primaryRoute = priority.find((route) => routes.includes(route)) || ROUTES.RESIDUAL;

  return {
    ...features,
    primaryRoute,
    routes: priority.filter((route) => routes.includes(route)),
    classifierVersion: "dns-structural-v1",
  };
}

function scoreStructuralSimilarity(leftInput, rightInput) {
  const left = coerceFeatures(leftInput);
  const right = coerceFeatures(rightInput);
  if (!left || !right) return 0;

  const lengthDelta = Math.abs(left.characterLength - right.characterLength);
  const lengthScore = Math.exp(-lengthDelta / Math.max(1, Math.min(left.characterLength, right.characterLength) * 0.45));
  const classScore = left.characterClass === right.characterClass ? 1 : 0.15;
  const scarcityScore = left.scarcityClass === right.scarcityClass
    ? 1
    : left.characterClass === right.characterClass
      ? Math.max(0.2, 1 - (lengthDelta * 0.22))
      : 0.1;
  const patternScore = left.patternSignature === right.patternSignature
    ? 1
    : patternFeatureSimilarity(left, right);
  const scriptScore = scriptSimilarity(left.scripts, right.scripts);
  const routeScore = jaccard(left.routes || [left.primaryRoute], right.routes || [right.primaryRoute]);

  let score;
  if (left.primaryRoute === ROUTES.NUMERIC) {
    score = (scarcityScore * 0.38) + (patternScore * 0.32) + (lengthScore * 0.18) + (classScore * 0.12);
  } else if (left.primaryRoute === ROUTES.SHORT_LETTERS) {
    score = (scarcityScore * 0.4) + (lengthScore * 0.25) + (routeScore * 0.2) + (patternScore * 0.15);
  } else if (left.primaryRoute === ROUTES.MULTILINGUAL) {
    score = (scriptScore * 0.35) + (lengthScore * 0.25) + (classScore * 0.15) + (routeScore * 0.15) + (patternScore * 0.1);
  } else {
    score = (lengthScore * 0.27) + (classScore * 0.18) + (scarcityScore * 0.18) + (patternScore * 0.14) + (scriptScore * 0.1) + (routeScore * 0.13);
  }
  return clamp(score, 0, 1);
}

function coerceFeatures(value) {
  if (!value) return null;
  if (typeof value === "string") return classifyTonDns(value);
  if (typeof value === "object" && value.primaryRoute && Number.isFinite(value.characterLength)) return value;
  if (typeof value === "object" && typeof value.domain === "string") return classifyTonDns(value.domain);
  return null;
}

function patternFeatureSimilarity(left, right) {
  const flags = ["palindrome", "nearPalindrome", "hasPattern"];
  let matches = 0;
  for (const flag of flags) {
    if (Boolean(left[flag]) === Boolean(right[flag])) matches += 1;
  }
  if (left.sequence && left.sequence === right.sequence) matches += 1;
  if (left.maxRunLength === right.maxRunLength) matches += 1;
  return matches / 5;
}

function scriptSimilarity(left = [], right = []) {
  if (!left.length && !right.length) return 1;
  return jaccard(left, right);
}

function jaccard(left = [], right = []) {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);
  if (!union.size) return 1;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / union.size;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

module.exports = {
  DEFAULT_CRYPTO_TERMS,
  DEFAULT_DICTIONARY_WORDS,
  ROUTES,
  buildPatternSignature,
  classifyTonDns,
  extractStructuralFeatures,
  normalizeTonDnsLabel,
  normalizeTonDnsName,
  scoreStructuralSimilarity,
  splitGraphemes,
};
