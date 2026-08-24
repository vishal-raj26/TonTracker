"use strict";

const ROUTES = Object.freeze({
  NUMERIC: "numeric",
  SHORT: "short",
  PATTERN: "pattern",
  ALPHANUMERIC: "alphanumeric",
  WORD: "word",
  MULTILINGUAL: "multilingual",
  RESIDUAL: "residual",
});

const SCRIPT_TESTS = Object.freeze([
  ["Latin", /\p{Script=Latin}/u],
  ["Cyrillic", /\p{Script=Cyrillic}/u],
  ["Arabic", /\p{Script=Arabic}/u],
  ["Han", /\p{Script=Han}/u],
  ["Other", /\p{Letter}/u],
]);
const LETTER_RE = /^\p{Letter}+$/u;
const NUMBER_RE = /^\p{Number}+$/u;
const ALPHANUMERIC_RE = /^[\p{Letter}\p{Number}_]+$/u;
const segmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("und", { granularity: "grapheme" })
  : null;

function splitGraphemes(value) {
  const text = String(value ?? "").normalize("NFC");
  return segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text);
}

function normalizeTelegramUsername(input) {
  if (typeof input !== "string") throw new TypeError("Telegram username must be a string");
  let value = input.normalize("NFKC").trim().replace(/^@+/u, "").replace(/^https?:\/\/(?:t\.me|telegram\.me)\//iu, "");
  value = value.replace(/^t\.me\//iu, "").replace(/\?.*$/u, "").replace(/\/+$/u, "").toLocaleLowerCase("und").normalize("NFC");
  if (!value || /[\p{Control}\p{Separator}\s]/u.test(value)) throw new RangeError("Telegram username is invalid");
  return value;
}

function patternSignature(graphemes) {
  const seen = new Map();
  let next = 0;
  return graphemes.map((char) => {
    if (!seen.has(char)) seen.set(char, String.fromCharCode(65 + next++));
    return seen.get(char);
  }).join("");
}

function maxRunLength(graphemes) {
  let best = graphemes.length ? 1 : 0;
  let run = 1;
  for (let index = 1; index < graphemes.length; index += 1) {
    run = graphemes[index] === graphemes[index - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

function sequence(graphemes) {
  if (graphemes.length < 3 || !graphemes.every((char) => /^[a-z0-9]$/u.test(char))) return null;
  const direction = graphemes[1].codePointAt(0) - graphemes[0].codePointAt(0);
  if (![1, -1].includes(direction)) return null;
  return graphemes.every((char, index) => index === 0 || char.codePointAt(0) - graphemes[index - 1].codePointAt(0) === direction)
    ? direction === 1 ? "ascending" : "descending"
    : null;
}

function repeatedBlock(graphemes) {
  for (let size = 1; size <= Math.floor(graphemes.length / 2); size += 1) {
    if (graphemes.length % size) continue;
    const block = graphemes.slice(0, size).join("");
    if (block.repeat(graphemes.length / size) === graphemes.join("")) return block;
  }
  return null;
}

function shapeSignature(graphemes) {
  return graphemes.map((char) => {
    if (/\p{Letter}/u.test(char)) return "L";
    if (/\p{Number}/u.test(char)) return "N";
    if (char === "_") return "_";
    return "X";
  }).join("");
}

function classifyTelegramUsername(input, options = {}) {
  const username = normalizeTelegramUsername(input);
  const graphemes = splitGraphemes(username);
  const scripts = [...new Set(graphemes.filter((char) => /\p{Letter}/u.test(char)).map((char) => (
    SCRIPT_TESTS.find(([, expression]) => expression.test(char)) || ["Other"]
  )[0]))].sort();
  const lettersOnly = LETTER_RE.test(username);
  const numbersOnly = NUMBER_RE.test(username);
  const short = lettersOnly && graphemes.length <= 4;
  const repeated = maxRunLength(graphemes) > 1;
  const palindrome = graphemes.length > 2 && graphemes.every((char, index) => char === graphemes[graphemes.length - index - 1]);
  const sequenceDirection = sequence(graphemes);
  const repeatingBlock = repeatedBlock(graphemes);
  const digitCount = graphemes.filter((char) => /\p{Number}/u.test(char)).length;
  const underscoreCount = graphemes.filter((char) => char === "_").length;
  const latinLetters = graphemes.filter((char) => /[a-z]/u.test(char));
  const vowelCount = latinLetters.filter((char) => /[aeiouy]/u.test(char)).length;
  const vowelRatio = latinLetters.length ? vowelCount / latinLetters.length : 0;
  const pronounceability = lettersOnly && scripts.length === 1 && scripts[0] === "Latin"
    ? vowelRatio >= 0.22 && vowelRatio <= 0.72 ? "balanced" : "difficult"
    : "not-applicable";
  const dictionaryHints = new Set((options.dictionaryWords || []).map((value) => String(value).toLocaleLowerCase("und")));
  const wordHint = dictionaryHints.has(username);
  let primaryRoute = ROUTES.RESIDUAL;
  if (numbersOnly) primaryRoute = ROUTES.NUMERIC;
  else if (short) primaryRoute = ROUTES.SHORT;
  else if (scripts.length > 1 || (scripts.length === 1 && scripts[0] !== "Latin")) primaryRoute = ROUTES.MULTILINGUAL;
  else if (repeated || palindrome || sequenceDirection) primaryRoute = ROUTES.PATTERN;
  else if (ALPHANUMERIC_RE.test(username) && /[\p{Letter}]/u.test(username) && /\p{Number}/u.test(username)) primaryRoute = ROUTES.ALPHANUMERIC;
  else if (wordHint || (lettersOnly && graphemes.length >= 5 && graphemes.length <= 12)) primaryRoute = ROUTES.WORD;
  const scarcityClass = numbersOnly ? `${graphemes.length}N` : lettersOnly ? `${graphemes.length}L` : `${graphemes.length}M`;
  const routes = [primaryRoute];
  if ((repeated || palindrome || sequenceDirection) && !routes.includes(ROUTES.PATTERN)) routes.push(ROUTES.PATTERN);
  return {
    classifierVersion: "username-structural-v2",
    normalizedUsername: username,
    displayUsername: `@${username}`,
    characterLength: graphemes.length,
    byteLength: Buffer.byteLength(username, "utf8"),
    characterClass: numbersOnly ? "numeric" : lettersOnly ? "letters" : ALPHANUMERIC_RE.test(username) ? "alphanumeric" : "mixed",
    primaryRoute,
    routes,
    scarcityClass,
    patternSignature: patternSignature(graphemes),
    shapeSignature: shapeSignature(graphemes),
    uniqueCharacterCount: new Set(graphemes).size,
    maxRunLength: maxRunLength(graphemes),
    palindrome,
    sequence: sequenceDirection,
    repeatedBlock: repeatingBlock,
    scripts,
    primaryScript: scripts[0] || "Common",
    containsUnderscore: username.includes("_"),
    underscoreCount,
    digitCount,
    digitRatio: graphemes.length ? digitCount / graphemes.length : 0,
    vowelRatio,
    pronounceability,
    leadingZero: numbersOnly && username.startsWith("0"),
    roundNumber: numbersOnly && /0{2,}$/u.test(username),
    wordHint,
  };
}

module.exports = { ROUTES, classifyTelegramUsername, normalizeTelegramUsername, splitGraphemes };
