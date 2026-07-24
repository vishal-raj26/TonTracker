const screens = document.querySelectorAll("[data-screen]");
const Charts = window.TonTrackCharts;
const navButtons = document.querySelectorAll(".dock button");
const walletButtons = document.querySelectorAll(".js-connect-wallet");
const homeWalletCard = document.querySelector(".home-wallet-card");
const homeWalletTitle = document.querySelector("#homeWalletTitle");
const homeWalletText = document.querySelector("#homeWalletText");
const homeWalletButton = document.querySelector("#homeWalletButton");
let walletConnected = false;
let telegramConnected = false;
let telegramProfile = null;
let telegramImportInFlight = false;
let telegramPortfolioValue = 0;
// Connected sources are retained independently and merged through the same
// gift/sticker grouping pipeline used by wallet imports.
let telegramGiftGroups = [];
let telegramStickerGroups = [];
let walletGiftGroups = [];
let walletStickerGroups = [];
// Wallet and Telegram imports share visible asset arrays. Keep the active
// source explicit so a delayed wallet refresh can never replace Telegram data.
let activePortfolioSource = "none";

function hasTonWalletPortfolio() {
  return activePortfolioSource === "wallet" || activePortfolioSource === "combined";
}
let priceMode = "USD";
let displayCurrency = "USD";
let selectedAllocation = null;
let usdTonRate = 3.12;
const HOME_ACTIVITY_LIMIT = 5;
const STICKER_SOURCE_IMAGES = {
  Fuse: "https://cdn.prod.website-files.com/68a3e520329c3b7c58f92c0e/68a4ff89b48cb4186a9fdafd_Fuse%20Logo%20Light.svg",
  Goodies: "https://www.goodies.tg/logo.svg",
};
const TON_LOGO_URL = "https://raw.githubusercontent.com/tonkeeper/opentonapi/master/pkg/references/media/ton_symbol.png";
let detailReturnScreen = "assets";
const navigationStack = [];
const forwardNavigationStack = [];
let homePortfolioValue = 0;
let homePortfolioDelta = 0;

window.Telegram?.WebApp?.ready();
window.Telegram?.WebApp?.expand();
let homePortfolioChange = "+0.00%";
let liveWalletData = null;
let liveWalletAddress = "";
let liveHistoryPoints = [];
const liveHistoryByRange = new Map();
const liveHistoryRequests = new Map();
const loadingPortfolioRanges = new Set();
const historyRangeState = new Map();
const historyRanges = ["1D", "7D", "1M"];
const HOME_GRAPH_PRELOAD_DELAY_MS = 5000;
let historyStatusTimer = 0;
let graphHistoryLoadingPaused = true;
let tonConnectUI = null;
let lastTonConnectAddress = "";
let tokenSortMode = "value";
let latestVisibleTokens = [];
let fullActivityEvents = [];
let activityFilterMode = "All";
let activitySearchTerm = "";
let activitySearchTimer = 0;
let txSheetUrl = "";
let activityBackgroundLoading = false;
let activityPreloadAddress = "";
let activityInitialLoading = false;
let tokenDetailRange = "day";
let giftDetailRange = "7d";
let stickerDetailRange = "7d";
const tokenDetailMetricsCache = new Map();
const tokenDetailPrefetchRequests = new Map();
const giftDetailCache = new Map();
const giftDetailRequests = new Map();
const giftComboHistoryCache = new Map();
const giftComboHistoryRequests = new Map();
const giftModelStatsCache = new Map();
const giftModelStatsRequests = new Map();
const giftCollectionStatsCache = new Map();
const giftDetailPayloadVersion = "exact-combo-history-v4-explicit-traits";
const stickerDetailCache = new Map();
const stickerDetailRequests = new Map();
let activeTokenDetailRequest = 0;
let activeStickerDetailRequest = 0;
let activeGiftDetailRequest = 0;
let activeHistoryWalletKey = "";
let homeEntrancePlayed = false;
let latestCollectibleStatus = "";
const allocationState = { gifts: 0, tokens: 0, stickers: 0 };
let detailWarmupQueue = Promise.resolve();
let activeImportSessionId = 0;
let importLoaderPulseTimer = 0;
let allocationUiLocked = false;
const sectionLoadState = new Map();
let sectionToastTimer = 0;
const IMPORT_LOADER_STAGES = [
  { min: 0, step: 1, key: "connect", note: "Opening a secure, read-only view." },
  { min: 40, step: 2, key: "holdings", note: "Tokens, Gifts and stickers are reporting in." },
  { min: 65, step: 3, key: "values", note: "Matching holdings with verified market data." },
  { min: 85, step: 4, key: "dashboard", note: "Building your dashboard and first chart." },
  { min: 100, step: 5, key: "complete", note: "Your portfolio is ready to explore." },
];
const SECTION_LABELS = {
  tokens: "Tokens",
  gifts: "Gifts",
  stickers: "Stickers",
  activity: "Activity",
  graph: "Graph",
};

const navGroup = {
  tokens: "assets",
  gifts: "assets",
  "gift-brand": "assets",
  stickers: "assets",
  "sticker-brand": "assets",
  detail: "assets",
  activity: "home",
  wallets: "settings",
};

const giftAssets = [
  {
    id: "diamond-ring",
    type: "gift",
    name: "Diamond Ring",
    collection: "Diamond Ring Collection",
    icon: "gem",
    tag: 4821,
    traits: [
      { label: "Model", value: "Hypnotoad", rarity: "1.2% â€” Very Rare" },
      { label: "Backdrop", value: "Electric Indigo", rarity: "1.5% â€” Rare" },
      { label: "Symbol", value: "Coin", rarity: "0.2% â€” Ultra Rare" },
    ],
    mint: { current: 1240, total: 6962 },
    floorUsd: 2840,
    floorTon: 143,
    dailyUsd: 12.4,
    dailyPct: 8.2,
    pnlUsd: 840,
    pnlPct: 42,
    status: "Unlisted",
    acquired: "May 15, 2026",
    acquiredSort: 20260515,
    costBasis: 2000,
    upgraded: "Upgraded Â· 2,500 Stars Â· ~$25",
    provenance: 'Gifted by @alex to you Â· May 15 Â· "Happy birthday!"',
    comboRank: "Top 0.03% rarest trait combo in this collection",
    exactCount: "Only 9 gifts share this exact Model + Backdrop + Symbol",
    quickSellTon: 135.8,
    quickSellUsd: 2698,
    sales: [
      ["148 TON Â· $2,938", "May 15", "Hypnotoad", "Electric Indigo", "Coin", "Getgems"],
      ["143 TON Â· $2,840", "May 14", "Hypnotoad", "Electric Indigo", "Coin", "Fragment"],
      ["139 TON Â· $2,761", "May 12", "Hypnotoad", "Electric Indigo", "Coin", "Getgems"],
    ],
    intel: {
      trend: "â–‚â–ƒâ–…â–†â–‡",
      badge: "Trending Up",
      sales24h: "3 exact variant sales",
      volume24h: "430 TON Â· $8,539",
      prior: "+34% volume Â· +12% sales count",
      daysToSell: "~2.4 days",
      listedSupply: "12 listed across Getgems + Fragment",
      listingRate: "Listed: 8% of supply â€” low supply supports price",
      bestTime: "Thursdays 6â€“9 PM UTC",
    },
    chart: [2000, 2140, 2260, 2190, 2420, 2680, 2840],
  },
  {
    id: "royal-crown",
    type: "gift",
    name: "Royal Crown",
    collection: "Royal Crown Collection",
    icon: "crown",
    tag: 1088,
    traits: [
      { label: "Model", value: "Goldcrest", rarity: "2.4% â€” Rare" },
      { label: "Backdrop", value: "Velvet Night", rarity: "3.1% â€” Scarce" },
      { label: "Symbol", value: "Star", rarity: "0.8% â€” Very Rare" },
    ],
    mint: { current: 886, total: 5000 },
    floorUsd: 1960,
    floorTon: 98,
    dailyUsd: 44,
    dailyPct: 6.4,
    pnlUsd: 320,
    pnlPct: 19.5,
    status: "Listed on Fragment",
    acquired: "Apr 28, 2026",
    acquiredSort: 20260428,
    costBasis: 1640,
    upgraded: "Upgraded Â· 1,200 Stars Â· ~$12",
    provenance: 'Gifted by @mira to you Â· Apr 28 Â· "For the vault"',
    comboRank: "Top 0.12% rarest trait combo in this collection",
    exactCount: "Only 21 gifts share this exact Model + Backdrop + Symbol",
    quickSellTon: 93.1,
    quickSellUsd: 1862,
    sales: [
      ["101 TON Â· $2,018", "May 14", "Goldcrest", "Velvet Night", "Star", "Fragment"],
      ["97 TON Â· $1,931", "May 11", "Goldcrest", "Velvet Night", "Star", "Getgems"],
    ],
    intel: {
      trend: "â–‚â–ƒâ–„â–…â–…",
      badge: "Stable",
      sales24h: "2 exact variant sales",
      volume24h: "198 TON Â· $3,949",
      prior: "+9% volume Â· +4% sales count",
      daysToSell: "~3.1 days",
      listedSupply: "18 listed across Getgems + Fragment",
      listingRate: "Listed: 11% of supply",
      bestTime: "Sundays 4â€“7 PM UTC",
    },
    chart: [1640, 1705, 1810, 1760, 1880, 1920, 1960],
  },
  {
    id: "star-bloom",
    type: "gift",
    name: "Star Bloom",
    collection: "Star Bloom Collection",
    icon: "sparkles",
    tag: 7812,
    traits: [
      { label: "Model", value: "Soft Flare", rarity: "8.2% â€” Notable" },
      { label: "Backdrop", value: "Mint Haze", rarity: "4.5% â€” Scarce" },
      { label: "Symbol", value: "Moon", rarity: "2.1% â€” Rare" },
    ],
    mint: { current: 4210, total: 9000 },
    floorUsd: 420,
    floorTon: 21,
    dailyUsd: -6,
    dailyPct: -3.1,
    pnlUsd: 48,
    pnlPct: 12.9,
    status: "Unlisted",
    acquired: "Mar 12, 2026",
    acquiredSort: 20260312,
    costBasis: 372,
    upgraded: "Not upgraded Â· 0 Stars Â· $0",
    provenance: 'Gifted by @dani to you Â· Mar 12 Â· "Tiny star"',
    comboRank: "Top 1.6% rarest trait combo in this collection",
    exactCount: "Only 144 gifts share this exact Model + Backdrop + Symbol",
    quickSellTon: 19.95,
    quickSellUsd: 399,
    sales: [
      ["22 TON Â· $438", "May 13", "Soft Flare", "Mint Haze", "Moon", "Getgems"],
      ["21 TON Â· $420", "May 10", "Soft Flare", "Mint Haze", "Moon", "Fragment"],
    ],
    intel: {
      trend: "â–…â–„â–ƒâ–ƒâ–‚",
      badge: "Cooling",
      sales24h: "1 exact variant sale",
      volume24h: "21 TON Â· $420",
      prior: "-12% volume Â· -18% sales count",
      daysToSell: "~5.8 days",
      listedSupply: "64 listed across Getgems + Fragment",
      listingRate: "Listed: 19% of supply",
      bestTime: "Fridays 5â€“8 PM UTC",
    },
    chart: [372, 405, 444, 462, 438, 426, 420],
  },
  {
    id: "gold-trophy",
    type: "gift",
    name: "Gold Trophy",
    collection: "Gold Trophy Collection",
    icon: "medal",
    tag: 2260,
    traits: [
      { label: "Model", value: "Champion", rarity: "1.8% â€” Very Rare" },
      { label: "Backdrop", value: "Carbon Black", rarity: "2.7% â€” Rare" },
      { label: "Symbol", value: "Laurel", rarity: "0.9% â€” Very Rare" },
    ],
    mint: { current: 612, total: 4200 },
    floorUsd: 1380,
    floorTon: 69,
    dailyUsd: 32,
    dailyPct: 9.7,
    pnlUsd: 410,
    pnlPct: 42.3,
    status: "Listed on Getgems",
    acquired: "Feb 09, 2026",
    acquiredSort: 20260209,
    costBasis: 970,
    upgraded: "Upgraded Â· 900 Stars Â· ~$9",
    provenance: 'Gifted by @tonfan to you Â· Feb 09 Â· "Winner"',
    comboRank: "Top 0.18% rarest trait combo in this collection",
    exactCount: "Only 15 gifts share this exact Model + Backdrop + Symbol",
    quickSellTon: 65.55,
    quickSellUsd: 1311,
    sales: [
      ["70 TON Â· $1,398", "May 15", "Champion", "Carbon Black", "Laurel", "Getgems"],
      ["67 TON Â· $1,337", "May 12", "Champion", "Carbon Black", "Laurel", "Fragment"],
    ],
    intel: {
      trend: "â–‚â–„â–…â–†â–‡",
      badge: "Trending Up",
      sales24h: "2 exact variant sales",
      volume24h: "137 TON Â· $2,735",
      prior: "+22% volume Â· +9% sales count",
      daysToSell: "~2.9 days",
      listedSupply: "15 listed across Getgems + Fragment",
      listingRate: "Listed: 7% of supply â€” tight inventory",
      bestTime: "Thursdays 6â€“9 PM UTC",
    },
    chart: [970, 1040, 1115, 1190, 1260, 1328, 1380],
  },
];

const stickerAssets = [
  {
    id: "neon-cat-set",
    type: "sticker",
    name: "Neon Cat Set",
    icon: "sparkles",
    packId: "ton://sticker/neon-cat",
    creator: "NeonCatLab",
    format: "Animated",
    edition: "Limited Drop",
    count: 24,
    floorUsd: 620,
    floorTon: 31,
    dailyUsd: -11.16,
    dailyPct: -1.8,
    pnlUsd: -28,
    pnlPct: -4.3,
    status: "Unlisted",
    acquired: "Apr 28, 2026",
    acquiredSort: 20260428,
    costBasis: 648,
    attributes: [
      ["Pack Name", "Neon Cat Set"],
      ["Emoji Trigger", "ðŸ±"],
      ["Format", "Animated"],
      ["Sticker Count", "24"],
      ["Set ID", "ton://sticker/neon-cat"],
      ["Creator", "NeonCatLab"],
      ["Release Type", "Limited Drop"],
      ["Collaboration", "Telegram Artists"],
      ["Drop Date", "April 10, 2026"],
    ],
    quickSellTon: 29.45,
    quickSellUsd: 589,
    sales: [
      ["32 TON Â· $638", "May 14", "Animated", "NeonCatLab", "Getgems"],
      ["31 TON Â· $620", "May 12", "Animated", "NeonCatLab", "Getgems"],
    ],
    intel: {
      trend: "â–…â–„â–ƒâ–ƒâ–‚",
      badge: "Cooling",
      sales24h: "4 pack sales",
      volume24h: "124 TON Â· $2,476",
      prior: "-8% volume Â· -11% sales",
      daysToSell: "~4.1 days",
      listedSupply: "41 listed across Getgems",
      listingRate: "Listed: 14% of total supply",
      bestTime: "Mondays 7â€“9 PM UTC",
    },
    chart: [648, 676, 690, 671, 650, 632, 620],
  },
  {
    id: "pixel-faces",
    type: "sticker",
    name: "Pixel Faces",
    icon: "badge",
    packId: "ton://sticker/pixel-faces",
    creator: "PixelForge",
    format: "Static",
    edition: "Limited Drop",
    count: 18,
    floorUsd: 880,
    floorTon: 44,
    dailyUsd: 46.6,
    dailyPct: 5.6,
    pnlUsd: 140,
    pnlPct: 18.9,
    status: "Listed on Getgems",
    acquired: "Apr 02, 2026",
    acquiredSort: 20260402,
    costBasis: 740,
    attributes: [
      ["Pack Name", "Pixel Faces"],
      ["Emoji Trigger", "ðŸ™‚"],
      ["Format", "Static"],
      ["Sticker Count", "18"],
      ["Set ID", "ton://sticker/pixel-faces"],
      ["Creator", "PixelForge"],
      ["Release Type", "Limited Drop"],
      ["Collaboration", "PixelForge Ãƒâ€” Telegram"],
      ["Drop Date", "March 22, 2026"],
    ],
    quickSellTon: 41.8,
    quickSellUsd: 836,
    sales: [
      ["45 TON Â· $898", "May 15", "Static", "PixelForge", "Getgems"],
      ["43 TON Â· $858", "May 13", "Static", "PixelForge", "Getgems"],
    ],
    intel: {
      trend: "â–‚â–ƒâ–…â–†â–‡",
      badge: "Trending Up",
      sales24h: "7 pack sales",
      volume24h: "306 TON Â· $6,109",
      prior: "+28% volume Â· +18% sales",
      daysToSell: "~1.9 days",
      listedSupply: "23 listed across Getgems",
      listingRate: "Listed: 6% of total supply â€” price support",
      bestTime: "Thursdays 6â€“9 PM UTC",
    },
    chart: [740, 762, 790, 812, 850, 862, 880],
  },
  {
    id: "moon-moods",
    type: "sticker",
    name: "Moon Moods",
    icon: "wand-sparkles",
    packId: "ton://sticker/moon-moods",
    creator: "MoonStudio",
    format: "Video",
    edition: "Open Edition",
    count: 32,
    floorUsd: 410,
    floorTon: 20.5,
    dailyUsd: 4.9,
    dailyPct: 1.2,
    pnlUsd: 32,
    pnlPct: 8.5,
    status: "Unlisted",
    acquired: "Mar 18, 2026",
    acquiredSort: 20260318,
    costBasis: 378,
    attributes: [
      ["Pack Name", "Moon Moods"],
      ["Emoji Trigger", "ðŸŒ™"],
      ["Format", "Video"],
      ["Sticker Count", "32"],
      ["Set ID", "ton://sticker/moon-moods"],
      ["Creator", "MoonStudio"],
      ["Release Type", "Open Edition"],
      ["Collaboration", "Independent"],
      ["Drop Date", "March 10, 2026"],
    ],
    quickSellTon: 19.48,
    quickSellUsd: 390,
    sales: [
      ["21 TON Â· $420", "May 13", "Video", "MoonStudio", "Getgems"],
      ["20 TON Â· $399", "May 11", "Video", "MoonStudio", "Getgems"],
    ],
    intel: {
      trend: "â–ƒâ–„â–ƒâ–„â–…",
      badge: "Stable",
      sales24h: "5 pack sales",
      volume24h: "102 TON Â· $2,041",
      prior: "+4% volume Â· +2% sales",
      daysToSell: "~3.5 days",
      listedSupply: "78 listed across Getgems",
      listingRate: "Listed: 18% of total supply",
      bestTime: "Saturdays 3â€“6 PM UTC",
    },
    chart: [378, 390, 402, 398, 407, 414, 410],
  },
];
const tokenDetails = {
  toncoin: {
    id: "toncoin",
    type: "token",
    name: "Toncoin",
    category: "TON Token",
    value: "$4,180 Â· +2.4%",
    icon: "coins",
    tone: "token-bg",
    statOneLabel: "Balance",
    statOne: "1,340 TON",
    statTwoLabel: "Price",
    statTwo: "$3.12",
    statThreeLabel: "Wallet",
    statThree: "Main",
    pnl: "+$610",
    history: "Received 30 TON Â· 3m ago",
    link: "Explorer",
  },
  notcoin: {
    id: "notcoin",
    type: "token",
    name: "Notcoin",
    category: "TON Token",
    value: "$1,120 Â· -1.1%",
    icon: "circle-dollar-sign",
    tone: "token-bg",
    statOneLabel: "Balance",
    statOne: "18,400 NOT",
    statTwoLabel: "Price",
    statTwo: "$0.008",
    statThreeLabel: "Wallet",
    statThree: "Trading",
    pnl: "-$42",
    history: "Bought 4,200 NOT Â· May 10",
    link: "Explorer",
  },
  "jetton-basket": {
    id: "jetton-basket",
    type: "token",
    name: "Jetton Basket",
    category: "TON Token",
    value: "$440 Â· +0.8%",
    icon: "landmark",
    tone: "token-bg",
    statOneLabel: "Assets",
    statOne: "6 jettons",
    statTwoLabel: "Best",
    statTwo: "+4.2%",
    statThreeLabel: "Wallet",
    statThree: "Main",
    pnl: "+$36",
    history: "Portfolio refreshed Â· Today",
    link: "Explorer",
  },
};

const assetDetails = Object.fromEntries([...giftAssets, ...stickerAssets, ...Object.values(tokenDetails)].map((asset) => [asset.id, asset]));

function money(value) {
  if (displayCurrency === "TON") return `${(value / usdTonRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TON`;
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const WINDOWS_1252_BYTES = {
  "\u20ac": 0x80, "\u201a": 0x82, "\u0192": 0x83, "\u201e": 0x84, "\u2026": 0x85,
  "\u2020": 0x86, "\u2021": 0x87, "\u02c6": 0x88, "\u2030": 0x89, "\u0160": 0x8a,
  "\u2039": 0x8b, "\u0152": 0x8c, "\u017d": 0x8e, "\u2018": 0x91, "\u2019": 0x92,
  "\u201c": 0x93, "\u201d": 0x94, "\u2022": 0x95, "\u2013": 0x96, "\u2014": 0x97,
  "\u02dc": 0x98, "\u2122": 0x99, "\u0161": 0x9a, "\u203a": 0x9b, "\u0153": 0x9c,
  "\u017e": 0x9e, "\u0178": 0x9f,
};

function repairMojibake(value) {
  let text = String(value ?? "");
  if (!/[\u00c2\u00c3\u00e2]/.test(text)) return text;

  for (let pass = 0; pass < 3; pass += 1) {
    const bytes = [];
    let canDecode = true;
    for (const char of text) {
      const code = char.charCodeAt(0);
      const byte = code <= 0xff ? code : WINDOWS_1252_BYTES[char];
      if (byte === undefined) {
        canDecode = false;
        break;
      }
      bytes.push(byte);
    }
    if (!canDecode) break;
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
      if (decoded === text) break;
      text = decoded;
      if (!/[\u00c2\u00c3\u00e2]/.test(text)) break;
    } catch {
      break;
    }
  }
  return text;
}

function normalizeVisibleText(root) {
  if (!root || root.nodeType === Node.COMMENT_NODE) return;
  if (root.nodeType === Node.TEXT_NODE) {
    const repaired = repairMojibake(root.nodeValue);
    if (repaired !== root.nodeValue) root.nodeValue = repaired;
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || /^(SCRIPT|STYLE|TEXTAREA)$/.test(root.tagName)) return;
  root.childNodes.forEach(normalizeVisibleText);
}

let mojibakeObserverStarted = false;
function startMojibakeObserver() {
  if (mojibakeObserverStarted || !document.body) return;
  mojibakeObserverStarted = true;
  normalizeVisibleText(document.body);
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(normalizeVisibleText)))
    .observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startMojibakeObserver, { once: true });
} else {
  startMojibakeObserver();
}
function escapeHtml(value) {
  startMojibakeObserver();
  return repairMojibake(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function signedMoney(value) {
  if (displayCurrency === "TON") return `${value >= 0 ? "+" : "-"}${(Math.abs(value) / usdTonRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TON`;
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signedPct(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function tokenPriceLabel(value) {
  const number = Number(value || 0);
  if (!(number > 0)) return "Price n/a";
  return `$${number.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 })}`;
}

function usdValueLabel(value) {
  const number = Number(value || 0);
  return `$${number.toLocaleString(undefined, {
    minimumFractionDigits: number >= 1 ? 2 : 0,
    maximumFractionDigits: number >= 1 ? 2 : 6,
  })}`;
}

function tokenBalanceLabel(token) {
  const balance = Number(token.balance || 0);
  const compact = Math.abs(balance) >= 1000
    ? balance.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 2 })
    : balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  const symbol = String(token.symbol || "").length > 8 ? `${String(token.symbol).slice(0, 8)}...` : token.symbol;
  return `${compact} ${symbol}`;
}

function tokenBalanceCompact(token) {
  const balance = Number(token.balance || 0);
  return Math.abs(balance) >= 1000
    ? balance.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 2 })
    : balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

function tokenSymbolCompact(token) {
  const symbol = String(token.symbol || "");
  return symbol.length > 6 ? `${symbol.slice(0, 6)}...` : symbol;
}

function compactNumber(value, options = {}) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "--";
  return number.toLocaleString(undefined, {
    notation: Math.abs(number) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: options.maximumFractionDigits ?? (Math.abs(number) >= 10000 ? 2 : 0),
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
  });
}



function showScreen(name) {
  const previousScreen = document.querySelector(".screen.is-active")?.dataset.screen;
  screens.forEach((screen) => {
    screen.classList.toggle("is-active", screen.dataset.screen === name);
  });
  document.querySelector(".app-frame")?.classList.toggle("is-home-screen", name === "home");
  const group = navGroup[name] || name;
  navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.screenTarget === group);
  });
  if (name === "home" && !homeEntrancePlayed) {
    playHomeEntrance();
    homeEntrancePlayed = true;
  }
  if (name === "activity") loadFullActivity();
}

function navigationRouteKey(route = {}) {
  return [route.screen || "", route.mode || "", route.asset || ""].join(":");
}

function currentNavigationRoute() {
  const screen = document.querySelector(".screen.is-active")?.dataset.screen || "home";
  const route = { screen, scrollY: window.scrollY || document.documentElement.scrollTop || 0 };
  if (screen === "detail") {
    route.asset = currentDetailAssetId();
  } else if (screen === "gift-brand") {
    const giftScreen = document.querySelector('[data-screen="gift-brand"]');
    route.asset = giftScreen?.dataset.modelGroupAsset || giftScreen?.dataset.asset || "";
    route.mode = giftScreen?.dataset.modelGroupAsset ? "gift-model-group" : "gift-brand";
  } else if (screen === "sticker-brand") {
    route.asset = document.querySelector('[data-screen="sticker-brand"]')?.dataset.asset || "";
  }
  return route;
}

function routeFromTarget(target) {
  const screen = target.dataset.screenTarget || "home";
  const route = { screen, asset: target.dataset.asset || "" };
  if (screen === "gift-model-group") {
    route.screen = "gift-brand";
    route.mode = "gift-model-group";
  } else if (screen === "gift-brand") {
    route.mode = "gift-brand";
  }
  return route;
}

function isHeaderBackTarget(target) {
  const header = target.closest(".page-header");
  return Boolean(header && header.firstElementChild === target && target.classList.contains("icon-button"));
}

function restoreRouteScroll(route) {
  const top = Math.max(0, Number(route?.scrollY || 0));
  requestAnimationFrame(() => {
    requestAnimationFrame(() => window.scrollTo({ top, behavior: "auto" }));
  });
}

function applyNavigationRoute(route, { restoreScroll = false } = {}) {
  if (!route?.screen) return;
  if (route.screen === "detail") {
    if (!route.asset || !renderAssetDetail(route.asset)) return;
  } else if (route.screen === "gift-brand") {
    if (route.mode === "gift-model-group") renderGiftModelGroup(route.asset);
    else renderGiftBrand(route.asset);
  } else if (route.screen === "sticker-brand") {
    renderStickerBrand(route.asset);
  } else if (route.screen === "activity") {
    loadFullActivity();
  }
  showScreen(route.screen);
  if (restoreScroll) restoreRouteScroll(route);
  else window.scrollTo({ top: 0, behavior: "auto" });
}

function navigateToRoute(route, { back = false, forward = false } = {}) {
  const currentRoute = currentNavigationRoute();
  if (back && navigationStack.length) {
    const previousRoute = navigationStack.pop();
    forwardNavigationStack.push(currentRoute);
    applyNavigationRoute(previousRoute, { restoreScroll: true });
    return;
  }
  if (back) return;
  if (forward && forwardNavigationStack.length) {
    const nextRoute = forwardNavigationStack.pop();
    navigationStack.push(currentRoute);
    applyNavigationRoute(nextRoute, { restoreScroll: true });
    return;
  }
  if (forward) return;
  if (navigationRouteKey(currentRoute) !== navigationRouteKey(route)) {
    navigationStack.push(currentRoute);
    forwardNavigationStack.length = 0;
  }
  applyNavigationRoute(route, { restoreScroll: false });
}

function shouldIgnoreNavigationSwipe(target) {
  return Boolean(target?.closest?.([
    "button",
    "a",
    "input",
    "textarea",
    "select",
    "[contenteditable]",
    "[data-external-url]",
    ".wallet-sheet",
    ".wallet-sheet-backdrop",
    ".wallet-action-sheet",
    ".wallet-action-backdrop",
    ".token-sort-sheet",
    ".tx-sheet",
    ".tx-sheet-backdrop",
    ".sticker-thumb-overlay",
    ".gift-pfp-tray",
    ".gift-pfp-tray-backdrop",
    ".floor-chart",
    ".donut-chart",
  ].join(",")));
}

function installNavigationSwipeGestures() {
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let swipeTarget = null;
  const threshold = 72;
  const verticalTolerance = 1.25;
  const maxDurationMs = 900;

  document.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1 || shouldIgnoreNavigationSwipe(event.target)) {
      swipeTarget = null;
      return;
    }
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = Date.now();
    swipeTarget = event.target;
  }, { passive: true });

  document.addEventListener("touchend", (event) => {
    if (!swipeTarget || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const duration = Date.now() - startTime;
    swipeTarget = null;
    if (duration > maxDurationMs) return;
    if (Math.abs(deltaX) < threshold) return;
    if (Math.abs(deltaX) < Math.abs(deltaY) * verticalTolerance) return;
    if (deltaX > 0) navigateToRoute({}, { back: true });
    else navigateToRoute({}, { forward: true });
  }, { passive: true });

  document.addEventListener("touchcancel", () => {
    swipeTarget = null;
  }, { passive: true });
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function setIcon(container, iconName, tone) {
  if (!container) return;
  container.className = `asset-icon ${tone}`;
  container.innerHTML = `<i data-lucide="${iconName}"></i>`;
}

function renderCollectibleGrids() {
  updateCollectibleSummaryBanner("gifts");
  updateCollectibleSummaryBanner("stickers");
  renderGiftGrid();
  renderStickerGrid();
}

function updateCollectibleSummaryBanner(kind) {
  const screen = document.querySelector(`[data-screen="${kind}"]`);
  const banner = screen?.querySelector(".asset-total-banner");
  if (!banner) return;
  const assets = kind === "gifts" ? giftAssets : stickerAssets;
  if (isSectionLoading(kind) && !assets.length) {
    banner.innerHTML = `<small>${kind === "gifts" ? "Total Gifts Value" : "Total Stickers Value"}</small><div><h2><span class="metric-skeleton metric-skeleton-large"></span></h2><span><span class="metric-skeleton metric-skeleton-small"></span></span></div><strong><span class="metric-skeleton metric-skeleton-line"></span></strong><p><span class="metric-skeleton metric-skeleton-line"></span></p>`;
    return;
  }
  const priced = assets.filter((asset) => Number(asset.floorUsd) > 0);
  const label = kind === "gifts" ? "Total Gifts Value" : "Total Stickers Value";
  if (!priced.length) {
    const pending = hasPendingCollectiblePrices(kind);
    banner.innerHTML = `<small>${label}</small><div><h2>${pending ? "Price loading" : "Price unavailable"}</h2><span>${assets.length} item${assets.length === 1 ? "" : "s"}</span></div><strong>${pending ? "Market prices are loading in the background" : "No market prices available yet"}</strong><p></p>`;
    return;
  }
  const total = priced.reduce((sum, asset) => sum + Number(asset.floorUsd || 0), 0);
  const totalTon = usdTonRate > 0 ? total / usdTonRate : 0;
  const daily = priced.reduce((sum, asset) => sum + Number(asset.dailyUsd || 0), 0);
  const pnl = priced.reduce((sum, asset) => sum + Number(asset.pnlUsd || 0), 0);
  const pnlBase = priced.reduce((sum, asset) => sum + Math.max(0, Number(asset.floorUsd || 0) - Number(asset.pnlUsd || 0)), 0);
  const dailyPct = total ? (daily / total) * 100 : 0;
  const pnlPct = pnlBase ? (pnl / pnlBase) * 100 : 0;
  const dailyClass = daily < 0 ? "negative" : "positive";
  const pnlClass = pnl < 0 ? "negative" : "positive";
  banner.innerHTML = `<small>${label}</small><div><h2>${money(total)}</h2><span>${compactNumber(totalTon)} TON</span></div><strong class="${dailyClass}">${signedMoney(daily)} Â· ${signedPct(dailyPct)} 24h</strong><p>${kind === "gifts" ? "Gift" : "Sticker"} unrealized PnL: <b class="${pnlClass}">${signedMoney(pnl)} Â· ${signedPct(pnlPct)}</b></p>`;
}

function renderGiftGrid() {
  const grid = document.querySelector("#giftGrid");
  if (!grid) return;
  const sort = document.querySelector("#giftSort")?.value || "floor-desc";
  const filter = document.querySelector("#giftFilter")?.value || "all";
  const query = (document.querySelector("#giftSearch")?.value || "").trim().toLowerCase();
  const searched = query
    ? giftAssets.filter((asset) => [
      asset.name,
      asset.collection,
      asset.model,
      asset.backdrop,
      asset.symbol,
      ...(asset.traits || []).flatMap((trait) => [trait.label, trait.value]),
      ...(asset.children || []).flatMap((child) => [
        child.name,
        child.collection,
        child.model,
        child.backdrop,
        child.symbol,
        ...(child.traits || []).flatMap((trait) => [trait.label, trait.value]),
      ]),
    ].filter(Boolean).join(" ").toLowerCase().includes(query))
    : giftAssets;
  const items = sortAssets(filterAssets(searched, filter), sort);
  const countLabel = document.querySelector("#giftCountLabel");
  if (countLabel) {
    const count = items.reduce((sum, asset) => sum + Number(asset.count || 1), 0);
    countLabel.textContent = `${count} gift${count === 1 ? "" : "s"}`;
  }
  const coverageLabel = document.querySelector("#giftPriceCoverage");
  if (coverageLabel) {
    const holdings = giftAssets.flatMap((asset) => asset.children?.length ? asset.children : [asset]);
    const fetched = holdings.filter((asset) => asset.floorSource === "backdrop" && Number(asset.floorUsd || 0) > 0).length;
    const estimated = holdings.filter(isEstimatedAsset).length;
    coverageLabel.textContent = `${fetched} fetched Â· ${estimated} valued`;
    coverageLabel.classList.toggle("is-complete", Boolean(holdings.length) && fetched + estimated >= holdings.length);
  }
  grid.innerHTML = items.length ? items.map(renderGiftCard).join("") : `<article class="collectible-card"><div class="value-stack"><strong>No gifts found</strong><small>Try a different search.</small></div></article>`;
  window.lucide?.createIcons();
  initCollectibleAnimations(grid);
  applyCurrencyDisplay();
}

function renderStickerGrid() {
  const grid = document.querySelector("#stickerGrid");
  if (!grid) return;
  const sort = document.querySelector("#stickerSort")?.value || "floor-desc";
  const filter = document.querySelector("#stickerFilter")?.value || "all";
  const query = (document.querySelector("#stickerSearch")?.value || "").trim().toLowerCase();
  const searched = query
    ? stickerAssets.filter((asset) => [
      asset.name,
      asset.collection,
      asset.creator,
      asset.characterName,
      asset.marketPlatform,
      asset.source,
      asset.format,
      asset.edition,
      ...(asset.children || []).flatMap((child) => [child.name, child.collection, child.characterName, child.source]),
    ].filter(Boolean).join(" ").toLowerCase().includes(query))
    : stickerAssets;
  const items = sortAssets(filterAssets(searched, filter), sort);
  const countLabel = document.querySelector("#stickerCountLabel");
  if (countLabel) {
    const count = items.reduce((sum, asset) => sum + stickerOwnedCount(asset), 0);
    countLabel.textContent = `${count} sticker${count === 1 ? "" : "s"}`;
  }
  grid.innerHTML = items.length ? items.map(renderStickerCard).join("") : `<article class="collectible-card"><div class="value-stack"><strong>No stickers found</strong><small>Try a different search.</small></div></article>`;
  window.lucide?.createIcons();
  initCollectibleAnimations(grid);
  applyCurrencyDisplay();
}

function filterAssets(items, filter) {
  if (filter === "all") return [...items];
  const members = (item) => item.children?.length ? item.children : [item];
  if (filter === "listed") return items.filter((item) => members(item).some((member) => member.status !== "Unlisted"));
  if (filter === "unlisted") return items.filter((item) => members(item).every((member) => member.status === "Unlisted"));
  const [field, value] = filter.split(":");
  if (field === "collection") return items.filter((item) => item.collection === value);
  if (field === "model" || field === "backdrop" || field === "symbol") {
    const label = field[0].toUpperCase() + field.slice(1);
    return items.filter((item) => item.traits?.some((trait) => trait.label === label && trait.value === value));
  }
  if (field === "format") return items.filter((item) => members(item).some((member) => member.format === value));
  if (field === "creator") return items.filter((item) => members(item).some((member) => item.creator === value || member.creator === value));
  if (field === "edition") return items.filter((item) => members(item).some((member) => member.edition === value));
  return [...items];
}

function sortAssets(items, sort) {
  const sorted = [...items];
  const numericMetric = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };
  const firstTraitPct = (item) => Number.parseFloat(item.traits?.[0]?.rarity || "99");
  const mintNumber = (item) => item.mint?.current || 999999;
  const sorters = {
    "floor-desc": (a, b) => numericMetric(b.floorUsd) - numericMetric(a.floorUsd) || String(a.name || "").localeCompare(String(b.name || "")),
    "floor-asc": (a, b) => numericMetric(a.floorUsd) - numericMetric(b.floorUsd) || String(a.name || "").localeCompare(String(b.name || "")),
    "pnl-desc": (a, b) => numericMetric(b.pnlPct) - numericMetric(a.pnlPct),
    "daily-desc": (a, b) => numericMetric(b.dailyPct) - numericMetric(a.dailyPct),
    "date-desc": (a, b) => b.acquiredSort - a.acquiredSort,
    "tag-asc": (a, b) => (a.tag || 0) - (b.tag || 0),
    "model-rarity": (a, b) => firstTraitPct(a) - firstTraitPct(b),
    "mint-asc": (a, b) => mintNumber(a) - mintNumber(b),
    "name-asc": (a, b) => a.name.localeCompare(b.name),
  };
  return sorted.sort(sorters[sort] || sorters["floor-desc"]);
}

function floorSourceLine(asset = {}) {
  if (Number(asset.estimatedCount || 0) > 0) {
    const base = Number(asset.floorTon || 0) > 0 ? `${Number(asset.floorTon).toFixed(2)} TON` : "";
    return ["Floor", base].filter(Boolean).map((part) => escapeHtml(String(part))).join(" Â· ");
  }
  const isEstimate = asset.floorStatus === "estimated" || asset.floorSource === "estimate" || asset.source === "estimated-combo-value";
  const isLastSale = asset.floorSource === "last-sale" || asset.source === "last-sale-exact" || /last sale/i.test(String(asset.marketPlatform || ""));
  const parts = [isLastSale ? "Last sale" : "Floor"];
  if (asset.floorSource === "model") parts.push("Model");
  if (Number(asset.floorTon || 0) > 0) parts.push(`${Number(asset.floorTon).toFixed(2)} TON`);
  const platform = marketSourceLabel(asset.marketPlatform);
  if (!isEstimate && platform && platform !== "xGift Model" && platform !== "Model Floor") parts.push(platform);
  if (Number(asset.initTon || 0) > 0) parts.push(`Init ${Number(asset.initTon).toFixed(2)} TON`);
  else if (Number(asset.initUsd || 0) > 0) parts.push(`Init ${money(asset.initUsd)}`);
  return parts.map((part) => escapeHtml(String(part))).join(" Â· ");
}

function isEstimatedAsset(asset = {}) {
  return asset.floorStatus === "estimated" || asset.floorSource === "estimate" || asset.source === "estimated-combo-value" || Number(asset.estimatedCount || 0) > 0;
}

function estimatedPillHtml(asset = {}) {
  return isEstimatedAsset(asset) ? `<span class="status-badge is-estimated">Estimated</span>` : "";
}


function renderGiftCard(asset) {
  if (asset.priceLoading && !(Number(asset.floorUsd || 0) > 0)) return renderCollectiblePriceSkeletonCard(asset, "gift");
  const dailyClass = asset.dailyUsd >= 0 ? "positive" : "negative";
  const pnlClass = asset.pnlUsd >= 0 ? "positive" : "negative";
  const listed = asset.status && asset.status !== "Unlisted";
  const title = asset.name || asset.collection || "Gift";
  const model = giftModelTrait(asset);
  const backdrop = giftBackdropTrait(asset);
  const subtitle = [model, backdrop].filter(Boolean).join(" Â· ")
    || [asset.creator, asset.collection].find((value) => value && collectibleKey(value) !== collectibleKey(title)) || "";
  const provenance = asset.provenance && collectibleKey(asset.provenance) !== collectibleKey(title)
    && collectibleKey(asset.provenance) !== collectibleKey(subtitle) ? asset.provenance : "";
  const hasPrice = Number(asset.floorUsd) > 0;
  const floorNote = hasPrice
    ? floorSourceLine(asset)
    : "No market price available";
  return `
    <article class="collectible-card is-gift-card" data-screen-target="gift-brand" data-asset="${asset.id}">
      <div class="collectible-top">
        ${collectibleArtHtml(asset, "gift")}
        <div><h3>${escapeHtml(title)}</h3>${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ""}</div>
        <span class="tag-number">${Number(asset.count || 1)} gift${Number(asset.count || 1) === 1 ? "" : "s"}</span>${estimatedPillHtml(asset)}
      </div>
      ${provenance || listed ? `<div class="card-meta-line ${provenance ? "" : "is-status-only"}">${provenance ? `<span>${escapeHtml(provenance)}</span>` : ""}${listed ? `<b class="status-badge is-listed">${escapeHtml(asset.status)}</b>` : ""}</div>` : ""}
      <div class="value-stack"><strong>${hasPrice ? money(asset.floorUsd) : "Price unavailable"}</strong><small>${floorNote}</small></div>
      <div class="pnl-row">
        <span class="pnl-box"><small>Daily PnL</small><b class="${dailyClass}">${hasPrice ? `${signedMoney(asset.dailyUsd)} Â· ${signedPct(asset.dailyPct)}` : "â€”"}</b></span>
        <span class="pnl-box"><small>Total PnL</small><b class="${pnlClass}">${hasPrice ? `${signedMoney(asset.pnlUsd)} Â· ${signedPct(asset.pnlPct)}` : "â€”"}</b></span>
      </div>
    </article>`;
}

function renderGiftBrand(assetId) {
  const brand = giftAssets.find((asset) => asset.id === assetId) || giftAssets[0];
  if (!brand) return;
  const screen = document.querySelector('[data-screen="gift-brand"]');
  if (screen) {
    screen.dataset.asset = brand.id;
    delete screen.dataset.modelGroupAsset;
  }
  const children = brand.children?.length ? brand.children : [brand];
  children.forEach((child) => { assetDetails[child.id] = child; });
  const groupedChildren = groupGiftBrandChildren(children);
  setText("#giftBrandTitle", brand.name || "Gift Collection");
  const summary = document.querySelector("#giftBrandSummary");
  if (summary) {
    const count = children.reduce((sum, item) => sum + Number(item.count || 1), 0);
    const totalValue = children.reduce((sum, item) => sum + Number(item.floorUsd || 0), 0);
    const init = children.reduce((sum, item) => sum + Number(item.initUsd || 0), 0);
    const pnl = init ? totalValue - init : 0;
    const valueLabel = totalValue > 0 ? money(totalValue) : "Price unavailable";
    const countLabel = `${count} gift${count === 1 ? "" : "s"}`;
    summary.innerHTML = `<small>${escapeHtml(brand.creator || brand.collection || "Gift collection")}</small><div><h2>${valueLabel}</h2><span>${escapeHtml(countLabel)}</span></div><strong class="${pnl < 0 ? "negative" : "positive"}">${init && totalValue > 0 ? `${signedMoney(pnl)} Â· ${signedPct((pnl / init) * 100)}` : "Tap a gift to open details"}</strong>`;
  }
  const grid = document.querySelector("#giftBrandGrid");
  groupedChildren.forEach((item) => { assetDetails[item.id] = item; });
  if (grid) grid.innerHTML = groupedChildren.map(renderGiftBrandItem).join("");
  window.lucide?.createIcons();
  if (grid) initCollectibleAnimations(grid);
  applyCurrencyDisplay();
}

function giftBrandNumberList(asset = {}) {
  const numbers = (asset.children?.length ? asset.children : [asset])
    .map(giftBrandMintLabel)
    .filter(Boolean);
  return [...new Set(numbers)];
}

function giftDetailHeroMeta(detail = {}) {
  const count = Number(detail.count || detail.children?.length || 1);
  const numbers = giftBrandNumberList(detail);
  const parts = [
    detail.creator || detail.collection || "Gift collection",
    `${count} gift${count === 1 ? "" : "s"}`,
  ].filter(Boolean);
  if (!numbers.length) return escapeHtml(parts.join(" Â· "));
  return escapeHtml(parts.join(" Â· "));
}

function giftBrandModelLabel(asset = {}) {
  return giftModelTrait(asset) || asset.name || asset.collection || "Gift";
}

function giftDetailTitle(detail = {}) {
  return String(detail.name || detail.collection || "Gift")
    .replace(/\s*#\d+\b/g, "")
    .trim() || "Gift";
}

function giftBrandMintLabel(asset = {}) {
  const nameMatch = String(asset.name || asset.collection || "").match(/#(\d{1,7})\b/);
  const value = nameMatch?.[1] || asset.tag || asset.mint?.current || "";
  const cleaned = String(value || "").replace(/[^\d]/g, "");
  if (!cleaned || cleaned.length > 7) return "";
  return `#${cleaned}`;
}


function groupGiftBrandChildren(children = []) {
  const groups = new Map();
  children.forEach((asset) => {
    const key = collectibleKey(`${asset.collection || ""}:${giftBrandModelLabel(asset)}`);
    const item = groups.get(key) || {
      ...asset,
      id: asset.id,
      children: [],
      count: 0,
      floorUsd: 0,
      floorTon: 0,
      priceLoading: false,
      tagList: [],
      previewImages: [],
      estimatedCount: 0,
    };
    item.children.push(asset);
    item.count += Number(asset.count || 1);
    item.floorUsd += Number(asset.floorUsd || 0);
    item.floorTon += Number(asset.floorTon || 0);
    item.initUsd = Number(item.initUsd || 0) + Number(asset.initUsd || asset.costBasis || 0);
    item.priceLoading = item.priceLoading || Boolean(asset.priceLoading && !(Number(asset.floorUsd || 0) > 0));
    if (asset.floorStatus === "estimated" || asset.floorSource === "estimate" || asset.source === "estimated-combo-value") {
      item.estimatedCount += Number(asset.count || 1);
      item.floorStatus = item.floorStatus || "estimated";
      item.floorSource = item.floorSource || "estimate";
    }
    item.modelFloor = item.modelFloor || asset.modelFloor || null;
    if (asset.floorSource === "model") {
      item.floorSource = "model";
      item.marketPlatform = "Model Floor";
    } else if (asset.floorSource === "backdrop" && item.floorSource !== "model") {
      item.floorSource = "backdrop";
      item.marketPlatform = "Backdrop Floor";
    }
    const tag = giftBrandMintLabel(asset);
    if (tag) item.tagList.push(tag);
    const media = giftMediaDescriptor(asset);
    if (media.url && !item.previewImages.some((entry) => entry.url === media.url)) item.previewImages.push(media);
    groups.set(key, item);
  });
  return Array.from(groups.values())
    .map((item) => ({
      ...item,
      pnlUsd: Number(item.initUsd || 0) ? Number(item.floorUsd || 0) - Number(item.initUsd || 0) : Number(item.pnlUsd || 0),
      pnlPct: Number(item.initUsd || 0) ? ((Number(item.floorUsd || 0) - Number(item.initUsd || 0)) / Number(item.initUsd || 1)) * 100 : Number(item.pnlPct || 0),
    }))
    .sort((a, b) => {
      const aValue = Number(a.floorUsd || 0);
      const bValue = Number(b.floorUsd || 0);
      if (bValue !== aValue) return bValue - aValue;
      return String(giftBrandModelLabel(a)).localeCompare(String(giftBrandModelLabel(b)));
    });
}

function renderGiftBrandItem(asset) {
  if (asset.priceLoading && !(Number(asset.floorUsd || 0) > 0)) return renderCollectiblePriceSkeletonCard(asset, "gift");
  const hasPrice = Number(asset.floorUsd) > 0;
  const floorNote = hasPrice ? floorSourceLine(asset) : (asset.marketPlatform ? `Floor Â· ${escapeHtml(asset.marketPlatform)}` : "Open details");
  const count = Number(asset.count || asset.children?.length || 1);
  const imageStack = count > 1 ? giftBrandImageStack(asset) : "";
  const modelLabel = giftBrandModelLabel(asset);
  const modelCount = giftBrandModelNumber(asset);
  const backdropLabel = giftBackdropTrait(asset);
  const modelMeta = [modelLabel, backdropLabel].filter(Boolean).join(" Â· ") || modelLabel;
  const target = count > 1 ? "gift-model-group" : "detail";
  return `
    <article class="collectible-card is-gift-card ${imageStack ? "has-gift-stack" : ""} ${count > 1 ? "is-grouped-gift" : ""}" data-screen-target="${target}" data-asset="${asset.id}">
      <div class="collectible-top">
        ${imageStack || collectibleArtHtml(asset, "gift")}
        <div><h3>${escapeHtml(asset.collection || asset.name)}</h3><small>${escapeHtml(modelMeta)}</small></div>
        <span class="gift-model-badges">
          <b>${count} gift${count === 1 ? "" : "s"}</b>
        </span>${estimatedPillHtml(asset)}
      </div>
      <div class="value-stack"><strong>${hasPrice ? money(asset.floorUsd) : "Price unavailable"}</strong><small>${floorNote}</small></div>
    </article>`;
}

function renderGiftModelGroup(assetId) {
  const group = assetDetails[assetId];
  if (!group) return;
  const screen = document.querySelector('[data-screen="gift-brand"]');
  if (screen) screen.dataset.modelGroupAsset = group.id;
  const children = (group.children?.length ? group.children : [group])
    .slice()
    .sort((a, b) => Number(b.floorUsd || 0) - Number(a.floorUsd || 0));
  children.forEach((child) => { assetDetails[child.id] = child; });
  setText("#giftBrandTitle", group.collection || group.name || "Gift Model");
  const summary = document.querySelector("#giftBrandSummary");
  if (summary) {
    const totalValue = children.reduce((sum, item) => sum + Number(item.floorUsd || 0), 0);
    summary.innerHTML = `<small>${escapeHtml(giftBrandModelLabel(group))}</small><div><h2>${money(totalValue)}</h2><span>${children.length} gift${children.length === 1 ? "" : "s"}</span></div><strong class="positive">Tap a gift to open details</strong>`;
  }
  const grid = document.querySelector("#giftBrandGrid");
  if (grid) grid.innerHTML = children.map(renderGiftIndividualItem).join("");
  window.lucide?.createIcons();
  applyCurrencyDisplay();
}

function renderGiftIndividualItem(asset) {
  const hasPrice = Number(asset.floorUsd) > 0;
  const number = giftBrandMintLabel(asset);
  const modelLabel = giftBrandModelLabel(asset);
  const backdropLabel = giftBackdropTrait(asset);
  const title = giftDetailTitle(asset);
  return `
    <article class="collectible-card is-gift-card is-individual-gift" data-screen-target="detail" data-asset="${asset.id}">
      <div class="collectible-top">
        ${collectibleArtHtml(asset, "gift")}
        <div>
          <h3>${escapeHtml(title)}</h3>
          <small>${escapeHtml([modelLabel, backdropLabel].filter(Boolean).join(" Â· "))}</small>
        </div>
        ${number ? `<span class="tag-number">${escapeHtml(number)}</span>` : ""}${estimatedPillHtml(asset)}
      </div>
      <div class="value-stack"><strong>${hasPrice ? money(asset.floorUsd) : "Price unavailable"}</strong><small>${hasPrice ? floorSourceLine(asset) : "Open details"}</small></div>
    </article>`;
}

function giftBrandModelNumber(asset = {}) {
  const direct = Number(asset.modelFloor?.modelCount || 0);
  if (direct > 0) return direct;
  const child = (asset.children || []).find((item) => Number(item.modelFloor?.modelCount || 0) > 0);
  return Number(child?.modelFloor?.modelCount || 0);
}

function giftBrandImageStack(asset = {}) {
  const previews = (asset.children?.length ? asset.children : [asset]).slice(0, 2);
  if (!previews.length) return "";
  const extra = Number(asset.count || previews.length) - previews.length;
  return `<button type="button" class="gift-pfp-stack" data-gift-pfp-tray="${escapeHtml(asset.id)}" aria-label="Show gift previews">${previews.map((item) => collectibleArtHtml(item, "gift")).join("")}${extra > 0 ? `<b>+${extra}</b>` : ""}</button>`;
}

function giftMediaDescriptor(asset = {}) {
  const animated = asset.animatedImage || asset.animationUrl || asset.animatedUrl || asset.mediaUrl || "";
  const fallback = asset.image || asset.iconUrl || asset.previewUrl || "";
  const animatedUrl = resolveAnimationMediaUrl(animated || "");
  const fallbackUrl = resolveTokenImage(fallback || "");
  const declaredType = String(asset.mediaType || "").toLowerCase();
  const inferredType = /\.(?:lottie\.)?json(?:[?#].*)?$/i.test(String(animatedUrl))
    ? "lottie"
    // Telegram files use a signed route without a filename extension. Prefer
    // the explicit backend type before attempting URL-based inference.
    : (["lottie", "video"].includes(declaredType)
      ? declaredType
      : (/(\.webm|\.mp4|\.mov)(?:[?#].*)?$/i.test(String(animatedUrl)) ? "video" : "image"));
  if (inferredType === "lottie") {
    return { url: animatedUrl || fallbackUrl || "", type: "lottie", fallback: fallbackUrl, animationUrl: animatedUrl, mediaType: "lottie" };
  }
  const url = animatedUrl || fallbackUrl || "";
  return { url, type: inferredType, fallback: fallbackUrl };
}

function stickerMediaDescriptor(asset = {}) {
  const animated = asset.animatedImage || asset.animationUrl || asset.animatedUrl || asset.mediaUrl || "";
  const fallback = asset.image || asset.iconUrl || asset.previewUrl || asset.preview || "";
  const animatedUrl = resolveAnimationMediaUrl(animated || "");
  const fallbackUrl = resolveTokenImage(fallback || "");
  const type = /\.(?:lottie\.)?json(?:[?#].*)?$/i.test(String(animatedUrl)) || /\/lottie(?:\/|$)/i.test(String(animatedUrl))
    ? "lottie"
    : (asset.mediaType || (/(\.webm|\.mp4|\.mov)(?:[?#].*)?$/i.test(String(animatedUrl)) ? "video" : "image"));
  return {
    url: animatedUrl || fallbackUrl || "",
    type: animatedUrl ? type : "image",
    fallback: fallbackUrl,
  };
}

function giftCardMediaDescriptor(asset = {}) {
  // Gift cards deliberately use the verified static preview. Animated/layered
  // media belongs to the detail hero only; using it in lists made cards flicker
  // and exposed Telegram's empty thumbnail placeholder.
  const staticPreview = asset.image || asset.previewUrl || asset.iconUrl || asset.thumbnailUrl || "";
  return { url: resolveTokenImage(staticPreview), type: "image", fallback: "" };
}

function giftCollectionLabel(asset = {}) {
  return String(asset.collection || asset.name || "Gift").replace(/\s*#\d+\b/g, "").trim() || "Gift";
}

function giftLayerDescriptor(asset = {}) {
  const modelTrait = giftModelTrait(asset);
  const backdropTrait = String((asset.traits || []).find((trait) => /backdrop/i.test(String(trait.label || "")))?.value || "").trim();
  const patternTrait = String((asset.traits || []).find((trait) => /symbol/i.test(String(trait.label || "")))?.value || "").trim();
  const isVintageCigarTest = /vintage cigars?/i.test(giftCollectionLabel(asset))
    && modelTrait === "Golden Hour"
    && backdropTrait === "Shamrock Green"
    && patternTrait === "The Eye";
  const layered = asset.layeredMedia || (isVintageCigarTest ? {
    collectionName: "Vintage Cigar",
    giftName: "Vintage Cigar",
    modelName: modelTrait,
    backdropName: backdropTrait,
    patternName: patternTrait,
    modelAnimationUrl: "/assets/gifts/vintage-cigar/models/golden-hour.json",
    patternImageUrl: "/assets/gifts/vintage-cigar/patterns/the-eye.png",
    backdropPalette: {
      centerColor: "#8ab163",
      edgeColor: "#559345",
      patternColor: "#126b00",
      textColor: "#d5fbc8",
    },
    mediaType: "lottie",
  } : {});
  if (!layered.modelAnimationUrl && !layered.modelImageUrl && !asset.animationUrl && !asset.animatedImage) return null;
  const collectionName = String(layered.collectionName || giftCollectionLabel(asset)).trim();
  const giftName = String(layered.giftName || collectionName).trim();
  const modelName = String(layered.modelName || modelTrait).trim();
  const backdropName = String(layered.backdropName || backdropTrait).trim();
  const patternName = String(layered.patternName || patternTrait).trim();
  const modelAnimationUrl = resolveAnimationMediaUrl(layered.modelAnimationUrl || asset.animationUrl || asset.animatedImage || "");
  const modelImageUrl = resolveTokenImage(layered.modelImageUrl || "");
  const patternImageUrl = resolveTokenImage(layered.patternImageUrl || "");
  const mediaUrl = modelAnimationUrl || modelImageUrl;
  if (!mediaUrl || !layered.backdropPalette) return null;
  const mediaType = /\.(?:lottie\.)?json(?:[?#].*)?$/i.test(String(mediaUrl))
    ? "lottie"
    : (layered.mediaType || (/(\.webm|\.mp4|\.mov)(?:[?#].*)?$/i.test(String(mediaUrl)) ? "video" : "image"));
  return {
    collectionName,
    giftName,
    modelName,
    backdropName,
    patternName,
    modelAnimationUrl,
    modelImageUrl,
    patternImageUrl,
    mediaType,
    backdropPalette: layered.backdropPalette,
  };
}

const giftPatternPositions = [
  ["10%", "26.5%", "8%", 10], ["10%", "75.5%", "8%", 10],
  ["43%", "0.5%", "8%", 10], ["43%", "101.5%", "8%", 10],
  ["98%", "51%", "8%", 10], ["12%", "51%", "8%", 15],
  ["26.5%", "10.3%", "8%", 15], ["26.5%", "91.8%", "8%", 15],
  ["68%", "7.3%", "8%", 15], ["68%", "94.6%", "8%", 15],
  ["89.2%", "13.8%", "8%", 15], ["89.2%", "35.8%", "8%", 15],
  ["89.2%", "66.2%", "8%", 15], ["89.2%", "88%", "8%", 15],
  ["21.5%", "34%", "10%", 24], ["21.5%", "65.5%", "10%", 24],
  ["35%", "23.2%", "8%", 24], ["35%", "78.8%", "8%", 24],
  ["50%", "16%", "11%", 24], ["50%", "82.8%", "11%", 24],
  ["75%", "24.5%", "9%", 24], ["75%", "76%", "9%", 24],
  ["79.5%", "50.5%", "9%", 24],
];

function giftPatternLayerHtml(layer = {}) {
  if (!layer.patternImageUrl) return "";
  return `<span class="gift-layer-pattern" aria-hidden="true">${giftPatternPositions.map(([top, left, size, opacity]) => `<span style="top:${top};left:${left};width:${size};height:${size};opacity:${opacity / 100};--gift-pattern-image:url('${escapeHtml(layer.patternImageUrl)}')"></span>`).join("")}</span>`;
}

function giftLayeredArtHtml(asset = {}, wrapperClass = "animated-art", { staticOnly = false } = {}) {
  const layer = giftLayerDescriptor(asset);
  const mediaUrl = staticOnly
    ? (layer?.modelAnimationUrl || layer?.modelImageUrl || "")
    : (layer?.modelAnimationUrl || layer?.modelImageUrl || "");
  if (!mediaUrl) return "";
  const media = {
    url: mediaUrl,
    type: layer.modelAnimationUrl ? (layer.mediaType || "lottie") : "image",
    fallback: "",
    staticFrame: staticOnly && Boolean(layer.modelAnimationUrl),
  };
  const palette = layer.backdropPalette;
  const className = `${wrapperClass} gift-layer-art`.trim();
  return `<span class="${escapeHtml(className)}">
    <span class="gift-layer-backdrop" style="--gift-center:${escapeHtml(palette.centerColor || "#7ac7ff")};--gift-edge:${escapeHtml(palette.edgeColor || "#17385e")};--gift-pattern:${escapeHtml(palette.patternColor || "#dbf1ff")};--gift-text:${escapeHtml(palette.textColor || "#ffffff")}"></span>
    ${giftPatternLayerHtml(layer)}
    <span class="gift-layer-model">${collectibleMediaHtml(media, asset.name || "Gift", "gift-layer-model-media")}</span>
  </span>`;
}

function giftDetailAnimationHtml(asset = {}) {
  const media = giftMediaDescriptor(asset);
  if (!media.url || !["lottie", "video"].includes(media.type)) return "";
  return collectibleMediaHtml(media, asset.name || "Gift");
}

function collectibleMediaHtml(media = {}, alt = "Collectible", className = "") {
  const url = resolveTokenImage(media.url || "");
  const fallback = resolveTokenImage(media.fallback || "");
  const classList = className ? ` ${escapeHtml(className)}` : "";
  if (!url) return "";
  if (media.type === "video") {
    return `<video class="collectible-video${classList}" src="${escapeHtml(url)}" muted loop playsinline preload="metadata" data-collectible-video="1" ${fallback ? `poster="${escapeHtml(fallback)}"` : ""}></video>`;
  }
  if (media.type === "lottie") {
    return `<span class="lottie-host${classList}" data-lottie-src="${escapeHtml(url)}" ${media.staticFrame ? 'data-lottie-static="1"' : ""} ${fallback ? `data-lottie-fallback="${escapeHtml(fallback)}"` : ""}>${fallback ? `<img class="lottie-fallback" src="${escapeHtml(fallback)}" alt="${escapeHtml(alt)}" loading="eager" decoding="async">` : ""}</span>`;
  }
  return `<img class="${classList.trim()}" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="eager" decoding="async">`;
}

let collectibleLottieLibraryPromise = null;
const collectibleLottieDataCache = new Map();
const collectibleMediaElements = new Set();
let collectibleMediaObserver = null;
let collectibleViewportSyncFrame = 0;
let collectibleViewportListenersInstalled = false;

function ensureCollectibleLottieLibrary() {
  if (window.lottie?.loadAnimation) return Promise.resolve(window.lottie);
  if (collectibleLottieLibraryPromise) return collectibleLottieLibraryPromise;
  collectibleLottieLibraryPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-lottie-runtime="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.lottie), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "/assets/vendor/lottie.min.js";
    script.async = true;
    script.dataset.lottieRuntime = "1";
    script.onload = () => resolve(window.lottie);
    script.onerror = reject;
    document.head.appendChild(script);
  }).catch((error) => {
    collectibleLottieLibraryPromise = null;
    throw error;
  });
  return collectibleLottieLibraryPromise;
}

function loadCollectibleLottieData(src = "") {
  if (!src) return Promise.reject(new Error("Missing Lottie source"));
  if (collectibleLottieDataCache.has(src)) return collectibleLottieDataCache.get(src);
  const request = fetch(src, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`Lottie request failed (${response.status})`);
      return response.json();
    })
    .catch((error) => {
      collectibleLottieDataCache.delete(src);
      throw error;
    });
  collectibleLottieDataCache.set(src, request);
  return request;
}

function playCollectibleLottie(host) {
  const animation = host?.__lottieAnimation;
  if (!animation || !host.__collectibleVisible || host.dataset.lottieStatic === "1") return;
  animation.play();
  host.dataset.animationPlaying = "1";
}

function pauseCollectibleLottie(host) {
  const animation = host?.__lottieAnimation;
  if (!animation) return;
  animation.pause();
  host.dataset.animationPlaying = "0";
}

function activateCollectibleLottie(host) {
  const src = host.dataset.lottieSrc;
  if (!src || host.__lottieAnimation || host.dataset.lottieLoading === "1") return;
  host.dataset.lottieLoading = "1";
  host.classList.add("is-lottie-loading");
  Promise.all([ensureCollectibleLottieLibrary(), loadCollectibleLottieData(src)])
    .then(([lottie, animationData]) => {
      if (!host.isConnected || host.__lottieAnimation) return;
      const animation = lottie.loadAnimation({
        container: host,
        renderer: "canvas",
        loop: true,
        autoplay: false,
        animationData,
        rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
      });
      host.__lottieAnimation = animation;
      if (host.dataset.lottieStatic === "1") animation.goToAndStop?.(0, true);
      else if (host.__collectibleVisible) playCollectibleLottie(host);
      animation.addEventListener?.("DOMLoaded", () => {
        host.classList.remove("is-lottie-loading");
        host.classList.add("is-lottie-ready");
        host.dataset.animationReady = "1";
        if (host.dataset.lottieStatic === "1") animation.goToAndStop?.(0, true);
        else if (host.__collectibleVisible) playCollectibleLottie(host);
        else pauseCollectibleLottie(host);
      });
      const markFailed = () => {
        host.classList.remove("is-lottie-loading");
        host.classList.add("is-lottie-failed");
        host.dataset.animationFailed = "1";
        host.dataset.animationPlaying = "0";
        host.querySelector(".collectible-media-fallback")?.removeAttribute("hidden");
      };
      animation.addEventListener?.("data_failed", markFailed);
      animation.addEventListener?.("error", markFailed);
    })
    .catch(() => {
      host.classList.remove("is-lottie-loading");
      host.classList.add("is-lottie-failed");
      host.dataset.animationFailed = "1";
      host.dataset.animationPlaying = "0";
      host.querySelector(".collectible-media-fallback")?.removeAttribute("hidden");
    })
    .finally(() => { delete host.dataset.lottieLoading; });
}

function setCollectibleMediaVisibility(element, visible) {
  element.__collectibleVisible = visible;
  if (visible) {
    if (element.matches("[data-lottie-src]")) {
      if (element.__lottieAnimation) playCollectibleLottie(element);
      else activateCollectibleLottie(element);
    } else if (element.matches("[data-collectible-video]")) {
      element.play()
        .then(() => { element.dataset.animationPlaying = "1"; })
        .catch(() => { element.dataset.animationPlaying = "0"; });
    }
  } else if (element.__lottieAnimation) {
    pauseCollectibleLottie(element);
  } else if (element.matches("[data-collectible-video]")) {
    element.pause();
    element.dataset.animationPlaying = "0";
  }
}

function collectibleMediaIsNearViewport(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom >= -160 && rect.top <= window.innerHeight + 160;
}

function syncCollectibleMediaViewport() {
  collectibleViewportSyncFrame = 0;
  collectibleMediaElements.forEach((element) => {
    if (!element.isConnected) return;
    setCollectibleMediaVisibility(element, collectibleMediaIsNearViewport(element));
  });
}

function scheduleCollectibleMediaViewportSync() {
  if (collectibleViewportSyncFrame) return;
  collectibleViewportSyncFrame = requestAnimationFrame(syncCollectibleMediaViewport);
}

function installCollectibleViewportListeners() {
  if (collectibleViewportListenersInstalled) return;
  collectibleViewportListenersInstalled = true;
  window.addEventListener("scroll", scheduleCollectibleMediaViewportSync, { passive: true });
  window.addEventListener("resize", scheduleCollectibleMediaViewportSync, { passive: true });
}

function collectibleAnimationObserver() {
  if (collectibleMediaObserver) return collectibleMediaObserver;
  collectibleMediaObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const element = entry.target;
      if (!element.isConnected) {
        collectibleMediaObserver.unobserve(element);
        element.__lottieAnimation?.destroy?.();
        collectibleMediaElements.delete(element);
        return;
      }
      setCollectibleMediaVisibility(element, entry.isIntersecting || collectibleMediaIsNearViewport(element));
    });
  }, { rootMargin: "160px 0px", threshold: 0.05 });
  return collectibleMediaObserver;
}

function cleanupDetachedCollectibleAnimations() {
  collectibleMediaElements.forEach((element) => {
    if (element.isConnected) return;
    collectibleMediaObserver?.unobserve(element);
    element.__lottieAnimation?.destroy?.();
    collectibleMediaElements.delete(element);
  });
}

function initCollectibleAnimations(scope = document) {
  cleanupDetachedCollectibleAnimations();
  const selector = "[data-lottie-src]:not([data-animation-bound]), [data-collectible-video]:not([data-animation-bound])";
  const elements = [
    ...(scope.matches?.(selector) ? [scope] : []),
    ...scope.querySelectorAll(selector),
  ];
  const observer = collectibleAnimationObserver();
  installCollectibleViewportListeners();
  elements.forEach((element) => {
    element.dataset.animationBound = "1";
    collectibleMediaElements.add(element);
    observer.observe(element);
    setCollectibleMediaVisibility(element, collectibleMediaIsNearViewport(element));
  });
}

function openGiftPfpTray(assetId, trigger = null, kind = "gift") {
  const asset = assetDetails[assetId];
  if (!asset) return;
  closeGiftPfpTray();
  const children = asset.children?.length ? asset.children : [asset];
  const isSticker = kind === "sticker";
  const tray = document.createElement("div");
  tray.className = "gift-pfp-tray-backdrop";
  tray.innerHTML = `
    <div class="gift-pfp-tray">
      <span class="gift-pfp-tray-handle" aria-hidden="true"></span>
      <div class="gift-pfp-tray-head">
        <button type="button" data-close-gift-pfp-tray><i data-lucide="x"></i></button>
      </div>
      <div class="gift-pfp-tray-grid">
        ${children.map((item) => {
          const number = isSticker ? stickerEditionLabel(item) : giftBrandMintLabel(item);
          const label = isSticker ? stickerPackLabel(item) : giftBrandModelLabel(item);
          return `<button type="button" data-screen-target="detail" data-asset="${escapeHtml(item.id)}">
            ${collectibleArtHtml(item, isSticker ? "sticker" : "gift")}
            <span>${escapeHtml(label)}</span>
            <small>${number ? escapeHtml(number) : (isSticker ? "Sticker" : "Gift")}</small>
          </button>`;
        }).join("")}
      </div>
    </div>`;
  const rect = trigger?.getBoundingClientRect();
  tray.style.setProperty("--gift-tray-origin-x", `${rect ? rect.left + rect.width / 2 : window.innerWidth / 2}px`);
  tray.style.setProperty("--gift-tray-origin-y", `${rect ? rect.top + rect.height / 2 : window.innerHeight / 2}px`);
  document.body.appendChild(tray);
  window.lucide?.createIcons();
  requestAnimationFrame(() => tray.classList.add("is-open"));
}

function closeGiftPfpTray() {
  const tray = document.querySelector(".gift-pfp-tray-backdrop");
  if (!tray || tray.classList.contains("is-closing")) return;
  tray.classList.add("is-closing");
  tray.classList.remove("is-open");
  setTimeout(() => tray.remove(), 220);
}

function collectibleKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function giftModelTrait(asset = {}) {
  return (asset.traits || []).find((trait) => /model/i.test(String(trait.label || "")))?.value || "";
}

function giftBackdropTrait(asset = {}) {
  return (asset.traits || []).find((trait) => /backdrop|background/i.test(String(trait.label || "")))?.value || "";
}

function giftTraitValue(asset = {}, label = "") {
  return (asset.traits || []).find((trait) => String(trait.label || "").toLowerCase() === label.toLowerCase())?.value || "";
}

function applyGiftTraitRarities(asset, model = {}) {
  const traitRarities = new Map(
    Object.entries(model.traitRarities || {})
      .map(([label, rarity]) => [collectibleKey(label), Number(rarity || 0)])
  );
  if (!traitRarities.size) return;
  asset.traits = (asset.traits || []).map((trait) => {
    const rarity = traitRarities.get(collectibleKey(trait.label)) || 0;
    return rarity > 0 ? { ...trait, rarity: `${rarity}%` } : trait;
  });
}

function renderStickerCard(asset) {
  if (asset.priceLoading && !(Number(asset.floorUsd || 0) > 0)) return renderCollectiblePriceSkeletonCard(asset, "sticker");
  const hasPrice = Number(asset.floorUsd) > 0;
  const packCount = Number(asset.packCount || asset.children?.length || 1);
  const count = stickerOwnedCount(asset);
  const floorNote = hasPrice ? `Across ${packCount} pack${packCount === 1 ? "" : "s"}` : "No verified pack prices yet";
  return `
    <article class="collectible-card sticker-brand-card" data-screen-target="sticker-brand" data-asset="${asset.id}">
      <div class="collectible-top">
        ${collectibleArtHtml(asset, "sticker")}
        <div><h3>${escapeHtml(asset.name || "Sticker Brand")}</h3><small>${packCount} pack${packCount === 1 ? "" : "s"}</small></div>
        <span class="tag-number">${count} sticker${count === 1 ? "" : "s"}</span>
      </div>
      <div class="value-stack"><strong>${hasPrice ? money(asset.floorUsd) : "Price unavailable"}</strong><small>${floorNote}</small></div>
    </article>`;
}

function renderCollectiblePriceSkeletonCard(asset, kind = "gift") {
  const count = kind === "sticker" ? stickerOwnedCount(asset) : Number(asset.count || 1);
  const target = kind === "sticker" ? "sticker-brand" : "gift-brand";
  return `
    <article class="collectible-card ${kind === "gift" ? "is-gift-card" : ""}" data-screen-target="${target}" data-asset="${escapeHtml(asset.id || "")}">
      <div class="collectible-top">
        ${collectibleArtHtml(asset, kind)}
        <div><h3>${escapeHtml(asset.name || (kind === "gift" ? "Gift" : "Sticker"))}</h3><small>${escapeHtml(asset.creator || asset.collection || "Loading market data")}</small></div>
        <span class="tag-number">${count} ${kind}${count === 1 ? "" : "s"}</span>
      </div>
      <div class="value-stack"><strong><span class="metric-skeleton metric-skeleton-large"></span></strong><small><span class="metric-skeleton metric-skeleton-line"></span></small></div>
      <div class="pnl-row">
        <span class="pnl-box"><small>Daily PnL</small><b><span class="metric-skeleton metric-skeleton-small"></span></b></span>
        <span class="pnl-box"><small>Total PnL</small><b><span class="metric-skeleton metric-skeleton-small"></span></b></span>
      </div>
    </article>`;
}

function collectibleArtHtml(asset, fallback = "gift") {
  const icon = asset.icon || (fallback === "sticker" ? "sticker" : "gift");
  const artClass = fallback === "gift" ? "animated-art is-gift-art" : "animated-art is-sticker-art";
  const media = fallback === "sticker"
    ? stickerMediaDescriptor(asset)
    : giftCardMediaDescriptor(asset);
  if (fallback === "gift") {
    const layered = giftLayeredArtHtml(asset, artClass, { staticOnly: true });
    if (layered) return layered;
  }
  return media.url
    ? `<span class="${artClass}">${collectibleMediaHtml(media, asset.name || "Collectible")}</span>`
    : `<span class="${artClass}"><i data-lucide="${icon}"></i></span>`;
}

function renderStickerBrand(assetId) {
  const brand = stickerAssets.find((asset) => asset.id === assetId) || stickerAssets[0];
  if (!brand) return;
  const screen = document.querySelector('[data-screen="sticker-brand"]');
  if (screen) screen.dataset.asset = brand.id;
  const children = brand.children?.length ? brand.children : [brand];
  children.forEach((child) => { assetDetails[child.id] = child; });
  const groupedChildren = groupStickerBrandChildren(children);
  setText("#stickerBrandTitle", brand.name || "Sticker Brand");
  const summary = document.querySelector("#stickerBrandSummary");
  if (summary) {
    const count = children.reduce((sum, item) => sum + stickerOwnedCount(item), 0);
    const packCount = groupedChildren.length;
    const total = Number(brand.floorUsd || 0);
    summary.innerHTML = `<small>Sticker brand</small><div><h2>${total > 0 ? money(total) : "Price unavailable"}</h2><span>${count} sticker${count === 1 ? "" : "s"}</span></div><strong>${packCount} pack${packCount === 1 ? "" : "s"} in this brand</strong>`;
  }
  const grid = document.querySelector("#stickerBrandGrid");
  groupedChildren.forEach((item) => { assetDetails[item.id] = item; });
  if (grid) grid.innerHTML = groupedChildren.map(renderStickerBrandItem).join("");
  if (grid) initCollectibleAnimations(grid);
  window.lucide?.createIcons();
  applyCurrencyDisplay();
}

function renderStickerBrandItem(asset) {
  const hasPrice = Number(asset.floorUsd) > 0;
  const floorNote = hasPrice ? floorSourceLine(asset) : (asset.marketPlatform ? `Floor Â· ${escapeHtml(asset.marketPlatform)}` : "Open details");
  const count = stickerOwnedCount(asset);
  const imageStack = count > 1 ? stickerPackImageStack(asset) : "";
  return `
    <article class="collectible-card sticker-pack-card ${imageStack ? "has-gift-stack" : ""}" data-screen-target="detail" data-asset="${asset.id}">
      <div class="collectible-top">
        ${imageStack || collectibleArtHtml(asset, "sticker")}
        <div><h3>${escapeHtml(stickerPackLabel(asset))}</h3><small>${escapeHtml(stickerPackMeta(asset))}</small></div>
        <span class="tag-number">${count} sticker${count === 1 ? "" : "s"}</span>
      </div>
      <div class="value-stack"><strong>${hasPrice ? money(asset.floorUsd) : "Price unavailable"}</strong><small>${floorNote}</small></div>
    </article>`;
}

function marketSourceLabel(value = "") {
  const source = String(value || "").toLowerCase();
  if (!source || source.includes("estimated")) return "";
  if (source.includes("stickers tools")) return "Stickers Tools";
  if (source.includes("getgems")) return "Getgems";
  if (source.includes("thermos")) return "Verified Market";
  if (source.includes("mrkt") || source.includes("tgmrkt")) return "MRKT";
  if (source.includes("tonapi")) return "TonAPI";
  if (source.includes("stickerdom")) return "Stickerdom";
  return String(value || "");
}

function renderAssetDetail(assetId) {
  const detail = assetDetails[assetId];
  if (!detail) {
    console.warn(`Asset detail was not found for ${assetId}`);
    return false;
  }
  const detailScreen = document.querySelector('[data-screen="detail"]');
  if (detailScreen) detailScreen.dataset.asset = detail.id;
  detailScreen?.classList.toggle("is-token-detail", detail.type === "token");
  detailScreen?.classList.toggle("is-gift-detail", detail.type === "gift");
  detailScreen?.classList.toggle("is-sticker-detail", detail.type === "sticker");
  toggleGiftDetailLayout(detail.type === "gift" || detail.type === "sticker");
  if (detail.type === "gift") {
    const cachedGift = getGiftDetailCachedPayload(detail);
    if (cachedGift) {
      applyGiftDetailPayload(detail, cachedGift, { applyFloor: false });
      renderGiftDetailPage(detail, { loading: !detail.floorHistoryAvailable });
      if (!detail.floorHistoryAvailable) {
        detail.floorHistoryLoading = true;
        setTimeout(() => {
          if (currentDetailAssetId() === detail.id) loadGiftDetail(detail);
        }, 0);
      }
    } else {
      detail.floorHistoryLoading = true;
      renderGiftDetailPage(detail, { loading: false });
      setTimeout(() => {
        if (currentDetailAssetId() === detail.id) loadGiftDetail(detail);
      }, 0);
    }
    window.lucide?.createIcons();
    applyCurrencyDisplay();
    return true;
  }
  if (detail.type === "sticker") {
    const cachedSticker = getStickerDetailCachedPayload(detail);
    if (cachedSticker) applyStickerDetailPayload(detail, cachedSticker);
    renderStickerDetailPage(detail, { loading: !cachedSticker });
    loadStickerDetail(detail, { forceRefresh: !cachedSticker });
    window.lucide?.createIcons();
    applyCurrencyDisplay();
    return true;
  }
  if (detail.type !== "token") ensureCollectibleDetailHero();
  const detailName = document.querySelector("#detailName");
  if (detailName) detailName.dataset.asset = detail.id;
  const tone = detail.type === "sticker" ? "sticker-bg" : detail.type === "token" ? "token-bg" : "gift-bg";
  const category = detail.type === "gift" ? "Telegram Gift" : detail.type === "sticker" ? "Sticker Pack" : detail.category;

  setText("#detailCategory", category);
  setText("#detailName", detail.name);
  setText("#detailValue", detail.type === "token" ? detail.value : `${money(detail.floorUsd)} Â· ${signedPct(detail.dailyPct)}`);
  setText("#detailMintLine", detail.type === "gift" ? `#${detail.tag} Â· ${detail.collection} Â· ${detail.mint.current.toLocaleString()} of ${detail.mint.total.toLocaleString()} issued` : detail.type === "sticker" ? `${detail.packId} Â· ${detail.creator}` : "Held in Main wallet");
  if (detail.type === "token") {
    setIcon(document.querySelector("#detailIcon"), detail.icon || "coins", tone);
    const ghost = document.querySelector("#detailGhost");
    if (ghost) ghost.innerHTML = `<i data-lucide="${detail.icon || "coins"}"></i>`;
  } else {
    setCollectibleDetailHero(detail, tone);
  }

  if (detail.type === "token") {
    renderTokenDetail(detail, tone);
  } else {
    renderCollectibleDetail(detail, tone);
  }
  drawDetailPriceChart(detail);
  window.lucide?.createIcons();
  applyCurrencyDisplay();
  return true;
}

function currentDetailAssetId() {
  return document.querySelector('[data-screen="detail"]')?.dataset.asset || document.querySelector("#detailName")?.dataset.asset || "";
}

function toggleGiftDetailLayout(showCustomDetail) {
  const mount = document.getElementById("giftDetailMount");
  const sections = [
    document.getElementById("detailHero"),
    document.getElementById("detailTraitPanel"),
    document.getElementById("detailMetaStack"),
    document.querySelector(".financial-grid"),
    document.getElementById("detailAcquiredLabel"),
    document.querySelector(".price-panel"),
    document.querySelector(".sales-panel"),
    document.querySelector(".market-intel"),
  ];
  if (mount) mount.style.display = showCustomDetail ? "" : "none";
  sections.forEach((section) => {
    if (section) section.style.display = showCustomDetail ? "none" : "";
  });
}

function ensureCollectibleDetailHero() {
  const hero = document.querySelector("#detailHero");
  if (!hero || hero.querySelector("#detailIcon")) return;
  hero.innerHTML = `
    <span class="detail-ghost" id="detailGhost"><i data-lucide="gem"></i></span>
    <span class="asset-icon gift-bg" id="detailIcon"><i data-lucide="gem"></i></span>
    <small id="detailCategory">Telegram Gift</small>
    <h2 id="detailName">Diamond Ring</h2>
    <strong id="detailValue">$0.00</strong>
    <p id="detailMintLine"></p>`;
}

function setCollectibleDetailHero(detail, tone) {
  const icon = document.querySelector("#detailIcon");
  const ghost = document.querySelector("#detailGhost");
  const hero = document.querySelector("#detailHero");
  const media = detail.type === "sticker"
    ? stickerMediaDescriptor(detail)
    : { url: resolveTokenImage(detail.image || ""), type: "image", fallback: "" };
  const image = resolveTokenImage(detail.image || media.fallback || "");
  if (hero) {
    hero.style.textAlign = "center";
    hero.style.alignItems = "center";
    hero.style.justifyItems = "center";
  }
  if (icon) {
    icon.className = `asset-icon ${tone}`;
    icon.style.width = "80px";
    icon.style.height = "80px";
    icon.style.borderRadius = "18px";
    icon.style.overflow = "hidden";
    icon.innerHTML = media.url
      ? collectibleMediaHtml(media, detail.name || "Collectible")
      : `<i data-lucide="${detail.icon || "gift"}"></i>`;
    initCollectibleAnimations(icon);
  }
  if (ghost) {
    ghost.innerHTML = image
      ? `<img src="${escapeHtml(image)}" alt="" style="width:100%;height:100%;object-fit:cover;filter:blur(10px);opacity:.4">`
      : `<i data-lucide="${detail.icon || "gift"}"></i>`;
  }
}

function renderCollectibleDetail(detail, tone) {
  const isGift = detail.type === "gift";
  const pnlClass = detail.pnlUsd >= 0 ? "positive" : "negative";
  const quickSell = money(detail.quickSellUsd);
  const financialGrid = document.querySelector(".financial-grid");
  financialGrid?.style.removeProperty("display");
  if (financialGrid && !financialGrid.querySelector("#detailStatOne")) {
    financialGrid.innerHTML = `
      <article><small id="detailStatOneLabel">Current Floor</small><b id="detailStatOne">--</b></article>
      <article><small id="detailStatTwoLabel">Cost Basis</small><b id="detailStatTwo">--</b></article>
      <article><small>Unrealized PnL</small><b class="positive" id="detailPnl">--</b></article>
      <article><small id="detailStatThreeLabel">Quick Sell Estimate</small><b id="detailStatThree">--</b></article>`;
  }
  document.querySelector(".token-chart-ranges")?.remove();
  document.querySelector("#tokenPressurePanel")?.remove();
  Charts.mountRangeControls("collectibleFloor", stickerDetailRange, {
    element: document.querySelector(".price-panel"),
    attribute: "data-sticker-detail-range",
  });
  setDetailHeading(".price-panel", isGift ? "Price Movement" : "Floor Price", "USD");
  setDetailHeading(".sales-panel", "Recent Sales", isGift ? "Exact Variant" : "This Pack");
  setDetailHeading(".market-intel", "Market Intel", "Live");
  setText("#detailStatOneLabel", "Current Floor");
  setText("#detailStatOne", collectibleValueLabel(detail.floorUsd, detail.floorTon));
  setText("#detailStatTwoLabel", "Cost Basis");
  setText("#detailStatTwo", detail.costBasis ? `${money(detail.costBasis)} Â· purchased ${String(detail.acquired || "").replace(", 2026", "")}` : "Set cost");
  setText("#detailStatThreeLabel", "Quick Sell Estimate");
  setText("#detailStatThree", detail.quickSellTon ? collectibleValueLabel(detail.quickSellUsd, detail.quickSellTon) : quickSell);
  setText("#detailPnl", `${signedMoney(detail.pnlUsd)} Â· ${signedPct(detail.pnlPct)}`);
  document.querySelector("#detailPnl")?.classList.toggle("positive", detail.pnlUsd >= 0);
  document.querySelector("#detailPnl")?.classList.toggle("negative", detail.pnlUsd < 0);
  setText("#detailAcquiredLabel", detail.acquired ? `Acquired ${detail.acquired}` : "");

  const traitPanel = document.querySelector("#detailTraitPanel");
  if (traitPanel) {
    traitPanel.innerHTML = isGift
      ? detail.traits.map((trait) => `<article class="trait-card"><span>${trait.label}</span><b>${trait.value}</b><em>${trait.rarity}</em></article>`).join("")
      : (detail.attributes || []).slice(0, 3).map(([label, value]) => `<article class="trait-card"><span>${label}</span><b>${value}</b><em>${label === "Format" ? detail.format : detail.edition}</em></article>`).join("");
  }

  const meta = document.querySelector("#detailMetaStack");
  if (meta) {
    meta.innerHTML = isGift
      ? `<article class="detail-note"><b>${detail.comboRank || "Live collectible"}</b></article><article class="detail-note">${detail.exactCount || ""}</article><article class="detail-note">${detail.upgraded || ""}</article><article class="detail-note">${detail.provenance || ""}</article>`
      : `<article class="detail-note">${(detail.attributes || []).map(([label, value]) => `<b>${label}</b>: ${value}`).join(" Â· ")}</article>`;
  }

  renderSales(detail);
  if (isGift) {
    const cachedGift = getGiftDetailCachedPayload(detail);
    if (cachedGift) {
      applyGiftDetailPayload(detail, cachedGift);
      renderSales(detail);
      renderMarketIntel(detail);
      drawDetailPriceChart(detail);
    } else {
      renderSales(detail);
      renderMarketIntel(detail);
      drawDetailPriceChart(detail);
      setTimeout(() => {
        if (currentDetailAssetId() === detail.id) loadGiftDetail(detail);
      }, 0);
    }
  } else {
    const cachedSticker = getStickerDetailCachedPayload(detail);
    if (cachedSticker) {
      applyStickerDetailPayload(detail, cachedSticker);
    } else {
      renderStickerDetailSkeleton();
    }
    loadStickerDetail(detail, { forceRefresh: !cachedSticker });
  }
  setIcon(document.querySelector("#detailHistoryIcon"), "clock", tone);
  const detailMarketLabel = isEstimatedAsset(detail) ? "" : marketSourceLabel(detail.marketPlatform);
  setText("#detailHistoryText", isGift ? (detailMarketLabel ? `Floor source Â· ${detailMarketLabel}` : detail.provenance) : `Pack acquired Â· ${detail.acquired}`);
  setText("#detailLinkLabel", isGift ? (detailMarketLabel || "Marketplace") : "Marketplace");
}

function collectibleValueLabel(usdValue, tonValue) {
  const usd = Number(usdValue || 0);
  const ton = Number(tonValue || 0);
  if (usd > 0 && ton > 0) return `${money(usd)} Â· ${ton.toFixed(2)} TON`;
  if (usd > 0) return money(usd);
  if (ton > 0) return `${ton.toFixed(2)} TON`;
  return "â€”";
}

function renderStickerDetailSkeleton() {
  setDetailHeading(".market-intel", "Pack Stats", "");
  document.querySelector("#detailMarketIntel").innerHTML = `${renderDetailLoadingMetrics()}<div class="mini-thumb-row"><span class="sticker-mini skeleton"></span><span class="sticker-mini skeleton"></span><span class="sticker-mini skeleton"></span></div>`;
  document.querySelector("#detailSalesTable").innerHTML = `<div class="sales-row"><b>Loading trades<span>Sticker pack</span></b><span>â€”</span><span>â€”</span></div>`;
  Charts.mountRangeControls("collectibleFloor", stickerDetailRange, {
    element: document.querySelector(".price-panel"),
    attribute: "data-sticker-detail-range",
  });
}


function giftGlowFromBackdrop(detail) {
  const backdrop = String(detail.traits?.find((trait) => /backdrop/i.test(trait.label))?.value || "").toLowerCase();
  if (/gold|amber|yellow|sun|solar/.test(backdrop)) return "rgba(245, 199, 70, .32)";
  if (/purple|violet|indigo|dark|night|plum/.test(backdrop)) return "rgba(139, 92, 246, .30)";
  return "rgba(45, 212, 191, .28)";
}

function giftTraitPercent(trait = {}) {
  const perMille = Number(trait.rarityPerMille ?? trait.rarity_per_mille);
  if (Number.isFinite(perMille) && perMille > 0) return perMille / 10;
  const values = [
    trait.rarity,
    trait.rarityPct,
    trait.rarityPercent,
    trait.rarity_percent,
    trait.percent,
    trait.probability,
  ];
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const text = String(value);
    const match = text.match(/([\d.]+)\s*%/);
    if (match) return Number(match[1]);
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric <= 1 ? numeric * 100 : numeric;
  }
  return null;
}

function giftTraitTone(percent) {
  if (percent !== null && percent <= 5) return { border: "#F5C746", fill: "#F5C746" };
  if (percent !== null && percent <= 20) return { border: "#8B5CF6", fill: "#8B5CF6" };
  return { border: "var(--border)", fill: "#14B8A6" };
}

function giftTraitPills(detail) {
  return (detail.traits || []).slice(0, 3).map((trait) => {
    const percent = giftTraitPercent(trait);
    const tone = giftTraitTone(percent);
    return `<span class="gift-trait-pill" style="border-color:${tone.border};">${escapeHtml(trait.value || "â€”")}</span>`;
  }).join("");
}

function giftUpgradeState(detail) {
  const onChain = Boolean(detail.tokenAddress || detail.collectionAddress) && !/not yet upgraded|held in telegram/i.test(String(detail.upgraded || ""));
  if (onChain) return { upgraded: true, label: "Upgraded Â· On-chain collectible" };
  return { upgraded: false, label: "Not yet upgraded Â· Held in Telegram" };
}

function giftEligibility(detail) {
  const state = giftUpgradeState(detail);
  if (state.upgraded) return null;
  const acquiredTs = new Date(detail.origin?.receivedOn || detail.acquired || "").getTime();
  if (!Number.isFinite(acquiredTs)) return { text: "â€”", eligible: false };
  const readyTs = acquiredTs + 21 * 24 * 60 * 60 * 1000;
  const diffDays = Math.ceil((readyTs - Date.now()) / (24 * 60 * 60 * 1000));
  return diffDays <= 0
    ? { text: "Eligible now", eligible: true }
    : { text: `Eligible in ${diffDays} day${diffDays === 1 ? "" : "s"}`, eligible: false };
}

function giftOriginSender(detail) {
  const direct = detail.origin?.senderName || detail.senderName || detail.sender || "";
  if (direct) return direct.includes(".ton") ? direct : truncateWalletAddress(direct);
  const senderAddress = detail.origin?.senderAddress || "";
  if (senderAddress) return truncateWalletAddress(senderAddress);
  const provenance = String(detail.provenance || "");
  const match = provenance.match(/gifted by\s+([^Â·]+?)(?:\s+to|\s+Â·|$)/i);
  return match ? match[1].trim() : "â€”";
}


function giftDemandBadge(intel) {
  if (!giftDemandHasData(intel)) return "";
  const change = Number(intel?.change24hPct ?? intel?.change ?? 0);
  if (!Number.isFinite(change)) return `<span class="status-badge is-unlisted">â€” Stable</span>`;
  if (change > 20) return `<span class="status-badge is-listed">Heating Up</span>`;
  if (change < -20) return `<span class="status-badge is-unlisted">Cooling Down</span>`;
  return `<span class="status-badge is-unlisted">â€” Stable</span>`;
}

function giftDemandHasData(intel) {
  if (!intel) return false;
  return [intel.sales24h, intel.volume24h, intel.listedCount, intel.listedSupply, intel.change24hPct].some((value) => value && value !== "â€”" && value !== 0);
}

function giftMarketLinks(detail) {
  const fragmentId = encodeURIComponent(detail.fragmentId || "");
  const getgemsUrl = detail.links?.getgems || (detail.collectionAddress
    ? `https://getgems.io/collection/${encodeURIComponent(detail.collectionAddress)}`
    : detail.marketUrl || "");
  return {
    fragment: detail.links?.fragment || (fragmentId ? `https://fragment.com/gift/${fragmentId}` : ""),
    getgems: getgemsUrl,
  };
}

function renderGiftDetailPage(detail, { loading = false } = {}) {
  const mount = document.getElementById("giftDetailMount");
  if (!mount) return;
  const traits = (detail.traits || []).slice(0, 3);
  const isListed = /listed/i.test(String(detail.status || "")) && !/unlisted/i.test(String(detail.status || ""));
  const glow = giftGlowFromBackdrop(detail);
  const detailMarketSource = isEstimatedAsset(detail) ? "" : marketSourceLabel(detail.marketPlatform);
  const sourceLabel = detailMarketSource ? `Floor Â· ${escapeHtml(detailMarketSource)}` : "Price source unavailable";
  const upgradeState = giftUpgradeState(detail);
  const eligibility = giftEligibility(detail);
  const links = giftMarketLinks(detail);
  const priceChangeClass = Number(detail.dailyPct || 0) < 0 ? "negative" : "positive";
  const floorLabel = Number(detail.floorUsd || 0) > 0 ? money(detail.floorUsd) : "â€”";
  const floorSubLabel = Number(detail.floorTon || 0) > 0 ? `${detail.floorTon.toFixed(2)} TON` : "â€”";
  const chartIsLoading = loading || detail.floorHistoryLoading || detail.priceLoading;
  const chartSourceLabel = detail.floorHistoryAvailable
    ? detail.floorHistorySource === "sales-derived" ? "Sales-derived floor"
      : detail.floorHistorySource === "see.tg-graphics" ? "see.tg floor history"
      : detail.floorHistorySource === "tontrack-combo-registry" ? "Exact floor history"
      : detail.floorHistorySource === "tontrack-estimate-history" ? "Estimated floor history"
      : detail.floorHistorySource === "tontrack-snapshots" ? "TonTrack snapshots"
      : "Live floor history"
    : chartIsLoading ? "Loading floor history..." : "Floor history unavailable";
  const rows = traits.map((trait) => {
    const percent = giftTraitPercent(trait);
    const tone = giftTraitTone(percent);
    const width = percent === null ? 12 : Math.max(10, Math.min(80, (100 - percent) * 0.8));
    return `<div class="gift-rarity-row">
      <span class="gift-rarity-label">${escapeHtml(trait.label)}</span>
      <b class="gift-rarity-value">${escapeHtml(trait.value || "â€”")}</b>
      <div class="gift-rarity-meter">
        <span class="gift-rarity-bar"><span style="width:${width}px;background:${tone.fill};"></span></span>
        <small>${percent === null ? "â€”" : `${percent}%`}</small>
      </div>
    </div>`;
  }).join("");
  const salesRows = loading
    ? `<div class="sales-row"><b class="skeleton">&nbsp;<span class="skeleton">&nbsp;</span></b><b class="skeleton">&nbsp;<span class="skeleton">&nbsp;</span></b><b class="skeleton">&nbsp;<span class="skeleton">&nbsp;</span></b></div>`
    : renderGiftSalesRows(detail);
  const intelBlock = loading
    ? renderDetailLoadingMetrics()
    : renderGiftDemandBlock(detail);
  mount.innerHTML = `
    <section class="gift-detail-layout">
      <article class="gift-detail-hero-card gift-detail-stage">
        ${isListed ? `<span class="status-badge is-listed">Listed</span>` : estimatedPillHtml(detail) ? `<span class="status-badge is-estimated">Estimated</span>` : ""}
        <div class="gift-detail-glow" style="background:radial-gradient(circle, ${glow} 0%, rgba(0,0,0,0) 68%);"></div>
        <div class="gift-detail-hero-inner">
          <div class="gift-detail-art-stage">
            ${giftLayeredArtHtml(detail, "gift-detail-hero-art") || `<span class="gift-detail-hero-art">${giftDetailAnimationHtml(detail) || collectibleArtHtml(detail, "gift")}</span>`}
          </div>
          <div class="gift-detail-title-block">
            <h2>${escapeHtml(giftDetailTitle(detail))}</h2>
            <small>${giftDetailHeroMeta(detail)}</small>
          </div>
          <div class="gift-detail-pill-row">${giftTraitPills(detail)}</div>
          <div class="gift-detail-price-lockup">
            <span>Current Floor</span>
            <div class="gift-detail-floor-row">
              <strong>${floorLabel}</strong>
              <span class="status-badge ${priceChangeClass === "negative" ? "is-unlisted" : "is-listed"}">${signedPct(detail.dailyPct || 0)}</span>
            </div>
            <small class="gift-detail-floor-sub">${floorSubLabel} Â· ${sourceLabel}</small>
          </div>
        </div>
      </article>

      <article class="card gift-detail-card gift-collection-stats-card">
        ${giftCollectionStatsRows(detail)}
      </article>

      <article class="card gift-detail-card gift-traits-card">
        <div class="section-heading">
          <div class="gift-detail-heading-lockup">
            <span class="gift-detail-section-icon"><i data-lucide="fingerprint"></i></span>
            <div><h2>Traits & Rarity</h2><small>Exact attributes</small></div>
          </div>
        </div>
        <div class="gift-traits-list">${rows || `<p class="detail-empty-state">â€”</p>`}</div>
      </article>

      <article class="card gift-detail-card gift-floor-card">
        <div class="section-heading">
          <div class="gift-detail-heading-lockup">
            <span class="gift-detail-section-icon"><i data-lucide="chart-no-axes-combined"></i></span>
            <div><h2>Floor Price</h2><small>${chartSourceLabel}</small></div>
          </div>
          <div class="gift-detail-toggle-row">
            <button type="button" class="mini-button ${priceMode === "USD" ? "active" : ""}" data-gift-price-mode="USD">USD</button>
            <button type="button" class="mini-button ${priceMode === "TON" ? "active" : ""}" data-gift-price-mode="TON">TON</button>
          </div>
        </div>
        ${chartIsLoading ? `<div class="gift-chart-loading" aria-label="Loading gift floor chart">
          <span class="gift-chart-gridline is-top"></span>
          <span class="gift-chart-gridline is-mid"></span>
          <span class="gift-chart-gridline is-low"></span>
          <span class="gift-chart-scan"></span>
          <span class="gift-chart-loader-line"></span>
          <span class="gift-chart-loader-dot is-one"></span>
          <span class="gift-chart-loader-dot is-two"></span>
          <span class="gift-chart-loader-dot is-three"></span>
          <span class="gift-chart-loading-label">Fetching live floor history</span>
        </div>` : `<canvas id="giftDetailPriceChart" role="img" aria-label="Gift floor price chart" class="gift-detail-chart"></canvas>
        <div id="giftDetailChartTooltip" class="chart-tooltip">${detail.floorHistoryAvailable ? `Latest: ${money(detail.floorUsd || 0)}` : "Floor history unavailable"}</div>`}
        <div class="gift-detail-chart-footer">
          <div class="gift-detail-toggle-row">
            ${Charts.rangeButtons("collectibleFloor", giftDetailRange, { attribute: "data-gift-detail-range" })}
          </div>
        </div>
      </article>

      <article class="card gift-detail-card gift-sales-card">
        <div class="section-heading">
          <div class="gift-detail-heading-lockup">
            <span class="gift-detail-section-icon"><i data-lucide="receipt-text"></i></span>
            <div><h2>Last Sales</h2><small>Recent market evidence</small></div>
          </div>
          <button class="text-action" type="button">${detail.salesScope === "same-traits" ? "Exact variant Â· 365D" : "Collection-wide Â· 365D"}</button>
        </div>
        <div class="sales-table">${salesRows}</div>
      </article>

      <article class="card gift-detail-card gift-demand-card">
        <div class="section-heading">
          <div class="gift-detail-heading-lockup">
            <span class="gift-detail-section-icon"><i data-lucide="activity"></i></span>
            <div><h2>Demand Intel</h2><small>Model-level signals</small></div>
          </div>
          ${loading ? "" : giftDemandBadge(detail.intel)}
        </div>
        <div class="gift-demand-grid">${intelBlock}</div>
      </article>

      <article class="card gift-detail-card gift-origin-card">
        <div class="section-heading">
          <div class="gift-detail-heading-lockup">
            <span class="gift-detail-section-icon"><i data-lucide="route"></i></span>
            <div><h2>Origin</h2><small>Ownership provenance</small></div>
          </div>
        </div>
        <div class="gift-origin-list">${giftOriginRows(detail, upgradeState, eligibility)}</div>
      </article>
    </section>`;  if (!chartIsLoading) {
    drawDetailPriceChart(detail, {
      svgSelector: "#giftDetailPriceChart",
      tooltipSelector: "#giftDetailChartTooltip",
      height: 190,
      referenceText: "Your cost",
      emptyTooltip: "Floor history unavailable",
      hideReferenceWhenMissing: true,
      showAxes: true,
      showArea: true,
      interactive: true,
    });
  }
  window.lucide?.createIcons();
  initCollectibleAnimations(mount);
  const externalButton = document.querySelector('[data-screen="detail"] .page-header .icon-button:last-child');
  if (externalButton) {
    const url = detail.marketUrl || links.fragment || links.getgems;
    externalButton.hidden = !url;
    externalButton.setAttribute("aria-label", "Open market listing");
    externalButton.title = "Open market listing";
    externalButton.onclick = () => {
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    };
  }
}

function stickerDetailPackRows(detail) {
  const count = stickerOwnedCount(detail);
  const rows = [
    ["Format", detail.format || "â€”"],
    ["Edition", detail.edition || "â€”"],
    ["Owned", `${count} sticker${count === 1 ? "" : "s"}`],
  ];
  return rows.map(([label, value], index) => `${index ? `<div class="gift-detail-divider"></div>` : ""}<div class="gift-detail-data-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`).join("");
}

function stickerDetailStatsRows(detail) {
  const floor = detail.stickerFloor || {};
  const rows = [
    ["24h volume", Number(floor.volume24hUsd || 0) > 0 ? collectibleValueLabel(floor.volume24hUsd, floor.volume24hTon) : "â€”"],
    ["Total supply", formatMetricCount(floor.totalSupply)],
    ["Holders", formatMetricCount(floor.holders)],
  ].filter(([, value]) => value && value !== "â€”");
  if (!rows.length) return `<p class="detail-empty-state">Pack stats unavailable</p>`;
  return rows.map(([label, value], index) => `${index ? `<div class="gift-detail-divider"></div>` : ""}<div class="gift-detail-data-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`).join("");
}

function stickerDetailRows(rows = []) {
  const available = rows.filter(([, value]) => value && value !== "â€”");
  if (!available.length) return "";
  return available.map(([label, value], index) => `${index ? `<div class="gift-detail-divider"></div>` : ""}<div class="gift-detail-data-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`).join("");
}

function stickerDetailIntelSections(detail) {
  const intel = detail.stickerIntel || {};
  const about = intel.about || {};
  const supply = intel.supply || {};
  const market = intel.market || {};
  const ton = (value) => Number(value || 0) > 0 ? `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} TON` : "â€”";
  const date = market.releaseAt ? new Date(market.releaseAt).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "â€”";
  const aboutRows = stickerDetailRows([
    ["Creator", about.creator || "â€”"],
    ["Status", about.official ? "Official collection" : "â€”"],
    ["Released", date],
    ["Sticker set", Number(about.stickerCount || 0) ? `${about.stickerCount} designs` : "â€”"],
  ]);
  const supplyRows = stickerDetailRows([
    ["Issued", formatMetricCount(supply.initial)],
    ["Circulating", formatMetricCount(supply.current)],
    ["Burned", formatMetricCount(supply.burned)],
    ["Primary remaining", formatMetricCount(supply.remaining)],
  ]);
  const marketRows = stickerDetailRows([
    ["Median price", Number(market.medianUsd || 0) ? `${money(market.medianUsd)} Â· ${ton(market.medianTon)}` : "â€”"],
    ["24h activity", Number(market.volume24hTon || 0) || Number(market.trades24h || 0) ? `${ton(market.volume24hTon)} Â· ${formatMetricCount(market.trades24h)} trades` : "â€”"],
    ["7d volume", ton(market.volume7dTon)],
    ["30d volume", ton(market.volume30dTon)],
    ["All-time trades", formatMetricCount(market.totalTrades)],
    ["Unique traders", formatMetricCount(market.uniqueTraders)],
    ["Initial price", Number(market.initialPriceUsd || 0) ? money(market.initialPriceUsd) : ton(market.initialPriceTon)],
  ]);
  const description = String(about.description || "").trim();
  const emojis = Array.isArray(about.emojiSet) ? about.emojiSet : [];
  return `
    ${aboutRows || description || emojis.length ? `<article class="card gift-detail-card sticker-intel-card"><div class="section-heading"><h2>About</h2>${about.official ? `<span class="text-action">Official</span>` : ""}</div>${description ? `<p class="sticker-detail-description">${escapeHtml(description)}</p>` : ""}${aboutRows}${emojis.length ? `<div class="sticker-emoji-row" aria-label="Sticker emoji set">${emojis.map((emoji) => `<span>${escapeHtml(emoji)}</span>`).join("")}</div>` : ""}</article>` : ""}
    ${supplyRows ? `<article class="card gift-detail-card"><div class="section-heading"><h2>Supply</h2></div>${supplyRows}</article>` : ""}
    ${marketRows ? `<article class="card gift-detail-card"><div class="section-heading"><h2>Market Activity</h2><span class="text-action">Pack-wide</span></div>${marketRows}</article>` : ""}`;
}

function renderStickerDetailSalesRows(detail, loading = false) {
  if (loading) return `<div class="gift-sales-loading" aria-label="Loading recent sticker sales"><span></span><span></span><span></span></div>`;
  const rows = detail.sales || [];
  if (!rows.length) return `<p class="detail-empty-state">No recent pack sales</p>`;
  return `<div class="gift-sales-list" role="table" aria-label="Recent sticker pack sales">${rows.slice(0, 8).map((sale) => `
    <div class="gift-sale-row" role="row">
      <span class="gift-sale-copy" role="cell"><b>${escapeHtml(sale[4] || "Market")}</b><small>${escapeHtml(sale[1] || "â€”")}</small></span>
      <span class="gift-sale-value" role="cell"><b>${escapeHtml(sale[0] || "â€”")}</b><small>${escapeHtml(sale[2] || detail.format || "Sticker")}</small></span>
    </div>`).join("")}</div>`;
}

function renderStickerDetailPage(detail, { loading = false } = {}) {
  const mount = document.getElementById("giftDetailMount");
  if (!mount) return;
  const media = stickerMediaDescriptor(detail);
  const floorLabel = Number(detail.floorUsd || 0) > 0 ? money(detail.floorUsd) : "â€”";
  const floorSubLabel = Number(detail.floorTon || 0) > 0 ? `${Number(detail.floorTon).toFixed(2)} TON` : "Price unavailable";
  const priceChangeClass = Number(detail.dailyPct || 0) < 0 ? "negative" : "positive";
  const hasChart = Array.isArray(detail.floorHistoryPoints) && detail.floorHistoryPoints.length >= 2;
  const source = marketSourceLabel(detail.marketPlatform || detail.stickerFloor?.source) || "Market data";
  const externalButton = document.querySelector('[data-screen="detail"] .page-header .icon-button:last-child');

  mount.innerHTML = `
    <section class="gift-detail-layout sticker-detail-layout">
      <article class="gift-detail-hero-card sticker-detail-hero-card">
        <div class="gift-detail-glow sticker-detail-glow"></div>
        <div class="gift-detail-hero-inner">
          <span class="gift-detail-hero-art sticker-detail-hero-art">${media.url ? collectibleMediaHtml(media, detail.name || "Sticker") : `<i data-lucide="sticker"></i>`}</span>
          <div class="gift-detail-title-block">
            <h2>${escapeHtml(detail.name || "Sticker Pack")}</h2>
            <small>${escapeHtml(detail.creator || detail.collection || "Telegram sticker")}</small>
          </div>
          <div class="gift-detail-pill-row">
            ${detail.format ? `<span class="gift-trait-pill">${escapeHtml(detail.format)}</span>` : ""}
            ${detail.edition ? `<span class="gift-trait-pill">${escapeHtml(detail.edition)}</span>` : ""}
          </div>
          <div class="gift-detail-floor-row">
            <strong>${floorLabel}</strong>
            ${Number(detail.floorUsd || 0) > 0 ? `<span class="status-badge ${priceChangeClass === "negative" ? "is-unlisted" : "is-listed"}">${signedPct(detail.dailyPct || 0)}</span>` : ""}
          </div>
          <small class="gift-detail-floor-sub">${floorSubLabel} Â· ${escapeHtml(source)}</small>
        </div>
      </article>

      <article class="card gift-detail-card">
        <div class="section-heading"><h2>Pack Details</h2></div>
        ${stickerDetailPackRows(detail)}
      </article>

      <article class="card gift-detail-card">
        <div class="section-heading">
          <h2>Floor Price</h2>
          <div class="gift-detail-toggle-row">
            <button type="button" class="mini-button ${priceMode === "USD" ? "active" : ""}" data-gift-price-mode="USD">USD</button>
            <button type="button" class="mini-button ${priceMode === "TON" ? "active" : ""}" data-gift-price-mode="TON">TON</button>
          </div>
        </div>
        ${loading ? `<div class="gift-chart-loading" aria-label="Loading sticker floor chart"><span class="gift-chart-gridline is-top"></span><span class="gift-chart-gridline is-mid"></span><span class="gift-chart-gridline is-low"></span><span class="gift-chart-scan"></span><span class="gift-chart-loader-line"></span><span class="gift-chart-loader-dot is-one"></span><span class="gift-chart-loader-dot is-two"></span><span class="gift-chart-loader-dot is-three"></span><span class="gift-chart-loading-label">Loading pack history</span></div>` : `<canvas id="giftDetailPriceChart" role="img" aria-label="Sticker floor price chart" class="gift-detail-chart"></canvas><div id="giftDetailChartTooltip" class="chart-tooltip">${hasChart ? `Latest: ${floorLabel}` : "Floor history unavailable"}</div>`}
        <div class="gift-detail-chart-footer"><div class="gift-detail-toggle-row">${Charts.rangeButtons("collectibleFloor", stickerDetailRange, { attribute: "data-sticker-detail-range" })}</div><small>${hasChart ? "Recent sales history" : "History builds from verified sales"}</small></div>
      </article>

      <article class="card gift-detail-card">
        <div class="section-heading"><h2>Pack Stats</h2><span class="text-action">Live</span></div>
        ${stickerDetailStatsRows(detail)}
      </article>

      ${stickerDetailIntelSections(detail)}

      <article class="card gift-detail-card">
        <div class="section-heading"><h2>Recent Sales</h2><span class="text-action">This pack</span></div>
        ${renderStickerDetailSalesRows(detail, loading)}
      </article>
    </section>`;

  if (!loading) {
    drawDetailPriceChart(detail, {
      svgSelector: "#giftDetailPriceChart",
      tooltipSelector: "#giftDetailChartTooltip",
      height: 190,
      emptyTooltip: "Floor history unavailable",
      hideReferenceWhenMissing: true,
      showAxes: true,
      showArea: true,
      interactive: true,
    });
  }
  initCollectibleAnimations(mount);
  if (externalButton) {
    externalButton.hidden = !detail.marketUrl;
    externalButton.onclick = () => {
      if (detail.marketUrl) window.open(detail.marketUrl, "_blank", "noopener,noreferrer");
    };
  }
}

function giftOriginRows(detail, upgradeState, eligibility) {
  const rows = [
    ["Received From", giftOriginSender(detail)],
    ["Received On", detail.origin?.receivedOn ? formatActivityDate(detail.origin.receivedOn) : (detail.acquired || "â€”")],
    ["Upgrade Status", upgradeState.label],
  ];
  if (!upgradeState.upgraded) rows.push(["Upgrade Eligibility", eligibility?.text || "â€”"]);
  const body = rows.map(([label, value], index) => `${index ? `<div class="gift-detail-divider"></div>` : ""}<div class="gift-detail-data-row"><span>${escapeHtml(label)}</span><span class="${/Eligible now|Upgraded/i.test(String(value)) ? "is-positive" : ""}">${escapeHtml(value)}</span></div>`).join("");
  const upgradeLink = !upgradeState.upgraded && eligibility?.eligible
    ? `<div class="gift-detail-divider"></div><button type="button" data-external-url="https://t.me/nft" class="gift-detail-link-button">Upgrade on Telegram â†’</button>`
    : "";
  return `${body}${upgradeLink}`;
}

function formatMintPrice(stats = {}) {
  if (Number(stats.mintPriceTon || 0) > 0) return `${Number(stats.mintPriceTon).toLocaleString(undefined, { maximumFractionDigits: 2 })} TON`;
  if (Number(stats.mintPriceStars || 0) > 0) return `${Number(stats.mintPriceStars).toLocaleString()} Stars`;
  if (Number(stats.mintPriceUsd || 0) > 0) return money(stats.mintPriceUsd);
  return "â€”";
}

function formatGiftStatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "â€”";
  return `${numeric.toFixed(numeric > 0 && numeric < 1 ? 2 : 0)}%`;
}

function giftCollectionSupplyPercent(value, total) {
  const numeric = Number(value);
  const denominator = Number(total);
  if (!Number.isFinite(numeric) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.max(0, Math.min(100, (numeric / denominator) * 100));
}

function giftCollectionPercentLabel(value) {
  if (!Number.isFinite(value)) return "â€”";
  return `${value.toFixed(value > 0 && value < 1 ? 2 : 0)}%`;
}

function giftCollectionStatsRows(detail) {
  const stats = detail.collectionStats || {};
  const hasStats = [
    stats.mintPriceStars,
    stats.mintPriceTon,
    stats.mintPriceUsd,
    stats.upgradedSupply,
    stats.unupgradedSupply,
    stats.burnedCount,
    stats.holdOnchainPct,
    stats.holdTelegramPct,
    stats.onchainHolders,
    stats.tgHolders,
    stats.totalMinted,
  ].some((value) => Number(value || 0) > 0);
  if (!hasStats) return `
    <div class="collection-stats-heading">
      <span class="collection-stats-heading-icon"><i data-lucide="bar-chart-3"></i></span>
      <h2>Collection Stats</h2>
    </div>
    <p class="detail-empty-state">Collection stats unavailable</p>`;

  const upgradedSupply = Number(stats.upgradedSupply || 0);
  const unupgradedSupply = Number(stats.unupgradedSupply || 0);
  const burnedCount = Number(stats.burnedCount || 0);
  const reportedTotal = Number(stats.totalMinted || 0);
  const derivedTotal = upgradedSupply + unupgradedSupply + burnedCount;
  const supplyTotal = reportedTotal > 0 ? reportedTotal : derivedTotal;
  const upgradedPct = giftCollectionSupplyPercent(upgradedSupply, supplyTotal);
  const unupgradedPct = giftCollectionSupplyPercent(unupgradedSupply, supplyTotal);
  const burnedPct = giftCollectionSupplyPercent(burnedCount, supplyTotal);
  const onchainPct = Number.isFinite(Number(stats.holdOnchainPct)) ? Math.max(0, Math.min(100, Number(stats.holdOnchainPct))) : null;
  const telegramPct = Number.isFinite(Number(stats.holdTelegramPct)) ? Math.max(0, Math.min(100, Number(stats.holdTelegramPct))) : null;
  const supplyMetrics = [
    { label: "Total Minted", value: formatMetricCount(stats.totalMinted), icon: "layers-3", tone: "neutral", pct: null },
    { label: "Upgraded Supply", value: formatMetricCount(stats.upgradedSupply), icon: "trending-up", tone: "upgraded", pct: upgradedPct },
    { label: "Unupgraded Supply", value: formatMetricCount(stats.unupgradedSupply), icon: "hexagon", tone: "unupgraded", pct: unupgradedPct },
    { label: "Total Burned", value: formatMetricCount(stats.burnedCount), icon: "flame", tone: "burned", pct: burnedPct },
  ];
  const metricMarkup = supplyMetrics.map((metric) => `
    <div class="collection-supply-metric is-${metric.tone}">
      <div class="collection-supply-percent">${metric.pct === null ? "" : `<span></span>${giftCollectionPercentLabel(metric.pct)}`}</div>
      <span class="collection-stats-icon-tile"><i data-lucide="${metric.icon}"></i></span>
      <strong>${escapeHtml(metric.value)}</strong>
      <small>${escapeHtml(metric.label)}</small>
    </div>`).join("");
  const ownershipRows = [
    { label: "Hold Onchain", icon: "globe-2", tone: "onchain", pct: onchainPct },
    { label: "Hold in TG", icon: "send", tone: "telegram", pct: telegramPct },
  ].map((item) => {
    const pct = Number.isFinite(item.pct) ? item.pct : 0;
    return `
      <div class="collection-ownership-row is-${item.tone}">
        <span class="collection-stats-icon-tile"><i data-lucide="${item.icon}"></i></span>
        <div class="collection-ownership-copy">
          <div><span>${item.label}</span><strong>${Number.isFinite(item.pct) ? formatGiftStatPercent(item.pct) : "â€”"}</strong></div>
          <span class="collection-ownership-track" role="img" aria-label="${item.label}: ${Number.isFinite(item.pct) ? formatGiftStatPercent(item.pct) : "unavailable"}">
            <span style="width:${pct}%"></span>
          </span>
        </div>
      </div>`;
  }).join("");

  return `
    <div class="collection-stats-heading">
      <span class="collection-stats-heading-icon"><i data-lucide="bar-chart-3"></i></span>
      <h2>Collection Stats</h2>
    </div>
    <div class="collection-mint-price">
      <div><span>Mint Price</span><strong>${escapeHtml(formatMintPrice(stats))}</strong></div>
      <span class="collection-mint-spark"><i data-lucide="sparkles"></i></span>
    </div>
    <div class="collection-stats-divider"></div>
    <section class="collection-supply-overview" aria-labelledby="collectionSupplyTitle">
      <h3 id="collectionSupplyTitle">Supply Overview</h3>
      <div class="collection-supply-grid">${metricMarkup}</div>
      <div class="collection-supply-track" aria-hidden="true">
        <span class="is-upgraded" style="width:${upgradedPct || 0}%"></span>
        <span class="is-unupgraded" style="width:${unupgradedPct || 0}%"></span>
        <span class="is-burned" style="width:${burnedPct || 0}%"></span>
      </div>
    </section>
    <div class="collection-stats-divider"></div>
    <section class="collection-ownership" aria-labelledby="collectionOwnershipTitle">
      <h3 id="collectionOwnershipTitle">Ownership</h3>
      <div class="collection-ownership-panel">${ownershipRows}</div>
    </section>`;
}

function renderGiftDemandBlock(detail) {
  const intel = detail.intel || {};
  const modelStats = detail.modelStats || {};
  const hasModelStats = [modelStats.modelCount, modelStats.supplyPct, modelStats.holderCount, modelStats.transferCount7d, modelStats.transferCount30d, modelStats.upgradedCount]
    .some((value) => Number(value || 0) > 0);
  if (!hasModelStats && (!intel || [intel.sales24h, intel.volume24h, intel.listedCount, intel.totalSupply].every((value) => !value || value === "â€”" || value === 0))) {
    return `<p class="detail-empty-state" style="text-align:center;color:var(--text-2);">â€” Insufficient data</p>`;
  }
  const velocity = Number(intel.velocityHours || 0) > 0 ? `Avg 1 sale every ${Number(intel.velocityHours).toFixed(1)} hours` : "â€”";
  const activeListingsValue = Number(intel.listedCount || intel.listedSupply || 0) > 0 ? String(intel.listedCount || intel.listedSupply) : "â€”";
  const rows = [
    ["Model supply", formatMetricCount(modelStats.modelCount), modelStats.supplyPct ? `${Number(modelStats.supplyPct).toFixed(Number(modelStats.supplyPct) < 1 ? 2 : 1)}% of collection` : ""],
    ["Model holders", formatMetricCount(modelStats.holderCount), ""],
    ["Model activity", formatMetricCount(modelStats.transferCount30d || modelStats.transferCount7d), modelStats.transferCount30d ? "30D transfers" : (modelStats.transferCount7d ? "7D transfers" : "")],
    ["Upgraded on-chain", formatMetricCount(modelStats.upgradedCount), ""],
    ["Sales last 24h", intel.sales24h || "â€”", ""],
    ["Volume last 24h", intel.volume24h || "â€”", ""],
    ["Active Listings", activeListingsValue, activeListingsValue !== "â€”" && intel.totalSupply ? `of ${formatMetricCount(intel.totalSupply)} total supply` : ""],
    ["Sales velocity", velocity, ""],
  ].filter(([, value]) => value !== "â€”");
  return rows.map(([label, value, secondary], index) => `${index ? `<div class="gift-detail-divider"></div>` : ""}<div class="gift-detail-data-row"><span>${escapeHtml(label)}</span><span class="gift-detail-data-stack"><b>${escapeHtml(value)}</b>${secondary ? `<small>${escapeHtml(secondary)}</small>` : ""}</span></div>`).join("");
}

function renderGiftSalesRows(detail) {
  const rows = detail.sales || [];
  if (!rows.length && detail.salesLoading) {
    return `<div class="gift-sales-loading" aria-label="Loading recent sales"><span></span><span></span><span></span></div>`;
  }
  if (!rows.length) return `<p class="detail-empty-state">No recent sales</p>`;
  const image = resolveTokenImage(detail.image || "");
  const marketLogo = (marketplace = "") => {
    const value = String(marketplace).toLowerCase();
    if (value.includes("mrkt")) return "assets/marketplaces/mrkt.jpg";
    if (value.includes("portal")) return "assets/marketplaces/portals.jpg";
    if (value.includes("tonnel")) return "assets/marketplaces/tonnel.jpg";
    return "";
  };
  const dateParts = (value = "") => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return { time: "â€”", day: "â€”" };
    return {
      time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
      day: `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`,
    };
  };
  const body = rows.slice(0, 10).map((sale) => {
    const saleMint = Number(sale.mint || 0) > 0 ? `#${Number(sale.mint).toLocaleString()}` : "";
    const marketplace = sale.marketplace || "Market";
    const logo = marketLogo(marketplace);
    const priceTon = Number(sale.priceTon || 0);
    const sold = dateParts(sale.soldAt || sale.date || "");
    const linkAttributes = sale.giftUrl
      ? ` data-external-url="${escapeHtml(sale.giftUrl)}" role="link" tabindex="0"`
      : "";
    return `<div class="gift-sale-table-row" role="row"${linkAttributes}>
      <span class="gift-sale-thumb" role="cell">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">` : `<i data-lucide="gift"></i>`}</span>
      <span class="gift-sale-identity" role="cell"><b>${escapeHtml(sale.model || "Gift")}${saleMint ? ` <small>${escapeHtml(saleMint)}</small>` : ""}</b></span>
      <span class="gift-sale-price" role="cell"><b>${priceTon > 0 ? `${priceTon.toLocaleString(undefined, { maximumFractionDigits: 4 })} TON` : "â€”"}</b><time datetime="${escapeHtml(sale.soldAt || sale.date || "")}">${escapeHtml(sold.day)} Â· ${escapeHtml(sold.time)}</time></span>
      <span class="gift-sale-market" role="cell" title="${escapeHtml(marketplace)}" aria-label="${escapeHtml(marketplace)}">${logo ? `<img src="${logo}" alt="${escapeHtml(marketplace)}">` : `<b>${escapeHtml(marketplace.slice(0, 2).toUpperCase())}</b>`}</span>
    </div>`;
  }).join("");
  return `<div class="gift-sales-list" role="table" aria-label="Last sales for this exact gift variant">${body}</div>`;
}

function applyGiftSales(detail, sales = [], scope = "same-traits") {
  detail.salesScope = scope;
  detail.salesLoading = false;
  detail.giftSalesRaw = Array.isArray(sales) ? sales.slice() : [];
  detail.sales = sales.map((sale) => ({
    priceTon: Number(sale.priceTon || 0),
    priceLabel: `${Number(sale.priceTon || 0).toFixed(2)} TON Â· ${money(sale.priceUsd || 0)}`,
    dateLabel: formatActivityDate(sale.date || Date.now()),
    date: sale.date || "",
    soldAt: sale.soldAt || sale.date || "",
    marketplace: sale.marketplace || "Market",
    buyer: truncateWalletAddress(sale.buyer || ""),
    seller: truncateWalletAddress(sale.seller || ""),
    mint: Number(sale.mint || 0),
    model: sale.model || "",
    backdrop: sale.backdrop || "",
    symbol: sale.symbol || "",
    giftUrl: sale.giftUrl || "",
  }));
}

function stickerMetricGridHtml(metrics = {}) {
  return `<div class="token-metric-grid">
    ${[
      ["Floor Price", metrics.floor || "â€”"],
      ["24h Volume", metrics.volume24h || "â€”"],
      ["Total Supply", metrics.totalSupply || "â€”"],
      ["Unique Holders", metrics.holders || "â€”"],
      ["All-Time High", metrics.ath || "â€”"],
      ["Your Portfolio %", metrics.portfolioShare || "â€”"],
    ].map(([label, value]) => `<article class="card token-metric-card"><small>${label}</small><b>${value}</b></article>`).join("")}
  </div>`;
}

function stickerThumbsHtml(items = []) {
  if (!items.length) return `<div class="mini-thumb-row"><span class="detail-empty-state">No sticker previews</span></div>`;
  return `<div class="mini-thumb-row">${items.map((item, index) => {
    const image = item.previews?.[0]?.url || item.metadata?.image || "";
    const animated = item.metadata?.animation_url || item.metadata?.animation || item.metadata?.video_url || item.metadata?.video || item.metadata?.lottie || "";
    const media = stickerMediaDescriptor({
      image,
      animatedImage: animated,
      animationUrl: animated,
      mediaType: /\.(?:lottie\.)?json(?:[?#].*)?$/i.test(String(animated))
        ? "lottie"
        : (/(\.webm|\.mp4|\.mov)(?:[?#].*)?$/i.test(String(animated)) ? "video" : ""),
    });
    return `<button class="sticker-mini" type="button" data-sticker-thumb='${escapeHtml(JSON.stringify({ image, name: item.metadata?.name || item.collection?.name || `Sticker ${index + 1}`, tag: item.index || 0, traits: (item.metadata?.attributes || []).map((attr) => `${attr.trait_type}: ${attr.value}`).join(" Â· ") }))}'>${collectibleMediaHtml(media, item.metadata?.name || "Sticker")}</button>`;
  }).join("")}</div>`;
}

function stickerDetailCacheKey(detail = {}) {
  return [
    detail.collectionAddress,
    detail.collectionId,
    detail.characterId,
    detail.characterName || detail.name,
  ].map((value) => String(value || "").trim().toLowerCase()).join("|");
}

async function fetchStickerDetailPayload(detail) {
  const key = stickerDetailCacheKey(detail);
  if (!key) return { floor: {}, sales: [], itemsPayload: {}, intel: {} };
  const cached = stickerDetailCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (stickerDetailRequests.has(key)) return stickerDetailRequests.get(key);
  const attributes = (detail.attributes || []).map((attribute) => Array.isArray(attribute)
    ? { label: attribute[0], value: attribute[1] }
    : attribute);
  const context = new URLSearchParams({
    collection: detail.collectionAddress || detail.collection || detail.name || "",
    name: detail.brand || detail.creator || detail.collection || "",
    item: detail.characterName || detail.name || "",
    kind: "sticker",
    attributes: JSON.stringify(attributes),
    traits: JSON.stringify(attributes),
  });
  const request = Promise.allSettled([
    fetchJson(`/api/collection-floor?${context.toString()}`),
    fetchJson(`/api/collection-sales?${context.toString()}`),
    detail.collectionAddress ? fetchJsonFast(`https://tonapi.io/v2/nfts/collections/${encodeURIComponent(detail.collectionAddress)}/items?limit=24`, 5000) : Promise.resolve({}),
    detail.collectionId ? fetchJson(`/api/sticker-detail-intel?${new URLSearchParams({ collectionId: detail.collectionId, characterId: detail.characterId || "", characterName: detail.characterName || detail.name || "" }).toString()}`) : Promise.resolve({}),
  ]).then(([floorResult, salesResult, itemsResult, intelResult]) => {
    const value = {
      floor: settledValue(floorResult, {}),
      sales: settledValue(salesResult, []),
      itemsPayload: settledValue(itemsResult, {}),
      intel: settledValue(intelResult, {}),
    };
    stickerDetailCache.set(key, { value, expiresAt: Date.now() + 5 * 60 * 1000 });
    return value;
  }).finally(() => stickerDetailRequests.delete(key));
  stickerDetailRequests.set(key, request);
  return request;
}

function getStickerDetailCachedPayload(detail) {
  const cached = stickerDetailCache.get(stickerDetailCacheKey(detail));
  return cached && cached.expiresAt > Date.now() ? cached.value : null;
}

function applyStickerDetailPayload(detail, payload = {}) {
  const floor = payload?.floor || {};
  const sales = payload?.sales || [];
  const itemsPayload = payload?.itemsPayload || {};
  const thumbs = itemsPayload?.nft_items || itemsPayload?.items || [];
  detail.floorTon = Number(floor.floorTon || detail.floorTon || 0);
  detail.floorUsd = Number(floor.floorUsd || detail.floorUsd || 0);
  detail.stickerFloor = floor;
  detail.dailyPct = Number(floor.change24hPct || detail.dailyPct || 0);
  detail.dailyUsd = detail.floorUsd ? detail.floorUsd * (detail.dailyPct / 100) : 0;
  detail.quickSellTon = detail.floorTon ? detail.floorTon * 0.95 : 0;
  detail.quickSellUsd = detail.floorUsd ? detail.floorUsd * 0.95 : 0;
  detail.sales = sales.map((sale) => [`${Number(sale.priceTon || 0).toFixed(2)} TON Â· ${money(sale.priceUsd || 0)}`, formatActivityDate(sale.date || Date.now()), detail.format || "Sticker", detail.creator || detail.collection, sale.marketplace || "Market"]);
  detail.floorHistoryPoints = buildStickerHistory(sales);
  detail.chart = detail.floorHistoryPoints.map((point) => point.priceUsd);
  detail.stickerThumbnails = thumbs;
  detail.stickerIntel = payload?.intel || {};
  if (currentDetailAssetId() === detail.id) {
    renderStickerDetailPage(detail, { loading: false });
    window.lucide?.createIcons();
    applyCurrencyDisplay();
  }
}

async function loadStickerDetail(detail, { forceRefresh = false } = {}) {
  const requestId = ++activeStickerDetailRequest;
  try {
    const payload = forceRefresh ? await fetchStickerDetailPayload(detail) : (getStickerDetailCachedPayload(detail) || await fetchStickerDetailPayload(detail));
    if (requestId !== activeStickerDetailRequest) return;
    applyStickerDetailPayload(detail, payload);
  } catch (error) {
    console.warn("Sticker detail load failed", error);
    if (requestId !== activeStickerDetailRequest) return;
    if (currentDetailAssetId() === detail.id) renderStickerDetailPage(detail, { loading: false });
  }
}

function giftDetailCacheKey(detail = {}) {
  return `${giftDetailPayloadVersion}:${String(detail.tokenAddress || detail.id || detail.name || "")}:${giftDetailRange}`;
}

async function fetchGiftDetailPayload(detail) {
  const key = giftDetailCacheKey(detail);
  if (!key) return { floor: {}, sales: [], origin: {}, rarity: {}, links: {} };
  const cached = giftDetailCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (giftDetailRequests.has(key)) return giftDetailRequests.get(key);
  const wallet = liveWalletAddress || liveWalletData?.account?.address || "";
  const nft = detail.tokenAddress || "";
  if (!wallet && !nft) return { floor: {}, sales: [], origin: {}, rarity: {}, links: {} };
  const collectionAddress = detail.collectionAddress || "";
  const collectionName = detail.collection || detail.name || "";
  const model = giftModelTrait(detail) || detail.model || "";
  const backdrop = giftTraitValue(detail, "Backdrop") || detail.backdrop || "";
  const symbol = giftTraitValue(detail, "Symbol") || detail.symbol || "";
  const detailParams = new URLSearchParams({
    wallet,
    nft,
    collection: collectionAddress || collectionName,
    collectionName,
    item: detail.name || detail.collection || "",
    attributes: JSON.stringify(detail.traits || []),
    model,
    backdrop,
    symbol,
    range: giftDetailRange,
    v: giftDetailPayloadVersion,
    t: String(Date.now()),
  });
  const tgauth = telegramInitData();
  if (tgauth) detailParams.set("tgauth", tgauth);
  const request = fetchJson(`/api/gift-detail-data?${detailParams.toString()}`)
    .then((payload) => {
      giftDetailCache.set(key, { value: payload, expiresAt: Date.now() + 5 * 60 * 1000 });
      return payload;
    })
    .finally(() => giftDetailRequests.delete(key));
  giftDetailRequests.set(key, request);
  return request;
}

async function loadGiftSalesFast(detail = {}, requestId = activeGiftDetailRequest) {
  const combo = giftComboHistoryCandidates(detail)[0];
  if (!combo) return false;
  const params = new URLSearchParams({
    collection: combo.collection,
    model: combo.model,
    backdrop: combo.backdrop,
    symbol: combo.symbol,
    limit: "10",
  });
  try {
    const payload = await fetchJsonFast(`/api/gift-registry/sales?${params}`, 2200);
    if (requestId !== activeGiftDetailRequest) return false;
    const sales = Array.isArray(payload?.sales) ? payload.sales : [];
    if (!sales.length) return false;
    applyGiftSales(detail, sales, "same-traits");
    refreshGiftDetailChrome(detail, { loading: false });
    return true;
  } catch {
    return false;
  }
}

function giftComboHistoryCandidates(detail = {}) {
  const seen = new Set();
  return [detail, ...(Array.isArray(detail.children) ? detail.children : [])].flatMap((item) => {
    const model = String(giftModelTrait(item) || giftModelTrait(detail) || item.model || detail.model || "").trim();
    const backdrop = String(giftTraitValue(item, "Backdrop") || giftTraitValue(detail, "Backdrop") || item.backdrop || detail.backdrop || "").trim();
    const symbol = String(giftTraitValue(item, "Symbol") || giftTraitValue(detail, "Symbol") || item.symbol || detail.symbol || "").trim();
    if (!model || !backdrop || !symbol) return [];
    return [item.collection, detail.collection, item.creator, detail.creator, item.name, detail.name]
      .filter(Boolean)
      .flatMap((value) => {
        const name = String(value).replace(/\s*#\d+\b/g, "").trim();
        return [name, /s$/i.test(name) ? name.slice(0, -1) : `${name}s`];
      })
      .filter((collection) => {
        const key = `${collectibleKey(collection)}:${collectibleKey(model)}:${collectibleKey(backdrop)}:${collectibleKey(symbol)}`;
        if (!collection || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((collection) => ({ collection, model, backdrop, symbol }));
  });
}

function giftComboHistoryCacheKey(detail = {}) {
  const candidate = giftComboHistoryCandidates(detail)[0];
  if (!candidate) return "";
  return `${giftDetailRange}:${collectibleKey(candidate.collection)}:${collectibleKey(candidate.model)}:${collectibleKey(candidate.backdrop)}:${collectibleKey(candidate.symbol)}`;
}

async function hydrateGiftDetailTraitRarities(detail = {}, requestId = activeGiftDetailRequest) {
  const collection = detail.collection || detail.name || "";
  const model = giftModelTrait(detail);
  const backdrop = giftTraitValue(detail, "Backdrop");
  const symbol = giftTraitValue(detail, "Symbol");
  if (!collection || !model) return false;
  const payload = await requestJson("/api/gift-model-floors/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pairs: [{ collection, model, backdrop, symbol }] }),
  }, "Gift trait rarity lookup failed").catch(() => null);
  if (requestId !== activeGiftDetailRequest) return false;
  const modelPayload = (payload?.models || [])[0];
  if (!modelPayload?.traitRarities || !Object.keys(modelPayload.traitRarities).length) return false;
  applyGiftTraitRarities(detail, modelPayload);
  const stored = assetDetails[detail.id];
  if (stored && stored !== detail) applyGiftTraitRarities(stored, modelPayload);
  return true;
}

function giftModelStatsCacheKey(detail = {}) {
  const collection = detail.collection || detail.name || "";
  const model = giftModelTrait(detail);
  if (!collection || !model) return "";
  return `${collectibleKey(collection)}:${collectibleKey(model)}`;
}

function giftCollectionStatsCacheKey(detail = {}) {
  const collection = detail.collection || detail.name || "";
  return collection ? collectibleKey(collection) : "";
}

function applyGiftModelStats(detail = {}, stats = {}) {
  if (!stats || typeof stats !== "object") return false;
  const normalized = {
    modelCount: Number(stats.modelCount || 0) || 0,
    supplyPct: Number(stats.supplyPct || 0) || 0,
    holderCount: Number(stats.holderCount || 0) || 0,
    transferCount7d: Number(stats.transferCount7d || 0) || 0,
    transferCount30d: Number(stats.transferCount30d || 0) || 0,
    upgradedCount: Number(stats.upgradedCount || 0) || 0,
    source: stats.source || "",
    updatedAt: stats.updatedAt || "",
  };
  if (!Object.values(normalized).some((value) => (typeof value === "number" ? value > 0 : Boolean(value)))) return false;
  detail.modelStats = normalized;
  return true;
}

function applyGiftCollectionStats(detail = {}, stats = {}) {
  if (!stats || typeof stats !== "object") return false;
  const normalized = {
    mintPriceStars: Number(stats.mintPriceStars || 0) || 0,
    mintPriceTon: Number(stats.mintPriceTon || 0) || 0,
    mintPriceUsd: Number(stats.mintPriceUsd || 0) || 0,
    upgradedSupply: Number(stats.upgradedSupply || 0) || 0,
    unupgradedSupply: Number(stats.unupgradedSupply || 0) || 0,
    burnedCount: Number(stats.burnedCount || 0) || 0,
    holdOnchainPct: Number(stats.holdOnchainPct || 0) || 0,
    holdTelegramPct: Number(stats.holdTelegramPct || 0) || 0,
    onchainHolders: Number(stats.onchainHolders || 0) || 0,
    tgHolders: Number(stats.tgHolders || 0) || 0,
    totalMinted: Number(stats.totalMinted || 0) || 0,
    source: stats.source || "",
    updatedAt: stats.updatedAt || "",
  };
  if (!Object.values(normalized).some((value) => (typeof value === "number" ? value > 0 : Boolean(value)))) return false;
  detail.collectionStats = normalized;
  return true;
}

async function hydrateGiftDetailModelStats(detail = {}, requestId = activeGiftDetailRequest) {
  const collection = detail.collection || detail.name || "";
  const model = giftModelTrait(detail);
  if (!collection || !model) return false;
  const key = giftModelStatsCacheKey(detail);
  const collectionKey = giftCollectionStatsCacheKey(detail);
  const cached = giftModelStatsCache.get(key);
  const cachedCollection = giftCollectionStatsCache.get(collectionKey);
  if (cached?.expiresAt > Date.now() && cachedCollection?.expiresAt > Date.now()) {
    const modelApplied = applyGiftModelStats(detail, cached.value);
    const collectionApplied = applyGiftCollectionStats(detail, cachedCollection.value);
    return modelApplied || collectionApplied;
  }
  if (giftModelStatsRequests.has(key)) return giftModelStatsRequests.get(key);
  const request = requestJson("/api/gift-model-stats", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pairs: [{ collection, model }] }),
  }, "Gift model stats lookup failed")
    .then((payload) => {
      if (requestId !== activeGiftDetailRequest) return false;
      const stats = (payload?.models || [])[0];
      const collectionStats = (payload?.collections || [])[0];
      let applied = false;
      if (stats) {
        giftModelStatsCache.set(key, { value: stats, expiresAt: Date.now() + 15 * 60 * 1000 });
        applied = applyGiftModelStats(detail, stats) || applied;
      }
      if (collectionStats && collectionKey) {
        giftCollectionStatsCache.set(collectionKey, { value: collectionStats, expiresAt: Date.now() + 15 * 60 * 1000 });
        applied = applyGiftCollectionStats(detail, collectionStats) || applied;
      }
      const stored = assetDetails[detail.id];
      if (stored && stored !== detail) {
        if (stats) applyGiftModelStats(stored, stats);
        if (collectionStats) applyGiftCollectionStats(stored, collectionStats);
      }
      return applied;
    })
    .catch(() => false)
    .finally(() => giftModelStatsRequests.delete(key));
  giftModelStatsRequests.set(key, request);
  return request;
}

async function fetchGiftComboHistoryPayload(detail = {}) {
  const key = giftComboHistoryCacheKey(detail);
  if (!key) return null;
  const cached = giftComboHistoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (giftComboHistoryRequests.has(key)) return giftComboHistoryRequests.get(key);
  const candidates = giftComboHistoryCandidates(detail);
  const request = (async () => {
    let points = [];
    for (const candidate of candidates) {
      const params = new URLSearchParams({ ...candidate, range: giftDetailRange });
      const history = await fetchJson(`/api/gift-registry/history?${params.toString()}`).catch(() => []);
      points = Array.isArray(history) ? history : [];
      if (points.length >= 2) break;
    }
      const latest = points[points.length - 1] || {};
      const floorTon = Number(detail.floorTon || latest.floorTon || latest.priceTon || 0);
      const rate = Number(detail.floorTon || 0) > 0 && Number(detail.floorUsd || 0) > 0
        ? Number(detail.floorUsd) / Number(detail.floorTon)
        : usdTonRate;
      const value = {
        floor: {
          floorTon,
          floorUsd: Number(detail.floorUsd || 0) || (floorTon > 0 ? floorTon * rate : 0),
          tonUsdRate: rate,
          floorHistorySource: points.length >= 2
            ? (detail.floorStatus === "estimated" || detail.floorSource === "estimate" ? "tontrack-estimate-history" : "tontrack-combo-registry")
            : "",
        },
        floorHistory: points,
        floorHistorySource: points.length >= 2
          ? (detail.floorStatus === "estimated" || detail.floorSource === "estimate" ? "tontrack-estimate-history" : "tontrack-combo-registry")
          : "",
      };
      giftComboHistoryCache.set(key, { value, expiresAt: Date.now() + 5 * 60 * 1000 });
      return value;
  })().finally(() => giftComboHistoryRequests.delete(key));
  giftComboHistoryRequests.set(key, request);
  return request;
}

function getGiftDetailCachedPayload(detail) {
  const cached = giftDetailCache.get(giftDetailCacheKey(detail));
  return cached && cached.expiresAt > Date.now() ? cached.value : null;
}

function isVerifiedGiftFloor(floor = {}) {
  const source = `${floor.source || ""} ${floor.marketPlatform || ""}`.toLowerCase();
  return /(?:thermos|d1|combo|backdrop)/i.test(source)
    && (Number(floor.floorUsd || 0) > 0 || Number(floor.floorTon || 0) > 0);
}

function isEstimatedGiftFloor(floor = {}) {
  const source = `${floor.source || ""} ${floor.marketPlatform || ""}`.toLowerCase();
  return /estimated|last-sale|last sale/.test(source)
    && (Number(floor.floorUsd || 0) > 0 || Number(floor.floorTon || 0) > 0);
}

function giftFloorHistoryPointsFromPayload(detail, payload = {}) {
  const floor = payload?.floor || {};
  const rate = Number(floor.tonUsdRate || (
    Number(floor.floorTon || 0) > 0 ? Number(floor.floorUsd || 0) / Number(floor.floorTon || 1) : 0
  ) || (
    Number(detail.floorTon || 0) > 0 ? Number(detail.floorUsd || 0) / Number(detail.floorTon || 1) : 0
  ) || 0);
  const history = Array.isArray(payload?.floorHistory) ? payload.floorHistory : [];
  return history
    .map((point, index) => {
      const timestamp = new Date(point.timestamp || point.date || 0).getTime();
      const priceTon = Number(point.priceTon || point.ton || point.floorTon || 0);
      const priceUsd = Number(point.priceUsd || point.usd || point.floorUsd || (priceTon > 0 && rate > 0 ? priceTon * rate : 0));
      if (!(priceUsd > 0 || priceTon > 0)) return null;
      return {
        timestamp: Number.isFinite(timestamp) ? timestamp : Date.now() - ((history.length - 1 - index) * 86400000),
        priceUsd: priceUsd || (priceTon * rate),
        priceTon,
      };
    })
    .filter((point) => Number(point.priceUsd || 0) > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function applyGiftFloorHistory(detail, payload = {}) {
  const floorHistoryPoints = giftFloorHistoryPointsFromPayload(detail, payload);
  if (floorHistoryPoints.length < 2) {
    const existingPoints = Array.isArray(detail.floorHistoryPoints) ? detail.floorHistoryPoints : [];
    if (existingPoints.length >= 2) {
      detail.floorHistoryAvailable = true;
      detail.chart = existingPoints.map((point) => point.priceUsd);
      return;
    }
    detail.floorHistoryAvailable = false;
    detail.floorHistorySource = "";
    detail.floorHistoryPoints = [];
    detail.chart = [];
    return true;
  }
  detail.floorHistoryAvailable = true;
  detail.floorHistorySource = payload.floorHistorySource || payload?.floor?.floorHistorySource || "live";
  detail.floorHistoryPoints = floorHistoryPoints;
  detail.chart = floorHistoryPoints.map((point) => point.priceUsd);
}

function refreshGiftDetailChrome(detail, { loading = false } = {}) {
  if (currentDetailAssetId() !== detail.id) return;
  renderGiftDetailPage(detail, { loading });
  window.lucide?.createIcons();
  applyCurrencyDisplay();
  return true;
}

async function loadGiftComboHistoryFast(detail = {}, requestId = activeGiftDetailRequest) {
  const comboHistoryPayload = await fetchGiftComboHistoryPayload(detail).catch(() => null);
  if (requestId !== activeGiftDetailRequest) return false;
  if (comboHistoryPayload) applyGiftFloorHistory(detail, comboHistoryPayload);
  return Boolean(detail.floorHistoryAvailable);
}

function applyGiftVerifiedFloor(detail, payload = {}) {
  const floor = payload?.floor || {};
  const verifiedFloor = isVerifiedGiftFloor(floor);
  const estimatedFloor = !verifiedFloor && isEstimatedGiftFloor(floor);
  const hasDisplayPrice = verifiedFloor || estimatedFloor;
  const incomingTon = Number(floor.floorTon || 0);
  const incomingUsd = Number(floor.floorUsd || 0) || (incomingTon > 0 ? incomingTon * usdTonRate : 0);
  // A detail response is enrichment, not authority to discard a valid floor
  // that was resolved in the import response. Empty detail payloads occur for
  // valid Telegram assets that do not have a separate detail entry yet.
  if (!hasDisplayPrice && Number(detail.floorUsd || 0) > 0) {
    applyGiftFloorHistory(detail, payload);
    return;
  }
  detail.floorTon = hasDisplayPrice ? incomingTon : 0;
  detail.floorUsd = hasDisplayPrice ? incomingUsd : 0;
  detail.dailyPct = verifiedFloor ? Number(floor.change24hPct || 0) : 0;
  detail.dailyUsd = detail.floorUsd && detail.dailyPct ? detail.floorUsd * (detail.dailyPct / 100) : 0;
  detail.marketPlatform = hasDisplayPrice ? (marketSourceLabel(floor.marketPlatform || floor.source) || (estimatedFloor ? "Estimated Value" : "Verified Market")) : "";
  detail.marketUrl = verifiedFloor ? (floor.marketUrl || "") : "";
  detail.graphImageUrl = "";
  detail.marketVerified = verifiedFloor && detail.floorUsd > 0;
  const isLastSale = floor.source === "last-sale-exact" || /last sale/i.test(String(floor.marketPlatform || ""));
  detail.floorSource = isLastSale ? "last-sale" : (estimatedFloor ? "estimate" : (detail.marketVerified ? "backdrop" : ""));
  detail.floorStatus = isLastSale ? "last-sale" : (estimatedFloor ? "estimated" : (verifiedFloor ? "priced" : "unavailable"));
  detail.estimateConfidence = estimatedFloor && !isLastSale ? (floor.estimateConfidence || "") : "";
  detail.estimateSignals = estimatedFloor && !isLastSale ? (floor.estimateSignals || null) : null;
  detail.quickSellTon = detail.floorTon ? detail.floorTon * 0.95 : 0;
  detail.quickSellUsd = detail.floorUsd ? detail.floorUsd * 0.95 : 0;
  detail.pnlUsd = detail.costBasis ? detail.floorUsd - detail.costBasis : 0;
  detail.pnlPct = detail.costBasis ? ((detail.floorUsd - detail.costBasis) / detail.costBasis) * 100 : 0;
  applyGiftFloorHistory(detail, payload);
}

function applyGiftDetailPayload(detail, payload = {}, options = {}) {
  const floor = payload?.floor || {};
  const sales = payload?.sales || [];
  detail.origin = payload?.origin || detail.origin || {};
  detail.rarity = payload?.rarity || detail.rarity || {};
  detail.links = payload?.links || detail.links || {};
  detail.onchainActivity = payload?.onchainActivity || detail.onchainActivity || {};
  detail.salesScope = payload?.salesScope || detail.salesScope || "collection";
  if (payload?.modelStats) applyGiftModelStats(detail, payload.modelStats);
  if (payload?.collectionStats) applyGiftCollectionStats(detail, payload.collectionStats);
  if (options.applyFloor !== false) applyGiftVerifiedFloor(detail, payload);
  else applyGiftFloorHistory(detail, payload);
  if (sales.length || !detail.giftSalesRaw?.length) applyGiftSales(detail, sales, detail.salesScope);
  const derivedSales24h = Number(payload?.salesStats?.sales24h || 0);
  const derivedVolume24hTon = Number(payload?.salesStats?.volume24hTon || 0);
  const derivedVolume24hUsd = Number(payload?.salesStats?.volume24hUsd || 0);
  const saleTimestamps = sales
    .map((sale) => new Date(sale.date || 0).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const avgGapHours = saleTimestamps.length > 1
    ? saleTimestamps.slice(1).reduce((sum, value, index) => sum + ((value - saleTimestamps[index]) / 3600000), 0) / (saleTimestamps.length - 1)
    : (Number(floor.sales24h || derivedSales24h) > 0 ? 24 / Math.max(1, Number(floor.sales24h || derivedSales24h)) : 0);
  detail.intel = {
    trend: detail.dailyPct >= 0 ? "â–‚â–ƒâ–…â–†â–‡" : "â–‡â–†â–…â–ƒâ–‚",
    badge: detail.dailyPct > 2 ? "Trending Up" : detail.dailyPct < -2 ? "Cooling" : "Stable",
    change24hPct: Number(floor.change24hPct || detail.dailyPct || 0),
    sales24h: Number(floor.sales24h || derivedSales24h || 0) > 0 ? String(Number(floor.sales24h || derivedSales24h || 0)) : "â€”",
    volume24h: Number(floor.volume24hUsd || derivedVolume24hUsd || 0) > 0 ? collectibleValueLabel(floor.volume24hUsd || derivedVolume24hUsd, floor.volume24hTon || derivedVolume24hTon) : "â€”",
    prior: Number.isFinite(Number(floor.change24hPct)) ? signedPct(Number(floor.change24hPct || 0)) : "â€”",
    daysToSell: avgGapHours > 0 ? `${avgGapHours.toFixed(1)} hours` : "â€”",
    listedSupply: Number(floor.listedCount || 0) > 0 ? String(Number(floor.listedCount || 0)) : "â€”",
    listedCount: Number(floor.listedCount || 0) || 0,
    totalSupply: Number(floor.totalSupply || 0) || 0,
    listingRate: Number(floor.totalSupply || 0) > 0 && Number(floor.listedCount || 0) > 0 ? `${((Number(floor.listedCount || 0) / Number(floor.totalSupply || 1)) * 100).toFixed(1)}%` : "â€”",
    velocityHours: avgGapHours || 0,
    bestTime: detail.marketPlatform || "Marketplace",
  };
}

async function loadGiftDetail(detail, { forceRefresh = false } = {}) {
  const requestId = ++activeGiftDetailRequest;
  detail.floorHistoryLoading = !detail.floorHistoryAvailable;
  detail.salesLoading = !(detail.sales || []).length;
  refreshGiftDetailChrome(detail, { loading: false });
  loadGiftSalesFast(detail, requestId);
  const traitRarityRequest = hydrateGiftDetailTraitRarities(detail, requestId).then((updated) => {
    if (requestId !== activeGiftDetailRequest) return;
    if (updated) refreshGiftDetailChrome(detail, { loading: false });
  });
  const modelStatsRequest = hydrateGiftDetailModelStats(detail, requestId).then((updated) => {
    if (requestId !== activeGiftDetailRequest) return;
    if (updated) refreshGiftDetailChrome(detail, { loading: false });
  });
  const fastHistoryRequest = loadGiftComboHistoryFast(detail, requestId).then((hasHistory) => {
    if (requestId !== activeGiftDetailRequest) return;
    if (hasHistory) {
      detail.floorHistoryLoading = false;
      refreshGiftDetailChrome(detail, { loading: false });
    }
  });
  try {
    const payload = forceRefresh ? await fetchGiftDetailPayload(detail) : (getGiftDetailCachedPayload(detail) || await fetchGiftDetailPayload(detail));
    if (requestId !== activeGiftDetailRequest) return;
    applyGiftDetailPayload(detail, payload, { applyFloor: true });
    await traitRarityRequest;
    await modelStatsRequest;
    if (!detail.floorHistoryAvailable) {
      await fastHistoryRequest;
    }
    detail.floorHistoryLoading = false;
    refreshGiftDetailChrome(detail, { loading: false });
  } catch (error) {
    console.warn("Gift detail load failed", error);
    if (requestId !== activeGiftDetailRequest) return;
    await traitRarityRequest;
    await modelStatsRequest;
    await fastHistoryRequest;
    detail.floorHistoryLoading = false;
    refreshGiftDetailChrome(detail, { loading: false });
  }
}

function buildStickerHistory(sales = []) {
  const start = Date.now() - (stickerDetailRange === "30d" ? 30 : 7) * 86400000;
  const points = sales.map((sale) => ({
    timestamp: new Date(sale.date || 0).getTime(),
    priceUsd: Number(sale.priceUsd || 0),
  })).filter((point) => Number.isFinite(point.timestamp) && point.timestamp >= start && point.priceUsd > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
  return points.length >= 2 ? points : [];
}

function setDetailHeading(panelSelector, title, action = "") {
  const panel = document.querySelector(panelSelector);
  if (!panel) return;
  const heading = panel.querySelector(".section-heading h2");
  const button = panel.querySelector(".section-heading button");
  if (heading) heading.textContent = title;
  if (button) {
    button.textContent = action;
    button.style.display = action ? "" : "none";
  }
}


function tokenActivityMatches(detail, event = {}) {
  const action = event.actions?.find((item) => item.simplePreview?.value) || event.actions?.[0];
  const preview = action?.simplePreview || {};
  const searchable = [
    preview.value,
    preview.description,
    preview.name,
    action?.type,
    preview.asset,
    preview.token,
  ].filter(Boolean).join(" ");
  const symbol = String(detail.symbol || "").trim();
  const name = String(detail.name || "").trim();
  const address = String(detail.address || "").trim().toLowerCase();
  const addressText = JSON.stringify([preview.asset, preview.token, preview.jettonAddress, action?.asset, action?.jetton]).toLowerCase();
  if (address && addressText.includes(address)) return true;
  if (symbol.toUpperCase() === "TON") return /\bTON\b/i.test(searchable);
  if (symbol && new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(symbol)}([^A-Za-z0-9]|$)`, "i").test(searchable)) return true;
  if (name && name.length > 3 && new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(name)}([^A-Za-z0-9]|$)`, "i").test(searchable)) return true;
  return false;
}

function renderTokenActivity(detail) {
  const table = document.querySelector("#detailSalesTable");
  if (!table) return;
  const headingAction = document.querySelector('.sales-panel .section-heading .text-action');
  if (headingAction) {
    headingAction.textContent = "See all";
    headingAction.dataset.tokenActivitySeeAll = detail.symbol || detail.name || "";
  }
  const matches = fullActivityEvents.filter((event) => {
    if (!tokenActivityMatches(detail, event)) return false;
    const action = event.actions?.find((item) => item.simplePreview?.value) || event.actions?.[0];
    const value = String(action?.simplePreview?.value || action?.simplePreview?.description || "");
    const numeric = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
    return !Number.isFinite(numeric) || Math.abs(numeric) > 0;
  }).slice(0, 3);
  if (matches.length) {
    table.innerHTML = matches.map((event) => {
      const action = event.actions?.find((item) => item.simplePreview?.value) || event.actions?.[0];
      const preview = action?.simplePreview || {};
      const direction = preview.direction || (/swap/i.test(action?.type || preview.name || "") ? "Swap" : /^\s*-/.test(preview.value || "") ? "Sent" : "Received");
      const icon = direction === "Swap" ? "refresh-cw" : direction === "Sent" ? "arrow-up-from-line" : "arrow-down-to-line";
      const rawValue = String(preview.value || preview.description || "");
      const symbol = detail.symbol || "";
      const tokenAmount = rawValue.match(new RegExp(`[-+âˆ’]?\\s*[\\d,.]+(?:\\.\\d+)?\\s*${escapeRegExp(symbol)}`, "i"))?.[0]
        || rawValue.replace(/^Swapping\s+/i, "").replace(/\s+for\s+/i, " â†’ ")
        || "On-chain";
      const hash = preview.transactionHash || event.id || "";
      return `<article class="token-detail-activity" data-tx-hash="${escapeHtml(hash)}"><span class="activity-dot token-bg"><i data-lucide="${icon}"></i></span><div><b>${escapeHtml(direction)}</b><small>${event.date ? formatActivityDate(event.date) : "Recent"}</small></div><aside><strong>${escapeHtml(tokenAmount)}</strong>${preview.usdValue ? `<small>${escapeHtml(preview.usdValue)}</small>` : ""}</aside></article>`;
    }).join("");
    return;
  }
  table.innerHTML = `<div class="detail-empty-state"><strong>No recent ${escapeHtml(detail.symbol || detail.name || "token")} activity</strong><small>Transactions for this asset will appear here when they are available from the connected wallet history.</small></div>`;
}

function renderTokenHero(detail, pnl, pnlClass) {
  const hero = document.querySelector("#detailHero");
  if (!hero) return;
  const image = resolveTokenImage(detail.image);
  const symbol = escapeHtml((detail.symbol || detail.name || "?").slice(0, 3).toUpperCase());
  const logo = image
    ? `<span class="token-detail-logo"><img src="${escapeHtml(image)}" alt="${escapeHtml(detail.symbol || detail.name)}" onerror="this.parentElement.textContent='${symbol}';"></span>`
    : `<span class="token-detail-logo">${symbol}</span>`;
  hero.innerHTML = `
    ${logo}
    <h2 id="detailName" data-asset="${escapeHtml(detail.id)}">${escapeHtml(detail.name)}</h2>
    <strong id="detailValue"><span>${tokenPriceLabel(detail.priceUsd)}</span><em class="detail-change-pill ${pnlClass}">${pnl}</em></strong>
    <p id="detailMintLine">${escapeHtml(tokenBalanceLabel(detail))} Â· ${money(detail.valueUsd || 0)}</p>
    <small id="detailCategory" hidden></small>
  `;
}

function renderTokenChartControls() {
  const panel = document.querySelector(".price-panel");
  if (!panel) return;
  const chart = panel.querySelector("#detailPriceChart");
  Charts.mountRangeControls("tokenPrice", tokenDetailRange, { element: panel, attribute: "data-token-detail-range", before: "#detailPriceChart" });
  let metrics = panel.querySelector("#tokenChartMetrics") || Object.assign(document.createElement("div"), {
    id: "tokenChartMetrics", className: "token-chart-metrics",
  });
  if (chart && metrics.previousElementSibling !== chart) chart.insertAdjacentElement("afterend", metrics);
  metrics.innerHTML = Array.from({ length: 4 }, () => `<article class="token-chart-metric"><small class="skeleton">&nbsp;</small><strong class="skeleton">&nbsp;</strong></article>`).join("");
}

function tokenChartAxisLabel(value) {
  const number = Number(value || 0);
  const abs = Math.abs(number);
  const maximumFractionDigits = abs >= 1 ? 2 : Math.min(8, Math.max(4, 3 - Math.floor(Math.log10(abs || 1))));
  return `$${number.toLocaleString(undefined, {
    minimumFractionDigits: abs >= 1 ? 2 : 0,
    maximumFractionDigits,
  })}`;
}

function renderTokenChartMetrics(detail, values = []) {
  const root = document.querySelector("#tokenChartMetrics");
  if (!root || !Array.isArray(values) || !values.length) return;
  const stats = Charts.seriesStats(values);
  if (!stats) return;
  const price = (value) => priceMode === "TON" ? `${value.toFixed(value >= 1 ? 2 : 4)} TON` : tokenPriceLabel(value);
  const items = [
    ["High", price(stats.high), "positive"],
    ["Low", price(stats.low), "negative"],
    ["Period", signedPct(stats.changePct), stats.changePct < 0 ? "negative" : "positive"],
    ["Swing", signedPct(stats.swingPct), "neutral"],
  ];
  root.innerHTML = items.map(([label, value, tone]) => (
    `<article class="token-chart-metric ${tone}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></article>`
  )).join("");
}

function renderPressureMeter(data = {}) {
  if (!data) return "";
  const buy = Math.max(0, Number(data.buy || 50));
  const sell = Math.max(0, Number(data.sell || 50));
  const total = buy + sell || 1;
  const buyPct = Math.round((buy / total) * 100);
  const sellPct = 100 - buyPct;
  return `<small>24h Pressure</small><div class="pressure-bar"><span style="width:${buyPct}%"></span><b style="left:${buyPct}%"></b></div><div class="pressure-labels"><em>${buyPct}% Buy</em><em>${sellPct}% Sell</em></div>`;
}

function ensureTokenDetailSections() {
  const pricePanel = document.querySelector(".price-panel");
  const salesPanel = document.querySelector(".sales-panel");
  const marketPanel = document.querySelector(".market-intel");
  if (!pricePanel || !salesPanel || !marketPanel) return {};
  marketPanel.after(salesPanel);
  pricePanel.after(marketPanel);
  let pressureHost = document.querySelector("#detailPressureHost");
  if (!pressureHost) {
    pressureHost = document.createElement("section");
    pressureHost.id = "detailPressureHost";
    pressureHost.className = "pressure-card";
  }
  marketPanel.after(pressureHost);
  let tonNetworkHost = document.querySelector("#detailTonNetworkHost");
  if (!tonNetworkHost) {
    tonNetworkHost = document.createElement("section");
    tonNetworkHost.id = "detailTonNetworkHost";
  }
  salesPanel.after(tonNetworkHost);
  return { pricePanel, marketPanel, pressureHost, salesPanel, tonNetworkHost };
}

function renderTokenMetricGrid(metrics = {}) {
  return `<div class="token-metric-grid">
    ${[
      ["Market Cap", metrics.marketCap || "--"],
      ["24h Volume", metrics.volume24h || "--"],
      ["TVL", metrics.tvl || "--"],
      ["Holders", metrics.holders || "--"],
      ["All Time High", metrics.ath || "--"],
      ["Your Portfolio %", metrics.portfolioShare || "--"],
    ].map(([label, value]) => `<article class="card token-metric-card"><small>${label}</small><b>${value}</b></article>`).join("")}
  </div>`;
}

function renderHolderRing(percent = 0) {
  const numeric = Number(percent);
  const known = Number.isFinite(numeric) && numeric > 0;
  const safe = known ? Math.max(0, Math.min(100, numeric)) : 0;
  return `<section class="holder-ring-card">
    <div class="holder-ring ${known ? "" : "is-loading"}" style="--holder-pct:${safe};"><span>${known ? `${safe.toFixed(1)}%` : "â€”"}</span></div>
    <small>Top 10 holders</small>
  </section>`;
}

function renderTonNetworkHighlights(network = {}) {
  const items = [
    ["Total Supply", network.totalSupplyTon ? `${network.totalSupplyTon} TON` : "â€”"],
    ["Active Wallets", network.activeWalletsMonthly || "â€”"],
    ["Daily Wallets", network.activeWalletsDaily || "â€”"],
    ["Activated Wallets", network.activatedWallets || "â€”"],
    ["Tx / Day", network.txPerDay || "â€”"],
    ["Staked TON", network.stakedTon ? `${network.stakedTon} TON` : "â€”"],
    ["Inflation", network.annualInflationPct ? `${network.annualInflationPct}%` : "â€”"],
  ];
  return `<section class="ton-network-card">
    <div class="section-heading"><h2>TON Network</h2><span class="network-live-badge"><i></i>Live</span></div>
    <div class="token-metric-grid ton-network-grid">
      ${items.map(([label, value]) => `<article class="card token-metric-card"><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></article>`).join("")}
    </div>
  </section>`;
}

function renderDetailLoadingMetrics() {
  return `<div class="token-metric-grid">${Array.from({ length: 6 }, () => `<article class="card token-metric-card"><small class="skeleton">&nbsp;</small><b class="skeleton">&nbsp;</b></article>`).join("")}</div>
    <section class="holder-ring-card"><div class="holder-ring is-loading"><span>--</span></div><small>Top 10 holders</small></section>`;
}

function ensureStickerThumbOverlay() {
  let overlay = document.getElementById("stickerThumbOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "stickerThumbOverlay";
  overlay.className = "sticker-thumb-overlay";
  overlay.innerHTML = `<button class="sticker-thumb-backdrop" type="button" aria-label="Close"></button><section class="sticker-thumb-panel"><button class="sticker-thumb-close" type="button" aria-label="Close">Ã—</button><img alt=""><h3></h3><p></p><small></small></section>`;
  document.body.appendChild(overlay);
  overlay.querySelector(".sticker-thumb-backdrop")?.addEventListener("click", closeStickerThumbOverlay);
  overlay.querySelector(".sticker-thumb-close")?.addEventListener("click", closeStickerThumbOverlay);
  return overlay;
}

function openStickerThumbOverlay(data = {}) {
  const overlay = ensureStickerThumbOverlay();
  overlay.querySelector("img").src = data.image || "";
  overlay.querySelector("h3").textContent = data.name || "Sticker";
  overlay.querySelector("p").textContent = data.tag ? `#${data.tag}` : "";
  overlay.querySelector("small").textContent = data.traits || "â€”";
  overlay.classList.add("is-open");
}

function closeStickerThumbOverlay() {
  document.getElementById("stickerThumbOverlay")?.classList.remove("is-open");
}

function formatMetricMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "â€”";
  if (number >= 1_000_000_000) return `$${(number / 1_000_000_000).toFixed(number >= 10_000_000_000 ? 1 : 2)}B`;
  if (number >= 1_000_000) return `$${(number / 1_000_000).toFixed(number >= 10_000_000 ? 1 : 2)}M`;
  if (number >= 1_000) return `$${(number / 1_000).toFixed(number >= 10_000 ? 1 : 2)}K`;
  return money(number);
}

function formatMetricCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "â€”";
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return number.toLocaleString();
}

function tokenApiAddress(detail = {}) {
  return detail.address && detail.address !== "Native TON" && detail.address !== "System asset" ? detail.address : "";
}

function tokenDetailCacheKey(detail, range = tokenDetailRange) {
  return `${detail.address || detail.symbol || "ton"}:${detail.priceUsd}:${range}`;
}

function tokenChartQuery(detail, range = tokenDetailRange) {
  const params = new URLSearchParams({
    symbol: detail.symbol || "",
    address: tokenApiAddress(detail),
    decimals: String(detail.decimals ?? 9),
    priceUsd: String(detail.priceUsd || 0),
    valueUsd: String(detail.valueUsd || 0),
    range,
    t: String(Date.now()),
  });
  return `/api/token-detail-data?${params.toString()}`;
}

async function fetchJsonFast(url, timeoutMs = 3200) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await requestJson(url, { signal: controller.signal }, "Request failed");
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTokenDetailChart(points = []) {
  return points.map((point) => ({
    timestamp: Number(point.timestamp),
    price: Number(point.price),
  })).filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.price) && point.price > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function setTokenDetailChart(detail, points = []) {
  detail.historyChart = normalizeTokenDetailChart(points);
  if (detail.historyChart.length) {
    detail.entryPrice = detail.historyChart[0].price;
    detail.priceUsd = detail.historyChart.at(-1)?.price || detail.priceUsd;
  }
  drawDetailPriceChart(detail);
}

function tokenChartRangeMs() {
  const day = 24 * 60 * 60 * 1000;
  return { day, week: 14 * day, month: 30 * day, year: 365 * day, all: 1000 * day }[tokenDetailRange] || day;
}

function tokenChartRangeLabel(timestamp, compact = false) {
  const date = new Date(timestamp);
  if (tokenDetailRange === "day") {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (tokenDetailRange === "week") {
    return date.toLocaleDateString(undefined, { month: compact ? undefined : "short", day: "numeric" });
  }
  if (tokenDetailRange === "month") {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  if (tokenDetailRange === "year") {
    return date.toLocaleDateString(undefined, { month: "short" });
  }
  return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}


async function loadTokenDetailMetrics(detail) {
  const cacheKey = tokenDetailCacheKey(detail);
  const requestId = ++activeTokenDetailRequest;
  const cachedMetrics = tokenDetailMetricsCache.get(cacheKey);
  if (cachedMetrics && cachedMetrics.expiresAt > Date.now()) {
    applyTokenDetailMetrics(detail, cachedMetrics.value);
    return;
  }
  try {
    const backendPayload = await fetchJsonFast(tokenChartQuery(detail), 6500);
    if (requestId !== activeTokenDetailRequest) return;
    tokenDetailMetricsCache.set(cacheKey, { value: backendPayload, expiresAt: Date.now() + 10 * 60 * 1000 });
    applyTokenDetailMetrics(detail, backendPayload);
  } catch (error) {
    console.warn("Token detail metrics failed", error);
    if (requestId !== activeTokenDetailRequest) return;
    const pressure = document.querySelector("#tokenPressurePanel");
    if (pressure) {
      pressure.innerHTML = "";
      pressure.style.display = "none";
    }
    const root = document.querySelector("#detailMarketIntel");
    if (root) root.innerHTML = `${renderTokenMetricGrid()}${renderHolderRing(0)}`;
  }
}

function prefetchTokenDetailMetrics(detail, range = "day") {
  if (!detail) return;
  const cacheKey = tokenDetailCacheKey(detail, range);
  const cached = tokenDetailMetricsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return;
  if (tokenDetailPrefetchRequests.has(cacheKey)) return;
  const request = fetchJsonFast(tokenChartQuery(detail, range), 6500)
    .then((payload) => {
      tokenDetailMetricsCache.set(cacheKey, { value: payload, expiresAt: Date.now() + 10 * 60 * 1000 });
    })
    .catch(() => {})
    .finally(() => tokenDetailPrefetchRequests.delete(cacheKey));
  tokenDetailPrefetchRequests.set(cacheKey, request);
}

function prefetchVisibleTokenDetails(tokens = latestVisibleTokens) {
  const candidates = tokens.slice(0, 24).map((token) => tokenDetails[token.id] || token);
  const chunkSize = 6;
  for (let index = 0; index < candidates.length; index += chunkSize) {
    const chunk = candidates.slice(index, index + chunkSize);
    setTimeout(() => {
      chunk.forEach((token) => prefetchTokenDetailMetrics(token, "day"));
    }, Math.floor(index / chunkSize) * 180);
  }
}

function queueDetailWarmup(task) {
  detailWarmupQueue = detailWarmupQueue
    .then(() => task())
    .catch(() => {})
    .then(() => delay(45));
  return detailWarmupQueue;
}

function flattenCollectibleAssets(assets = []) {
  return assets.flatMap((asset) => asset.children?.length ? asset.children : [asset]);
}

const preloadedGiftImages = new Set();
const preloadedGiftAnimations = new Set();
const preloadedStickerAnimations = new Set();

function preloadStickerAnimatedMedia(assets = []) {
  const queue = [...new Set(
    flattenCollectibleAssets(assets)
      .map((asset) => stickerMediaDescriptor(asset))
      .filter((media) => media.type === "lottie" && media.url)
      .map((media) => media.url)
      .filter((url) => !preloadedStickerAnimations.has(url))
  )];
  let active = 0;
  const pump = () => {
    while (active < 4 && queue.length) {
      const url = queue.shift();
      preloadedStickerAnimations.add(url);
      active += 1;
      loadCollectibleLottieData(url)
        .catch(() => preloadedStickerAnimations.delete(url))
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  };
  pump();
}

function preloadGiftStaticImages(assets = []) {
  const imageUrls = new Set();
  const animationUrls = new Set();
  flattenCollectibleAssets(assets).forEach((asset) => {
    const layer = giftLayerDescriptor(asset);
    [asset.image, asset.iconUrl, asset.previewUrl, layer?.modelImageUrl, layer?.patternImageUrl]
      .map((url) => resolveTokenImage(url || ""))
      .filter(Boolean)
      .forEach((url) => imageUrls.add(url));
    const animationUrl = resolveAnimationMediaUrl(layer?.modelAnimationUrl || asset.animationUrl || asset.animatedImage || "");
    const isLottie = layer?.mediaType === "lottie" || /\.(?:lottie\.)?json(?:[?#].*)?$/i.test(animationUrl);
    if (animationUrl && isLottie) animationUrls.add(animationUrl);
  });
  const queue = [...imageUrls].filter((url) => !preloadedGiftImages.has(url));
  let active = 0;
  const pump = () => {
    while (active < 6 && queue.length) {
      const url = queue.shift();
      preloadedGiftImages.add(url);
      active += 1;
      const image = new Image();
      const done = () => {
        active -= 1;
        pump();
      };
      image.onload = done;
      image.onerror = done;
      image.src = url;
    }
  };
  pump();

  // Fetch Lottie data now, at import time. The renderer can then paint the
  // first frame immediately when its card is mounted instead of waiting for
  // an intersection/hover event to begin network work.
  [...animationUrls]
    .filter((url) => !preloadedGiftAnimations.has(url))
    .forEach((url) => {
      preloadedGiftAnimations.add(url);
      loadCollectibleLottieData(url).catch(() => preloadedGiftAnimations.delete(url));
    });
}

function refreshCollectibleDerivedUi({ renderCollectibles = true } = {}) {
  updateAllocationUi(true);
  updateCategoryAndTopAsset();
  updateAssetsPortfolioStrip();
  if (renderCollectibles) renderCollectibleGrids();
  if (typeof renderWalletCharts === "function") renderWalletCharts();
  updateAnalyticsFromWallet(homePortfolioValue);
}

function syncCollectibleGroupFromChildren(group) {
  const children = group?.children || [];
  if (!children.length) return group;
  group.floorUsd = children.reduce((sum, item) => sum + Number(item.floorUsd || 0), 0);
  group.floorTon = children.reduce((sum, item) => sum + Number(item.floorTon || 0), 0);
  group.dailyUsd = children.reduce((sum, item) => sum + Number(item.dailyUsd || 0), 0);
  group.initUsd = children.reduce((sum, item) => sum + Number(item.initUsd || 0), 0);
  group.initTon = children.reduce((sum, item) => sum + Number(item.initTon || 0), 0);
  group.pnlUsd = group.initUsd ? group.floorUsd - group.initUsd : children.reduce((sum, item) => sum + Number(item.pnlUsd || 0), 0);
  group.pnlPct = group.initUsd ? ((group.floorUsd - group.initUsd) / group.initUsd) * 100 : group.pnlPct;
  group.priceLoading = children.some((item) => item.priceLoading);
  const priced = children.find((item) => Number(item.floorUsd || 0) > 0);
  if (priced) {
    group.marketPlatform = priced.marketPlatform || group.marketPlatform;
    group.marketUrl = priced.marketUrl || group.marketUrl;
    group.source = priced.source || group.source;
  }
  assetDetails[group.id] = group;
  children.forEach((child) => { assetDetails[child.id] = child; });
  return group;
}


let giftDerivedUiRefreshTimer = 0;
const giftPricePrefetchKeys = new Set();

function scheduleGiftDerivedUiRefresh() {
  if (giftDerivedUiRefreshTimer) return;
  giftDerivedUiRefreshTimer = window.setTimeout(() => {
    giftDerivedUiRefreshTimer = 0;
    refreshCollectibleDerivedUi();
  }, 500);
}

function prefetchGiftDetails(assets = giftAssets) {
  assets.forEach((group) => {
    const children = group.children?.length ? group.children : [group];
    children
      .filter((asset) => asset.type === "gift")
      .forEach((asset) => {
        const key = giftDetailCacheKey(asset);
        if (!key || giftPricePrefetchKeys.has(key)) return;
        giftPricePrefetchKeys.add(key);
        queueDetailWarmup(async () => {
          try {
            const payload = await fetchGiftDetailPayload(asset);
            // Telegram imports already receive their resolved D1 price in the
            // initial response. Detail prefetch is enrichment only; an empty
            // detail response must never erase that known value.
            applyGiftDetailPayload(asset, payload, { applyFloor: false });
          } catch (error) {
            console.warn("Gift price prefetch failed", error);
          } finally {
            asset.priceLoading = false;
            syncCollectibleGroupFromChildren(group);
            scheduleGiftDerivedUiRefresh();
            giftPricePrefetchKeys.delete(key);
          }
        });
      });
  });
}

let stickerDerivedUiRefreshTimer = 0;
const stickerPricePrefetchKeys = new Set();

function applyStickerFloorPayload(asset, payload = {}) {
  const floor = payload?.floor || {};
  const nextFloorTon = Number(floor.floorTon || asset.floorTon || 0);
  const nextFloorUsd = Number(floor.floorUsd || asset.floorUsd || 0);
  const nextDailyPct = Number(floor.change24hPct || asset.dailyPct || 0);
  asset.floorTon = nextFloorTon;
  asset.floorUsd = nextFloorUsd;
  asset.dailyPct = nextDailyPct;
  asset.dailyUsd = asset.floorUsd && asset.dailyPct ? asset.floorUsd * (asset.dailyPct / 100) : 0;
  asset.marketPlatform = marketSourceLabel(floor.marketPlatform || floor.source) || asset.marketPlatform || "";
  asset.marketUrl = floor.marketUrl || asset.marketUrl || "";
  asset.pnlUsd = asset.costBasis ? asset.floorUsd - asset.costBasis : asset.pnlUsd;
  asset.pnlPct = asset.costBasis ? ((asset.floorUsd - asset.costBasis) / asset.costBasis) * 100 : asset.pnlPct;
}

function patchStickerGroupCard(group) {
  const card = [...document.querySelectorAll("#stickerGrid .collectible-card[data-asset]")]
    .find((element) => element.dataset.asset === group.id);
  if (!card) return;
  const template = document.createElement("template");
  template.innerHTML = renderStickerCard(group).trim();
  const replacement = template.content.firstElementChild;
  if (!replacement) return;
  card.replaceWith(replacement);
  window.lucide?.createIcons();
  initCollectibleAnimations(replacement);
}

function scheduleStickerDerivedUiRefresh() {
  if (stickerDerivedUiRefreshTimer) return;
  stickerDerivedUiRefreshTimer = window.setTimeout(() => {
    stickerDerivedUiRefreshTimer = 0;
    refreshCollectibleDerivedUi({ renderCollectibles: false });
  }, 500);
}

function prefetchStickerDetails(assets = stickerAssets) {
  assets.forEach((group) => {
    const children = group.children?.length ? group.children : [group];
    children
      .filter((asset) => asset.type === "sticker" && asset.collectionAddress)
      .forEach((asset) => {
        const key = stickerDetailCacheKey(asset);
        if (!key || stickerPricePrefetchKeys.has(key)) return;
        stickerPricePrefetchKeys.add(key);
        queueDetailWarmup(async () => {
          try {
            const payload = await fetchStickerDetailPayload(asset);
            applyStickerFloorPayload(asset, payload);
          } finally {
            asset.priceLoading = false;
            syncCollectibleGroupFromChildren(group);
            patchStickerGroupCard(group);
            scheduleStickerDerivedUiRefresh();
            stickerPricePrefetchKeys.delete(key);
          }
        });
      });
    });
}

function prefetchAllVisibleDetails() {
  prefetchVisibleTokenDetails(latestVisibleTokens);
  prefetchStickerDetails(stickerAssets);
}

function applyTokenDetailMetrics(detail, payload = {}) {
  detail.chartLoading = false;
  if (payload.chart?.length) setTokenDetailChart(detail, payload.chart);
  else drawDetailPriceChart(detail);
  const apiMetrics = payload.metrics || {};
  const metrics = {
    marketCap: formatMetricMoney(apiMetrics.marketCap),
    volume24h: formatMetricMoney(apiMetrics.volume24h),
    tvl: formatMetricMoney(apiMetrics.tvl),
    holders: formatMetricCount(apiMetrics.holders),
    ath: apiMetrics.ath ? tokenPriceLabel(apiMetrics.ath) : "â€”",
    portfolioShare: homePortfolioValue > 0 ? `${((Number(detail.valueUsd || 0) / homePortfolioValue) * 100).toFixed(2)}%` : "â€”",
    concentration: Number(apiMetrics.concentration || 0),
  };
  const { pressureHost, tonNetworkHost } = ensureTokenDetailSections();
  if (pressureHost) {
    const pressureMarkup = renderPressureMeter(payload.pressure || null);
    pressureHost.innerHTML = pressureMarkup;
    pressureHost.style.display = pressureMarkup ? "" : "none";
  }
  const root = document.querySelector("#detailMarketIntel");
  if (root) {
    const isTon = String(detail.symbol || "").toUpperCase() === "TON" && !detail.address;
    const holderRing = !isTon ? renderHolderRing(metrics.concentration) : "";
    root.innerHTML = `${renderTokenMetricGrid(metrics)}${holderRing}`;
    if (tonNetworkHost) {
      tonNetworkHost.innerHTML = isTon ? renderTonNetworkHighlights(payload.tonNetwork || {}) : "";
      tonNetworkHost.style.display = isTon ? "" : "none";
    }
  }
}

function renderTokenDetail(detail, tone) {
  if (liveWalletAddress && !fullActivityEvents.length) startActivityPreload(liveWalletAddress);
  const change = Number(detail.change24h);
  const pnl = Number.isFinite(change) ? signedPct(change) : "0.0%";
  const pnlClass = change < 0 ? "negative" : "positive";
  const contract = detail.address ? truncateWalletAddress(detail.address) : "Native TON";
  const compactBalance = tokenBalanceCompact(detail);
  const compactSymbol = tokenSymbolCompact(detail);
  const financialGrid = document.querySelector(".financial-grid");
  if (financialGrid) financialGrid.style.display = "none";
  detail.chartLoading = false;
  detail.historyChart = [];
  renderTokenHero(detail, pnl, pnlClass);
  setText("#detailStatOneLabel", "Price");
  setText("#detailStatOne", tokenPriceLabel(detail.priceUsd));
  setText("#detailStatTwoLabel", "Balance");
  setText("#detailStatTwo", compactBalance);
  setText("#detailStatThreeLabel", "Contract");
  setText("#detailStatThree", contract);
  setText("#detailPnl", pnl);
  document.querySelector("#detailPnl")?.classList.toggle("positive", change >= 0 || !Number.isFinite(change));
  document.querySelector("#detailPnl")?.classList.toggle("negative", change < 0);
  setText("#detailAcquiredLabel", "");
  document.querySelector("#detailTraitPanel").innerHTML = "";
  document.querySelector("#detailMetaStack").innerHTML = "";
  setText("#detailAcquiredLabel", "");
  setDetailHeading(".price-panel", "Price Movement", "");
  setDetailHeading(".sales-panel", "Recent Activity", "See all");
  setDetailHeading(".market-intel", "Market Stats", "");
  renderTokenChartControls();
  const { pressureHost, tonNetworkHost } = ensureTokenDetailSections();
  if (pressureHost) {
    pressureHost.innerHTML = "";
    pressureHost.style.display = "none";
  }
  if (tonNetworkHost) {
    tonNetworkHost.innerHTML = "";
    tonNetworkHost.style.display = "none";
  }
  renderTokenActivity(detail);
  document.querySelector("#detailMarketIntel").innerHTML = renderDetailLoadingMetrics();
  const cachedMetrics = tokenDetailMetricsCache.get(tokenDetailCacheKey(detail));
  if (cachedMetrics && cachedMetrics.expiresAt > Date.now()) {
    applyTokenDetailMetrics(detail, cachedMetrics.value);
  }
  loadTokenDetailMetrics(detail);
  setIcon(document.querySelector("#detailHistoryIcon"), "clock", tone);
  setText("#detailHistoryText", "Imported from connected TON wallet");
  setText("#detailLinkLabel", detail.address ? "Tonviewer" : "Explorer");
  const externalButton = document.querySelector('[data-screen="detail"] .page-header .icon-button:last-child');
  if (externalButton) {
    externalButton.onclick = () => {
      const url = detail.address
        ? `https://tonviewer.com/${encodeURIComponent(detail.address)}`
        : currentWalletExplorer("tonviewer");
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    };
  }
}

function renderSales(detail) {
  const table = document.querySelector("#detailSalesTable");
  if (!table) return;
  const rows = detail.sales || [];
  table.innerHTML = rows.map((sale) => `<div class="sales-row"><b>${sale[0]}<span>${sale[1]}</span></b><b>${sale[2]}<span>${sale[3]}</span></b><b>${sale[5] || sale[4]}<span>${sale[4]}</span></b></div>`).join("");
}

function renderMarketIntel(detail) {
  const root = document.querySelector("#detailMarketIntel");
  if (!root) return;
  if (!detail.intel) {
    root.innerHTML = `<div class="intel-grid"><article class="intel-row"><b>Demand</b><span>Live data unavailable</span></article></div>`;
    return;
  }
  const items = [
    ["Demand Trend", `<span class="trend-spark">${detail.intel.trend}</span><span class="trend-badge">${detail.intel.badge}</span>`],
    ["Sales last 24h", detail.intel.sales24h],
    ["Volume last 24h", detail.intel.volume24h],
    ["vs Prior 24h", detail.intel.prior],
    ["Avg days to sell", detail.intel.daysToSell],
    ["Listed supply", detail.intel.listedSupply],
    ["Listing rate", detail.intel.listingRate],
    ["Best time to sell", detail.intel.bestTime],
  ];
  root.innerHTML = `<div class="intel-grid">${items.map(([label, value]) => `<article class="intel-row"><b>${label}</b><span>${value}</span></article>`).join("")}</div>`;
}

function drawDetailPriceChart(detail, options = {}) {
  const element = document.querySelector(options.svgSelector || "#detailPriceChart");
  if (!element) return;
  const tooltipSelector = options.tooltipSelector || "#chartTooltip";
  const isToken = detail.type === "token";
  const sourcePoints = isToken ? (detail.historyChart || []) : (detail.floorHistoryPoints || []);
  const sourceValues = isToken ? sourcePoints.map((point) => point.price) : (detail.chart || []);
  const values = priceMode === "TON" ? sourceValues.map((value) => value / usdTonRate) : sourceValues;
  const rows = values.map((value, index) => ({ value, timestamp: Number(sourcePoints[index]?.timestamp) }))
    .filter((point) => Number.isFinite(point.timestamp));
  const sourceReference = isToken ? Number.NaN : (detail.costBasis || sourceValues[0]);
  const hasReference = !isToken && (Number(detail.costBasis || 0) > 0 || !options.hideReferenceWhenMissing);
  const reference = priceMode === "TON" ? sourceReference / usdTonRate : sourceReference;
  const label = (value) => priceMode === "TON"
    ? `${value.toFixed(value >= 1 ? 2 : 4)} TON`
    : (isToken ? tokenPriceLabel(value) : usdValueLabel(value));
  const result = Charts.renderDetailSeries(isToken ? "tokenPrice" : "collectibleFloor", rows, {
    element,
    height: options.height || (isToken ? 230 : 150),
    showAxes: isToken || options.showAxes,
    showArea: isToken || options.showArea,
    showPoints: !isToken,
    interactive: isToken || options.interactive !== false,
    loading: isToken && detail.chartLoading,
    reference: hasReference ? reference : Number.NaN,
    referenceText: hasReference ? (options.referenceText || `Bought at ${label(reference)}`) : "",
    formatAxis: (value) => priceMode === "TON" ? label(value) : tokenChartAxisLabel(value),
    formatTick: (point) => point.timestamp ? tokenChartRangeLabel(point.timestamp, true) : "",
    formatDate: (point) => new Date(point.timestamp).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
    }),
    formatValue: (point) => `Price: ${label(point.value)}${priceMode === "USD" && isToken ? " USD" : ""}`,
  });
  if (result?.loading) {
    setText(tooltipSelector, "Loading chart...");
    return;
  }
  if (result?.empty) {
    const value = Number(detail.floorUsd || detail.priceUsd || 0);
    setText(tooltipSelector, options.emptyTooltip || `Latest: ${value > 0 ? label(value) : "â€”"}`);
    return;
  }
  const latest = values.at(-1);
  setText(tooltipSelector, `Latest: ${label(latest)}`);
  if (isToken) renderTokenChartMetrics(detail, values);
}

function renderWalletState() {
  const portfolioConnected = walletConnected || telegramConnected;
  document.querySelector(".app-frame")?.classList.toggle("has-wallet", portfolioConnected);
  const portfolioSourceLabel = document.getElementById("portfolioSourceLabel");
  if (portfolioSourceLabel) {
    portfolioSourceLabel.textContent = telegramConnected && walletConnected
      ? "Telegram + TON"
      : telegramConnected ? "Telegram" : walletConnected ? "TON wallet" : "Connected assets";
  }
  walletButtons.forEach((button) => {
    const textNode = button.querySelector("span");
    const label = telegramConnected && !walletConnected
      ? "Add wallet"
      : (portfolioConnected ? "Connected" : (button.dataset.walletLabel || "Connect"));
    if (textNode) textNode.textContent = label;
    else button.textContent = label;
    button.classList.toggle("is-connected", portfolioConnected);
  });
  homeWalletCard?.classList.toggle("is-connected", portfolioConnected);
  if (homeWalletTitle) homeWalletTitle.textContent = telegramConnected && !liveWalletAddress ? "Telegram connected" : (walletConnected ? "TON wallet connected" : "TON wallet not connected");
  if (homeWalletTitle && telegramConnected && walletConnected) homeWalletTitle.textContent = "Telegram + TON wallet connected";
  if (homeWalletText) homeWalletText.textContent = telegramConnected && !liveWalletAddress
    ? `${telegramProfile?.firstName || "Telegram"}â€™s gifts and stickers are included.`
    : (walletConnected ? `${currentWalletLabel()} included in portfolio.` : "Connect wallet to include TON balances.");
  if (homeWalletButton) homeWalletButton.textContent = portfolioConnected ? "Connected" : "Connect";
  if (homeWalletText && telegramConnected && walletConnected) homeWalletText.textContent = "Telegram assets and TON wallet assets are included together.";
  if (homeWalletButton && telegramConnected && !walletConnected) homeWalletButton.textContent = "Add wallet";
}

function openWalletSheet() {
  const sheet = document.getElementById("walletSheet");
  if (!sheet) return;
  sheet.classList.add("is-open");
  sheet.setAttribute("aria-hidden", "false");
  window.lucide?.createIcons();
}

function showConnectionRoute(route = "choice") {
  document.querySelectorAll("[data-connection-view]").forEach((view) => {
    view.hidden = view.dataset.connectionView !== route;
  });
  const title = document.getElementById("walletSheetTitle");
  const back = document.querySelector(".wallet-sheet-back");
  if (title) title.textContent = route === "telegram" ? "Connect Telegram" : route === "ton" ? "Connect TON wallet" : "Add to TonTrack";
  if (back) back.hidden = route === "choice";
  window.lucide?.createIcons();
}

function closeWalletSheet() {
  const sheet = document.getElementById("walletSheet");
  if (!sheet) return;
  sheet.classList.remove("is-open");
  sheet.setAttribute("aria-hidden", "true");
  showConnectionRoute("choice");
}

function setTelegramLoginStatus(message, error = false) {
  const status = document.getElementById("telegramLoginStatus");
  if (!status) return;
  status.textContent = message;
  status.style.color = error ? "#ff9188" : "";
}

function clearStaticPortfolioPreview() {
  walletConnected = false;
  telegramConnected = false;
  telegramProfile = null;
  telegramPortfolioValue = 0;
  telegramGiftGroups = [];
  telegramStickerGroups = [];
  walletGiftGroups = [];
  walletStickerGroups = [];
  activePortfolioSource = "none";
  liveWalletData = null;
  liveWalletAddress = "";
  lastTonConnectAddress = "";
  giftAssets.splice(0, giftAssets.length);
  stickerAssets.splice(0, stickerAssets.length);
  resetWalletBoundUi();
  renderCollectibleGrids();
}

function finishTelegramImportAtHome(importSessionId) {
  if (!isCurrentImportSession(importSessionId) || activePortfolioSource !== "telegram") return;
  // Telegram connection is an import action, never a Gifts navigation event.
  navigationStack.length = 0;
  forwardNavigationStack.length = 0;
  showScreen("home");
  window.scrollTo({ top: 0, behavior: "auto" });
}

async function importTelegramAccount() {
  if (telegramImportInFlight) return;
  const initData = telegramInitData();
  if (!initData) throw new Error("Open TonTrack from Telegram to connect your Telegram account.");
  telegramImportInFlight = true;
  const importSessionId = beginImportSession();
  // A Telegram account is an import source in its own right. Start from the
  // same clean state as a TON-wallet import so stale assets cannot flicker in
  // while its gift catalogue is being resolved.
  resetWalletSwitchState("");
  activePortfolioSource = "telegram";
  telegramConnected = false;
  telegramProfile = null;
  telegramPortfolioValue = 0;
  walletConnected = false;
  giftPricePrefetchKeys.clear();
  stickerPricePrefetchKeys.clear();
  setSectionLoading("tokens", "Telegram does not include TON wallet balances...");
  setSectionLoading("gifts", "Reading your Telegram gifts...");
  setSectionLoading("stickers", "Preparing Telegram collectibles...");
  setSectionLoading("activity", "Preparing recent activity...");
  if (isGraphHistoryLoadingEnabled()) setSectionLoading("graph", "Preparing graph preview...");
  else setSectionReady("graph", "Graph history paused for this session.", { toast: false });
  allocationState.tokens = 0;
  navigationStack.length = 0;
  forwardNavigationStack.length = 0;
  renderTokenLoadingState();
  updateCollectibleSummaryBanner("gifts");
  updateCollectibleSummaryBanner("stickers");
  syncAssetsSummary(null, []);
  updateAllocationUi();
  finishTelegramImportAtHome(importSessionId);
  setTelegramLoginStatus("Telegram verified. Reading your owned gifts...");
  setImportLoader(true, "Opening your Telegram vault", 18);
  pulseImportLoader(importSessionId, "Opening your Telegram vault", 18, 74, 7000);
  await nextPaint();
  try {
    const payload = await requestJson("/api/telegram/webapp/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData }),
    }, "Could not read your Telegram gifts");
    if (!isCurrentImportSession(importSessionId)) return;
    stopImportLoaderPulse();
    setImportLoader(true, "Putting your collection in place", 78);
    const importedCollectibles = payload.assets?.collectibles || payload.gifts || [];
    telegramGiftGroups = groupGiftAssets(importedCollectibles.map((item, index) => liveCollectibleAsset(item, "gift", `telegram-${index}`, { suppressMarket: true })));
    telegramStickerGroups = groupStickerAssets((payload.stickers || []).map((item, index) => liveCollectibleAsset(item, "sticker", `telegram-${index}`, { suppressMarket: true })));
    walletGiftGroups = [];
    walletStickerGroups = [];
    const { gifts, stickers } = rebuildPortfolioCollectibleGroups();
    telegramConnected = true;
    telegramProfile = payload.profile || null;
    // Telegram is a first-class portfolio source, but not a TON wallet. Keep
    // wallet-only refresh and totals pipelines from overwriting this session.
    walletConnected = false;
    liveWalletAddress = "";
    latestVisibleTokens = [];
    if (Number(payload.summary?.tonUsdRate) > 0) usdTonRate = Number(payload.summary.tonUsdRate);
    telegramPortfolioValue = Math.max(0, Number(payload.summary?.totalUsd || 0));
    liveWalletData = {
      account: payload.account || {
        displayAddress: telegramProfile?.username ? `@${telegramProfile.username}` : "Telegram",
        tonName: telegramProfile?.firstName || "Telegram account",
      },
      summary: {
        ...(payload.summary || {}),
        totalUsd: telegramPortfolioValue,
        tonUsdRate: Number(payload.summary?.tonUsdRate || usdTonRate),
        tokenCount: 0,
        giftCount: importedCollectibles.length,
        stickerCount: stickers.length,
        nftCount: importedCollectibles.length + stickers.length,
      },
      assets: { collectibles: [...importedCollectibles, ...(payload.stickers || [])] },
    };
    setCollectiblesBanner("gifts", gifts.length ? "" : "No Telegram gifts found for this account.");
    setCollectiblesBanner("stickers", stickers.length ? "" : "Connect a TON wallet to include your on-chain sticker NFTs.");
    setSectionReady("gifts", `Telegram gifts ready Â· ${gifts.length} collection${gifts.length === 1 ? "" : "s"} loaded`, { toast: false });
    setSectionReady("stickers", "Telegram connection ready Â· connect a TON wallet for on-chain sticker NFTs", { toast: false });
    setSectionReady("tokens", "Connect a TON wallet to load token balances", { toast: false });
    setSectionReady("activity", "Telegram collection imported", { toast: false });
    renderCollectibleGrids();
    renderTokenEmptyState("Connect a TON wallet to load tokens");
    preloadGiftStaticImages(gifts);
    allocationUiLocked = false;
    // Telegram carries no TON balance. Compute the portfolio once from the
    // already hydrated Telegram response instead of running wallet totals.
    updateAllocationUi(true);
    syncAssetsSummary(liveWalletData, [], 0);
    updateWalletScreen(liveWalletData, 0);
    updateAnalyticsFromWallet(homePortfolioValue);
    resetPortfolioHeader();
    renderPortfolioGraph(activePortfolioRange(), true);
    renderWalletState();
    closeWalletSheet();
    finishTelegramImportAtHome(importSessionId);
    setImportLoader(true, "Your Telegram collection is ready", 100);
    setTimeout(() => {
      if (!isCurrentImportSession(importSessionId)) return;
      setSectionReady("graph", "Graph history starts with this import", { toast: false });
      setImportLoader(false);
      finishTelegramImportAtHome(importSessionId);
    }, 420);
  } catch (error) {
    stopImportLoaderPulse();
    setImportLoader(false);
    throw error;
  } finally {
    telegramImportInFlight = false;
  }
}

function currentWalletTonName() {
  return liveWalletData?.account?.tonName || "";
}

function currentWalletLabel() {
  return currentWalletTonName() || truncateWalletAddress(liveWalletData?.account?.address || liveWalletAddress);
}

function currentWalletExplorer(type = "tonviewer") {
  if (type === "tonscan") return liveWalletData?.account?.tonscanUrl || (liveWalletAddress ? `https://tonscan.org/address/${encodeURIComponent(liveWalletAddress)}` : "");
  return liveWalletData?.account?.tonviewerUrl || (liveWalletAddress ? `https://tonviewer.com/${encodeURIComponent(liveWalletAddress)}` : "");
}

function syncWalletActionSheet() {
  const title = document.getElementById("walletActionTitle");
  const address = document.getElementById("walletActionAddress");
  if (title) title.textContent = currentWalletLabel() || "Connected wallet";
  if (address) address.textContent = liveWalletData?.account?.address || liveWalletAddress || "No wallet connected";
}

function openWalletActionSheet() {
  const sheet = document.getElementById("walletActionSheet");
  if (!sheet) return;
  syncWalletActionSheet();
  sheet.classList.add("is-open");
  sheet.setAttribute("aria-hidden", "false");
  window.lucide?.createIcons();
}

function closeWalletActionSheet() {
  const sheet = document.getElementById("walletActionSheet");
  if (!sheet) return;
  sheet.classList.remove("is-open");
  sheet.setAttribute("aria-hidden", "true");
}

function openTokenSortSheet() {
  const sheet = document.getElementById("tokenSortSheet");
  if (!sheet) return;
  sheet.classList.add("is-open");
  sheet.setAttribute("aria-hidden", "false");
  document.querySelectorAll("[data-token-sort]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tokenSort === tokenSortMode);
  });
  window.lucide?.createIcons();
}

function closeTokenSortSheet() {
  const sheet = document.getElementById("tokenSortSheet");
  if (!sheet) return;
  sheet.classList.remove("is-open");
  sheet.setAttribute("aria-hidden", "true");
}

function setWalletImportStatus(message, isError = false) {
  const status = document.getElementById("walletImportStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("negative", isError);
}

function ensureSectionStatusUi() {
  const appFrame = document.querySelector(".app-frame");
  if (!appFrame) return {};
  let panel = document.getElementById("sectionStatusPanel");
  if (!panel) {
    panel = document.createElement("aside");
    panel.id = "sectionStatusPanel";
    panel.className = "section-status-panel";
    panel.setAttribute("aria-live", "polite");
    appFrame.appendChild(panel);
  }
  let toast = document.getElementById("sectionReadyToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "sectionReadyToast";
    toast.className = "section-ready-toast";
    toast.setAttribute("aria-live", "polite");
    appFrame.appendChild(toast);
  }
  return { panel, toast };
}

function renderSectionStatusUi() {
  const { panel } = ensureSectionStatusUi();
  if (!panel) return;
  panel.classList.remove("is-visible");
  panel.innerHTML = "";
}

function showSectionReadyToast(message) {
  const { toast } = ensureSectionStatusUi();
  if (!toast || !message) return;
  clearTimeout(sectionToastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  sectionToastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
}

function setSectionLoading(key, message) {
  if (!key) return;
  sectionLoadState.set(key, { status: "loading", message });
  renderSectionStatusUi();
  if (key === "gifts" || key === "stickers") {
    updateAllocationUi(true);
    updateCategoryAndTopAsset();
    updateAssetsPortfolioStrip();
    renderCollectibleGrids();
  }
}

function setSectionReady(key, message, options = {}) {
  if (!key) return;
  const previous = sectionLoadState.get(key);
  sectionLoadState.set(key, { status: "ready", message });
  renderSectionStatusUi();
  if (key === "gifts" || key === "stickers") {
    updateAllocationUi(true);
    updateCategoryAndTopAsset();
    updateAssetsPortfolioStrip();
    renderCollectibleGrids();
    if (typeof renderWalletCharts === "function") renderWalletCharts();
    updateAnalyticsFromWallet(homePortfolioValue);
  }
  if (options.toast !== false && previous?.status === "loading" && message) {
    showSectionReadyToast(message);
  }
}

function resetSectionLoadingState() {
  sectionLoadState.clear();
  renderSectionStatusUi();
  const toast = document.getElementById("sectionReadyToast");
  toast?.classList.remove("is-visible");
}

function isSectionLoading(key) {
  return sectionLoadState.get(key)?.status === "loading";
}

function walletImportUrl(address) {
  return `/api/wallet?address=${encodeURIComponent(address)}&t=${Date.now()}`;
}

function tunnelSafeHeaders(extra = {}) {
  const headers = {
    Accept: "application/json",
    ...extra,
  };
  const host = String(window.location.hostname || "").toLowerCase();
  if (host.endsWith("loca.lt")) headers["bypass-tunnel-reminder"] = "true";
  return headers;
}

async function parseJsonResponse(response, fallbackMessage = "Request failed") {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const raw = await response.text();
  if (contentType.includes("application/json")) {
    try {
      const payload = raw ? JSON.parse(raw) : {};
      if (!response.ok) throw new Error(payload?.error || `${fallbackMessage} (${response.status})`);
      return payload;
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error("Received invalid JSON from server.");
      throw error;
    }
  }
  if (/<!doctype|<html/i.test(raw)) {
    throw new Error("Tunnel returned an HTML page instead of API data. Refresh once or reopen the tunnel.");
  }
  if (!response.ok) throw new Error(`${fallbackMessage} (${response.status})`);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("Received an unexpected response from server.");
  }
}

async function requestJson(url, options = {}, fallbackMessage = "Request failed") {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: tunnelSafeHeaders(options.headers || {}),
  });
  return parseJsonResponse(response, fallbackMessage);
}

function telegramInitData() {
  return window.Telegram?.WebApp?.initData || "";
}

async function fetchWalletImport(address) {
  return requestJson(walletImportUrl(address), {}, "Wallet import failed");
}

function currentWalletTimestamp(data = liveWalletData) {
  const importedAt = new Date(data?.importedAt || Date.now()).getTime();
  return Number.isFinite(importedAt) ? importedAt : Date.now();
}

function setLastUpdatedLabel(dateValue = Date.now()) {
  const updated = document.getElementById("portfolioUpdatedAt");
  if (!updated) return;
  const date = new Date(dateValue);
  const month = date.toLocaleString("en-US", { month: "short" });
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  updated.textContent = `Last updated on ${month} ${date.getDate()}, ${time}`;
}

function isCurrentImportSession(sessionId) {
  return !sessionId || sessionId === activeImportSessionId;
}

function beginImportSession() {
  activeImportSessionId += 1;
  allocationUiLocked = true;
  return activeImportSessionId;
}

function walletStateKey(address = liveWalletAddress) {
  return String(address || "").trim().toLowerCase();
}

function isGraphHistoryLoadingEnabled() {
  return !graphHistoryLoadingPaused;
}

function setImportLoader(active, text = "Meeting your wallet", progress = 8) {
  const loader = document.getElementById("importLoader");
  const loaderText = document.getElementById("importLoaderText");
  const loaderNote = document.getElementById("importLoaderNote");
  const loaderStage = document.getElementById("importLoaderStage");
  const loaderPercent = document.getElementById("importLoaderPercent");
  const loaderBar = document.getElementById("importLoaderBar");
  if (!loader) return;
  loader.classList.toggle("is-active", active);
  loader.setAttribute("aria-hidden", active ? "false" : "true");
  const clamped = Math.max(0, Math.min(100, progress));
  const stage = [...IMPORT_LOADER_STAGES].reverse().find((entry) => clamped >= entry.min) || IMPORT_LOADER_STAGES[0];
  loader.dataset.phase = stage.key;
  loader.dataset.step = String(stage.step);
  loader.classList.toggle("is-complete", stage.key === "complete");
  if (!active) {
    loader.classList.remove("is-complete");
    loader.dataset.phase = "connect";
    loader.dataset.step = "1";
  }
  if (loaderText) loaderText.textContent = text;
  if (loaderNote) loaderNote.textContent = stage.note;
  if (loaderStage) loaderStage.textContent = `Step ${stage.step} of ${IMPORT_LOADER_STAGES.length}`;
  if (loaderPercent) loaderPercent.textContent = `${Math.round(clamped)}%`;
  if (loaderBar) loaderBar.style.width = `${clamped}%`;
}

function stopImportLoaderPulse() {
  if (!importLoaderPulseTimer) return;
  window.clearTimeout(importLoaderPulseTimer);
  importLoaderPulseTimer = 0;
}

function pulseImportLoader(importSessionId, text, start, ceiling, durationMs) {
  stopImportLoaderPulse();
  const startedAt = Date.now();
  const tick = () => {
    if (!isCurrentImportSession(importSessionId)) return;
    const elapsed = Date.now() - startedAt;
    const progress = start + ((ceiling - start) * (1 - Math.exp((-2.6 * elapsed) / durationMs)));
    setImportLoader(true, text, progress);
    importLoaderPulseTimer = window.setTimeout(tick, 140);
  };
  tick();
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function initTonConnect() {
  if (tonConnectUI) return tonConnectUI;
  const tonConnect = window.TON_CONNECT_UI;
  if (!tonConnect?.TonConnectUI) return null;
  tonConnectUI = new tonConnect.TonConnectUI({
    manifestUrl: `${window.location.origin}/tonconnect-manifest.json`,
    uiPreferences: {
      theme: tonConnect.THEME?.DARK || "DARK",
      borderRadius: "s",
    },
  });
  tonConnectUI.onStatusChange((wallet) => {
    const address = wallet?.account?.address;
    if (!address || address === lastTonConnectAddress) return;
    lastTonConnectAddress = address;
    setWalletImportStatus("Wallet connected. Fetching live portfolio...");
    importWallet(address, { combineTelegram: telegramConnected, background: telegramConnected }).catch((error) => {
      setWalletImportStatus(error.message || "Wallet connected, but portfolio import failed.", true);
      openWalletSheet();
    });
  });
  return tonConnectUI;
}

async function connectTonWallet() {
  const ui = initTonConnect();
  if (!ui) {
    setWalletImportStatus("TON Connect failed to load. Paste the wallet address manually.", true);
    document.getElementById("walletAddressInput")?.focus();
    return;
  }
  setWalletImportStatus("Opening TON wallet connection...");
  closeWalletSheet();
  if (typeof ui.openModal === "function") {
    await ui.openModal();
  } else {
    await ui.modal?.open?.();
  }
}

async function importWallet(address, options = {}) {
  const cleanAddress = address.trim();
  if (!cleanAddress) {
    setWalletImportStatus("Paste a TON wallet address first.", true);
    document.getElementById("walletAddressInput")?.focus();
    return;
  }
  setWalletImportStatus("Fetching wallet data...");
  const importSessionId = beginImportSession();
  const combineTelegram = Boolean(options.combineTelegram && telegramConnected);
  const background = Boolean(options.background && combineTelegram);
  resetWalletSwitchState(cleanAddress, { preserveTelegram: combineTelegram });
  activePortfolioSource = combineTelegram ? "combined" : "wallet";
  setSectionLoading("tokens", "Syncing token balances...");
  if (!combineTelegram) {
    setSectionLoading("gifts", "Scanning wallet gifts...");
    setSectionLoading("stickers", "Scanning sticker packs...");
  }
  setSectionLoading("activity", "Preparing recent activity...");
  if (isGraphHistoryLoadingEnabled()) setSectionLoading("graph", "Preparing graph preview...");
  else setSectionReady("graph", "Graph history paused for this session.", { toast: false });
  renderTokenLoadingState();
  renderTokenSummary([]);
  updateCollectibleSummaryBanner("gifts");
  updateCollectibleSummaryBanner("stickers");
  syncAssetsSummary(liveWalletData, []);
  updateAllocationUi();
  if (!background) {
    setImportLoader(true, "Meeting your wallet", 8);
    pulseImportLoader(importSessionId, "Meeting your wallet", 8, 38, 9000);
  }
  await nextPaint();
  try {
    const payload = await fetchWalletImport(cleanAddress);
    if (!isCurrentImportSession(importSessionId)) return;
    if (!background) {
      stopImportLoaderPulse();
      setImportLoader(true, "Your assets are checking in", 42);
    }
    liveWalletData = payload;
    liveWalletAddress = payload.account?.address || cleanAddress;
    activeHistoryWalletKey = walletStateKey(liveWalletAddress);
    if (Number(payload.summary?.tonUsdRate) > 0) usdTonRate = Number(payload.summary.tonUsdRate);
    homePortfolioValue = Number(payload.summary?.totalUsd || 0);
    try {
      localStorage.setItem("vaulton:lastWalletAddress", liveWalletAddress || cleanAddress);
    } catch {}
    liveHistoryByRange.clear();
    liveHistoryRequests.clear();
    loadingPortfolioRanges.clear();
    historyRangeState.clear();
    resetDetailWarmCaches();
    fullActivityEvents = [];
    activityPreloadAddress = "";
    activityInitialLoading = false;
    stopHistoryStatusPolling();
    document.querySelectorAll("[data-range]").forEach((button) => button.classList.remove("is-loading"));
    const initialHistory = Array.isArray(payload.history) && payload.history.length > 1 ? payload.history : [];
    if (initialHistory.length) setLiveHistoryRange("1D", initialHistory);
    applyHistoryStatus(payload.historyStatus || []);
    walletConnected = true;
    if (!background) {
      setImportLoader(true, "Putting every number in place", 68);
      pulseImportLoader(importSessionId, "Putting every number in place", 68, 88, 5000);
    }
    const homeReadyPromise = Promise.resolve(applyImportedWallet(payload, { importSessionId }));
    startActivityPreload(liveWalletAddress || cleanAddress);
    if (isGraphHistoryLoadingEnabled()) {
      setTimeout(() => {
        if (!isCurrentImportSession(importSessionId) || walletStateKey(liveWalletAddress) !== activeHistoryWalletKey || !isGraphHistoryLoadingEnabled()) return;
        preloadLiveHistoryRanges().catch((error) => console.warn("History preload failed", error));
        startHistoryStatusPolling();
      }, HOME_GRAPH_PRELOAD_DELAY_MS);
    } else {
      updateHistoryStatus("Graph history loading paused for this session");
      setSectionReady("graph", "Graph history paused for this session.", { toast: false });
    }
    renderWalletState();
    closeWalletSheet();
    await homeReadyPromise;
    if (!isCurrentImportSession(importSessionId)) return;
    if (!background) {
      stopImportLoaderPulse();
      setImportLoader(true, "Drawing the big picture", 92);
      setImportLoader(true, "Everything found its place", 100);
    }
    setTimeout(() => {
      if (!isCurrentImportSession(importSessionId)) return;
      allocationUiLocked = false;
      updateAllocationUi(true);
      syncAssetsSummary();
      updateAnalyticsFromWallet(homePortfolioValue);
      pinCachedHistoryToCurrent(liveWalletData);
      renderPortfolioGraph(activePortfolioRange(), true);
      resetPortfolioHeader();
      setLastUpdatedLabel(currentWalletTimestamp(liveWalletData));
      setSectionReady("graph", "Graph preview ready");
      if (!background) setImportLoader(false);
    }, 420);
  } catch (error) {
    if (isCurrentImportSession(importSessionId)) {
      allocationUiLocked = false;
      if (!background) {
        stopImportLoaderPulse();
        setImportLoader(false);
      }
    }
    throw error;
  }
}

async function refreshConnectedWallet() {
  if (!hasTonWalletPortfolio()) {
    renderPortfolioGraph(activePortfolioRange());
    return;
  }
  if (!liveWalletAddress) {
    renderPortfolioGraph(activePortfolioRange());
    return;
  }
  const refreshSessionId = beginImportSession();
  const refreshButton = document.querySelector(".refresh-button");
  refreshButton?.classList.add("is-loading");
  updateHistoryStatus("Refreshing wallet...");
  try {
    const payload = await fetchWalletImport(liveWalletAddress);
    if (!isCurrentImportSession(refreshSessionId)) return;
    liveWalletData = payload;
    liveWalletAddress = payload.account?.address || liveWalletAddress;
    activeHistoryWalletKey = walletStateKey(liveWalletAddress);
    if (Number(payload.summary?.tonUsdRate) > 0) usdTonRate = Number(payload.summary.tonUsdRate);
    homePortfolioValue = Number(payload.summary?.totalUsd || 0);
    applyHistoryStatus(payload.historyStatus || []);
    await Promise.resolve(applyImportedWallet(payload, { importSessionId: refreshSessionId }));
    if (!isCurrentImportSession(refreshSessionId)) return;
    allocationUiLocked = false;
    updateAllocationUi(true);
    syncAssetsSummary();
    updateAnalyticsFromWallet(homePortfolioValue);
    if (isGraphHistoryLoadingEnabled()) await refreshVisibleLiveHistory();
    pinCachedHistoryToCurrent(payload);
    renderPortfolioGraph(activePortfolioRange(), true);
    resetPortfolioHeader();
    setLastUpdatedLabel(currentWalletTimestamp(payload));
  } catch (error) {
    console.warn("Wallet refresh failed", error);
    updateHistoryStatus("Could not refresh wallet.");
  } finally {
    if (isCurrentImportSession(refreshSessionId)) allocationUiLocked = false;
    refreshButton?.classList.remove("is-loading");
  }
}

async function restoreSavedWallet() {
  let savedAddress = "";
  try {
    savedAddress = localStorage.getItem("vaulton:lastWalletAddress") || "";
  } catch {}
  if (!savedAddress || liveWalletData || activePortfolioSource === "telegram") return;
  updateHistoryStatus("Restoring connected wallet...");
  try {
    await importWallet(savedAddress);
  } catch (error) {
    renderWalletState();
    updateHistoryStatus("Connect wallet to load live portfolio.");
    console.warn("Saved wallet restore failed", error);
  }
}

function applyImportedWallet(data, options = {}) {
  if (!hasTonWalletPortfolio()) return Promise.resolve();
  if (Number(data.summary?.tonUsdRate) > 0) usdTonRate = Number(data.summary.tonUsdRate);
  const totalUsd = Number(data.summary?.totalUsd || 0);
  homePortfolioValue = totalUsd;
  homePortfolioDelta = 0;
  homePortfolioChange = "+0.00%";
  pinCachedHistoryToCurrent(data);
  updateDashboardFromWallet(data, totalUsd);
  updateAssetsFromWallet(data, totalUsd);
  updateWalletScreen(data, totalUsd);
  updateAnalyticsFromWallet(totalUsd);
  renderPortfolioGraph(liveHistoryByRange.has(activePortfolioRange()) ? activePortfolioRange() : "1D", true);
  resetPortfolioHeader();
  applyCurrencyDisplay();
  window.lucide?.createIcons();
  const tokensReady = Promise.resolve(updateTokensFromWallet(data, { importSessionId: options.importSessionId }));
  const collectiblesReady = updateCollectiblesFromWallet(data, { importSessionId: options.importSessionId }).then(() => {
    if (!isCurrentImportSession(options.importSessionId)) return;
    updateAllocationUi();
    syncAssetsSummary();
    updateAnalyticsFromWallet(homePortfolioValue);
    prefetchAllVisibleDetails();
  }).catch((error) => console.warn("Collectibles background update failed", error));
  return Promise.all([tokensReady, collectiblesReady]).then(() => {
    if (!isCurrentImportSession(options.importSessionId)) return;
    updateAllocationUi();
    syncAssetsSummary();
    updateAnalyticsFromWallet(homePortfolioValue);
    setTimeout(prefetchAllVisibleDetails, 1600);
  });
}

function resetActivityState() {
  fullActivityEvents = [];
  activityPreloadAddress = "";
  activityInitialLoading = false;
  activityBackgroundLoading = false;
  activitySearchTerm = "";
  clearTimeout(activitySearchTimer);
  const search = document.getElementById("activitySearch");
  if (search) search.value = "";
  if (document.querySelector('[data-screen="activity"]')) renderFullActivity([]);
}

function resetDetailWarmCaches() {
  giftDetailCache.clear();
  giftDetailRequests.clear();
  stickerDetailCache.clear();
  stickerDetailRequests.clear();
  detailWarmupQueue = Promise.resolve();
}

function resetWalletSwitchState(nextAddress = "", options = {}) {
  const preserveTelegram = Boolean(options.preserveTelegram && telegramConnected);
  stopHistoryStatusPolling();
  resetSectionLoadingState();
  liveWalletData = null;
  liveWalletAddress = nextAddress;
  activeHistoryWalletKey = walletStateKey(nextAddress);
  liveHistoryPoints = [];
  liveHistoryByRange.clear();
  liveHistoryRequests.clear();
  loadingPortfolioRanges.clear();
  historyRangeState.clear();
  resetDetailWarmCaches();
  resetActivityState();
  latestVisibleTokens = [];
  collectiblePayloadCache.clear();
  collectiblePayloadRequests.clear();
  walletGiftGroups = [];
  walletStickerGroups = [];
  if (!preserveTelegram) {
    telegramGiftGroups = [];
    telegramStickerGroups = [];
    giftAssets.splice(0, giftAssets.length);
    stickerAssets.splice(0, stickerAssets.length);
  } else {
    rebuildPortfolioCollectibleGroups();
  }
  selectedAllocation = null;
  allocationState.gifts = preserveTelegram ? collectibleTotals().gifts : 0;
  allocationState.tokens = 0;
  allocationState.stickers = preserveTelegram ? collectibleTotals().stickers : 0;
  document.querySelectorAll("[data-range]").forEach((button) => button.classList.remove("is-loading"));
  setCollectiblesBanner("gifts", preserveTelegram ? "" : (nextAddress ? "Loading wallet gifts..." : ""));
  setCollectiblesBanner("stickers", preserveTelegram ? "" : (nextAddress ? "Loading wallet stickers..." : ""));
  renderCollectibleGrids();
  if (!preserveTelegram) resetWalletBoundUi();
}

function resetPerformerCards() {
  const cards = document.querySelectorAll('[data-screen="home"] .performer-row article');
  cards.forEach((card, index) => {
    delete card.dataset.screenTarget;
    delete card.dataset.asset;
    const label = index === 0 ? "Top Performer" : "Worst Performer";
    card.innerHTML = `<small>${label}</small><span class="performer-asset-line"><em>TON</em><b>No wallet</b></span><strong>0.0%</strong>`;
  });
}

function resetWalletBoundUi() {
  homePortfolioValue = 0;
  homePortfolioDelta = 0;
  homePortfolioChange = "+0.00%";
  renderPortfolioGraph(activePortfolioRange(), true);
  resetPortfolioHeader();
  setLastUpdatedLabel(Date.now());
  document.querySelector(".donut-chart span")?.replaceChildren(compactMoney(0));
  const giftStrong = document.querySelector(".allocation-list article:nth-child(1) strong");
  if (giftStrong) giftStrong.textContent = money(0);
  const giftSmall = document.querySelector(".allocation-list article:nth-child(1) small");
  if (giftSmall) giftSmall.textContent = "0%";
  const tokenStrong = document.querySelector(".allocation-list article:nth-child(2) strong");
  if (tokenStrong) tokenStrong.textContent = money(0);
  const tokenSmall = document.querySelector(".allocation-list article:nth-child(2) small");
  if (tokenSmall) tokenSmall.textContent = "0%";
  const stickerStrong = document.querySelector(".allocation-list article:nth-child(3) strong");
  if (stickerStrong) stickerStrong.textContent = money(0);
  const stickerSmall = document.querySelector(".allocation-list article:nth-child(3) small");
  if (stickerSmall) stickerSmall.textContent = "0%";
  allocationState.gifts = 0;
  allocationState.tokens = 0;
  allocationState.stickers = 0;
  latestVisibleTokens = [];
  renderTokenEmptyState("Connect wallet to load tokens");
  resetPerformerCards();
  renderActivityRows([]);
  const assetsStrip = document.querySelector('[data-screen="assets"] .portfolio-strip');
  if (assetsStrip) assetsStrip.innerHTML = `<article><small>Total</small><b>${money(0)}</b></article><article><small>Items</small><b>0</b></article><article><small>Wallet</small><b>Not connected</b></article>`;
  const tokenCategory = document.querySelector('[data-screen="assets"] .category-stack article[data-screen-target="tokens"] strong');
  if (tokenCategory) tokenCategory.textContent = money(0);
  document.querySelectorAll('[data-screen="assets"] .category-stack article[data-screen-target] strong').forEach((value) => {
    value.textContent = money(0);
  });
  const topAsset = document.querySelector('[data-screen="assets"] .mini-detail-card');
  if (topAsset) {
    topAsset.innerHTML = `<div class="section-heading"><h2>Your collection</h2></div><article class="feature-asset"><span class="asset-icon gift-bg"><i data-lucide="sparkles"></i></span><div><b>Nothing imported yet</b><small>Connect Telegram or a TON wallet to begin.</small></div></article>`;
    delete topAsset.dataset.screenTarget;
    delete topAsset.dataset.asset;
  }
  const walletList = document.querySelector('[data-screen="wallets"] .holdings-list');
  if (walletList) walletList.innerHTML = `<article><span class="asset-icon token-bg"><i data-lucide="wallet"></i></span><div><b>No wallet connected</b><small>Connect or paste another wallet address.</small></div><aside><b>${money(0)}</b><small>Ready</small></aside></article>`;
  window.lucide?.createIcons();
}

async function disconnectWallet() {
  closeWalletActionSheet();
  stopHistoryStatusPolling();
  try {
    await tonConnectUI?.disconnect?.();
  } catch (error) {
    console.warn("TON Connect disconnect failed", error);
  }
  walletConnected = false;
  walletGiftGroups = [];
  walletStickerGroups = [];
  liveWalletData = null;
  liveWalletAddress = "";
  activeHistoryWalletKey = "";
  lastTonConnectAddress = "";
  liveHistoryPoints = [];
  liveHistoryByRange.clear();
  liveHistoryRequests.clear();
  loadingPortfolioRanges.clear();
  historyRangeState.clear();
  resetDetailWarmCaches();
  allocationUiLocked = false;
  selectedAllocation = null;
  try {
    localStorage.removeItem("vaulton:lastWalletAddress");
  } catch {}
  resetSectionLoadingState();
  resetActivityState();
  if (telegramConnected) {
    activePortfolioSource = "telegram";
    const { gifts, stickers } = rebuildPortfolioCollectibleGroups();
    allocationState.tokens = 0;
    telegramPortfolioValue = Math.max(0, collectibleTotals().gifts + collectibleTotals().stickers);
    homePortfolioValue = telegramPortfolioValue;
    liveWalletData = {
      account: { displayAddress: telegramProfile?.username ? `@${telegramProfile.username}` : "Telegram", tonName: telegramProfile?.firstName || "Telegram account" },
      summary: { totalUsd: telegramPortfolioValue, tokenCount: 0, giftCount: gifts.length, stickerCount: stickers.length, nftCount: gifts.length + stickers.length, tonUsdRate: usdTonRate },
      assets: { collectibles: [...groupedAssetChildren(telegramGiftGroups), ...groupedAssetChildren(telegramStickerGroups)] },
    };
    renderCollectibleGrids();
    updateAllocationUi(true);
    syncAssetsSummary(liveWalletData, [], 0);
    renderTokenEmptyState("Connect a TON wallet to load tokens");
  } else {
    resetWalletBoundUi();
  }
  renderWalletState();
  setWalletImportStatus("Wallet disconnected. Connect or paste another wallet.");
  openWalletSheet();
}

function normalizeWalletHistory(points = []) {
  return points
    .filter((point) => {
      const keep = Number.isFinite(Number(point.valueUsd));
      if (!keep) console.warn("Dropped invalid wallet history point", point);
      return keep;
    })
    .map((point) => ({
      timestamp: new Date(point.timestamp).getTime(),
      value: Number(point.valueUsd),
      label: point.timestamp,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function activePortfolioRange() { return document.querySelector("[data-range].is-active")?.dataset.range || Charts.definitions.portfolio.ranges[0]; }


function setHistoryRangeState(range, status, pointsCount = 0, source = "") {
  historyRangeState.set(range, { status, pointsCount, source });
  if (status === "failed" || (status === "ready" && liveHistoryByRange.has(range))) loadingPortfolioRanges.delete(range);
  else if (liveWalletData && status !== "failed") loadingPortfolioRanges.add(range);
  syncRangeLoadingButtons();
}

function applyHistoryStatus(statuses = []) {
  statuses.forEach((item) => setHistoryRangeState(item.range, item.status, item.pointsCount || 0, item.source || ""));
  historyRanges.forEach((range) => {
    if (!historyRangeState.has(range)) setHistoryRangeState(range, liveHistoryByRange.has(range) ? "ready" : "queued");
  });
}

function setLiveHistoryRange(range, points = [], options = {}) {
  let normalized = normalizeWalletHistory(points);
  if (!normalized.length) return [];
  const hasSuspiciousScale = homePortfolioValue > 0 && normalized.some((point) => point.value > homePortfolioValue * 20);
  if (hasSuspiciousScale) {
    console.warn(`Rejected suspicious ${range} history scale`, normalized);
    return [];
  }
  normalized[normalized.length - 1] = {
    ...normalized[normalized.length - 1],
    timestamp: currentWalletTimestamp(),
    value: homePortfolioValue,
  };
  liveHistoryByRange.set(range, normalized);
  const source = options.source || "api";
  const status = options.status || "ready";
  if (source !== "partial") loadingPortfolioRanges.delete(range);
  historyRangeState.set(range, { status, pointsCount: normalized.length, source });
  syncRangeLoadingButtons();
  if (activePortfolioRange() === range || !liveHistoryPoints.length) liveHistoryPoints = normalized;
  return normalized;
}

function hasFinalHistory(range) {
  const state = historyRangeState.get(range);
  return liveHistoryByRange.has(range) && state?.source !== "partial";
}

function pinCachedHistoryToCurrent(data = liveWalletData) {
  const timestamp = currentWalletTimestamp(data);
  liveHistoryByRange.forEach((points, range) => {
    if (!points?.length) return;
    points[points.length - 1] = { ...points[points.length - 1], timestamp, value: homePortfolioValue };
    liveHistoryByRange.set(range, points);
  });
  const active = activePortfolioRange();
  liveHistoryPoints = liveHistoryByRange.get(active) || liveHistoryByRange.get("1D") || [];
}

function updateHistoryStatus(message) {
  const updated = document.getElementById("portfolioUpdatedAt");
  if (updated) updated.textContent = message;
}

function setRangeLoading(range, loading) {
  if (loading) loadingPortfolioRanges.add(range);
  else loadingPortfolioRanges.delete(range);
  if (loading && !historyRangeState.has(range)) historyRangeState.set(range, { status: "queued", pointsCount: 0 });
  syncRangeLoadingButtons();
}

function syncRangeLoadingButtons() {
  document.querySelectorAll("[data-range]").forEach((button) => {
    button.classList.toggle("is-loading", isGraphHistoryLoadingEnabled() && loadingPortfolioRanges.has(button.dataset.range));
  });
}

async function refreshLiveHistory(range, { renderWhenDone = false, force = false } = {}) {
  if (!liveWalletAddress) return liveHistoryByRange.get(range) || [];
  if (!isGraphHistoryLoadingEnabled()) {
    setRangeLoading(range, false);
    return liveHistoryByRange.get(range) || [];
  }
  const requestWalletAddress = liveWalletAddress;
  const requestWalletKey = walletStateKey(requestWalletAddress);
  if (!force && hasFinalHistory(range)) {
    setRangeLoading(range, false);
    return liveHistoryByRange.get(range);
  }
  const requestKey = `${requestWalletKey}:${range}`;
  if (liveHistoryRequests.has(requestKey)) return liveHistoryRequests.get(requestKey);
  const request = (async () => {
    const payload = await requestJson(`/api/wallet/history?address=${encodeURIComponent(requestWalletAddress)}&range=${encodeURIComponent(range)}&t=${Date.now()}`, {}, `History ${range} request failed`);
    if (activeHistoryWalletKey !== requestWalletKey || walletStateKey(liveWalletAddress) !== requestWalletKey) return [];
    const partial = payload.status === "partial";
    const rows = Array.isArray(payload.points) ? payload.points : [];
    if (!rows.length && payload.status && payload.status !== "ready") {
      setHistoryRangeState(range, payload.status, 0, payload.source || "");
      return [];
    }
    const points = setLiveHistoryRange(range, rows, {
      status: partial ? "building" : "ready",
      source: partial ? "partial" : (payload.source || "api"),
    });
    setRangeLoading(range, partial);
    if (renderWhenDone && activePortfolioRange() === range && points.length) {
      renderPortfolioGraph(range, true);
      updateHistoryStatus(`${partial ? "Building" : "Reconstructed"} ${range} wallet history | ${points.length} points`);
    }
    return points;
  })().finally(() => {
    liveHistoryRequests.delete(requestKey);
  });
  liveHistoryRequests.set(requestKey, request);
  return request;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopHistoryStatusPolling() {
  if (historyStatusTimer) {
    clearTimeout(historyStatusTimer);
    historyStatusTimer = 0;
  }
}

async function pollHistoryStatus() {
  if (!liveWalletAddress) return;
  if (!isGraphHistoryLoadingEnabled()) return;
  const requestWalletAddress = liveWalletAddress;
  const requestWalletKey = walletStateKey(requestWalletAddress);
  try {
    const payload = await requestJson(`/api/wallet/history-status?address=${encodeURIComponent(requestWalletAddress)}&t=${Date.now()}`, {}, "History status failed");
    if (activeHistoryWalletKey !== requestWalletKey || walletStateKey(liveWalletAddress) !== requestWalletKey) return;
    applyHistoryStatus(payload.ranges || []);
    updateHistoryStatus(payload.isComplete
      ? `Wallet history ready | ${historyRanges.length}/${historyRanges.length} ranges loaded`
      : `Building wallet history live | ${payload.readyCount || 0}/${payload.total || historyRanges.length} ranges ready`);
    for (const item of payload.ranges || []) {
      if ((item.status === "ready" || item.status === "building") && !hasFinalHistory(item.range)) {
        refreshLiveHistory(item.range, { renderWhenDone: activePortfolioRange() === item.range, force: true }).catch(() => {});
      }
    }
    if (!payload.isComplete) {
      historyStatusTimer = setTimeout(pollHistoryStatus, 3500);
    }
  } catch (error) {
    console.warn("History status poll failed", error);
    historyStatusTimer = setTimeout(pollHistoryStatus, 6000);
  }
}

function startHistoryStatusPolling() {
  if (!isGraphHistoryLoadingEnabled()) return;
  stopHistoryStatusPolling();
  historyStatusTimer = setTimeout(pollHistoryStatus, 800);
}

async function preloadLiveHistoryRanges() {
  if (!isGraphHistoryLoadingEnabled()) return;
  const ranges = historyRanges.filter((range) => !hasFinalHistory(range));
  if (!ranges.length) {
    updateHistoryStatus(`Wallet history ready | ${historyRanges.length}/${historyRanges.length} ranges loaded`);
    return;
  }
  ranges.forEach((range) => setRangeLoading(range, true));
  updateHistoryStatus(`Loading wallet history | 0/${historyRanges.length} ranges ready`);
  await Promise.allSettled(ranges.map((range) => refreshLiveHistory(range, { renderWhenDone: activePortfolioRange() === range })));
  const active = activePortfolioRange();
  if (liveHistoryByRange.has(active)) {
    liveHistoryPoints = liveHistoryByRange.get(active);
    renderPortfolioGraph(active, false);
  }
  const ready = historyRanges.filter((range) => hasFinalHistory(range)).length;
  updateHistoryStatus(`Wallet history ${ready === historyRanges.length ? "ready" : "loading"} | ${ready}/${historyRanges.length} ranges ready`);
}

function switchPortfolioRange(range) {
  if (!liveWalletData) {
    renderPortfolioGraph(range, true);
    return;
  }
  const cached = liveHistoryByRange.get(range);
  if (cached?.length) {
    liveHistoryPoints = cached;
    setRangeLoading(range, false);
    renderPortfolioGraph(range, true);
    updateHistoryStatus(`Reconstructed ${range} wallet history | ${cached.length} points`);
    return;
  }
  document.querySelectorAll("[data-range]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.range === range);
  });
  if (!isGraphHistoryLoadingEnabled()) {
    setRangeLoading(range, false);
    updateHistoryStatus("Graph history loading paused for this session");
    renderPortfolioGraph(range, true);
    return;
  }
  setRangeLoading(range, true);
  updateHistoryStatus(`Loading ${range} wallet history...`);
  renderPortfolioGraph(range, true);
  refreshLiveHistory(range, { renderWhenDone: true }).catch(() => {
    if (activePortfolioRange() === range) updateHistoryStatus(`Could not update ${range} wallet history`);
  });
}

async function refreshVisibleLiveHistory() {
  const range = activePortfolioRange();
  try {
    await refreshLiveHistory(range, { renderWhenDone: true, force: true });
  } catch {}
}

function collectibleTotals() {
  const liveValue = (asset) => {
    if (walletConnected && asset?.isDemo) return 0;
    return Number(asset.floorUsd || asset.valueUsd || 0);
  };
  return {
    gifts: giftAssets.reduce((sum, asset) => sum + liveValue(asset), 0),
    stickers: stickerAssets.reduce((sum, asset) => sum + liveValue(asset), 0),
  };
}

function hasPendingCollectiblePrices(kind) {
  const assets = kind === "gifts" ? giftAssets : stickerAssets;
  return assets.some((asset) => asset.priceLoading || (asset.children || []).some((child) => child.priceLoading));
}

function updateAllocationUi(force = false) {
  const totals = collectibleTotals();
  allocationState.gifts = totals.gifts;
  allocationState.stickers = totals.stickers;
  const total = Math.max(0, allocationState.gifts + allocationState.tokens + allocationState.stickers);
  if (walletConnected || telegramConnected) {
    homePortfolioValue = total;
    if (liveWalletData?.summary) liveWalletData.summary.totalUsd = total;
  }
  if (allocationUiLocked && !force) return total;
  const safeTotal = Math.max(1, total);
  document.querySelector(".donut-chart span")?.replaceChildren(compactMoney(total));
  [
    [1, allocationState.gifts],
    [2, allocationState.tokens],
    [3, allocationState.stickers],
  ].forEach(([index, value]) => {
    const strong = document.querySelector(`.allocation-list article:nth-child(${index}) strong`);
    const small = document.querySelector(`.allocation-list article:nth-child(${index}) small`);
    const key = index === 1 ? "gifts" : index === 2 ? "tokens" : "stickers";
    if (isSectionLoading(key) || (["gifts", "stickers"].includes(key) && value <= 0 && hasPendingCollectiblePrices(key))) {
      if (strong) strong.innerHTML = `<span class="metric-skeleton"></span>`;
      if (small) small.innerHTML = `<span class="metric-skeleton metric-skeleton-small"></span>`;
      return;
    }
    if (strong) strong.textContent = compactMoney(value);
    if (small) small.textContent = `${Math.round((value / safeTotal) * 100)}%`;
  });
  renderDonut();
  return total;
}

function updateCategoryAndTopAsset(tokenValue = allocationState.tokens) {
  const totals = collectibleTotals();
  const giftCategory = document.querySelector('[data-screen="assets"] .category-stack article[data-screen-target="gifts"] strong');
  const stickerCategory = document.querySelector('[data-screen="assets"] .category-stack article[data-screen-target="stickers"] strong');
  const giftCount = giftAssets.reduce((sum, asset) => sum + Number(asset.count || 1), 0);
  const stickerCount = stickerAssets.reduce((sum, asset) => sum + stickerOwnedCount(asset), 0);
  if (giftCategory) {
    if (totals.gifts <= 0 && giftCount > 0) giftCategory.textContent = `${giftCount} gift${giftCount === 1 ? "" : "s"}`;
    else if (isSectionLoading("gifts") || (totals.gifts <= 0 && hasPendingCollectiblePrices("gifts"))) giftCategory.innerHTML = `<span class="metric-skeleton"></span>`;
    else giftCategory.textContent = money(totals.gifts);
  }
  if (stickerCategory) {
    if (totals.stickers <= 0 && stickerCount > 0) stickerCategory.textContent = `${stickerCount} sticker${stickerCount === 1 ? "" : "s"}`;
    else if (isSectionLoading("stickers") || (totals.stickers <= 0 && hasPendingCollectiblePrices("stickers"))) stickerCategory.innerHTML = `<span class="metric-skeleton"></span>`;
    else stickerCategory.textContent = money(totals.stickers);
  }
  const candidates = [
    ...latestVisibleTokens.map((token) => ({ id: token.id, name: token.name, category: "TON Token", value: Number(token.valueUsd || 0), icon: token.image, symbol: token.symbol })),
    ...giftAssets.map((asset) => ({ id: asset.id, name: asset.name, category: "Gift", value: Number(asset.floorUsd || 0), icon: asset.image, symbol: "GFT" })),
    ...stickerAssets.map((asset) => ({ id: asset.id, name: asset.name, category: "Sticker", value: Number(asset.floorUsd || 0), icon: asset.image, symbol: "STK" })),
  ].filter((asset) => asset.value > 0).sort((a, b) => b.value - a.value);
  const top = candidates[0];
  const card = document.querySelector('[data-screen="assets"] .mini-detail-card');
  if (card && top) {
    card.dataset.asset = top.id;
    const isToken = top.category === "TON Token";
    const logo = top.icon
      ? `<span class="asset-icon ${isToken ? "token-bg" : top.category === "Gift" ? "gift-bg" : "sticker-bg"}"><img src="${escapeHtml(resolveTokenImage(top.icon))}" alt="${escapeHtml(top.symbol || top.name)}" onerror="this.parentElement.textContent='${escapeHtml((top.symbol || top.category).slice(0,3))}'"></span>`
      : `<span class="asset-icon ${isToken ? "token-bg" : top.category === "Gift" ? "gift-bg" : "sticker-bg"}">${escapeHtml((top.symbol || top.category).slice(0,3))}</span>`;
    const row = card.querySelector(".feature-asset");
    if (row) row.innerHTML = `${logo}<div><b>${escapeHtml(top.name)}</b><small>${escapeHtml(top.category)}</small></div><strong>${money(top.value)}</strong>`;
  }
}

function updateDashboardFromWallet(data, tonUsd) {
  const updated = document.getElementById("portfolioUpdatedAt");
  if (updated) updated.textContent = liveHistoryPoints.length > 1
    ? `Reconstructed wallet history | ${liveHistoryPoints.length} points`
    : `Live wallet imported | history starts now`;
  allocationState.tokens = Number(tonUsd || 0);
  updateAllocationUi();
  const importedActivity = Array.isArray(data.activity) ? data.activity : [];
  renderActivityRows(importedActivity.length ? importedActivity : fullActivityEvents, HOME_ACTIVITY_LIMIT);
}

function updateAssetsFromWallet(data, tonUsd) {
  syncAssetsSummary(data, latestVisibleTokens, tonUsd);
}

function truncateWalletAddress(address = "") {
  const text = String(address || "");
  return text.length > 10 ? `${text.slice(0, 4)}...${text.slice(-4)}` : text || "Connected";
}

function isTonAddressLike(value = "") {
  return /^(?:UQ|EQ)[A-Za-z0-9_-]{40,}$/.test(String(value).trim());
}

const ASSETS_DOT_GLYPHS = {
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "$": ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  ",": ["0", "0", "0", "0", "0", "1", "1"],
  ".": ["0", "0", "0", "0", "0", "0", "1"],
  "-": ["000", "000", "000", "111", "000", "000", "000"],
  " ": ["00", "00", "00", "00", "00", "00", "00"],
};

function renderDotMatrixText(element, value, variant = "display") {
  if (!element || element.querySelector(".metric-skeleton")) return;
  const text = String(value || "").toUpperCase();
  if (!text || element.dataset.dotText === text) return;
  element.dataset.dotText = text;
  element.setAttribute("aria-label", text);
  element.classList.add("dot-matrix-text", `dot-matrix-${variant}`);
  element.innerHTML = [...text].map((character) => {
    const rows = ASSETS_DOT_GLYPHS[character] || ASSETS_DOT_GLYPHS[" "];
    const columns = rows[0].length;
    const dots = rows.join("").split("").map((dot) => `<i class="dot-matrix-led${dot === "1" ? " is-on" : ""}"></i>`).join("");
    return `<span class="dot-matrix-character" style="--dot-columns:${columns}" aria-hidden="true">${dots}</span>`;
  }).join("");
}

function renderAssetsDotMatrix() {
  renderDotMatrixText(document.querySelector('[data-screen="assets"] .assets-header h1'), "ASSETS", "title");
  const portfolioValue = document.querySelector('[data-screen="assets"] .portfolio-strip article:first-child b');
  if (portfolioValue && !portfolioValue.querySelector(".metric-skeleton")) {
    renderDotMatrixText(portfolioValue, portfolioValue.textContent.trim(), "value");
  }
}
function syncAssetsSummary(data = liveWalletData, tokens = latestVisibleTokens, fallbackUsd = homePortfolioValue) {
  const strip = document.querySelector('[data-screen="assets"] .portfolio-strip');
  // A Telegram-only session has no TON balances. Do not reuse the combined
  // portfolio total as a token value just because its token list is empty.
  const tokenValue = tokens.length
    ? tokens.reduce((sum, token) => sum + Number(token.valueUsd || 0), 0)
    : (telegramConnected && !liveWalletAddress ? 0 : Number(fallbackUsd || 0));
  const tokenCount = tokens.length || Number(data?.summary?.tokenCount || 0);
  const readyGiftCount = giftAssets.length;
  const readyStickerCount = stickerAssets.length;
  const address = truncateWalletAddress(data?.account?.displayAddress || liveWalletAddress);
  if (strip) {
    const totals = collectibleTotals();
    const knownTotal = tokenValue + totals.gifts + totals.stickers;
    const totalHtml = isSectionLoading("tokens") && !tokens.length
      ? `<span class="metric-skeleton"></span>`
      : money(knownTotal);
    const itemsHtml = isSectionLoading("tokens") && !tokens.length
      ? `<span class="metric-skeleton metric-skeleton-small"></span>`
      : `${tokenCount + readyGiftCount + readyStickerCount}`;
    const portfolioChange = String(homePortfolioChange || "+0.00%");
    const portfolioChangeClass = portfolioChange.trim().startsWith("-") ? "negative" : "positive";
    strip.innerHTML = `<article><small>Portfolio value</small><b>${totalHtml}</b><strong class="${portfolioChangeClass}">${escapeHtml(portfolioChange)} <em>24H</em></strong></article><article><small>Total assets</small><b>${itemsHtml}</b><span>Items</span></article><article><small>Wallet</small><b>${escapeHtml(address)}</b></article><article><small>View</small><b class="assets-view-arrow">-&gt;</b></article>`;
    renderAssetsDotMatrix();
  }
  const tokenCategory = document.querySelector('[data-screen="assets"] .category-stack article[data-screen-target="tokens"] strong');
  if (tokenCategory) {
    if (isSectionLoading("tokens")) tokenCategory.innerHTML = `<span class="metric-skeleton"></span>`;
    else tokenCategory.textContent = money(tokenValue);
  }
  updateCategoryAndTopAsset(tokenValue);
}

function updateAssetsPortfolioStrip() {
  syncAssetsSummary(liveWalletData, latestVisibleTokens, allocationState.tokens || homePortfolioValue);
}

function updateAnalyticsFromWallet(totalUsd) {
  const analyticsValue = document.querySelector('[data-screen="analytics"] .graph-head h1');
  if (analyticsValue) analyticsValue.textContent = money(totalUsd);
  const rows = document.querySelectorAll('[data-screen="analytics"] .insight-grid article');
  const performers = [
    ...latestVisibleTokens.map((token) => ({ name: token.name, change: Number(token.change24h || 0), pnl: 0 })),
    ...giftAssets.map((asset) => ({ name: asset.name, change: Number(asset.dailyPct || 0), pnl: Number(asset.pnlUsd || 0) })),
    ...stickerAssets.map((asset) => ({ name: asset.name, change: Number(asset.dailyPct || 0), pnl: Number(asset.pnlUsd || 0) })),
  ];
  const valid = performers.filter((item) => Number.isFinite(item.change));
  const best = valid.reduce((a, b) => (b.change > a.change ? b : a), valid[0] || { name: "â€”", change: 0 });
  const worst = valid.reduce((a, b) => (b.change < a.change ? b : a), valid[0] || { name: "â€”", change: 0 });
  const pnl = performers.reduce((sum, item) => sum + Number(item.pnl || 0), tokenAggregatePnl(latestVisibleTokens).delta || 0);
  if (rows[0]) rows[0].innerHTML = `<small>Best performer</small><b>${escapeHtml(best.name)}</b><strong class="positive">${signedPct(best.change)}</strong>`;
  if (rows[1]) rows[1].innerHTML = `<small>Worst performer</small><b>${escapeHtml(worst.name)}</b><strong class="negative">${signedPct(worst.change)}</strong>`;
  if (rows[2]) rows[2].innerHTML = `<small>Unrealized P/L</small><b>${signedMoney(pnl)}</b><strong class="${pnl < 0 ? "negative" : "positive"}">${totalUsd ? signedPct((pnl / totalUsd) * 100) : "+0.0%"}</strong>`;
  if (rows[3]) rows[3].querySelector("b").textContent = String(liveHistoryPoints.length || 0);
  renderAnalyticsChart();
}

function resolveTokenImage(url) {
  if (!url) return "";
  const value = String(url);
  if (value.includes("ton.org/download/ton_symbol.png")) return TON_LOGO_URL;
  return value.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${value.slice(7)}` : value;
}

function resolveAnimationMediaUrl(url) {
  return resolveTokenImage(url);
}

async function fetchJson(url) {
  return requestJson(url, {}, "Request failed");
}

function settledValue(result, fallback = null) {
  if (result?.status === "fulfilled") return result.value;
  if (result?.reason) console.warn("Token data source failed", result.reason);
  return fallback;
}


function parsePct(value) {
  const cleaned = String(value ?? "").replace("âˆ’", "-").replace("%", "").trim();
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : NaN;
}














function cleanTokenWord(value = "") {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isNativeTonImpostor(token = {}) {
  if (token.id === "toncoin" || token.category === "Native TON") return false;
  const symbol = cleanTokenWord(token.symbol);
  const name = cleanTokenWord(token.name);
  return ["TON", "TONS", "TONCOIN"].includes(symbol) || ["TON", "TONS", "TONCOIN"].includes(name);
}

function isGenericJettonPlaceholder(token = {}) {
  return /^unknown jetton$/i.test(String(token.name || "").trim()) || /^jetton$/i.test(String(token.symbol || "").trim());
}

function isDisplayableToken(token = {}) {
  if (token.category === "Native TON" || token.symbol === "TON") {
    return Number(token.balance || 0) > 0 && !isNativeTonImpostor(token);
  }
  const balance = Number(token.balance || 0);
  const priceUsd = Number(token.priceUsd || 0);
  const valueUsd = Number(token.valueUsd || 0);
  const verification = String(token.verification || "").toLowerCase();
  if (!(balance > 0) || isNativeTonImpostor(token) || isGenericJettonPlaceholder(token)) return false;
  if (String(token.qualityStatus || "").toLowerCase() === "blocked") return false;
  if (/ignored unverified/i.test(String(token.rateWarning || ""))) return false;
  if (priceUsd > 0) return Number.isFinite(valueUsd) && valueUsd >= 0.1;
  if (verification === "whitelist") return true;
  return false;
}

function tokenRowSort(a, b) {
  if (a.symbol === "TON") return -1;
  if (b.symbol === "TON") return 1;
  const stableRank = (token) => ["USDT", "USDâ‚®", "JUSDT", "USDC", "JUSDC"].includes(String(token.symbol || "").toUpperCase()) ? 0 : 1;
  const rankDiff = stableRank(a) - stableRank(b);
  if (rankDiff) return rankDiff;
  const pricedRank = (token) => Number(token.priceUsd || 0) > 0 ? 0 : 1;
  const priceDiff = pricedRank(a) - pricedRank(b);
  if (priceDiff) return priceDiff;
  if (tokenSortMode === "name") return String(a.name || a.symbol).localeCompare(String(b.name || b.symbol));
  if (tokenSortMode === "change") return (Number(b.change24h) || 0) - (Number(a.change24h) || 0);
  return b.valueUsd - a.valueUsd;
}

function tokenAggregatePnl(tokens) {
  const current = tokens.reduce((sum, token) => sum + token.valueUsd, 0);
  const previous = tokens.reduce((sum, token) => {
    const change = Number(token.change24h);
    if (!Number.isFinite(change) || change <= -99.9) return sum + token.valueUsd;
    return sum + token.valueUsd / (1 + change / 100);
  }, 0);
  const delta = current - previous;
  return {
    delta,
    pct: previous > 0 ? (delta / previous) * 100 : 0,
  };
}

function renderTokenSummary(tokens) {
  const summary = document.querySelector('[data-screen="tokens"] .summary-card');
  if (!summary) return;
  if (isSectionLoading("tokens") && !tokens.length) {
    summary.style.position = "relative";
    summary.innerHTML = `
      <div class="token-summary-top">
        <small>Total tokens value</small>
        <button class="icon-button" type="button" data-token-refresh aria-label="Refresh tokens"><i data-lucide="refresh-cw"></i></button>
      </div>
      <h2><span class="metric-skeleton metric-skeleton-large"></span></h2>
      <p class="token-summary-meta"><span class="metric-skeleton metric-skeleton-line"></span></p>
    `;
    return;
  }
  const total = tokens.reduce((sum, token) => sum + token.valueUsd, 0);
  const pnl = tokenAggregatePnl(tokens);
  const tone = pnl.delta < 0 ? "negative" : "positive";
  summary.style.position = "relative";
  summary.innerHTML = `
    <div class="token-summary-top">
      <small>Total tokens value</small>
      <button class="icon-button" type="button" data-token-refresh aria-label="Refresh tokens"><i data-lucide="refresh-cw"></i></button>
    </div>
    <h2>${money(total)}</h2>
    <p class="token-summary-meta ${tone}">${signedMoney(pnl.delta)} Â· ${signedPct(pnl.pct)} Â· ${tokens.length} token${tokens.length === 1 ? "" : "s"}</p>
  `;
}

function renderTokenRows(tokens) {
  const list = document.querySelector('[data-screen="tokens"] .holdings-list');
  if (!list) return;
  const sortedTokens = [...tokens].sort(tokenRowSort);
  latestVisibleTokens = sortedTokens;
  allocationState.tokens = sortedTokens.reduce((sum, token) => sum + Number(token.valueUsd || 0), 0);
  renderTokenSummary(sortedTokens);
  sortedTokens.forEach((token) => {
    tokenDetails[token.id] = {
      id: token.id,
      type: "token",
      name: token.name,
      symbol: token.symbol,
      address: token.address,
      image: token.image,
      category: token.category,
      value: `${money(token.valueUsd)} Â· ${Number.isFinite(token.change24h) ? signedPct(token.change24h) : "24h n/a"}`,
      icon: "circle-dollar-sign",
      tone: "token-bg",
      balance: token.balance,
      decimals: token.decimals,
      priceUsd: token.priceUsd,
      valueUsd: token.valueUsd,
      change24h: token.change24h,
      statOneLabel: "Balance",
      statOne: tokenBalanceLabel(token),
      statTwoLabel: "Price",
      statTwo: tokenPriceLabel(token.priceUsd),
      statThreeLabel: "Value",
      statThree: money(token.valueUsd),
      pnl: Number.isFinite(token.change24h) ? signedPct(token.change24h) : "0.00%",
      history: "Imported from connected TON wallet",
      link: "Explorer",
      chart: [token.valueUsd * 0.94, token.valueUsd * 0.98, token.valueUsd * 0.96, token.valueUsd],
    };
    assetDetails[token.id] = tokenDetails[token.id];
  });
  list.innerHTML = sortedTokens.map((token) => {
    const changeClass = Number(token.change24h) < 0 ? "negative" : Number(token.change24h) > 0 ? "positive" : "";
    const hasPrice = Number(token.priceUsd || 0) > 0;
    const changeText = Number.isFinite(token.change24h) && hasPrice ? signedPct(token.change24h) : "â€”";
    const valueLabel = Number(token.valueUsd || 0) > 0 ? money(token.valueUsd) : "â€”";
    return `<article data-screen-target="detail" data-asset="${escapeHtml(token.id)}">${renderTokenLogo(token)}<div><b>${escapeHtml(token.name)}</b><small class="token-price-line"><span>${tokenPriceLabel(token.priceUsd)}</span><span class="${changeClass}">${changeText}</span></small></div><aside><b>${valueLabel}</b><small>${escapeHtml(tokenBalanceLabel(token))}</small></aside></article>`;
  }).join("");
  syncPortfolioFromDisplayedTokens(sortedTokens);
  syncAssetsSummary(liveWalletData, sortedTokens);
  updateAllocationUi();
  updateHomeTokenWidgets(sortedTokens);
  prefetchVisibleTokenDetails(sortedTokens);
  window.lucide?.createIcons();
}

function updateHomeTokenWidgets(tokens = latestVisibleTokens) {
  const validTokens = [...tokens].filter((token) => Number.isFinite(Number(token.change24h)));
  const top = validTokens.length ? validTokens.reduce((best, token) => Number(token.change24h) > Number(best.change24h) ? token : best, validTokens[0]) : tokens[0];
  const worst = validTokens.length ? validTokens.reduce((low, token) => Number(token.change24h) < Number(low.change24h) ? token : low, validTokens[0]) : tokens[0];
  const cards = document.querySelectorAll('[data-screen="home"] .performer-row article');
  const apply = (card, token, label) => {
    if (!card || !token) return;
    const change = Number(token.change24h);
    const tone = change < 0 ? "negative" : "positive";
    const symbol = escapeHtml((token.symbol || "?").slice(0, 3).toUpperCase());
    const image = resolveTokenImage(token.image);
    card.dataset.screenTarget = "detail";
    card.dataset.asset = token.id;
    card.innerHTML = `<small>${label}</small><span class="performer-asset-line">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(token.symbol || token.name)}" onerror="this.replaceWith(document.createTextNode('${symbol}'));">` : `<em>${symbol}</em>`}<b>${escapeHtml(token.name || token.symbol || "TON Token")}</b></span><strong class="${tone}">${Number.isFinite(change) ? signedPct(change) : "0.0%"}</strong>`;
  };
  apply(cards[0], top, "Top Performer");
  apply(cards[1], worst, "Worst Performer");
}

function renderTokenLogo(token) {
  const symbol = escapeHtml((token.symbol || "?").slice(0, 3).toUpperCase());
  const image = resolveTokenImage(token.image);
  if (!image) return `<span class="asset-icon token-bg" style="border-radius:50%;">${symbol}</span>`;
  return `<span class="asset-icon token-bg" style="border-radius:50%;overflow:hidden;"><img src="${escapeHtml(image)}" alt="${escapeHtml(token.symbol)}" data-fallback="${symbol}" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:50%;" onerror="this.parentElement.textContent=this.dataset.fallback;"></span>`;
}

function importedWalletTokenFallbacks(data = liveWalletData, tonPriceUsd = usdTonRate) {
  const tokens = [];
  const tonBalance = Number(data?.assets?.ton?.balance ?? data?.summary?.tonBalance ?? 0);
  if (tonBalance > 0) {
    tokens.push({
      id: "toncoin",
      name: "Toncoin",
      symbol: "TON",
      balance: tonBalance,
      priceUsd: tonPriceUsd,
      valueUsd: tonBalance * tonPriceUsd,
      change24h: NaN,
      image: TON_LOGO_URL,
      category: "Native TON",
      marketTrusted: true,
    });
  }
  (data?.assets?.jettons || []).forEach((jetton, index) => {
    const balance = Number(jetton.balance || 0);
    const priceUsd = Number(jetton.priceUsd || (balance ? Number(jetton.valueUsd || 0) / balance : 0));
    tokens.push({
      id: `live-jetton-${index}`,
      address: jetton.address,
      name: jetton.name || jetton.symbol || `Jetton ${index + 1}`,
      symbol: jetton.symbol || `JET${index + 1}`,
      balance,
      priceUsd,
      valueUsd: Number(jetton.valueUsd || balance * priceUsd),
      change24h: parsePct(jetton.diff24h),
      image: jetton.image,
      category: "TON Jetton",
      source: "imported",
      verification: jetton.verification || "none",
      rateWarning: jetton.rateWarning || "",
      qualityStatus: jetton.qualityStatus || "allowed",
      qualityReason: jetton.qualityReason || "",
      priceSource: jetton.priceSource || "",
      marketTrusted: String(jetton.verification || "").toLowerCase() === "whitelist",
    });
  });
  return tokens;
}

function syncPortfolioFromDisplayedTokens(tokens = latestVisibleTokens) {
  if (!hasTonWalletPortfolio() || !walletConnected || !tokens.length) return;
  const total = tokens.reduce((sum, token) => sum + Number(token.valueUsd || 0), 0);
  allocationState.tokens = total;
  if (liveWalletData?.summary) {
    liveWalletData.summary.jettonsValueUsd = Math.max(0, total - Number(liveWalletData.summary.tonValueUsd || 0));
    liveWalletData.summary.tokenCount = tokens.length;
  }
  updateAllocationUi();
  pinCachedHistoryToCurrent(liveWalletData);
  updateDashboardFromWallet(liveWalletData || {}, total);
  updateAssetsFromWallet(liveWalletData || {}, homePortfolioValue);
  updateAnalyticsFromWallet(homePortfolioValue);
  if (!allocationUiLocked) {
    renderPortfolioGraph(activePortfolioRange(), false);
    resetPortfolioHeader();
  }
}

function renderTokenLoadingState() {
  const list = document.querySelector('[data-screen="tokens"] .holdings-list');
  if (!list) return;
  list.innerHTML = Array.from({ length: 4 }, () => (
    `<article><span class="asset-icon token-bg skeleton"></span><div><b class="skeleton">&nbsp;</b><small class="skeleton">&nbsp;</small></div><aside><b class="skeleton">&nbsp;</b><small class="skeleton">&nbsp;</small></aside></article>`
  )).join("");
}

function renderTokenEmptyState(message = "No token balances above $0.10") {
  const list = document.querySelector('[data-screen="tokens"] .holdings-list');
  if (list) list.innerHTML = `<article><span class="asset-icon token-bg"><i data-lucide="coins"></i></span><div><b>${escapeHtml(message)}</b><small>Connect a wallet or try again later.</small></div><aside><b>${money(0)}</b><small></small></aside></article>`;
  renderTokenSummary([]);
  syncAssetsSummary(liveWalletData, []);
  updateHomeTokenWidgets([]);
  window.lucide?.createIcons();
}

async function updateTokensFromWallet(data, options = {}) {
  const list = document.querySelector('[data-screen="tokens"] .holdings-list');
  if (!list) return;
  if (!hasTonWalletPortfolio()) {
    renderTokenEmptyState("Connect a TON wallet to load tokens");
    setSectionReady("tokens", "Connect a TON wallet to load token balances", { toast: false });
    return [];
  }
  const walletAddress = liveWalletAddress || data?.account?.address || "";
  if (!walletAddress) {
    renderTokenEmptyState("Connect wallet to load tokens");
    setSectionReady("tokens", "Token screen is ready", { toast: false });
    return;
  }
  const importSessionId = options.importSessionId;
  const walletKey = walletStateKey(walletAddress);
  setSectionLoading("tokens", "Loading token balances...");
  renderTokenLoadingState();
  renderTokenSummary([]);
  syncAssetsSummary(liveWalletData, []);
  updateAllocationUi();
  let sourceData = data;
  let tokens = importedWalletTokenFallbacks(sourceData).filter(isDisplayableToken);
  const reportedTokenCount = Number(sourceData?.summary?.tokenCount || 0);
  const importedJettonCount = Array.isArray(sourceData?.assets?.jettons) ? sourceData.assets.jettons.length : 0;
  const visibleJettonCount = tokens.filter((token) => token.symbol !== "TON").length;
  if ((reportedTokenCount > tokens.length || importedJettonCount > visibleJettonCount) && visibleJettonCount === 0) {
    try {
      const freshData = await fetchWalletImport(walletAddress);
      if (!isCurrentImportSession(importSessionId) || walletStateKey(liveWalletAddress) !== walletKey) return [];
      sourceData = freshData;
      liveWalletData = freshData;
      liveWalletAddress = freshData.account?.address || walletAddress;
      if (Number(freshData.summary?.tonUsdRate) > 0) usdTonRate = Number(freshData.summary.tonUsdRate);
      homePortfolioValue = Number(freshData.summary?.totalUsd || homePortfolioValue || 0);
      tokens = importedWalletTokenFallbacks(sourceData).filter(isDisplayableToken);
    } catch (error) {
      console.warn("Fresh token sync failed", error);
    }
  }
  if (!isCurrentImportSession(importSessionId) || walletStateKey(liveWalletAddress) !== walletKey) return [];
  if (tokens.length) renderTokenRows(tokens);
  else renderTokenEmptyState("No token balances above $0.10");
  const jettonCount = Math.max(0, tokens.length - (tokens.some((token) => token.symbol === "TON") ? 1 : 0));
  setSectionReady("tokens", tokens.length ? `Tokens ready${jettonCount ? ` Â· ${jettonCount} jettons loaded` : ""}` : "Token screen is ready");
  return tokens;
}

const collectiblePayloadCache = new Map();
const collectiblePayloadRequests = new Map();

function fetchWalletCollectiblesPayload(walletAddress, options = {}) {
  const key = String(walletAddress || "").toLowerCase();
  if (!options.force && collectiblePayloadCache.has(key)) return Promise.resolve(collectiblePayloadCache.get(key));
  if (!options.force && collectiblePayloadRequests.has(key)) return collectiblePayloadRequests.get(key);
  const request = fetchJson(`/api/collectibles?address=${encodeURIComponent(walletAddress)}&t=${Date.now()}`)
    .then((payload) => {
      collectiblePayloadCache.set(key, payload);
      return payload;
    })
    .finally(() => collectiblePayloadRequests.delete(key));
  collectiblePayloadRequests.set(key, request);
  return request;
}

function renderImportedCollectiblesSnapshot(items = []) {
  if (!Array.isArray(items) || !items.length) return false;
  walletGiftGroups = groupGiftAssets(items.filter((item) => item.type === "gift").map((item, index) => liveCollectibleAsset(item, "gift", `wallet-${index}`, { suppressMarket: true })));
  walletStickerGroups = groupStickerAssets(items.filter((item) => item.type === "sticker").map((item, index) => liveCollectibleAsset(item, "sticker", `wallet-${index}`, { suppressMarket: true })));
  const { gifts, stickers } = rebuildPortfolioCollectibleGroups();
  setCollectiblesBanner("gifts", gifts.length ? "" : "No on-chain wallet gifts found.");
  setCollectiblesBanner("stickers", stickers.length ? "" : "No on-chain sticker packs found in this wallet.");
  renderCollectibleGrids();
  updateAllocationUi();
  syncAssetsSummary();
  return true;
}

function updateCollectiblesFromWallet(data, options = {}) {
  if (!hasTonWalletPortfolio()) return Promise.resolve([]);
  const walletAddress = liveWalletAddress || data?.account?.address;
  if (!walletAddress) return Promise.resolve([]);
  const hasSnapshot = renderImportedCollectiblesSnapshot(data?.assets?.collectibles);
  return Promise.allSettled([
    updateGiftsFromWallet(walletAddress, { loading: !hasSnapshot, importSessionId: options.importSessionId, force: true }),
    updateStickersFromWallet(walletAddress, { loading: !hasSnapshot, importSessionId: options.importSessionId }),
  ]).then(() => {
    if (!isCurrentImportSession(options.importSessionId)) return [];
    updateAllocationUi();
    syncAssetsSummary();
    updateAnalyticsFromWallet(homePortfolioValue);
    return [];
  });
}

const updateGiftsFromWallet = (walletAddress, options) => updateCollectiblesFromGetgems(walletAddress, "gifts", options);
async function updateStickersFromWallet(walletAddress, options = {}) {
  if (!walletAddress) return [];
  if (options.loading !== false) setSectionLoading("stickers", "Loading sticker packs...");
  if (options.loading !== false) setCollectibleLoading("stickers", true);
  try {
    const payload = await fetchJson(`/api/nfts?address=${encodeURIComponent(walletAddress)}&t=${Date.now()}`);
    if (!isCurrentImportSession(options.importSessionId)) return [];
    const rows = payload?.stickers || [];
    if (!rows.length) {
      walletStickerGroups = [];
      rebuildPortfolioCollectibleGroups();
      setCollectiblesBanner("stickers", "No on-chain sticker packs found in this wallet.");
      renderCollectibleGrids();
      setSectionReady("stickers", "Sticker screen ready Â· no sticker packs found");
      return [];
    }
    walletStickerGroups = groupStickerAssets(rows.map((item, index) => liveCollectibleAsset(item, "sticker", `wallet-${index}`)));
    const { stickers: assets } = rebuildPortfolioCollectibleGroups();
    setCollectiblesBanner("stickers", assets.some((asset) => Number(asset.floorUsd || 0) > 0) ? "" : "Fetching sticker prices...");
    renderCollectibleGrids();
    updateCollectibleSummaryBanner("stickers");
    preloadStickerAnimatedMedia(assets);
    prefetchStickerDetails(assets);
    setSectionReady("stickers", `Stickers ready Â· ${assets.length} collection${assets.length === 1 ? "" : "s"} loaded`);
    return assets;
  } catch (error) {
    console.warn("stickers live data failed", error);
    if (!isCurrentImportSession(options.importSessionId)) return [];
    walletStickerGroups = [];
    rebuildPortfolioCollectibleGroups();
    setCollectiblesBanner("stickers", "Sticker data is unavailable right now.");
    renderCollectibleGrids();
    setSectionReady("stickers", "Sticker screen ready Â· data unavailable");
    return [];
  }
}

async function updateCollectiblesFromGetgems(walletAddress, kind, options = {}) {
  if (!walletAddress) return [];
  if (options.loading !== false) setSectionLoading(kind, kind === "gifts" ? "Loading wallet gifts..." : "Loading wallet collectibles...");
  if (options.loading !== false) setCollectibleLoading(kind, true);
  try {
    const payload = await fetchWalletCollectiblesPayload(walletAddress, { force: Boolean(options.force) });
    if (!isCurrentImportSession(options.importSessionId)) return [];
    const rows = payload?.[kind] || [];
    if (!rows.length) {
      if (kind === "gifts") walletGiftGroups = [];
      else walletStickerGroups = [];
      rebuildPortfolioCollectibleGroups();
      if (kind === "stickers") {
        setCollectiblesBanner(kind, "No on-chain sticker packs found in this wallet.");
        setSectionReady(kind, "Sticker screen ready Â· no sticker packs found");
      } else {
        setCollectiblesBanner(kind, "No on-chain wallet gifts found.");
        setSectionReady(kind, "Gifts ready Â· no wallet gifts found");
      }
      renderCollectibleGrids();
      return [];
    }
    const walletGroups = kind === "stickers"
      ? groupStickerAssets(rows.map((item, index) => liveCollectibleAsset(item, "sticker", index)))
      : groupGiftAssets(rows.map((item, index) => liveCollectibleAsset(item, "gift", index, { suppressMarket: true })));
    if (kind === "gifts") walletGiftGroups = walletGroups;
    else walletStickerGroups = walletGroups;
    const { gifts, stickers } = rebuildPortfolioCollectibleGroups();
    const assets = kind === "gifts" ? gifts : stickers;
    setCollectiblesBanner(kind, "");
    renderCollectibleGrids();
    if (kind === "gifts") {
      preloadGiftStaticImages(assets);
      updateCollectibleSummaryBanner(kind);
    } else {
      preloadStickerAnimatedMedia(assets);
      prefetchStickerDetails(assets);
    }
    setSectionReady(kind, `${kind === "gifts" ? "Gifts" : "Stickers"} ready Â· ${assets.length} ${assets.length === 1 ? "collection" : "collections"} loaded`);
    return assets;
  } catch (error) {
    console.warn(`${kind} live data failed`, error);
    if (!isCurrentImportSession(options.importSessionId)) return [];
    if (kind === "gifts") walletGiftGroups = [];
    else walletStickerGroups = [];
    rebuildPortfolioCollectibleGroups();
    setCollectiblesBanner(kind, kind === "gifts" ? "Live data unavailable" : "Sticker data is unavailable right now.");
    renderCollectibleGrids();
    setSectionReady(kind, kind === "gifts" ? "Gift screen ready Â· live data unavailable" : "Sticker screen ready Â· data unavailable");
    return [];
  }
}

function groupedAssetChildren(groups = []) {
  return groups.flatMap((group) => Array.isArray(group?.children) && group.children.length ? group.children : [group]);
}

function stickerOwnedCount(asset = {}) {
  const holdings = Array.isArray(asset.children) && asset.children.length ? asset.children : [asset];
  const ownershipKeys = new Set(
    holdings
      .map((holding) => String(holding?.tokenAddress || holding?.id || "").trim())
      .filter(Boolean)
  );
  return ownershipKeys.size || holdings.length;
}

function rebuildPortfolioCollectibleGroups() {
  const gifts = groupGiftAssets([
    ...groupedAssetChildren(telegramGiftGroups),
    ...groupedAssetChildren(walletGiftGroups),
  ]);
  const stickers = groupStickerAssets([
    ...groupedAssetChildren(telegramStickerGroups),
    ...groupedAssetChildren(walletStickerGroups),
  ]);
  giftAssets.splice(0, giftAssets.length, ...gifts);
  stickerAssets.splice(0, stickerAssets.length, ...stickers);
  [...gifts, ...stickers].forEach((asset) => {
    assetDetails[asset.id] = asset;
    (asset.children || []).forEach((child) => { assetDetails[child.id] = child; });
  });
  return { gifts, stickers };
}

function groupStickerAssets(assets = []) {
  const groups = new Map();
  assets.forEach((asset) => {
    const brand = stickerBrandName(asset);
    const key = brand.toLowerCase();
    if (!groups.has(key)) groups.set(key, {
      ...asset,
      children: [],
      childCollections: [],
      floorUsd: 0,
      floorTon: 0,
      initUsd: 0,
      initTon: 0,
      dailyUsd: 0,
      count: 0,
      listedCount: 0,
      ownedStickerKeys: new Set(),
      family: brand,
      subtitle: "",
    });
    const group = groups.get(key);
    const ownershipKey = String(asset.tokenAddress || asset.id || "").trim();
    // A wallet holding is identified by its NFT address, never by collectible
    // metadata such as a pack's declared sticker count.
    if (ownershipKey && group.ownedStickerKeys.has(ownershipKey)) return;
    if (ownershipKey) group.ownedStickerKeys.add(ownershipKey);
    group.children.push(asset);
    const childLabel = stickerPackLabel(asset);
    if (childLabel && !group.childCollections.includes(childLabel)) group.childCollections.push(childLabel);
    group.count = group.ownedStickerKeys.size || group.children.length;
    group.floorUsd += Number(asset.floorUsd || 0);
    group.floorTon += Number(asset.floorTon || 0);
    group.dailyUsd += Number(asset.dailyUsd || 0);
    if (asset.status && asset.status !== "Unlisted") group.listedCount += 1;
    group.name = brand;
    group.collection = brand;
    group.creator = brand;
    group.packId = `${brand} Collection`;
    group.image = group.image || asset.image;
    const currentMedia = stickerMediaDescriptor(group);
    const candidateMedia = stickerMediaDescriptor(asset);
    const mediaRank = (type) => ({ lottie: 3, video: 2, image: 1 }[String(type || "").toLowerCase()] || 0);
    if (mediaRank(candidateMedia.type) > mediaRank(currentMedia.type)) {
      group.animatedImage = asset.animatedImage || asset.animationUrl || asset.animatedUrl || asset.mediaUrl || "";
      group.animationUrl = asset.animationUrl || asset.animatedImage || "";
      group.mediaType = candidateMedia.type;
      group.image = asset.image || group.image;
    }
    group.tokenAddress = group.tokenAddress || asset.tokenAddress;
    group.initUsd += Number(asset.initUsd || 0);
    group.initTon += Number(asset.initTon || 0);
    group.marketPlatform = group.marketPlatform || asset.marketPlatform;
    group.marketUrl = group.marketUrl || asset.marketUrl;
    group.collectionId = group.collectionId || asset.collectionId;
    group.characterId = group.characterId || asset.characterId;
    group.characterName = group.characterName || asset.characterName;
    group.source = group.source || asset.source;
    group.categorySource = group.categorySource || asset.categorySource;
    group.priceLoading = Boolean(group.priceLoading || asset.priceLoading);
  });
  return [...groups.values()].map(({ ownedStickerKeys, ...group }, index) => {
    const costBasis = Number(group.initUsd || group.costBasis || 0);
    const previousFloor = Number(group.floorUsd || 0) - Number(group.dailyUsd || 0);
    return {
      ...group,
      packCount: group.childCollections.length,
      format: group.mediaType === "lottie" ? "Animated" : (group.mediaType === "video" ? "Video" : "Static"),
      image: STICKER_SOURCE_IMAGES[group.name] || group.image,
      creator: group.family || group.name,
      subtitle: `${group.childCollections.length} pack${group.childCollections.length === 1 ? "" : "s"}`,
      costBasis,
      pnlUsd: costBasis ? group.floorUsd - costBasis : 0,
      pnlPct: costBasis ? ((group.floorUsd - costBasis) / costBasis) * 100 : 0,
      dailyPct: previousFloor > 0 ? (Number(group.dailyUsd || 0) / previousFloor) * 100 : 0,
      status: group.listedCount ? "Listed" : "Unlisted",
      id: `live-sticker-pack-${group.collection || group.name || index}`.replace(/[^a-z0-9_-]/gi, "-"),
    };
  });
}

function stickerPackLabel(asset = {}) {
  const brandKey = collectibleKey(stickerBrandName(asset));
  // Registry character names are classification metadata and can be shared by
  // otherwise different NFT collections. Ownership grouping must prefer the
  // collectible's actual collection/name so unrelated holdings never merge.
  const candidates = [asset.collection, asset.packId, asset.name, asset.characterName]
    .map((value) => String(value || "").replace(/\s+#\d+\b.*$/i, "").trim())
    .filter(Boolean);
  return candidates.find((value) => collectibleKey(value) !== brandKey && !/^telegram(?: collection)?$/i.test(value)) || candidates[0] || "Sticker Pack";
}

function stickerEditionLabel(asset = {}) {
  const value = String(asset.name || asset.collection || "").match(/#(\d{1,7})\b/)?.[1] || asset.tag || "";
  const cleaned = String(value || "").replace(/[^\d]/g, "");
  return cleaned ? `#${cleaned}` : "";
}

function stickerPackImageStack(asset = {}) {
  const previews = (asset.children?.length ? asset.children : [asset]).slice(0, 2);
  if (previews.length < 2) return "";
  const extra = stickerOwnedCount(asset) - previews.length;
  return `<button type="button" class="gift-pfp-stack" data-collectible-pfp-tray="${escapeHtml(asset.id)}" data-collectible-kind="sticker" aria-label="Show owned sticker editions">${previews.map((item) => collectibleArtHtml(item, "sticker")).join("")}${extra > 0 ? `<b>+${extra}</b>` : ""}</button>`;
}

function stickerPackMeta(asset = {}) {
  const parts = [asset.format, asset.edition].filter(Boolean);
  return parts.join(" Â· ") || "Sticker pack";
}

function groupStickerBrandChildren(children = []) {
  const groups = new Map();
  children.forEach((asset) => {
    const label = stickerPackLabel(asset);
    const key = collectibleKey(label) || asset.id;
    const item = groups.get(key) || {
      ...asset,
      id: asset.id,
      children: [],
      count: 0,
      floorUsd: 0,
      floorTon: 0,
      initUsd: 0,
      dailyUsd: 0,
      priceLoading: false,
      ownedStickerKeys: new Set(),
    };
    const ownershipKey = String(asset.tokenAddress || asset.id || "").trim();
    if (ownershipKey && item.ownedStickerKeys.has(ownershipKey)) return;
    if (ownershipKey) item.ownedStickerKeys.add(ownershipKey);
    item.children.push(asset);
    item.count = item.ownedStickerKeys.size || item.children.length;
    item.floorUsd += Number(asset.floorUsd || 0);
    item.floorTon += Number(asset.floorTon || 0);
    item.initUsd += Number(asset.initUsd || asset.costBasis || 0);
    item.dailyUsd += Number(asset.dailyUsd || 0);
    item.priceLoading = Boolean(item.priceLoading || (asset.priceLoading && !(Number(asset.floorUsd || 0) > 0)));
    groups.set(key, item);
  });
  return [...groups.values()]
    .map((item) => {
      const previousFloor = Number(item.floorUsd || 0) - Number(item.dailyUsd || 0);
      const { ownedStickerKeys, ...groupedItem } = item;
      return {
        ...groupedItem,
        pnlUsd: groupedItem.initUsd ? groupedItem.floorUsd - groupedItem.initUsd : 0,
        pnlPct: groupedItem.initUsd ? ((groupedItem.floorUsd - groupedItem.initUsd) / groupedItem.initUsd) * 100 : 0,
        dailyPct: previousFloor > 0 ? (groupedItem.dailyUsd / previousFloor) * 100 : 0,
      };
    })
    .sort((a, b) => Number(b.floorUsd || 0) - Number(a.floorUsd || 0) || stickerPackLabel(a).localeCompare(stickerPackLabel(b)));
}

function groupGiftAssets(assets = []) {
  const groups = new Map();
  assets.forEach((asset) => {
    const name = String(asset.collection || asset.name || "Telegram Gifts").trim();
    const source = isEstimatedAsset(asset) ? "" : String(asset.marketPlatform || "").trim();
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, {
      ...asset,
      children: [],
      floorUsd: 0,
      floorTon: 0,
      initUsd: 0,
      initTon: 0,
      dailyUsd: 0,
      count: 0,
      unpricedCount: 0,
      estimatedCount: 0,
      tags: [],
    });
    const group = groups.get(key);
    group.children.push(asset);
    group.count += Number(asset.count || 1);
    if (asset.floorStatus !== "priced" && !(Number(asset.floorUsd || 0) > 0)) group.unpricedCount += Number(asset.count || 1);
    if (asset.floorStatus === "estimated" || asset.floorSource === "estimate" || asset.source === "estimated-combo-value") group.estimatedCount += Number(asset.count || 1);
    group.floorUsd += Number(asset.floorUsd || 0);
    group.floorTon += Number(asset.floorTon || 0);
    group.initUsd += Number(asset.initUsd || 0);
    group.initTon += Number(asset.initTon || 0);
    group.dailyUsd += Number(asset.dailyUsd || 0);
    if (asset.tag) group.tags.push(asset.tag);
    group.name = name;
    group.collection = name;
    group.creator = source ? `Floor Â· ${source}` : (asset.creator || group.creator || name);
    group.provenance = source ? `${name} Â· ${source}` : name;
    group.image = group.image || asset.image;
    const mediaRank = (type) => ({ lottie: 3, video: 2, image: 1 }[String(type || "").toLowerCase()] || 0);
    const currentMedia = giftMediaDescriptor(group);
    const candidateMedia = giftMediaDescriptor(asset);
    if (mediaRank(candidateMedia.type) > mediaRank(currentMedia.type)) {
      group.image = asset.image || group.image;
      group.animatedImage = asset.animatedImage || asset.animationUrl || "";
      group.animationUrl = asset.animationUrl || asset.animatedImage || "";
      group.mediaType = candidateMedia.type;
      group.layeredMedia = asset.layeredMedia || group.layeredMedia;
    }
    group.marketPlatform = group.marketPlatform || asset.marketPlatform;
    group.marketUrl = group.marketUrl || asset.marketUrl;
    group.collectionAddress = group.collectionAddress || asset.collectionAddress;
    group.priceLoading = Boolean(group.priceLoading || asset.priceLoading);
  });
  return [...groups.values()].map((group, index) => {
    const costBasis = Number(group.initUsd || 0);
    const pnlUsd = costBasis ? Number(group.floorUsd || 0) - costBasis : 0;
    return {
      ...group,
      id: `live-gift-collection-${group.collection || group.name || index}`.replace(/[^a-z0-9_-]/gi, "-"),
      costBasis,
      pnlUsd,
      pnlPct: costBasis ? (pnlUsd / costBasis) * 100 : 0,
      dailyPct: Number(group.dailyPct || 0),
      floorStatus: group.unpricedCount >= group.count ? "unavailable" : "priced",
      tag: group.tags[0] || group.tag,
    };
  });
}

function stickerBrandName(asset = {}) {
  const raw = String(asset.collection || asset.name || asset.packId || asset.id || "Sticker Pack").trim();
  const brand = String(asset.brand || "").trim();
  const collection = String(asset.collection || "").trim();
  const name = String(asset.name || "").trim();
  const creator = String(asset.creator || "").trim();
  const source = String(asset.source || "").trim();
  const categorySource = String(asset.categorySource || "").trim();
  const cleaned = raw.replace(/\s+#\d+.*$/i, "").replace(/\s{2,}/g, " ").trim();
  const explicit = [
    ["Snoop Dogg x BAYC", "BAYC"],
    ["Bored Ape", "BAYC"],
    ["BAYC", "BAYC"],
    ["Cool Cat", "Cool Cat"],
    ["Doodles", "Doodles"],
    ["Not Pixel", "Not Pixel"],
    ["NotPixel", "Not Pixel"],
    ["DOGS Pixel", "Not Pixel"],
    ["Vice Pixel", "Not Pixel"],
    ["Pixel Earth", "Not Pixel"],
    ["Diamond Pixel", "Not Pixel"],
    ["Retro Pixel", "Not Pixel"],
    ["Error Pixel", "Not Pixel"],
    ["Pixel Knight", "Not Pixel"],
    ["SuperPixel", "Not Pixel"],
    ["Pixel phrases", "Not Pixel"],
    ["Grass Pixel", "Not Pixel"],
    ["MacPixel", "Not Pixel"],
    ["NOT Wise", "NOT Wise"],
    ["Notcoin OG", "Notcoin"],
    ["Notcoin", "Notcoin"],
    ["Shib", "Shib"],
    ["Ruyui", "Ruyui"],
    ["Lamborghini", "Lamborghini"],
    ["DOGS Origins", "DOGS Origins"],
    ["DOGS NY", "DOGS"],
    ["DOGS OG", "DOGS"],
    ["DOGS Rewards", "DOGS"],
    ["DOGS Unleashed", "DOGS"],
    ["Lost Dogs", "DOGS"],
    ["GAMEE", "GAMEE"],
    ["Moonbirds", "Moonbirds"],
    ["City Holder", "CITY Holder"],
    ["TON of Memes", "Fuse"],
    ["Gold Vibes Club", "Fuse"],
    ["Good Vibes Club", "Fuse"],
    ["The Meme OGs", "Fuse"],
    ["Tapps", "Fuse"],
    ["Goodies", "Goodies"],
    ["Legends of the Alley", "Goodies"],
    ["Teddie", "Goodies"],
    ["Goodies Intern", "Goodies"],
    ["Blindbox", "Goodies"],
  ];
  const familyText = [brand, collection, name, creator, source, categorySource, cleaned].join(" ").toLowerCase();
  const hit = explicit.find(([needle]) => familyText.includes(needle.toLowerCase()));
  if (hit) return hit[1];
  if (/\bgoodies\b/.test(familyText)) return "Goodies";
  if (/\b(fuse|ton of memes|good vibes club|gold vibes club|the meme ogs|tapps)\b/.test(familyText)) return "Fuse";
  if (brand) return brand;
  return cleaned.split(":")[0].replace(/\b(set|pack)\s*\d+$/i, "").trim() || cleaned;
}

function setCollectibleLoading(kind, loading) {
  const grid = document.getElementById(kind === "gifts" ? "giftGrid" : "stickerGrid");
  if (grid && loading) {
    grid.innerHTML = Array.from({ length: 3 }, () => `<article class="collectible-card"><div class="detail-skeleton-line"></div><div class="detail-skeleton-line short"></div></article>`).join("");
  }
}

function setCollectiblesBanner(kind, message) {
  const screenName = kind === "gifts" ? "gifts" : "stickers";
  const screen = document.querySelector(`[data-screen="${screenName}"]`);
  if (!screen) return;
  let banner = screen.querySelector(".live-data-banner");
  if (!message) {
    banner?.remove();
    return;
  }
  if (!banner) {
    banner = document.createElement("p");
    banner.className = "live-data-banner";
    screen.querySelector(".asset-total-banner")?.insertAdjacentElement("beforebegin", banner);
  }
  banner.textContent = message;
}

function liveCollectibleAsset(item, kind, index, options = {}) {
  const isGift = kind === "gift";
  const attrs = Array.isArray(item.attributes) ? item.attributes : [];
  const attr = (label) => attrs.find((item) => String(item.trait_type || item.type || item.label || "").toLowerCase().includes(label));
  const attrValue = (label, fallback = "â€”") => {
    const hit = attr(label);
    return String(hit?.value || fallback);
  };
  const attrRarity = (label) => {
    const value = attr(label)?.rarity;
    if (value === undefined || value === null || value === "") return "";
    const text = String(value);
    const numeric = Number(value);
    return text.includes("%") ? text : (Number.isFinite(numeric) ? `${numeric}%` : "");
  };
  const costBasis = Number(item.initUsd || 0) || (Number(item.lastSaleTon || 0) ? Number(item.lastSaleTon) * usdTonRate : 0);
  const hasBackendPrice = ["priced", "estimated", "last-sale"].includes(item.floorStatus) && (Number(item.floorUsd || 0) > 0 || Number(item.floorTon || 0) > 0);
  const hasEstimatedPrice = item.floorStatus === "estimated" && hasBackendPrice;
  const marketVerified = options.suppressMarket
    ? hasBackendPrice
    : (hasEstimatedPrice || ((Number(item.floorUsd || 0) > 0 || Number(item.floorTon || 0) > 0) && Boolean(item.marketPlatform || item.source || item.marketUrl)));
  const floorTon = marketVerified ? Number(item.floorTon || 0) : 0;
  const floorUsd = marketVerified
    ? (Number(item.floorUsd || 0) || (floorTon > 0 ? floorTon * usdTonRate : 0))
    : 0;
  const stickerAnimationSource = String(item.animationUrl || item.animatedImage || "");
  const stickerMediaType = !isGift
    ? ((/\.(?:lottie\.)?json(?:[?#].*)?$/i.test(stickerAnimationSource) || /\/lottie(?:\/|$)/i.test(stickerAnimationSource)) ? "lottie" : (item.mediaType || ""))
    : "";
  return {
    id: `live-${kind}-${item.tokenAddress || index}`.replace(/[^a-z0-9_-]/gi, "-"),
    type: kind,
    name: item.name || (isGift ? "Telegram Gift" : "Sticker Pack"),
    collection: item.collection || "Telegram Collection",
    creator: item.collection || "Telegram",
    image: item.image || item.previewUrl || item.iconUrl || item.thumbnailUrl || item.thumbnail || item.photo || "",
    animatedImage: item.animatedImage || item.animationUrl || item.animatedUrl || item.mediaUrl || "",
    animationUrl: item.animationUrl || item.animatedImage || "",
    mediaType: stickerMediaType || item.mediaType || "",
    layeredMedia: item.layeredMedia || null,
    collectionAddress: item.collectionAddress,
    tokenAddress: item.tokenAddress,
    icon: isGift ? "gift" : "sticker",
    tag: Number(item.mintIndex || index + 1),
    traits: [
      { label: "Model", value: item.modelName || item.model || attrValue("model", "TON NFT"), rarity: attrRarity("model") },
      { label: "Backdrop", value: item.backdropName || item.backdrop || attrValue("backdrop", item.collection?.slice(0, 16) || "Collection"), rarity: attrRarity("backdrop") },
      { label: "Symbol", value: item.symbolName || item.symbol || attrValue("symbol", "Wallet"), rarity: attrRarity("symbol") },
    ],
    mint: { current: Number(item.mintIndex || index + 1), total: Math.max(Number(item.mintIndex || index + 1), 1) },
    floorUsd,
    floorTon,
    floorStatus: item.floorStatus || (marketVerified ? "priced" : "unavailable"),
    snapshotAt: item.snapshotAt || item.marketUpdatedAt || "",
    marketVerified,
    priceLoading: item.floorStatus ? false : !marketVerified,
    dailyUsd: 0,
    dailyPct: marketVerified ? Number(item.change24hPct || 0) : 0,
    pnlUsd: costBasis ? floorUsd - costBasis : 0,
    pnlPct: costBasis ? ((floorUsd - costBasis) / costBasis) * 100 : 0,
    status: item.listed ? "Listed on Getgems" : "Unlisted",
    acquired: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
    acquiredSort: Date.now(),
    costBasis,
    upgraded: "Imported from connected TON wallet",
    provenance: `${item.collection || "Collection"} Â· ${truncateWalletAddress(item.tokenAddress || "")}`,
    comboRank: item.description || "Live wallet collectible",
    exactCount: "Trait data from marketplace metadata",
    quickSellTon: marketVerified ? floorTon * 0.95 : 0,
    quickSellUsd: marketVerified ? floorUsd * 0.95 : 0,
    initUsd: Number(item.initUsd || 0),
    initTon: Number(item.initTon || 0),
    marketPlatform: marketVerified ? (item.marketPlatform || item.marketplace || "") : "",
    marketUrl: marketVerified ? (item.marketUrl || "") : "",
    floorSource: item.source === "last-sale-exact" ? "last-sale" : (item.source === "estimated-combo-value" ? "estimate" : (marketVerified && item.source === "d1-backdrop-floor" ? "backdrop" : "")),
    estimateConfidence: item.estimateConfidence || "",
    estimateSignals: item.estimateSignals || null,
    collectionId: item.collectionId || "",
    characterId: item.characterId || "",
    characterName: item.characterName || "",
    source: item.source || "",
    brand: item.brand || "",
    categorySource: item.categorySource || "",
    sales: Array.isArray(item.sales) ? item.sales : (Array.isArray(item.recentSales) ? item.recentSales : []),
    salesScope: item.salesScope || "",
    salesLoading: Boolean(item.salesLoading),
    giftSalesRaw: Array.isArray(item.sales) ? item.sales : (Array.isArray(item.recentSales) ? item.recentSales : []),
    floorHistory: Array.isArray(item.floorHistory) ? item.floorHistory : [],
    floorHistorySource: item.floorHistorySource || "",
    floorHistoryAvailable: Array.isArray(item.floorHistory) && item.floorHistory.length >= 2,
    collectionStats: item.collectionStats || null,
    modelStats: item.modelStats || null,
    intel: { trend: "â–‚â–ƒâ–…â–†â–‡", badge: "Live", sales24h: "â€”", volume24h: "â€”", prior: "â€”", daysToSell: "â€”", listedSupply: "â€”", listingRate: "â€”", bestTime: "â€”" },
    chart: floorUsd ? [floorUsd, floorUsd, floorUsd, floorUsd, floorUsd, floorUsd, floorUsd] : [],
    ...(isGift ? {} : {
      format: stickerMediaType === "lottie" ? "Animated" : (stickerMediaType === "video" ? "Video" : attrValue("format", "Static")),
      edition: attrValue("edition", "Open Edition"),
      // TonAPI returns one row for each NFT address the wallet owns. Metadata
      // "count" traits describe the collectible and must not inflate ownership.
      count: 1,
      packId: item.collection || "Sticker Pack",
      attributes: [["Source", "TON NFT"], ["Collection", item.collection || "Telegram"], ["Owner", "Wallet"]],
    }),
  };
}

function updateWalletScreen(data, tonUsd) {
  const list = document.querySelector('[data-screen="wallets"] .holdings-list');
  if (!list) return;
  const walletLabel = data.account?.tonName || "Main wallet";
  list.innerHTML = `<article><span class="asset-icon token-bg"><i data-lucide="wallet"></i></span><div><b>${escapeHtml(walletLabel)}</b><small>${data.account.address} | ${data.summary.tokenCount + data.summary.nftCount} assets</small></div><aside><b>${money(tonUsd)}</b><small>${escapeHtml(truncateWalletAddress(data.account.address || liveWalletAddress))}</small></aside></article><article><span class="asset-icon gift-bg"><i data-lucide="message-circle"></i></span><div><b>TON collectibles</b><small>${data.summary.giftCount} gifts | ${data.summary.stickerCount} stickers | ${data.summary.nftCount} NFTs</small></div><aside><b>Imported</b><small>TonAPI</small></aside></article>`;
}

function renderActivityRows(events = [], limit = HOME_ACTIVITY_LIMIT) {
  const panel = document.querySelector('[data-screen="home"] .activity-panel');
  if (!panel) return;
  panel.querySelectorAll(".activity-row").forEach((row) => row.remove());
  const rows = activityRowsHtml(events, limit, "No TON activity found yet");
  panel.insertAdjacentHTML("beforeend", rows);
  window.lucide?.createIcons();
}

function formatActivityDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Recent";
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month} ${day} Â· ${hour}:${minute}`;
}

function activityDayLabel(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const start = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((start(now) - start(date)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${date.toLocaleString("en-US", { month: "short" })} ${date.getDate()}`;
}

function signedActivityValue(value, direction) {
  if (direction === "Swap") return value;
  if (/^[+\-âˆ’]/.test(value)) return value;
  if (!/(TON|USD|JETTON|[A-Z0-9$]{2,})/i.test(value)) return value;
  return `${direction === "Sent" ? "âˆ’" : "+"}${value}`;
}

function activityRowsHtml(events = [], limit = 5, emptyText = "No TON activity found yet", options = {}) {
  const usableEvents = events.map((event) => {
    const action = event.actions?.find((item) => item.simplePreview?.value) || event.actions?.[0];
    const preview = action?.simplePreview || {};
    let value = String(preview.value || preview.description?.replace(/^Swapping\s+/i, "").replace(/\s+for\s+/i, " â†’ ") || "On-chain");
    if (/nft|gift|sticker/i.test(`${action?.type || ""} ${preview.name || ""} ${value}`)) return null;
    const tonMatch = value.match(/[-+]?\d+(?:\.\d+)?\s*TON/i);
    if (tonMatch && Math.abs(Number.parseFloat(tonMatch[0])) <= 0) return null;
    const isNegative = /^\s*-/.test(value);
    const isPositive = /^\s*\+/.test(value);
    const direction = preview.direction || (/swap/i.test(action?.type || preview.name || "") ? "Swap" : isNegative ? "Sent" : "Received");
    value = signedActivityValue(value, direction);
    const valueParts = value.split(/\s+â†’\s+/);
    return {
      label: direction,
      description: preview.name || action?.type || "TON activity",
      value,
      valueHtml: valueParts.length > 1
        ? `${escapeHtml(valueParts[0])}<span>${escapeHtml(`â†’ ${valueParts.slice(1).join(" â†’ ")}`)}</span>`
        : escapeHtml(value),
      direction,
      usdValue: preview.usdValue || "",
      hash: preview.transactionHash || event.id || "",
      counterparty: preview.counterparty || preview.sender || preview.recipient || "",
      icon: direction === "Swap" ? "refresh-cw" : direction === "Sent" ? "arrow-up-from-line" : "arrow-down-to-line",
      tone: isNegative ? "negative" : isPositive ? "positive" : "",
      time: event.date ? formatActivityDate(event.date) : "Recent",
      group: event.date ? activityDayLabel(event.date) : "",
    };
  }).filter(Boolean).slice(0, limit);
  if (!usableEvents.length) return [
    `<article class="activity-row"><span class="activity-dot token-bg"><i data-lucide="clock-3"></i></span><div><b>Wallet history</b><small class="activity-direction">Synced</small><small>${escapeHtml(emptyText)}</small></div><aside><strong></strong></aside></article>`,
  ].join("");
  let lastGroup = "";
  return usableEvents.map((event) => {
    const group = options.groupDates && event.group && event.group !== lastGroup
      ? `<div class="activity-date-header micro">${escapeHtml(event.group)}</div>`
      : "";
    if (event.group) lastGroup = event.group;
    return `${group}<article class="activity-row" data-activity-direction="${escapeHtml(event.direction)}" data-tx-hash="${escapeHtml(event.hash)}"><span class="activity-dot token-bg"><i data-lucide="${event.icon}"></i></span><div><b>${escapeHtml(event.label)}</b><small>${escapeHtml(event.time)}</small></div><aside><strong class="${event.tone}">${event.valueHtml}</strong>${event.usdValue ? `<small class="activity-usd">${escapeHtml(event.usdValue)}</small>` : ""}</aside></article>`;
  }).join("");
}

function renderFullActivity(events = []) {
  const list = document.querySelector('[data-screen="activity"] .holdings-list');
  if (!list) return;
  fullActivityEvents = events;
  const query = activitySearchTerm.trim().toLowerCase();
  const filtered = activityFilterMode === "All"
    ? events
    : events.filter((event) => {
      const action = event.actions?.find((item) => item.simplePreview?.direction) || event.actions?.[0];
      const preview = action?.simplePreview || {};
      const direction = preview.direction || (/swap|jettonswap/i.test(`${action?.type || ""} ${preview.name || ""}`) ? "Swap" : "");
      return direction === activityFilterMode;
    });
  const searched = query
    ? filtered.filter((event) => {
      const action = event.actions?.find((item) => item.simplePreview) || event.actions?.[0];
      const preview = action?.simplePreview || {};
      const haystack = [
        action?.type,
        preview.name,
        preview.value,
        preview.direction,
        preview.usdValue,
        preview.sender,
        preview.senderName,
        preview.recipient,
        preview.recipientName,
        preview.counterparty,
        preview.searchText,
        liveWalletAddress,
        event.id,
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    })
    : filtered;
  list.innerHTML = activityRowsHtml(searched, 1000, query ? "No matching transactions" : "No TON activity found yet", { groupDates: true });
  window.lucide?.createIcons();
}

function txRowsHtml(detail = {}) {
  const partyLabel = detail.type === "Received" ? "Sender" : "Recipient";
  const partyValue = detail.type === "Received" ? detail.sender : detail.recipient;
  const partyName = detail.type === "Received" ? detail.senderName : detail.recipientName;
  const rows = [
    [partyLabel, partyName || truncateWalletAddress(partyValue || detail.recipientAddress || "")],
    [`${partyLabel} Address`, partyValue || detail.recipientAddress],
    ["Fee", detail.gasFee],
  ];
  return rows.map(([label, value]) => `<article><small>${escapeHtml(label)}</small><b>${escapeHtml(value || "")}</b></article>`).join("");
}

function txLogoHtml(item = {}) {
  const symbol = escapeHtml((item.symbol || "TOK").slice(0, 3).toUpperCase());
  const tonFallback = "https://asset.ston.fi/img/EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c/c8d21a3d93f9b574381e0a8d8f16d48b325dd8f54ce172f599c1e9d6c62f03f7";
  const isTon = String(item.symbol || "").toUpperCase() === "TON";
  const image = isTon ? tonFallback : resolveTokenImage(item.image || "");
  const fallback = isTon ? tonFallback : "";
  return image
    ? `<span><img src="${escapeHtml(image)}" alt="${symbol}" data-fallback="${escapeHtml(fallback)}" data-symbol="${symbol}" onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback}else{this.parentElement.textContent=this.dataset.symbol}"></span>`
    : `<span>${symbol}</span>`;
}

function renderTxSheet(detail = {}) {
  const isSwap = detail.type === "Swap";
  const logos = (detail.assetLogos || []).slice(0, isSwap ? 2 : 1);
  const logoStack = document.getElementById("txLogoStack");
  logoStack.classList.toggle("is-single", !isSwap);
  logoStack.innerHTML = logos.map(txLogoHtml).join("");
  const amountTitle = document.getElementById("txAmountTitle");
  const amountParts = String(detail.amount || "0 TON").split(/\s*â†’\s*/);
  amountTitle.innerHTML = isSwap && amountParts.length > 1
    ? `<span class="tx-swap-sent">âˆ’${escapeHtml(amountParts[0])}</span><span class="tx-swap-received">+${escapeHtml(amountParts.slice(1).join(" â†’ "))}</span>`
    : escapeHtml(detail.amount || "0 TON");
  document.getElementById("txUsdValue").textContent = isSwap ? "" : (detail.usdValue || "n/a");
  document.getElementById("txSubtitle").textContent = `${detail.type || "Transaction"} Â· ${detail.timestamp ? formatActivityDate(detail.timestamp) : ""}`;
  document.getElementById("txDetailList").innerHTML = txRowsHtml(detail);
  const button = document.getElementById("txTonscanButton");
  if (button) button.innerHTML = `<i data-lucide="globe"></i><span>${escapeHtml(truncateWalletAddress(detail.hash || ""))}</span>`;
  window.lucide?.createIcons();
}

function closeTxSheet() {
  const sheet = document.getElementById("txSheet");
  if (!sheet) return;
  sheet.classList.remove("is-open");
  sheet.setAttribute("aria-hidden", "true");
}

function txSeedFromHash(hash) {
  const event = fullActivityEvents.find((item) => {
    const action = item.actions?.find((entry) => entry.simplePreview?.transactionHash) || item.actions?.[0];
    return (action?.simplePreview?.transactionHash || item.id) === hash;
  });
  const preview = event?.actions?.[0]?.simplePreview || {};
  return {
    hash,
    type: preview.direction || "Transaction",
    amount: signedActivityValue(preview.value || "0 TON", preview.direction || ""),
    usdValue: preview.usdValue || "$0.00",
    sender: preview.sender || "",
    senderName: preview.senderName || "",
    recipient: preview.recipient || preview.counterparty || "",
    recipientName: preview.recipientName || "",
    recipientAddress: preview.recipient || preview.counterparty || "",
    timestamp: event?.date || "",
    assetLogos: preview.assetLogos || [],
    gasFee: preview.gasFee || "$0.00",
  };
}

async function openTxSheet(hash) {
  if (!hash) return;
  const sheet = document.getElementById("txSheet");
  if (!sheet) return;
  txSheetUrl = `https://tonscan.org/tx/${encodeURIComponent(hash)}`;
  const seed = txSeedFromHash(hash);
  renderTxSheet({ ...seed, gasFee: seed.gasFee || "$0.00" });
  sheet.classList.add("is-open");
  sheet.setAttribute("aria-hidden", "false");
  if (seed.senderName || seed.recipientName) return;
  try {
    const detail = await requestJson(`/api/transaction-detail?hash=${encodeURIComponent(hash)}&t=${Date.now()}`, {}, "Could not load transaction");
    txSheetUrl = detail.tonscanUrl || txSheetUrl;
    renderTxSheet({ ...seed, senderName: detail.senderName, recipientName: detail.recipientName, hash: detail.hash || seed.hash });
  } catch (error) {
    renderTxSheet({ ...seed, gasFee: "$0.00" });
  }
}

async function loadFullActivity() {
  const list = document.querySelector('[data-screen="activity"] .holdings-list');
  if (!list || !liveWalletAddress) return;
  if (fullActivityEvents.length) {
    renderFullActivity(fullActivityEvents);
    preloadFullActivityBackground(liveWalletAddress);
    return;
  }
  list.innerHTML = `<article class="activity-row"><span class="activity-dot token-bg skeleton"></span><div><b>Preparing activity...</b><small>Resolving wallet names</small></div><aside><strong></strong></aside></article>`;
  await startActivityPreload(liveWalletAddress);
}

async function startActivityPreload(address) {
  if (!address) return;
  console.info("Activity preload started", address);
  if (activityPreloadAddress === address && (activityInitialLoading || fullActivityEvents.length)) {
    if (fullActivityEvents.length) renderActivityRows(fullActivityEvents, HOME_ACTIVITY_LIMIT);
    if (fullActivityEvents.length && document.querySelector('[data-screen="activity"].is-active')) renderFullActivity(fullActivityEvents);
    return;
  }
  activityPreloadAddress = address;
  activityInitialLoading = true;
  setSectionLoading("activity", "Loading wallet activity...");
  try {
    const payload = await requestJson(`/api/wallet/activity?address=${encodeURIComponent(address)}&limit=200&t=${Date.now()}`, {}, "Could not load activity");
    if (address === activityPreloadAddress) {
      fullActivityEvents = payload.activity || [];
      renderActivityRows(fullActivityEvents, HOME_ACTIVITY_LIMIT);
      if (document.querySelector('[data-screen="activity"].is-active')) renderFullActivity(fullActivityEvents);
      preloadFullActivityBackground(address);
      setSectionReady("activity", `Activity ready Â· ${fullActivityEvents.length} transactions loaded`);
    }
  } catch (error) {
    console.warn("Full activity load failed", error);
    if (document.querySelector('[data-screen="activity"].is-active')) {
      document.querySelector('[data-screen="activity"] .holdings-list').innerHTML = activityRowsHtml([], 1000, "Could not load wallet history");
      window.lucide?.createIcons();
    }
    setSectionReady("activity", "Activity ready Â· unavailable");
  } finally {
    activityInitialLoading = false;
  }
}

async function preloadFullActivityBackground(address) {
  if (activityBackgroundLoading) return;
  activityBackgroundLoading = true;
  try {
    const payload = await requestJson(`/api/wallet/activity?address=${encodeURIComponent(address)}&limit=1000&t=${Date.now()}`, {}, "Could not load background activity");
    if (address === liveWalletAddress && payload.activity?.length > fullActivityEvents.length) {
      fullActivityEvents = payload.activity;
      renderActivityRows(fullActivityEvents, HOME_ACTIVITY_LIMIT);
      if (document.querySelector('[data-screen="activity"].is-active')) renderFullActivity(fullActivityEvents);
    }
  } catch (error) {
    console.warn("Background activity load failed", error);
  } finally {
    activityBackgroundLoading = false;
  }
}

function compactMoney(value) {
  if (displayCurrency === "TON") return formatTonFromUsd(value);
  return value >= 1000 ? `$${(value / 1000).toFixed(1)}K` : money(value);
}

function renderDonut(progress = 1) {
  const host = document.getElementById("donut-chart") || document.querySelector(".allocation-donut") || document.querySelector(".donut-chart");
  if (!host) return;
  const values = [allocationState.gifts, allocationState.tokens, allocationState.stickers];
  const labels = ["Gifts", "TON Tokens", "Stickers"];
  const total = values.reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0);
  const selectedValue = selectedAllocation === null ? total : values[selectedAllocation];
  const centerValue = host.querySelector("span");
  if (centerValue) centerValue.textContent = compactMoney(selectedValue);
  host.setAttribute("aria-label", selectedAllocation === null
    ? `Portfolio allocation, total ${compactMoney(total)}`
    : `${labels[selectedAllocation]} allocation, ${compactMoney(selectedValue)}`);
  const styles = getComputedStyle(document.documentElement);
  Charts.renderDonut(host, values, {
    progress,
    selected: selectedAllocation,
    pixelRatio: window.devicePixelRatio || 1,
    colors: ["--blue", "--mint", "--amber"].map((name) => styles.getPropertyValue(name).trim()),
  });
  const legendItems = document.querySelectorAll(".allocation-list article");
  document.querySelector(".allocation-list")?.classList.toggle("is-filtered", selectedAllocation !== null);
  legendItems.forEach((item, index) => {
    const selected = selectedAllocation === index;
    item.classList.toggle("is-selected", selected);
    item.setAttribute("aria-pressed", String(selected));
  });
}

function portfolioHistoryRows(range = "1D") {
  return liveHistoryByRange.get(range) || (range === "1D" ? liveHistoryPoints : []);
}

function portfolioTimeLabel(timestamp, range, detail = false) {
  const date = new Date(timestamp);
  const options = detail
    ? { weekday: "short", month: "2-digit", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }
    : range === "1D"
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : range === "7D" ? { weekday: "short" } : { month: "short", day: "numeric" };
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function renderPortfolioGraph(range = "1D", animate = false) {
  const graph = document.querySelector('[data-screen="home"] .graph-card');
  const canvas = graph?.querySelector(".value-graph canvas");
  if (!canvas) return;
  const points = portfolioHistoryRows(range);
  const rangeState = historyRangeState.get(range) || {};
  const hasHistory = points.length >= 2;
  const isLoading = !hasHistory
    && rangeState.status !== "failed"
    && isGraphHistoryLoadingEnabled()
    && (loadingPortfolioRanges.has(range) || ["queued", "building", "partial"].includes(rangeState.status));
  const hasFailed = !hasHistory && rangeState.status === "failed";
  const state = graph.querySelector(".portfolio-chart-state");
  const stateTitle = state?.querySelector("b");
  const stateText = state?.querySelector("small");
  graph.classList.toggle("is-history-ready", hasHistory);
  graph.classList.toggle("is-history-loading", isLoading);
  graph.classList.toggle("is-history-empty", !hasHistory && !isLoading && !hasFailed);
  graph.classList.toggle("is-history-failed", hasFailed);
  graph.dataset.historyState = hasHistory ? "ready" : isLoading ? "loading" : hasFailed ? "failed" : "empty";
  canvas.setAttribute("aria-hidden", String(!hasHistory));
  if (state) state.hidden = hasHistory;
  if (stateTitle) stateTitle.textContent = isLoading ? "Building your trend" : hasFailed ? "History unavailable" : "History starts here";
  if (stateText) stateText.textContent = isLoading
    ? "Refreshing your saved snapshots."
    : hasFailed ? "Your current portfolio value is still available." : "Your next snapshot unlocks the trend.";
  Charts.renderConfigured("portfolio", hasHistory ? points : [], {
    element: canvas,
    duration: animate ? 320 : 0,
    color: "#F4F4F1",
    areaColor: "rgba(244,244,241,.11)",
    gridColor: "rgba(255,255,255,.055)",
    tickColor: "#73736E",
    lineWidth: 2.25,
    easing: "easeOutQuart",
    formatTick: (point) => portfolioTimeLabel(point.timestamp, range),
    formatDate: (point) => portfolioTimeLabel(point.timestamp, range, true),
    formatValue: (point) => `${money(point.value)} portfolio`,
    formatAxis: compactMoney,
  });
  graph.querySelectorAll("[data-range]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.range === range);
    button.classList.toggle("is-loading", isGraphHistoryLoadingEnabled() && loadingPortfolioRanges.has(button.dataset.range));
  });
  resetPortfolioHeader(range);
}

function rangePnl(range) {
  const points = portfolioHistoryRows(range);
  const first = points[0]?.value ?? homePortfolioValue;
  const last = points.at(-1)?.value ?? homePortfolioValue;
  const delta = last - first;
  const pct = first ? (delta / first) * 100 : 0;
  return { delta, pct };
}

function resetPortfolioHeader(range = document.querySelector("[data-range].is-active")?.dataset.range || "1D") {
  const title = document.querySelector('[data-screen="home"] .graph-head h1');
  const badge = document.querySelector('[data-screen="home"] .portfolio-actions-row span');
  if (title) title.textContent = money(homePortfolioValue);
  if (badge) {
    const { delta, pct } = rangePnl(range);
    badge.textContent = `${signedMoney(delta)} | ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
    badge.classList.toggle("negative", delta < 0);
  }
}

function playHomeEntrance() {
  const home = document.querySelector('[data-screen="home"]');
  if (!home) return;
  home.classList.remove("home-animating");
  home.classList.add("home-ready");
  resetPortfolioHeader();
  renderPortfolioGraph(activePortfolioRange(), true);
  renderDonut();
}

const originalText = new WeakMap();

function formatTonFromUsd(usd, sign = "") {
  const ton = usd / usdTonRate;
  const label = ton >= 1000 ? `${(ton / 1000).toFixed(2)}K TON` : `${ton.toFixed(2)} TON`;
  return `${sign}${label}`;
}

function applyCurrencyDisplay() {
  const root = document.querySelector(".app-frame");
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.includes("$") && originalText.has(node)) return NodeFilter.FILTER_ACCEPT;
      return node.nodeValue.includes("$") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const source = originalText.get(node);
    node.nodeValue = displayCurrency === "USD"
      ? source
      : source.replace(/([+-]?)\$(\d[\d,]*(?:\.\d+)?)(K?)/g, (_, sign, raw, compact) => {
          const value = Number(raw.replace(/,/g, "")) * (compact ? 1000 : 1);
          return formatTonFromUsd(value, sign);
        });
  });
  document.getElementById("currencySettingLabel")?.replaceChildren(`Currency: ${displayCurrency}`);
  document.querySelectorAll("[data-currency-option]").forEach((option) => {
    option.classList.toggle("is-active", option.dataset.currencyOption === displayCurrency);
  });
}

function setCurrency(currency) {
  displayCurrency = currency;
  priceMode = currency;
  renderCollectibleGrids();
  const activeAsset = document.querySelector("#detailName")?.dataset.asset;
  if (document.querySelector('[data-screen="detail"].is-active') && activeAsset) renderAssetDetail(activeAsset);
  renderPortfolioGraph(document.querySelector("[data-range].is-active")?.dataset.range || "1D");
  applyCurrencyDisplay();
}

function renderAnalyticsChart() {
  const analyticsScreen = document.querySelector('[data-screen="analytics"]');
  const canvas = analyticsScreen?.querySelector(".value-graph canvas");
  if (!canvas) return;
  const activeHistory = liveHistoryByRange.get(activePortfolioRange()) || liveHistoryPoints;
  Charts.renderConfigured("analytics", activeHistory, { element: canvas });
}

document.addEventListener("click", (event) => {
  const closeGiftTrayButton = event.target.closest("[data-close-gift-pfp-tray]");
  if (closeGiftTrayButton || event.target.classList?.contains("gift-pfp-tray-backdrop")) {
    closeGiftPfpTray();
    return;
  }
  const giftPfpTrayButton = event.target.closest("[data-gift-pfp-tray]");
  if (giftPfpTrayButton) {
    event.preventDefault();
    event.stopPropagation();
    openGiftPfpTray(giftPfpTrayButton.dataset.giftPfpTray, giftPfpTrayButton);
    return;
  }
  const collectiblePfpTrayButton = event.target.closest("[data-collectible-pfp-tray]");
  if (collectiblePfpTrayButton) {
    event.preventDefault();
    event.stopPropagation();
    openGiftPfpTray(
      collectiblePfpTrayButton.dataset.collectiblePfpTray,
      collectiblePfpTrayButton,
      collectiblePfpTrayButton.dataset.collectibleKind || "gift",
    );
    return;
  }
  const walletLogout = event.target.closest("[data-wallet-logout]");
  if (walletLogout) {
    event.preventDefault();
    disconnectWallet();
    return;
  }
  const refreshTokenButton = event.target.closest("[data-token-refresh]");
  if (refreshTokenButton) {
    event.preventDefault();
    if (liveWalletData) updateTokensFromWallet(liveWalletData);
    return;
  }
  const sortButton = event.target.closest("[data-token-sort-open]");
  if (sortButton) {
    event.preventDefault();
    const sortSheet = document.getElementById("tokenSortSheet");
    if (sortSheet?.classList.contains("is-open")) closeTokenSortSheet();
    else openTokenSortSheet();
    return;
  }
  const sortSheet = document.getElementById("tokenSortSheet");
  if (sortSheet?.classList.contains("is-open") && !event.target.closest("#tokenSortSheet")) {
    closeTokenSortSheet();
  }
  const detailRangeButton = event.target.closest("[data-token-detail-range]");
  if (detailRangeButton) {
    tokenDetailRange = detailRangeButton.dataset.tokenDetailRange || "day";
    const activeAsset = currentDetailAssetId();
    if (activeAsset) renderAssetDetail(activeAsset);
    return;
  }
  const giftPriceModeButton = event.target.closest("[data-gift-price-mode]");
  if (giftPriceModeButton) {
    priceMode = giftPriceModeButton.dataset.giftPriceMode || "USD";
    const activeAsset = currentDetailAssetId();
    const detail = assetDetails[activeAsset];
    if (detail?.type === "gift") {
      renderGiftDetailPage(detail, { loading: false });
      window.lucide?.createIcons();
      applyCurrencyDisplay();
    } else if (activeAsset) {
      renderAssetDetail(activeAsset);
    }
    return;
  }
  const giftRangeButton = event.target.closest("[data-gift-detail-range]");
  if (giftRangeButton) {
    giftDetailRange = giftRangeButton.dataset.giftDetailRange || "7d";
    const activeAsset = currentDetailAssetId();
    const detail = assetDetails[activeAsset];
    if (detail?.type === "gift") {
      detail.floorHistoryLoading = true;
      renderGiftDetailPage(detail, { loading: false });
      window.lucide?.createIcons();
      applyCurrencyDisplay();
      loadGiftDetail(detail, { forceRefresh: false });
    } else if (activeAsset) {
      renderAssetDetail(activeAsset);
    }
    return;
  }
  const stickerRangeButton = event.target.closest("[data-sticker-detail-range]");
  if (stickerRangeButton) {
    stickerDetailRange = stickerRangeButton.dataset.stickerDetailRange || "7d";
    const activeAsset = currentDetailAssetId();
    if (activeAsset) renderAssetDetail(activeAsset);
    return;
  }
  const externalUrlButton = event.target.closest("[data-external-url]");
  if (externalUrlButton) {
    const url = externalUrlButton.dataset.externalUrl || "";
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const stickerThumb = event.target.closest("[data-sticker-thumb]");
  if (stickerThumb) {
    openStickerThumbOverlay(JSON.parse(stickerThumb.dataset.stickerThumb));
    return;
  }
  const tokenActivityButton = event.target.closest("[data-token-activity-see-all]");
  if (tokenActivityButton) {
    activitySearchTerm = tokenActivityButton.dataset.tokenActivitySeeAll || "";
    const search = document.getElementById("activitySearch");
    if (search) search.value = activitySearchTerm;
    activityFilterMode = "All";
    document.querySelectorAll("[data-activity-filter]").forEach((item) => item.classList.toggle("active", item.dataset.activityFilter === "All"));
    renderFullActivity(fullActivityEvents);
    showScreen("activity");
    return;
  }
  const target = event.target.closest("[data-screen-target]");
  const activityRow = event.target.closest('[data-screen="activity"] .activity-row[data-tx-hash]');
  if (activityRow && !target) {
    openTxSheet(activityRow.dataset.txHash);
    return;
  }
  const detailActivityRow = event.target.closest('[data-screen="detail"] .token-detail-activity[data-tx-hash]');
  if (detailActivityRow && !target) {
    openTxSheet(detailActivityRow.dataset.txHash);
    return;
  }
  if (!target) return;
  closeWalletActionSheet();
  const nextRoute = routeFromTarget(target);
  const currentScreen = document.querySelector(".screen.is-active")?.dataset.screen;
  if (nextRoute.screen === "detail") {
    detailReturnScreen = currentScreen || "assets";
    closeGiftPfpTray();
  }
  navigateToRoute(nextRoute, { back: isHeaderBackTarget(target) });
});

installNavigationSwipeGestures();

walletButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (walletConnected) {
      openWalletActionSheet();
      return;
    }
    openWalletSheet();
    if (telegramConnected) showConnectionRoute("ton");
  });
});

document.querySelector(".wallet-sheet-backdrop")?.addEventListener("click", closeWalletSheet);
document.querySelector(".wallet-sheet-close")?.addEventListener("click", closeWalletSheet);
document.querySelector(".wallet-sheet-back")?.addEventListener("click", () => showConnectionRoute("choice"));
document.querySelectorAll("[data-connection-route]").forEach((button) => {
  button.addEventListener("click", (event) => {
    // A connection choice is an action, not a screen route. Keep an ancestor
    // route from processing the same tap and skipping the choice flow.
    event.preventDefault();
    event.stopPropagation();
    const route = button.dataset.connectionRoute || "choice";
    showConnectionRoute(route);
    if (route === "telegram") {
      importTelegramAccount().catch((error) => {
        setTelegramLoginStatus(error.message || "Telegram connection failed.", true);
      });
    } else if (route === "ton") {
      initTonConnect();
    }
  });
});
document.querySelector(".wallet-action-backdrop")?.addEventListener("click", closeWalletActionSheet);
document.querySelector("[data-wallet-open-tonviewer]")?.addEventListener("click", () => {
  const url = currentWalletExplorer("tonviewer");
  if (url) window.open(url, "_blank", "noopener,noreferrer");
});
document.querySelector("[data-wallet-open-tonscan]")?.addEventListener("click", () => {
  const url = currentWalletExplorer("tonscan");
  if (url) window.open(url, "_blank", "noopener,noreferrer");
});
document.querySelectorAll("[data-token-sort-close]").forEach((button) => button.addEventListener("click", closeTokenSortSheet));
document.querySelectorAll("[data-token-sort]").forEach((button) => {
  button.addEventListener("click", () => {
    tokenSortMode = button.dataset.tokenSort || "value";
    renderTokenRows(latestVisibleTokens);
    closeTokenSortSheet();
  });
});
document.querySelectorAll("[data-activity-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activityFilterMode = button.dataset.activityFilter || "All";
    document.querySelectorAll("[data-activity-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderFullActivity(fullActivityEvents);
  });
});
document.getElementById("activitySearch")?.addEventListener("input", (event) => {
  activitySearchTerm = event.target.value || "";
  clearTimeout(activitySearchTimer);
  if (isTonAddressLike(activitySearchTerm)) {
    activitySearchTimer = setTimeout(async () => {
      try {
        const payload = await requestJson(`/api/wallet/activity?address=${encodeURIComponent(activitySearchTerm.trim())}&limit=200&t=${Date.now()}`, {}, "Could not load address activity");
        activityFilterMode = "All";
        document.querySelectorAll("[data-activity-filter]").forEach((item) => item.classList.toggle("active", item.dataset.activityFilter === "All"));
        activitySearchTerm = "";
        renderFullActivity(payload.activity || []);
      } catch (error) {
        console.warn("Address activity search failed", error);
      }
    }, 450);
    return;
  }
  renderFullActivity(fullActivityEvents);
});
document.querySelector(".tx-sheet-backdrop")?.addEventListener("click", closeTxSheet);
document.querySelector(".tx-sheet-close")?.addEventListener("click", closeTxSheet);
document.getElementById("txTonscanButton")?.addEventListener("click", () => {
  if (txSheetUrl) window.open(txSheetUrl, "_blank", "noopener,noreferrer");
});
document.querySelector("[data-settings-privacy]")?.addEventListener("click", () => {
  document.querySelector(".app-frame")?.classList.toggle("is-private");
});
document.querySelector("[data-settings-theme]")?.addEventListener("click", (event) => {
  const root = document.documentElement;
  const next = root.dataset.theme === "light" ? "dark" : "light";
  root.dataset.theme = next;
  event.currentTarget.querySelector("span").textContent = `Theme: ${next[0].toUpperCase()}${next.slice(1)}`;
});
document.querySelector("[data-settings-refresh]")?.addEventListener("click", refreshConnectedWallet);
document.querySelector("[data-settings-alerts]")?.addEventListener("click", () => showScreen("watchlist"));
document.querySelectorAll("[data-wallet-connect]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await connectTonWallet();
    } catch (error) {
      openWalletSheet();
      setWalletImportStatus(error.message || "TON wallet connection was cancelled.", true);
    }
  });
});
document.querySelector("#walletAddressForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("walletAddressInput");
  const submit = event.currentTarget.querySelector("button[type='submit']");
  submit.disabled = true;
  try {
    await importWallet(input?.value || "", { combineTelegram: telegramConnected, background: telegramConnected });
  } catch (error) {
    setWalletImportStatus(error.message, true);
  } finally {
    submit.disabled = false;
  }
});

document.querySelector("#giftSort")?.addEventListener("change", renderGiftGrid);
document.querySelector("#giftFilter")?.addEventListener("change", renderGiftGrid);
document.querySelector("#giftSearch")?.addEventListener("input", renderGiftGrid);
document.querySelector("#stickerSort")?.addEventListener("change", renderStickerGrid);
document.querySelector("#stickerFilter")?.addEventListener("change", renderStickerGrid);
document.querySelector("#stickerSearch")?.addEventListener("input", renderStickerGrid);
const scrollTopButton = document.querySelector("#scrollTopButton");
function updateScrollTopButton() {
  scrollTopButton?.classList.toggle("is-visible", window.scrollY > 420);
}
scrollTopButton?.addEventListener("click", () => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
});
window.addEventListener("scroll", updateScrollTopButton, { passive: true });
updateScrollTopButton();
document.querySelectorAll("[data-range]").forEach((button) => {
  button.addEventListener("click", () => {
    switchPortfolioRange(button.dataset.range);
  });
});
document.querySelector(".refresh-button")?.addEventListener("click", () => {
  if (liveWalletData) refreshConnectedWallet();
  else {
    setLastUpdatedLabel(Date.now());
    renderPortfolioGraph(activePortfolioRange(), true);
  }
});
function selectAllocation(index) {
  selectedAllocation = selectedAllocation === index ? null : index;
  renderDonut();
}

const allocationDonut = document.querySelector(".donut-chart");
allocationDonut?.addEventListener("click", (event) => {
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left - rect.width / 2;
  const y = event.clientY - rect.top - rect.height / 2;
  const hit = Charts.donutHitIndex(
    [allocationState.gifts, allocationState.tokens, allocationState.stickers],
    x,
    y,
    rect.width,
  );
  if (hit < 0) return;
  selectAllocation(hit);
});
allocationDonut?.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) return;
  event.preventDefault();
  const direction = event.key === "ArrowLeft" ? -1 : 1;
  selectAllocation(selectedAllocation === null ? 0 : (selectedAllocation + direction + 3) % 3);
});
document.querySelectorAll(".allocation-list article").forEach((item, index) => {
  item.addEventListener("click", (event) => {
    event.stopPropagation();
    selectAllocation(index);
  });
  item.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    selectAllocation(index);
  });
});
document.addEventListener("click", (event) => {
  if (selectedAllocation !== null && !event.target.closest(".allocation-card")) {
    selectedAllocation = null;
    renderDonut();
  }
});
document.querySelectorAll("[data-currency-option]").forEach((option) => {
  option.addEventListener("click", (event) => {
    event.stopPropagation();
    setCurrency(option.dataset.currencyOption);
  });
});
document.querySelector("#priceToggle")?.addEventListener("click", () => {
  priceMode = priceMode === "USD" ? "TON" : "USD";
  document.querySelector("#priceToggle").textContent = priceMode;
  const activeAsset = currentDetailAssetId();
  if (!activeAsset) return;
  const detail = assetDetails[activeAsset];
  if (detail?.type === "gift") renderAssetDetail(activeAsset);
  else drawDetailPriceChart(detail);
});

["copy", "cut", "contextmenu", "selectstart"].forEach((eventName) => {
  document.addEventListener(eventName, (event) => {
    if (event.target.closest("input, textarea, [contenteditable], .wallet-address, .tx-detail-list")) return;
    if (eventName === "contextmenu") event.preventDefault();
  });
});

document.addEventListener("keydown", (event) => {
  const externalTarget = event.target.closest?.("[data-external-url]");
  if (externalTarget && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    const url = externalTarget.dataset.externalUrl || "";
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && ["s", "p"].includes(key)) {
    event.preventDefault();
  }
});

const params = new URLSearchParams(window.location.search);
const initialScreen = params.get("screen");
const initialAsset = params.get("asset");
renderCollectibleGrids();
renderPortfolioGraph();
renderDonut();
renderAnalyticsChart();
if (initialScreen && document.querySelector(`[data-screen="${initialScreen}"]`) && walletConnected) {
  if (initialScreen === "detail") renderAssetDetail(initialAsset);
  showScreen(initialScreen);
} else {
  const defaultScreen = document.querySelector('[data-screen="home"]') || screens[0];
  if (defaultScreen) showScreen(defaultScreen.dataset.screen);
}
if (window.lucide) window.lucide.createIcons();
clearStaticPortfolioPreview();
renderWalletState();
renderAssetsDotMatrix();
applyCurrencyDisplay();
if (document.querySelector('[data-screen="home"].is-active')) {
  playHomeEntrance();
  homeEntrancePlayed = true;
}
