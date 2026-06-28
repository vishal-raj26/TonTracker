const screens = document.querySelectorAll("[data-screen]");
const navButtons = document.querySelectorAll(".dock button");
const walletButtons = document.querySelectorAll(".js-connect-wallet");
const homeWalletCard = document.querySelector(".home-wallet-card");
const homeWalletTitle = document.querySelector("#homeWalletTitle");
const homeWalletText = document.querySelector("#homeWalletText");
const homeWalletButton = document.querySelector("#homeWalletButton");
let walletConnected = false;
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
let homePortfolioValue = 0;
let homePortfolioDelta = 0;
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
let historyPreloadToken = 0;
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
let allocationUiLocked = false;
let loaderStatusCycleTimer = 0;
let loaderStatusCycleIndex = 0;
let loaderPhaseKey = "";
const sectionLoadState = new Map();
let sectionToastTimer = 0;
const LOADER_FETCH_MESSAGES = [
  "Reading TON balances...",
  "Loading collectibles...",
  "Fetching gift collections...",
  "Calculating portfolio value...",
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
      { label: "Model", value: "Hypnotoad", rarity: "1.2% — Very Rare" },
      { label: "Backdrop", value: "Electric Indigo", rarity: "1.5% — Rare" },
      { label: "Symbol", value: "Coin", rarity: "0.2% — Ultra Rare" },
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
    upgraded: "Upgraded · 2,500 Stars · ~$25",
    provenance: 'Gifted by @alex to you · May 15 · "Happy birthday!"',
    comboRank: "Top 0.03% rarest trait combo in this collection",
    exactCount: "Only 9 gifts share this exact Model + Backdrop + Symbol",
    quickSellTon: 135.8,
    quickSellUsd: 2698,
    sales: [
      ["148 TON · $2,938", "May 15", "Hypnotoad", "Electric Indigo", "Coin", "Getgems"],
      ["143 TON · $2,840", "May 14", "Hypnotoad", "Electric Indigo", "Coin", "Fragment"],
      ["139 TON · $2,761", "May 12", "Hypnotoad", "Electric Indigo", "Coin", "Getgems"],
    ],
    intel: {
      trend: "▂▃▅▆▇",
      badge: "Trending Up",
      sales24h: "3 exact variant sales",
      volume24h: "430 TON · $8,539",
      prior: "+34% volume · +12% sales count",
      daysToSell: "~2.4 days",
      listedSupply: "12 listed across Getgems + Fragment",
      listingRate: "Listed: 8% of supply — low supply supports price",
      bestTime: "Thursdays 6–9 PM UTC",
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
      { label: "Model", value: "Goldcrest", rarity: "2.4% — Rare" },
      { label: "Backdrop", value: "Velvet Night", rarity: "3.1% — Scarce" },
      { label: "Symbol", value: "Star", rarity: "0.8% — Very Rare" },
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
    upgraded: "Upgraded · 1,200 Stars · ~$12",
    provenance: 'Gifted by @mira to you · Apr 28 · "For the vault"',
    comboRank: "Top 0.12% rarest trait combo in this collection",
    exactCount: "Only 21 gifts share this exact Model + Backdrop + Symbol",
    quickSellTon: 93.1,
    quickSellUsd: 1862,
    sales: [
      ["101 TON · $2,018", "May 14", "Goldcrest", "Velvet Night", "Star", "Fragment"],
      ["97 TON · $1,931", "May 11", "Goldcrest", "Velvet Night", "Star", "Getgems"],
    ],
    intel: {
      trend: "▂▃▄▅▅",
      badge: "Stable",
      sales24h: "2 exact variant sales",
      volume24h: "198 TON · $3,949",
      prior: "+9% volume · +4% sales count",
      daysToSell: "~3.1 days",
      listedSupply: "18 listed across Getgems + Fragment",
      listingRate: "Listed: 11% of supply",
      bestTime: "Sundays 4–7 PM UTC",
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
      { label: "Model", value: "Soft Flare", rarity: "8.2% — Notable" },
      { label: "Backdrop", value: "Mint Haze", rarity: "4.5% — Scarce" },
      { label: "Symbol", value: "Moon", rarity: "2.1% — Rare" },
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
    upgraded: "Not upgraded · 0 Stars · $0",
    provenance: 'Gifted by @dani to you · Mar 12 · "Tiny star"',
    comboRank: "Top 1.6% rarest trait combo in this collection",
    exactCount: "Only 144 gifts share this exact Model + Backdrop + Symbol",
    quickSellTon: 19.95,
    quickSellUsd: 399,
    sales: [
      ["22 TON · $438", "May 13", "Soft Flare", "Mint Haze", "Moon", "Getgems"],
      ["21 TON · $420", "May 10", "Soft Flare", "Mint Haze", "Moon", "Fragment"],
    ],
    intel: {
      trend: "▅▄▃▃▂",
      badge: "Cooling",
      sales24h: "1 exact variant sale",
      volume24h: "21 TON · $420",
      prior: "-12% volume · -18% sales count",
      daysToSell: "~5.8 days",
      listedSupply: "64 listed across Getgems + Fragment",
      listingRate: "Listed: 19% of supply",
      bestTime: "Fridays 5–8 PM UTC",
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
      { label: "Model", value: "Champion", rarity: "1.8% — Very Rare" },
      { label: "Backdrop", value: "Carbon Black", rarity: "2.7% — Rare" },
      { label: "Symbol", value: "Laurel", rarity: "0.9% — Very Rare" },
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
    upgraded: "Upgraded · 900 Stars · ~$9",
    provenance: 'Gifted by @tonfan to you · Feb 09 · "Winner"',
    comboRank: "Top 0.18% rarest trait combo in this collection",
    exactCount: "Only 15 gifts share this exact Model + Backdrop + Symbol",
    quickSellTon: 65.55,
    quickSellUsd: 1311,
    sales: [
      ["70 TON · $1,398", "May 15", "Champion", "Carbon Black", "Laurel", "Getgems"],
      ["67 TON · $1,337", "May 12", "Champion", "Carbon Black", "Laurel", "Fragment"],
    ],
    intel: {
      trend: "▂▄▅▆▇",
      badge: "Trending Up",
      sales24h: "2 exact variant sales",
      volume24h: "137 TON · $2,735",
      prior: "+22% volume · +9% sales count",
      daysToSell: "~2.9 days",
      listedSupply: "15 listed across Getgems + Fragment",
      listingRate: "Listed: 7% of supply — tight inventory",
      bestTime: "Thursdays 6–9 PM UTC",
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
      ["Emoji Trigger", "🐱"],
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
      ["32 TON · $638", "May 14", "Animated", "NeonCatLab", "Getgems"],
      ["31 TON · $620", "May 12", "Animated", "NeonCatLab", "Getgems"],
    ],
    intel: {
      trend: "▅▄▃▃▂",
      badge: "Cooling",
      sales24h: "4 pack sales",
      volume24h: "124 TON · $2,476",
      prior: "-8% volume · -11% sales",
      daysToSell: "~4.1 days",
      listedSupply: "41 listed across Getgems",
      listingRate: "Listed: 14% of total supply",
      bestTime: "Mondays 7–9 PM UTC",
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
      ["Emoji Trigger", "🙂"],
      ["Format", "Static"],
      ["Sticker Count", "18"],
      ["Set ID", "ton://sticker/pixel-faces"],
      ["Creator", "PixelForge"],
      ["Release Type", "Limited Drop"],
      ["Collaboration", "PixelForge Ã— Telegram"],
      ["Drop Date", "March 22, 2026"],
    ],
    quickSellTon: 41.8,
    quickSellUsd: 836,
    sales: [
      ["45 TON · $898", "May 15", "Static", "PixelForge", "Getgems"],
      ["43 TON · $858", "May 13", "Static", "PixelForge", "Getgems"],
    ],
    intel: {
      trend: "▂▃▅▆▇",
      badge: "Trending Up",
      sales24h: "7 pack sales",
      volume24h: "306 TON · $6,109",
      prior: "+28% volume · +18% sales",
      daysToSell: "~1.9 days",
      listedSupply: "23 listed across Getgems",
      listingRate: "Listed: 6% of total supply — price support",
      bestTime: "Thursdays 6–9 PM UTC",
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
      ["Emoji Trigger", "🌙"],
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
      ["21 TON · $420", "May 13", "Video", "MoonStudio", "Getgems"],
      ["20 TON · $399", "May 11", "Video", "MoonStudio", "Getgems"],
    ],
    intel: {
      trend: "▃▄▃▄▅",
      badge: "Stable",
      sales24h: "5 pack sales",
      volume24h: "102 TON · $2,041",
      prior: "+4% volume · +2% sales",
      daysToSell: "~3.5 days",
      listedSupply: "78 listed across Getgems",
      listingRate: "Listed: 18% of total supply",
      bestTime: "Saturdays 3–6 PM UTC",
    },
    chart: [378, 390, 402, 398, 407, 414, 410],
  },
];
const demoStickerAssets = stickerAssets.map((asset) => structuredClone(asset));

const tokenDetails = {
  toncoin: {
    id: "toncoin",
    type: "token",
    name: "Toncoin",
    category: "TON Token",
    value: "$4,180 · +2.4%",
    icon: "coins",
    tone: "token-bg",
    statOneLabel: "Balance",
    statOne: "1,340 TON",
    statTwoLabel: "Price",
    statTwo: "$3.12",
    statThreeLabel: "Wallet",
    statThree: "Main",
    pnl: "+$610",
    history: "Received 30 TON · 3m ago",
    link: "Explorer",
  },
  notcoin: {
    id: "notcoin",
    type: "token",
    name: "Notcoin",
    category: "TON Token",
    value: "$1,120 · -1.1%",
    icon: "circle-dollar-sign",
    tone: "token-bg",
    statOneLabel: "Balance",
    statOne: "18,400 NOT",
    statTwoLabel: "Price",
    statTwo: "$0.008",
    statThreeLabel: "Wallet",
    statThree: "Trading",
    pnl: "-$42",
    history: "Bought 4,200 NOT · May 10",
    link: "Explorer",
  },
  "jetton-basket": {
    id: "jetton-basket",
    type: "token",
    name: "Jetton Basket",
    category: "TON Token",
    value: "$440 · +0.8%",
    icon: "landmark",
    tone: "token-bg",
    statOneLabel: "Assets",
    statOne: "6 jettons",
    statTwoLabel: "Best",
    statTwo: "+4.2%",
    statThreeLabel: "Wallet",
    statThree: "Main",
    pnl: "+$36",
    history: "Portfolio refreshed · Today",
    link: "Explorer",
  },
};

const assetDetails = Object.fromEntries([...giftAssets, ...stickerAssets, ...Object.values(tokenDetails)].map((asset) => [asset.id, asset]));

function money(value) {
  if (displayCurrency === "TON") return `${(value / usdTonRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TON`;
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
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

function tokenAddressForApi(detail = {}) {
  return detail.address && detail.address !== "Native TON" ? detail.address : "";
}

function tokenStonAddress(detail = {}) {
  if (detail.address) return detail.address;
  return String(detail.symbol || "").toUpperCase() === "TON"
    ? "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"
    : "";
}

function showScreen(name) {
  const previousScreen = document.querySelector(".screen.is-active")?.dataset.screen;
  screens.forEach((screen) => {
    screen.classList.toggle("is-active", screen.dataset.screen === name);
  });
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
  banner.innerHTML = `<small>${label}</small><div><h2>${money(total)}</h2><span>${compactNumber(totalTon)} TON</span></div><strong class="${dailyClass}">${signedMoney(daily)} · ${signedPct(dailyPct)} 24h</strong><p>${kind === "gifts" ? "Gift" : "Sticker"} unrealized PnL: <b class="${pnlClass}">${signedMoney(pnl)} · ${signedPct(pnlPct)}</b></p>`;
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
    const missing = Math.max(0, holdings.length - fetched);
    coverageLabel.textContent = `${fetched} fetched · ${missing} missing`;
    coverageLabel.classList.toggle("is-complete", Boolean(holdings.length) && missing === 0);
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
    const count = items.reduce((sum, asset) => sum + Number(asset.count || 1), 0);
    countLabel.textContent = `${count} sticker${count === 1 ? "" : "s"}`;
  }
  grid.innerHTML = items.length ? items.map(renderStickerCard).join("") : `<article class="collectible-card"><div class="value-stack"><strong>No stickers found</strong><small>Try a different search.</small></div></article>`;
  window.lucide?.createIcons();
  initCollectibleAnimations(grid);
  applyCurrencyDisplay();
}

function filterAssets(items, filter) {
  if (filter === "all") return [...items];
  if (filter === "listed") return items.filter((item) => item.status !== "Unlisted");
  if (filter === "unlisted") return items.filter((item) => item.status === "Unlisted");
  const [field, value] = filter.split(":");
  if (field === "collection") return items.filter((item) => item.collection === value);
  if (field === "model" || field === "backdrop" || field === "symbol") {
    const label = field[0].toUpperCase() + field.slice(1);
    return items.filter((item) => item.traits?.some((trait) => trait.label === label && trait.value === value));
  }
  if (field === "format") return items.filter((item) => item.format === value);
  if (field === "creator") return items.filter((item) => item.creator === value);
  if (field === "edition") return items.filter((item) => item.edition === value);
  return [...items];
}

function sortAssets(items, sort) {
  const sorted = [...items];
  const firstTraitPct = (item) => Number.parseFloat(item.traits?.[0]?.rarity || "99");
  const mintNumber = (item) => item.mint?.current || 999999;
  const sorters = {
    "floor-desc": (a, b) => b.floorUsd - a.floorUsd,
    "floor-asc": (a, b) => a.floorUsd - b.floorUsd,
    "pnl-desc": (a, b) => b.pnlPct - a.pnlPct,
    "daily-desc": (a, b) => b.dailyPct - a.dailyPct,
    "date-desc": (a, b) => b.acquiredSort - a.acquiredSort,
    "tag-asc": (a, b) => (a.tag || 0) - (b.tag || 0),
    "model-rarity": (a, b) => firstTraitPct(a) - firstTraitPct(b),
    "mint-asc": (a, b) => mintNumber(a) - mintNumber(b),
    "name-asc": (a, b) => a.name.localeCompare(b.name),
  };
  return sorted.sort(sorters[sort] || sorters["floor-desc"]);
}

function floorSourceLine(asset = {}) {
  const parts = ["Floor"];
  if (asset.floorSource === "model") parts.push("Model");
  if (Number(asset.floorTon || 0) > 0) parts.push(`${Number(asset.floorTon).toFixed(2)} TON`);
  const platform = marketSourceLabel(asset.marketPlatform);
  if (platform && platform !== "xGift Model" && platform !== "Model Floor") parts.push(platform);
  if (Number(asset.initTon || 0) > 0) parts.push(`Init ${Number(asset.initTon).toFixed(2)} TON`);
  else if (Number(asset.initUsd || 0) > 0) parts.push(`Init ${money(asset.initUsd)}`);
  return parts.map((part) => escapeHtml(String(part))).join(" · ");
}

function renderGiftCard(asset) {
  if (asset.priceLoading && !(Number(asset.floorUsd || 0) > 0)) return renderCollectiblePriceSkeletonCard(asset, "gift");
  const dailyClass = asset.dailyUsd >= 0 ? "positive" : "negative";
  const pnlClass = asset.pnlUsd >= 0 ? "positive" : "negative";
  const listed = asset.status && asset.status !== "Unlisted";
  const title = asset.name || asset.collection || "Gift";
  const subtitle = [asset.creator, asset.collection].find((value) => value && collectibleKey(value) !== collectibleKey(title)) || "";
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
        <span class="tag-number">${Number(asset.count || 1)} gift${Number(asset.count || 1) === 1 ? "" : "s"}</span>
      </div>
      ${provenance || listed ? `<div class="card-meta-line ${provenance ? "" : "is-status-only"}">${provenance ? `<span>${escapeHtml(provenance)}</span>` : ""}${listed ? `<b class="status-badge is-listed">${escapeHtml(asset.status)}</b>` : ""}</div>` : ""}
      <div class="value-stack"><strong>${hasPrice ? money(asset.floorUsd) : "Price unavailable"}</strong><small>${floorNote}</small></div>
      <div class="pnl-row">
        <span class="pnl-box"><small>Daily PnL</small><b class="${dailyClass}">${hasPrice ? `${signedMoney(asset.dailyUsd)} · ${signedPct(asset.dailyPct)}` : "—"}</b></span>
        <span class="pnl-box"><small>Total PnL</small><b class="${pnlClass}">${hasPrice ? `${signedMoney(asset.pnlUsd)} · ${signedPct(asset.pnlPct)}` : "—"}</b></span>
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
    summary.innerHTML = `<small>${escapeHtml(brand.creator || brand.collection || "Gift collection")}</small><div><h2>${money(totalValue)}</h2><span>${count} gift${count === 1 ? "" : "s"}</span></div><strong class="${pnl < 0 ? "negative" : "positive"}">${init ? `${signedMoney(pnl)} · ${signedPct((pnl / init) * 100)}` : "Open a gift to see details"}</strong>`;
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
  if (!numbers.length) return escapeHtml(parts.join(" · "));
  return escapeHtml(parts.join(" · "));
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

function giftBrandImageKey(asset = {}) {
  return collectibleKey(asset.animatedImage || asset.animationUrl || asset.image || asset.iconUrl || asset.previewUrl || "");
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
    };
    item.children.push(asset);
    item.count += Number(asset.count || 1);
    item.floorUsd += Number(asset.floorUsd || 0);
    item.floorTon += Number(asset.floorTon || 0);
    item.initUsd = Number(item.initUsd || 0) + Number(asset.initUsd || asset.costBasis || 0);
    item.priceLoading = item.priceLoading || Boolean(asset.priceLoading && !(Number(asset.floorUsd || 0) > 0));
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
  const floorNote = hasPrice ? floorSourceLine(asset) : (asset.marketPlatform ? `Floor · ${escapeHtml(asset.marketPlatform)}` : "Open details");
  const count = Number(asset.count || asset.children?.length || 1);
  const imageStack = count > 1 ? giftBrandImageStack(asset) : "";
  const modelLabel = giftBrandModelLabel(asset);
  const modelCount = giftBrandModelNumber(asset);
  const modelMeta = modelCount > 0 ? `${modelLabel} · model ${modelCount.toLocaleString()}` : modelLabel;
  const target = count > 1 ? "gift-model-group" : "detail";
  return `
    <article class="collectible-card is-gift-card ${imageStack ? "has-gift-stack" : ""} ${count > 1 ? "is-grouped-gift" : ""}" data-screen-target="${target}" data-asset="${asset.id}">
      <div class="collectible-top">
        ${imageStack || collectibleArtHtml(asset, "gift")}
        <div><h3>${escapeHtml(asset.collection || asset.name)}</h3><small>${escapeHtml(modelMeta)}</small></div>
        <span class="gift-model-badges">
          <b>${count} gift${count === 1 ? "" : "s"}</b>
          ${modelCount > 0 ? `<small>${modelCount.toLocaleString()} model</small>` : ""}
        </span>
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

function refreshActiveGiftViews() {
  const activeGiftScreen = document.querySelector('[data-screen="gift-brand"].is-active');
  const modelGroupAsset = activeGiftScreen?.dataset.modelGroupAsset;
  if (modelGroupAsset && assetDetails[modelGroupAsset]) {
    renderGiftModelGroup(modelGroupAsset);
  } else if (activeGiftScreen?.dataset.asset) {
    renderGiftBrand(activeGiftScreen.dataset.asset);
  }
  const activeDetail = assetDetails[currentDetailAssetId()];
  if (activeDetail?.type === "gift") renderGiftDetailPage(activeDetail, { loading: false });
}

function renderGiftIndividualItem(asset) {
  const hasPrice = Number(asset.floorUsd) > 0;
  const number = giftBrandMintLabel(asset);
  const modelLabel = giftBrandModelLabel(asset);
  const title = giftDetailTitle(asset);
  return `
    <article class="collectible-card is-gift-card is-individual-gift" data-screen-target="detail" data-asset="${asset.id}">
      <div class="collectible-top">
        ${collectibleArtHtml(asset, "gift")}
        <div>
          <h3>${escapeHtml(title)}</h3>
          <small>${escapeHtml(modelLabel)}</small>
        </div>
        ${number ? `<span class="tag-number">${escapeHtml(number)}</span>` : ""}
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
  const inferredType = /\.(?:lottie\.)?json(?:[?#].*)?$/i.test(String(animatedUrl))
    ? "lottie"
    : (asset.mediaType || (/(\.webm|\.mp4|\.mov)(?:[?#].*)?$/i.test(String(animatedUrl)) ? "video" : "image"));
  if (inferredType === "lottie") {
    return { url: animatedUrl || fallbackUrl || "", type: "lottie", fallback: fallbackUrl, animationUrl: animatedUrl, mediaType: "lottie" };
  }
  const url = animatedUrl || fallbackUrl || "";
  return { url, type: inferredType, fallback: fallbackUrl };
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

function giftLayeredArtHtml(asset = {}, wrapperClass = "animated-art") {
  const layer = giftLayerDescriptor(asset);
  if (!layer?.modelAnimationUrl) return "";
  const media = { url: layer.modelAnimationUrl, type: layer.mediaType || "lottie", fallback: "" };
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
  return collectibleMediaHtml({ ...media, fallback: "" }, asset.name || "Gift");
}

function collectibleMediaHtml(media = {}, alt = "Collectible", className = "") {
  const url = resolveTokenImage(media.url || "");
  if (!url) return "";
  const fallback = resolveTokenImage(media.fallback || "");
  const classList = className ? ` ${escapeHtml(className)}` : "";
  if (media.type === "video") {
    return `<video class="${classList.trim()}" src="${escapeHtml(url)}" autoplay muted loop playsinline preload="metadata" ${fallback ? `poster="${escapeHtml(fallback)}"` : ""}></video>`;
  }
  if (media.type === "lottie") {
    return `<span class="lottie-host${classList}" data-lottie-src="${escapeHtml(url)}" ${fallback ? `data-lottie-fallback="${escapeHtml(fallback)}"` : ""}>${fallback ? `<img class="lottie-fallback" src="${escapeHtml(fallback)}" alt="${escapeHtml(alt)}" loading="eager" decoding="async">` : ""}</span>`;
  }
  return `<img class="${classList.trim()}" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="eager" decoding="async">`;
}

let collectibleLottieLibraryPromise = null;
const collectibleLottieDataCache = new Map();

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
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js";
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

function initCollectibleAnimations(scope = document) {
  const hosts = [...scope.querySelectorAll("[data-lottie-src]:not([data-lottie-bound])")];
  if (!hosts.length) return;
  hosts.forEach((host) => { host.dataset.lottieBound = "1"; });
  ensureCollectibleLottieLibrary()
    .then((lottie) => {
      hosts.forEach((host) => {
        const src = host.dataset.lottieSrc;
        if (!src || host.__lottieAnimation) return;
        host.classList.add("is-lottie-loading");
        loadCollectibleLottieData(src).then((animationData) => {
          if (!host.isConnected || host.__lottieAnimation) return;
          const animation = lottie.loadAnimation({
            container: host,
            renderer: "svg",
            loop: true,
            autoplay: true,
            animationData,
            rendererSettings: {
              progressiveLoad: true,
              preserveAspectRatio: "xMidYMid meet",
            },
          });
          host.__lottieAnimation = animation;
          const markReady = () => {
            host.classList.remove("is-lottie-loading");
            host.classList.add("is-lottie-ready");
          };
          const markFailed = () => {
            host.classList.remove("is-lottie-loading");
            host.classList.add("is-lottie-failed");
          };
          animation.addEventListener?.("DOMLoaded", markReady);
          animation.addEventListener?.("data_failed", markFailed);
          animation.addEventListener?.("error", markFailed);
        }).catch(() => {
          host.classList.remove("is-lottie-loading");
          host.classList.add("is-lottie-failed");
        });
      });
    })
    .catch(() => {
      hosts.forEach((host) => host.classList.add("is-lottie-failed"));
    });
}

function openGiftPfpTray(assetId, trigger = null) {
  const asset = assetDetails[assetId];
  if (!asset) return;
  closeGiftPfpTray();
  const children = asset.children?.length ? asset.children : [asset];
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
          const number = giftBrandMintLabel(item);
          return `<button type="button" data-screen-target="detail" data-asset="${escapeHtml(item.id)}">
            ${collectibleArtHtml(item, "gift")}
            <span>${escapeHtml(giftBrandModelLabel(item))}</span>
            <small>${number ? escapeHtml(number) : "Gift"}</small>
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

function giftFloorRequestKey(collection = "", model = "", backdrop = "") {
  return [collection, model, backdrop].map(collectibleKey).join(":");
}

function giftAssetFloorKey(asset = {}, group = {}) {
  return giftFloorRequestKey(
    asset.collection || group.collection || group.name,
    giftModelTrait(asset),
    giftTraitValue(asset, "Backdrop"),
  );
}

function giftFloorResponseKeys(model = {}) {
  return [...new Set([
    model.requestKey,
    giftFloorRequestKey(model.collection, model.model || model.modelKey, model.backdrop),
    giftFloorRequestKey(model.collectionKey, model.modelKey, model.backdrop),
    giftFloorRequestKey(model.collectionKey, model.modelKey, model.backdropKey),
  ].filter(Boolean))];
}

function giftModelTrait(asset = {}) {
  return (asset.traits || []).find((trait) => /model/i.test(String(trait.label || "")))?.value || "";
}

function giftTraitValue(asset = {}, label = "") {
  return (asset.traits || []).find((trait) => String(trait.label || "").toLowerCase() === label.toLowerCase())?.value || "";
}

function applyGiftModelFloor(asset, model = {}) {
  const floorUsd = Number(model.floorUsd || 0);
  const floorTon = Number(model.floorTon || 0);
  if (!(floorUsd > 0 || floorTon > 0)) return false;
  asset.floorUsd = floorUsd;
  asset.floorTon = floorTon;
  asset.marketVerified = true;
  asset.priceLoading = false;
  const isBackdropFloor = model.source === "d1-backdrop-floor";
  asset.marketPlatform = isBackdropFloor ? "Backdrop Floor" : "Model Floor";
  asset.floorSource = isBackdropFloor ? "backdrop" : "model";
  if (model.iconUrl || model.animationUrl) {
    if (model.iconUrl) {
      asset.iconUrl = model.iconUrl || asset.iconUrl || "";
    }
    if (model.animationUrl) {
      asset.animatedImage = model.animationUrl || asset.animatedImage || "";
      asset.animationUrl = model.animationUrl || asset.animationUrl || "";
    }
    asset.mediaType = model.mediaType
      || asset.mediaType
      || (/\.(?:lottie\.)?json(?:[?#].*)?$/i.test(String(model.animationUrl || model.iconUrl || "")) ? "lottie" : (/(\.webm|\.mp4|\.mov)(?:[?#].*)?$/i.test(String(model.animationUrl || model.iconUrl || "")) ? "video" : "image"));
  }
  asset.modelFloor = {
    model: model.model || giftModelTrait(asset),
    listedCount: Number(model.listedCount || 0),
    deals30d: Number(model.deals30d || 0),
    avg30dTon: Number(model.avg30dTon || 0),
    rarity: Number(model.rarity || 0),
    updatedAt: model.marketUpdatedAt || "",
    iconUrl: model.iconUrl || "",
    animationUrl: model.animationUrl || "",
    mediaType: model.mediaType || "",
    source: model.source || "",
  };
  const traitRarities = new Map(
    Object.entries(model.traitRarities || {})
      .map(([label, rarity]) => [collectibleKey(label), Number(rarity || 0)])
  );
  asset.traits = (asset.traits || []).map((trait) => {
    const rarity = traitRarities.get(collectibleKey(trait.label)) || 0;
    return rarity > 0 ? { ...trait, rarity: `${rarity}%` } : trait;
  });
  asset.quickSellTon = floorTon * 0.95;
  asset.quickSellUsd = floorUsd * 0.95;
  const costBasis = Number(asset.costBasis || asset.initUsd || 0);
  asset.pnlUsd = costBasis ? floorUsd - costBasis : 0;
  asset.pnlPct = costBasis ? ((floorUsd - costBasis) / costBasis) * 100 : 0;
  return true;
}

function syncGiftFloorAcrossAssets(detail = {}) {
  if (detail?.type !== "gift" || detail.floorSource !== "backdrop") return;
  const collectionKey = collectibleKey(detail.collection || detail.name);
  const modelKey = collectibleKey(giftModelTrait(detail));
  const backdropKey = collectibleKey(giftTraitValue(detail, "Backdrop"));
  if (!collectionKey || !modelKey || !backdropKey || !(Number(detail.floorUsd || 0) > 0 || Number(detail.floorTon || 0) > 0)) return;
  const floorPayload = {
    collection: detail.collection || detail.name,
    model: giftModelTrait(detail),
    backdrop: giftTraitValue(detail, "Backdrop"),
    floorUsd: Number(detail.floorUsd || 0),
    floorTon: Number(detail.floorTon || 0),
    listedCount: Number(detail.intel?.listedCount || detail.modelFloor?.listedCount || 0),
    marketUpdatedAt: detail.modelFloor?.updatedAt || "",
    marketPlatform: detail.marketPlatform || "Backdrop Floor",
    marketUrl: detail.marketUrl || "",
    source: "d1-backdrop-floor",
  };
  giftAssets.forEach((group) => {
    let touched = false;
    (group.children || []).forEach((child) => {
      const sameCombo = collectibleKey(child.collection || child.name) === collectionKey
        && collectibleKey(giftModelTrait(child)) === modelKey
        && collectibleKey(giftTraitValue(child, "Backdrop")) === backdropKey;
      if (!sameCombo) return;
      if (applyGiftModelFloor(child, floorPayload)) {
        assetDetails[child.id] = child;
        touched = true;
      }
    });
    if (touched) {
      recomputeGiftGroup(group);
      assetDetails[group.id] = group;
    }
  });
  renderCollectibleGrids();
  const activeGiftScreen = document.querySelector('[data-screen="gift-brand"].is-active');
  const modelGroupAsset = activeGiftScreen?.dataset.modelGroupAsset;
  if (modelGroupAsset && assetDetails[modelGroupAsset]) renderGiftModelGroup(modelGroupAsset);
  else if (activeGiftScreen?.dataset.asset) renderGiftBrand(activeGiftScreen.dataset.asset);
  updateAllocationUi();
  syncAssetsSummary();
  updateCategoryAndTopAsset();
}

function resetGiftCollectionFloorPlaceholder(asset = {}) {
  if (asset.floorSource === "model" && !giftTraitValue(asset, "Backdrop")) return;
  asset.floorUsd = 0;
  asset.floorTon = 0;
  asset.marketVerified = false;
  asset.priceLoading = true;
  asset.marketPlatform = "";
  asset.floorSource = "";
  asset.quickSellTon = 0;
  asset.quickSellUsd = 0;
  asset.pnlUsd = 0;
  asset.pnlPct = 0;
}

function markGiftFloorUnavailable(asset = {}) {
  asset.floorUsd = 0;
  asset.floorTon = 0;
  asset.marketVerified = false;
  asset.priceLoading = false;
  asset.marketPlatform = "";
  asset.floorSource = "";
  asset.quickSellTon = 0;
  asset.quickSellUsd = 0;
  asset.pnlUsd = 0;
  asset.pnlPct = 0;
}

function recomputeGiftGroup(group) {
  const children = group.children || [];
  group.floorUsd = children.reduce((sum, child) => sum + Number(child.floorUsd || 0), 0);
  group.floorTon = children.reduce((sum, child) => sum + Number(child.floorTon || 0), 0);
  group.initUsd = children.reduce((sum, child) => sum + Number(child.initUsd || child.costBasis || 0), 0);
  group.initTon = children.reduce((sum, child) => sum + Number(child.initTon || 0), 0);
  group.priceLoading = children.some((child) => child.priceLoading && !(Number(child.floorUsd || 0) > 0));
  if (children.some((child) => child.floorSource === "model")) group.marketPlatform = "Model Floor";
  else if (children.some((child) => child.floorSource === "backdrop")) group.marketPlatform = "Backdrop Floor";
  group.marketVerified = group.floorUsd > 0 || group.floorTon > 0;
  group.quickSellUsd = group.floorUsd * 0.95;
  group.quickSellTon = group.floorTon * 0.95;
  group.pnlUsd = group.initUsd ? group.floorUsd - group.initUsd : 0;
  group.pnlPct = group.initUsd ? (group.pnlUsd / group.initUsd) * 100 : 0;
}

async function hydrateGiftModelFloors(groups = []) {
  const giftGroups = groups.filter((group) => group?.type === "gift");
  if (!giftGroups.length) return;
  const pairMap = new Map();
  giftGroups.forEach((group) => {
    (group.children || []).forEach((child) => {
      resetGiftCollectionFloorPlaceholder(child);
      const collection = child.collection || group.collection || group.name;
      const model = giftModelTrait(child);
      const backdrop = giftTraitValue(child, "Backdrop");
      const symbol = giftTraitValue(child, "Symbol");
      if (collection && model) {
        const key = giftFloorRequestKey(collection, model, backdrop);
        pairMap.set(key, { collection, model, backdrop, symbol });
      }
    });
    recomputeGiftGroup(group);
  });
  let pending = [...pairMap.values()];
  const applyPayload = (payload = {}) => {
    const models = new Map();
    (payload.models || []).forEach((model) => {
      giftFloorResponseKeys(model).forEach((key) => models.set(key, model));
    });
    giftGroups.forEach((group) => {
      (group.children || []).forEach((child) => {
        const model = models.get(giftAssetFloorKey(child, group));
        if (model && !applyGiftModelFloor(child, model) && model.source === "d1-combo-missing") {
          markGiftFloorUnavailable(child);
        }
        assetDetails[child.id] = child;
      });
      recomputeGiftGroup(group);
      assetDetails[group.id] = group;
    });
    renderCollectibleGrids();
    refreshActiveGiftViews();
    updateAllocationUi();
    syncAssetsSummary();
    updateCategoryAndTopAsset();
  };
  for (let attempt = 0; pending.length && attempt < 5; attempt += 1) {
    if (attempt) await delay(Math.min(8000, 1000 * (2 ** (attempt - 1))));
    const payload = await requestJson("/api/gift-model-floors/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairs: pending }),
    }, "Gift model floors failed");
    applyPayload(payload);
    pending = Array.isArray(payload.pending) ? payload.pending : [];
  }
  if (pending.length) {
    const pendingKeys = new Set(pending.map((pair) => giftFloorRequestKey(pair.collection, pair.model, pair.backdrop)));
    giftGroups.forEach((group) => {
      (group.children || []).forEach((child) => {
        const key = giftAssetFloorKey(child, group);
        if (pendingKeys.has(key)) {
          markGiftFloorUnavailable(child);
        }
        assetDetails[child.id] = child;
      });
      recomputeGiftGroup(group);
      assetDetails[group.id] = group;
    });
    renderCollectibleGrids();
    refreshActiveGiftViews();
    updateAllocationUi();
    syncAssetsSummary();
    updateCategoryAndTopAsset();
  }
}

function renderStickerCard(asset) {
  if (asset.priceLoading && !(Number(asset.floorUsd || 0) > 0)) return renderCollectiblePriceSkeletonCard(asset, "sticker");
  const dailyClass = asset.dailyUsd >= 0 ? "positive" : "negative";
  const pnlClass = asset.pnlUsd >= 0 ? "positive" : "negative";
  const statusClass = asset.status === "Unlisted" ? "is-unlisted" : "is-listed";
  const statusBadge = asset.status && asset.status !== "Unlisted" ? `<span class="status-badge ${statusClass}">${escapeHtml(asset.status)}</span>` : "";
  const editionClass = asset.edition === "Limited Drop" ? "is-limited" : "is-open";
  const hasPrice = Number(asset.floorUsd) > 0;
  const floorNote = hasPrice
    ? floorSourceLine(asset)
    : "No market price available";
  return `
    <article class="collectible-card" data-screen-target="sticker-brand" data-asset="${asset.id}">
      <div class="collectible-top">
        ${collectibleArtHtml(asset, "sticker")}
        <div><h3>${asset.name}</h3><small>${escapeHtml(asset.subtitle || asset.creator || asset.collection || "Sticker Brand")}</small></div>
        <span class="tag-number">${asset.count} sticker${asset.count === 1 ? "" : "s"}</span>
      </div>
      <div class="sticker-badge-row"><span class="format-badge">${asset.format}</span><span class="edition-badge ${editionClass}">${asset.edition}</span>${statusBadge}</div>
      <div class="value-stack"><strong>${hasPrice ? money(asset.floorUsd) : "Price unavailable"}</strong><small>${floorNote}</small></div>
      <div class="pnl-row">
        <span class="pnl-box"><small>Daily PnL</small><b class="${dailyClass}">${hasPrice ? `${signedMoney(asset.dailyUsd)} · ${signedPct(asset.dailyPct)}` : "—"}</b></span>
        <span class="pnl-box"><small>Total PnL</small><b class="${pnlClass}">${hasPrice ? `${signedMoney(asset.pnlUsd)} · ${signedPct(asset.pnlPct)}` : "—"}</b></span>
      </div>
    </article>`;
}

function renderCollectiblePriceSkeletonCard(asset, kind = "gift") {
  const count = Number(asset.count || 1);
  return `
    <article class="collectible-card ${kind === "gift" ? "is-gift-card" : ""}">
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
  const image = resolveTokenImage(asset.image || asset.iconUrl || asset.previewUrl || "");
  const icon = asset.icon || (fallback === "sticker" ? "sticker" : "gift");
  const artClass = fallback === "gift" ? "animated-art is-gift-art" : "animated-art";
  return image
    ? `<span class="${artClass}"><img src="${escapeHtml(image)}" alt="${escapeHtml(asset.name || "Collectible")}" loading="lazy" decoding="async"></span>`
    : `<span class="${artClass}"><i data-lucide="${icon}"></i></span>`;
}

function renderStickerBrand(assetId) {
  const brand = stickerAssets.find((asset) => asset.id === assetId) || stickerAssets[0];
  if (!brand) return;
  const children = brand.children?.length ? brand.children : [brand];
  children.forEach((child) => { assetDetails[child.id] = child; });
  setText("#stickerBrandTitle", brand.name || "Sticker Brand");
  const summary = document.querySelector("#stickerBrandSummary");
  if (summary) {
    const count = children.reduce((sum, item) => sum + Number(item.count || 1), 0);
    const init = children.reduce((sum, item) => sum + Number(item.initUsd || 0), 0);
    const pnl = init ? Number(brand.floorUsd || 0) - init : 0;
    summary.innerHTML = `<small>${escapeHtml(brand.creator || brand.source || "Sticker brand")}</small><div><h2>${money(brand.floorUsd || 0)}</h2><span>${count} sticker${count === 1 ? "" : "s"}</span></div><strong class="${pnl < 0 ? "negative" : "positive"}">${init ? `${signedMoney(pnl)} · ${signedPct((pnl / init) * 100)}` : "Open a sticker to see details"}</strong>`;
  }
  const grid = document.querySelector("#stickerBrandGrid");
  if (grid) grid.innerHTML = children.map(renderStickerBrandItem).join("");
  window.lucide?.createIcons();
  applyCurrencyDisplay();
}

function renderStickerBrandItem(asset) {
  const hasPrice = Number(asset.floorUsd) > 0;
  const floorNote = hasPrice ? floorSourceLine(asset) : (asset.marketPlatform ? `Floor · ${escapeHtml(asset.marketPlatform)}` : "Open details");
  return `
    <article class="collectible-card" data-screen-target="detail" data-asset="${asset.id}">
      <div class="collectible-top">
        ${collectibleArtHtml(asset, "sticker")}
        <div><h3>${escapeHtml(asset.collection || asset.name)}</h3><small>${escapeHtml(asset.name || asset.packId || "Sticker")}</small></div>
        <span class="tag-number">#${escapeHtml(String(asset.tag || asset.mint?.current || ""))}</span>
      </div>
      <div class="value-stack"><strong>${hasPrice ? money(asset.floorUsd) : "Price unavailable"}</strong><small>${floorNote}</small></div>
    </article>`;
}

function marketSourceLabel(value = "") {
  const source = String(value || "").toLowerCase();
  if (!source) return "";
  if (source.includes("stickers tools")) return "Stickers Tools";
  if (source.includes("getgems")) return "Getgems";
  if (source.includes("thermos")) return "Verified Market";
  if (source.includes("mrkt") || source.includes("tgmrkt")) return "MRKT";
  if (source.includes("tonapi")) return "TonAPI";
  if (source.includes("stickerdom")) return "Stickerdom";
  return String(value || "");
}

function renderAssetDetail(assetId) {
  const detail = assetDetails[assetId] || assetDetails["diamond-ring"];
  const detailScreen = document.querySelector('[data-screen="detail"]');
  if (detailScreen) detailScreen.dataset.asset = detail.id;
  detailScreen?.classList.toggle("is-token-detail", detail.type === "token");
  toggleGiftDetailLayout(detail.type === "gift");
  if (detail.type === "gift") {
    const cachedGift = getGiftDetailCachedPayload(detail);
    if (cachedGift) {
      applyGiftDetailPayload(detail, cachedGift);
      renderGiftDetailPage(detail, { loading: !detail.floorHistoryAvailable });
      setTimeout(() => {
        if (currentDetailAssetId() === detail.id) loadGiftDetail(detail, { forceRefresh: true });
      }, 0);
    } else {
      renderGiftDetailPage(detail, { loading: true });
      setTimeout(() => {
        if (currentDetailAssetId() === detail.id) loadGiftDetail(detail);
      }, 0);
    }
    window.lucide?.createIcons();
    applyCurrencyDisplay();
    return;
  }
  if (detail.type !== "token") ensureCollectibleDetailHero();
  const detailName = document.querySelector("#detailName");
  if (detailName) detailName.dataset.asset = detail.id;
  const tone = detail.type === "sticker" ? "sticker-bg" : detail.type === "token" ? "token-bg" : "gift-bg";
  const category = detail.type === "gift" ? "Telegram Gift" : detail.type === "sticker" ? "Sticker Pack" : detail.category;

  setText("#detailCategory", category);
  setText("#detailName", detail.name);
  setText("#detailValue", detail.type === "token" ? detail.value : `${money(detail.floorUsd)} · ${signedPct(detail.dailyPct)}`);
  setText("#detailMintLine", detail.type === "gift" ? `#${detail.tag} · ${detail.collection} · ${detail.mint.current.toLocaleString()} of ${detail.mint.total.toLocaleString()} issued` : detail.type === "sticker" ? `${detail.packId} · ${detail.creator}` : "Held in Main wallet");
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
}

function currentDetailAssetId() {
  return document.querySelector('[data-screen="detail"]')?.dataset.asset || document.querySelector("#detailName")?.dataset.asset || "";
}

function toggleGiftDetailLayout(showGift) {
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
  if (mount) mount.style.display = showGift ? "" : "none";
  sections.forEach((section) => {
    if (section) section.style.display = showGift ? "none" : "";
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
  const image = resolveTokenImage(detail.image || "");
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
    icon.innerHTML = image
      ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(detail.name)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<i data-lucide=&quot;${detail.icon || "gift"}&quot;></i>'">`
      : `<i data-lucide="${detail.icon || "gift"}"></i>`;
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
  renderStickerChartControls();
  setDetailHeading(".price-panel", isGift ? "Price Movement" : "Floor Price", "USD");
  setDetailHeading(".sales-panel", "Recent Sales", isGift ? "Exact Variant" : "This Pack");
  setDetailHeading(".market-intel", "Market Intel", "Live");
  setText("#detailStatOneLabel", "Current Floor");
  setText("#detailStatOne", collectibleValueLabel(detail.floorUsd, detail.floorTon));
  setText("#detailStatTwoLabel", "Cost Basis");
  setText("#detailStatTwo", detail.costBasis ? `${money(detail.costBasis)} · purchased ${String(detail.acquired || "").replace(", 2026", "")}` : "Set cost");
  setText("#detailStatThreeLabel", "Quick Sell Estimate");
  setText("#detailStatThree", detail.quickSellTon ? collectibleValueLabel(detail.quickSellUsd, detail.quickSellTon) : quickSell);
  setText("#detailPnl", `${signedMoney(detail.pnlUsd)} · ${signedPct(detail.pnlPct)}`);
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
      : `<article class="detail-note">${(detail.attributes || []).map(([label, value]) => `<b>${label}</b>: ${value}`).join(" · ")}</article>`;
  }

  renderSales(detail);
  if (isGift) {
    const cachedGift = getGiftDetailCachedPayload(detail);
    if (cachedGift) {
      applyGiftDetailPayload(detail, cachedGift);
      loadGiftDetail(detail, { forceRefresh: true });
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
  setText("#detailHistoryText", isGift ? (detail.marketPlatform ? `Floor source · ${detail.marketPlatform}` : detail.provenance) : `Pack acquired · ${detail.acquired}`);
  setText("#detailLinkLabel", isGift ? (detail.marketPlatform || "Marketplace") : "Marketplace");
}

function collectibleValueLabel(usdValue, tonValue) {
  const usd = Number(usdValue || 0);
  const ton = Number(tonValue || 0);
  if (usd > 0 && ton > 0) return `${money(usd)} · ${ton.toFixed(2)} TON`;
  if (usd > 0) return money(usd);
  if (ton > 0) return `${ton.toFixed(2)} TON`;
  return "—";
}

function renderStickerDetailSkeleton() {
  setDetailHeading(".market-intel", "Pack Stats", "");
  document.querySelector("#detailMarketIntel").innerHTML = `${renderDetailLoadingMetrics()}<div class="mini-thumb-row"><span class="sticker-mini skeleton"></span><span class="sticker-mini skeleton"></span><span class="sticker-mini skeleton"></span></div>`;
  document.querySelector("#detailSalesTable").innerHTML = `<div class="sales-row"><b>Loading trades<span>Sticker pack</span></b><span>—</span><span>—</span></div>`;
  renderStickerChartControls();
}

function renderGiftDetailSkeleton() {
  setDetailHeading(".market-intel", "Market Intel", "Live");
  document.querySelector("#detailMarketIntel").innerHTML = renderDetailLoadingMetrics();
  document.querySelector("#detailSalesTable").innerHTML = `<div class="sales-row"><b>Loading sales<span>Gift collection</span></b><span>—</span><span>—</span></div>`;
  renderStickerChartControls();
}

function giftGlowFromBackdrop(detail) {
  const backdrop = String(detail.traits?.find((trait) => /backdrop/i.test(trait.label))?.value || "").toLowerCase();
  if (/gold|amber|yellow|sun|solar/.test(backdrop)) return "rgba(245, 199, 70, .32)";
  if (/purple|violet|indigo|dark|night|plum/.test(backdrop)) return "rgba(139, 92, 246, .30)";
  return "rgba(45, 212, 191, .28)";
}

function giftTraitPercent(trait = {}) {
  const text = String(trait.rarity || "");
  const match = text.match(/([\d.]+)\s*%/);
  return match ? Number(match[1]) : null;
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
    return `<span class="gift-trait-pill" style="border-color:${tone.border};">${escapeHtml(trait.value || "—")}</span>`;
  }).join("");
}

function giftUpgradeState(detail) {
  const onChain = Boolean(detail.tokenAddress || detail.collectionAddress) && !/not yet upgraded|held in telegram/i.test(String(detail.upgraded || ""));
  if (onChain) return { upgraded: true, label: "Upgraded · On-chain collectible" };
  return { upgraded: false, label: "Not yet upgraded · Held in Telegram" };
}

function giftEligibility(detail) {
  const state = giftUpgradeState(detail);
  if (state.upgraded) return null;
  const acquiredTs = new Date(detail.origin?.receivedOn || detail.acquired || "").getTime();
  if (!Number.isFinite(acquiredTs)) return { text: "—", eligible: false };
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
  const match = provenance.match(/gifted by\s+([^·]+?)(?:\s+to|\s+·|$)/i);
  return match ? match[1].trim() : "—";
}

function giftComboRank(detail) {
  if (Number(detail.rarity?.expectedComboCount || 0) > 0 && Number(detail.rarity?.totalSupply || 0) > 0) {
    return `~${Number(detail.rarity.expectedComboCount).toLocaleString()} of ${Number(detail.rarity.totalSupply).toLocaleString()}`;
  }
  const total = Number(detail.mint?.total || 0);
  const rankMatch = String(detail.comboRank || "").match(/#?([\d,]+)\s+of\s+([\d,]+)/i);
  if (rankMatch) return `#${rankMatch[1]} of ${rankMatch[2]}`;
  if (detail.tag && total) return `#${Number(detail.tag).toLocaleString()} of ${total.toLocaleString()}`;
  return "—";
}

function giftDemandBadge(intel) {
  if (!giftDemandHasData(intel)) return "";
  const change = Number(intel?.change24hPct ?? intel?.change ?? 0);
  if (!Number.isFinite(change)) return `<span class="status-badge is-unlisted">— Stable</span>`;
  if (change > 20) return `<span class="status-badge is-listed">Heating Up</span>`;
  if (change < -20) return `<span class="status-badge is-unlisted">Cooling Down</span>`;
  return `<span class="status-badge is-unlisted">— Stable</span>`;
}

function giftDemandHasData(intel) {
  if (!intel) return false;
  return [intel.sales24h, intel.volume24h, intel.listedCount, intel.listedSupply, intel.change24hPct].some((value) => value && value !== "—" && value !== 0);
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
  const sourceLabel = detail.marketPlatform ? `Floor · ${escapeHtml(detail.marketPlatform)}` : "Price source unavailable";
  const upgradeState = giftUpgradeState(detail);
  const eligibility = giftEligibility(detail);
  const links = giftMarketLinks(detail);
  const priceChangeClass = Number(detail.dailyPct || 0) < 0 ? "negative" : "positive";
  const floorLabel = Number(detail.floorUsd || 0) > 0 ? money(detail.floorUsd) : "—";
  const floorSubLabel = Number(detail.floorTon || 0) > 0 ? `${detail.floorTon.toFixed(2)} TON` : "—";
  const chartIsLoading = loading || detail.floorHistoryLoading || detail.priceLoading;
  const chartSourceLabel = detail.floorHistoryAvailable
    ? detail.floorHistorySource === "sales-derived" ? "Sales-derived floor"
      : detail.floorHistorySource === "see.tg-graphics" ? "see.tg floor history"
      : detail.floorHistorySource === "tontrack-snapshots" ? "TonTrack snapshots"
      : "Live floor history"
    : chartIsLoading ? "Loading floor history..." : "Floor history unavailable";
  const rows = traits.map((trait) => {
    const percent = giftTraitPercent(trait);
    const tone = giftTraitTone(percent);
    const width = percent === null ? 12 : Math.max(10, Math.min(80, (100 - percent) * 0.8));
    return `<div class="gift-rarity-row">
      <span class="gift-rarity-label">${escapeHtml(trait.label)}</span>
      <b class="gift-rarity-value">${escapeHtml(trait.value || "—")}</b>
      <div class="gift-rarity-meter">
        <span class="gift-rarity-bar"><span style="width:${width}px;background:${tone.fill};"></span></span>
        <small>${percent === null ? "—" : `${percent}%`}</small>
      </div>
    </div>`;
  }).join("");
  const salesRows = loading
    ? `<div class="sales-row"><b class="skeleton">&nbsp;<span class="skeleton">&nbsp;</span></b><b class="skeleton">&nbsp;<span class="skeleton">&nbsp;</span></b><b class="skeleton">&nbsp;<span class="skeleton">&nbsp;</span></b></div>`
    : renderGiftSalesRows(detail);
  const intelBlock = loading
    ? renderDetailLoadingMetrics()
    : renderGiftDemandBlock(detail);
  const marketRows = [
    ["xGift", links.xgift, "#0EA5E9"],
    ["Fragment", links.fragment, "#7C3AED"],
    ["Getgems", links.getgems, "#2563EB"],
  ].filter(([, url]) => url).map(([label, url, bg]) => `<button type="button" class="profile-row gift-market-row" data-external-url="${escapeHtml(url)}">
      <span class="gift-market-icon" style="background:${bg};">${escapeHtml(label.slice(0, 1))}</span>
      <span class="gift-market-label">View on ${escapeHtml(label)}</span>
      <i data-lucide="external-link"></i>
    </button>`).join(`<div style="height:.5px;background:var(--border);"></div>`);
  mount.innerHTML = `
    <section class="gift-detail-layout">
      <article class="gift-detail-hero-card">
        ${isListed ? `<span class="status-badge is-listed" style="position:absolute;top:14px;right:14px;">Listed</span>` : ""}
        <div class="gift-detail-glow" style="background:radial-gradient(circle, ${glow} 0%, rgba(0,0,0,0) 68%);"></div>
        <div class="gift-detail-hero-inner">
          ${giftLayeredArtHtml(detail, "gift-detail-hero-art") || `<span class="gift-detail-hero-art">${giftDetailAnimationHtml(detail) || `<span class="detail-skeleton-line"></span>`}</span>`}
          <div class="gift-detail-title-block">
            <h2>${escapeHtml(giftDetailTitle(detail))}</h2>
            <small>${giftDetailHeroMeta(detail)}</small>
          </div>
          <div class="gift-detail-pill-row">${giftTraitPills(detail)}</div>
          <div class="gift-detail-floor-row">
            <strong>${floorLabel}</strong>
            <span class="status-badge ${priceChangeClass === "negative" ? "is-unlisted" : "is-listed"}">${signedPct(detail.dailyPct || 0)}</span>
          </div>
          <small class="gift-detail-floor-sub">${floorSubLabel} · ${sourceLabel}</small>
        </div>
      </article>

      <article class="card gift-detail-card">
        <div class="section-heading"><h2>Traits & Rarity</h2></div>
        ${rows || `<p class="detail-empty-state">—</p>`}
      </article>

      <article class="card gift-detail-card">
        <div class="section-heading"><h2>Origin</h2></div>
        ${giftOriginRows(detail, upgradeState, eligibility)}
      </article>

      <article class="card gift-detail-card">
        <div class="section-heading"><h2>Your Position</h2></div>
        ${giftPositionRows(detail)}
      </article>

      <article class="card gift-detail-card">
        <div class="section-heading">
          <h2>Floor Price</h2>
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
        </div>` : `<svg id="giftDetailPriceChart" viewBox="0 0 340 140" role="img" aria-label="Gift floor price chart" class="gift-detail-chart"></svg>
        <div id="giftDetailChartTooltip" class="chart-tooltip">${detail.floorHistoryAvailable ? `Latest: ${money(detail.floorUsd || 0)}` : "Floor history unavailable"}</div>`}
        <div class="gift-detail-chart-footer">
          <div class="gift-detail-toggle-row">
            <button class="mini-button ${giftDetailRange === "7d" ? "active" : ""}" type="button" data-gift-detail-range="7d">7D</button>
            <button class="mini-button ${giftDetailRange === "30d" ? "active" : ""}" type="button" data-gift-detail-range="30d">30D</button>
          </div>
          <small>${chartSourceLabel}</small>
        </div>
      </article>

      <article class="card gift-detail-card">
        <div class="section-heading"><h2>Demand Intel</h2>${loading ? "" : giftDemandBadge(detail.intel)}</div>
        ${intelBlock}
      </article>

      <article class="card gift-detail-card">
        <div class="section-heading"><h2>Recent Sales · This Gift Type</h2><button class="text-action" type="button" style="display:block;">${detail.salesScope === "same-traits" ? "Same traits" : "Collection-wide"}</button></div>
        <div class="sales-table">${salesRows}</div>
      </article>

      <article class="card gift-detail-card">
        <div class="section-heading"><h2>View on Markets</h2></div>
        <div>${marketRows || `<p class="detail-empty-state">No market links available</p>`}</div>
      </article>
    </section>`;
  if (!chartIsLoading) {
    drawDetailPriceChart(detail, {
      svgSelector: "#giftDetailPriceChart",
      tooltipSelector: "#giftDetailChartTooltip",
      height: 190,
      referenceText: "Your cost",
      collectibleRange: giftDetailRange,
      emptyTooltip: "Floor history unavailable",
      hideReferenceWhenMissing: true,
      requireHistory: true,
      showAxes: true,
      showArea: true,
      interactive: true,
    });
  }
  window.lucide?.createIcons();
  initCollectibleAnimations(mount);
  const externalButton = document.querySelector('[data-screen="detail"] .page-header .icon-button:last-child');
  if (externalButton) {
    externalButton.onclick = () => {
      const url = links.xgift || links.fragment || links.getgems;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    };
  }
}

function giftOriginRows(detail, upgradeState, eligibility) {
  const rows = [
    ["Received From", giftOriginSender(detail)],
    ["Received On", detail.origin?.receivedOn ? formatActivityDate(detail.origin.receivedOn) : (detail.acquired || "—")],
    ["Upgrade Status", upgradeState.label],
  ];
  if (!upgradeState.upgraded) rows.push(["Upgrade Eligibility", eligibility?.text || "—"]);
  const body = rows.map(([label, value], index) => `${index ? `<div class="gift-detail-divider"></div>` : ""}<div class="gift-detail-data-row"><span>${escapeHtml(label)}</span><span class="${/Eligible now|Upgraded/i.test(String(value)) ? "is-positive" : ""}">${escapeHtml(value)}</span></div>`).join("");
  const upgradeLink = !upgradeState.upgraded && eligibility?.eligible
    ? `<div class="gift-detail-divider"></div><button type="button" data-external-url="https://t.me/nft" class="gift-detail-link-button">Upgrade on Telegram →</button>`
    : "";
  return `${body}${upgradeLink}`;
}

function giftPositionRows(detail) {
  const rows = [
    ["Floor Value", collectibleValueLabel(detail.floorUsd, detail.floorTon)],
    ["Cost Basis", detail.costBasis ? money(detail.costBasis) : "Set cost"],
    ["Unrealized PnL", `${signedMoney(detail.pnlUsd)} · ${signedPct(detail.pnlPct)}`],
    ["Quick Sell Estimate", collectibleValueLabel(detail.quickSellUsd, detail.quickSellTon)],
  ];
  return rows.map(([label, value], index) => `${index ? `<div class="gift-detail-divider"></div>` : ""}<div class="gift-detail-data-row"><span>${escapeHtml(label)}</span><span class="${label === "Unrealized PnL" ? (detail.pnlUsd < 0 ? "is-negative" : "is-positive") : ""}">${escapeHtml(value)}</span></div>`).join("");
}

function renderGiftDemandBlock(detail) {
  const intel = detail.intel;
  if (!intel || [intel.sales24h, intel.volume24h, intel.listedCount, intel.totalSupply].every((value) => !value || value === "—" || value === 0)) {
    return `<p class="detail-empty-state" style="text-align:center;color:var(--text-2);">— Insufficient data</p>`;
  }
  const velocity = Number(intel.velocityHours || 0) > 0 ? `Avg 1 sale every ${Number(intel.velocityHours).toFixed(1)} hours` : "—";
  const activeListingsValue = Number(intel.listedCount || intel.listedSupply || 0) > 0 ? String(intel.listedCount || intel.listedSupply) : "—";
  const rows = [
    ["Sales last 24h", intel.sales24h || "—", ""],
    ["Volume last 24h", intel.volume24h || "—", ""],
    ["Active Listings", activeListingsValue, activeListingsValue !== "—" && intel.totalSupply ? `of ${formatMetricCount(intel.totalSupply)} total supply` : ""],
    ["Sales velocity", velocity, ""],
  ];
  return rows.map(([label, value, secondary], index) => `${index ? `<div class="gift-detail-divider"></div>` : ""}<div class="gift-detail-data-row"><span>${escapeHtml(label)}</span><span class="gift-detail-data-stack"><b>${escapeHtml(value)}</b>${secondary ? `<small>${escapeHtml(secondary)}</small>` : ""}</span></div>`).join("");
}

function renderGiftSalesRows(detail) {
  const rows = detail.sales || [];
  if (!rows.length) return `<p class="detail-empty-state">No recent sales</p>`;
  return rows.slice(0, 5).map((sale, index) => {
    const saleMint = Number(sale.mint || 0) > 0 ? `#${Number(sale.mint).toLocaleString()}` : `#${escapeHtml(String(detail.tag || detail.mint?.current || "—"))}`;
    const saleTraitSummary = [sale.model, sale.backdrop, sale.symbol].filter(Boolean).join(" · ");
    const traitSummary = saleTraitSummary || `${(detail.traits || []).map((trait) => trait.value).filter(Boolean).join(" · ") || "Collection sale"}`;
    const timeAgo = sale.dateLabel || sale[1] || "Recent";
    const marketplace = sale.marketplace || sale[5] || sale[2] || "Market";
    const priceLabel = sale.priceLabel || sale[0] || "—";
    return `${index ? `<div class="gift-detail-divider"></div>` : ""}<div class="gift-sale-row">
      <div class="gift-sale-copy">
        <small>${saleMint} · ${escapeHtml(traitSummary)}</small>
        <small class="is-secondary">${escapeHtml(timeAgo)}</small>
      </div>
      <div class="gift-sale-value">
        <b>${escapeHtml(priceLabel)}</b>
        <small>${escapeHtml(marketplace)}</small>
      </div>
    </div>`;
  }).join("");
}

function renderStickerChartControls() {
  const panel = document.querySelector(".price-panel");
  if (!panel) return;
  let controls = panel.querySelector(".token-chart-ranges");
  if (!controls) {
    controls = document.createElement("div");
    controls.className = "token-chart-ranges";
    panel.querySelector("#chartTooltip")?.insertAdjacentElement("afterend", controls);
  }
  controls.innerHTML = [["7d", "7D"], ["30d", "30D"]].map(([value, label]) => `<button class="mini-button ${stickerDetailRange === value ? "active" : ""}" type="button" data-sticker-detail-range="${value}">${label}</button>`).join("");
}

function stickerMetricGridHtml(metrics = {}) {
  return `<div class="token-metric-grid">
    ${[
      ["Floor Price", metrics.floor || "—"],
      ["24h Volume", metrics.volume24h || "—"],
      ["Total Supply", metrics.totalSupply || "—"],
      ["Unique Holders", metrics.holders || "—"],
      ["All-Time High", metrics.ath || "—"],
      ["Your Portfolio %", metrics.portfolioShare || "—"],
    ].map(([label, value]) => `<article class="card token-metric-card"><small>${label}</small><b>${value}</b></article>`).join("")}
  </div>`;
}

function stickerThumbsHtml(items = []) {
  if (!items.length) return `<div class="mini-thumb-row"><span class="detail-empty-state">No sticker previews</span></div>`;
  return `<div class="mini-thumb-row">${items.map((item, index) => `<button class="sticker-mini" type="button" data-sticker-thumb='${escapeHtml(JSON.stringify({ image: item.previews?.[0]?.url || item.metadata?.image || "", name: item.metadata?.name || item.collection?.name || `Sticker ${index + 1}`, tag: item.index || 0, traits: (item.metadata?.attributes || []).map((attr) => `${attr.trait_type}: ${attr.value}`).join(" · ") }))}'><img src="${escapeHtml(item.previews?.[0]?.url || item.metadata?.image || "")}" alt="${escapeHtml(item.metadata?.name || "Sticker")}" /></button>`).join("")}</div>`;
}

function stickerDetailCacheKey(detail = {}) {
  return String(detail.collectionAddress || detail.collection || detail.name || detail.id || "");
}

async function fetchStickerDetailPayload(detail) {
  const key = stickerDetailCacheKey(detail);
  if (!key) return { floor: {}, sales: [], itemsPayload: {} };
  const cached = stickerDetailCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (stickerDetailRequests.has(key)) return stickerDetailRequests.get(key);
  const request = Promise.allSettled([
    detail.collectionAddress ? fetchJson(`/api/collection-floor?collection=${encodeURIComponent(detail.collectionAddress)}`) : Promise.resolve({}),
    detail.collectionAddress ? fetchJson(`/api/collection-sales?collection=${encodeURIComponent(detail.collectionAddress)}`) : Promise.resolve([]),
    detail.collectionAddress ? fetchJsonFast(`https://tonapi.io/v2/nfts/collections/${encodeURIComponent(detail.collectionAddress)}/items?limit=24`, 5000) : Promise.resolve({}),
  ]).then(([floorResult, salesResult, itemsResult]) => {
    const value = {
      floor: settledValue(floorResult, {}),
      sales: settledValue(salesResult, []),
      itemsPayload: settledValue(itemsResult, {}),
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
  detail.dailyPct = Number(floor.change24hPct || detail.dailyPct || 0);
  detail.dailyUsd = detail.floorUsd ? detail.floorUsd * (detail.dailyPct / 100) : 0;
  detail.quickSellTon = detail.floorTon ? detail.floorTon * 0.95 : 0;
  detail.quickSellUsd = detail.floorUsd ? detail.floorUsd * 0.95 : 0;
  detail.sales = sales.map((sale) => [`${Number(sale.priceTon || 0).toFixed(2)} TON · ${money(sale.priceUsd || 0)}`, formatActivityDate(sale.date || Date.now()), detail.format || "Sticker", detail.creator || detail.collection, sale.marketplace || "Market"]);
  detail.chart = buildStickerChart(detail, sales);
  setText("#detailValue", `${money(detail.floorUsd)} · ${signedPct(detail.dailyPct)}`);
  setText("#detailMintLine", `${detail.packId} · ${detail.creator}`);
  setText("#detailStatOne", money(detail.floorUsd));
  setText("#detailStatThree", detail.quickSellUsd ? money(detail.quickSellUsd) : "—");
  document.querySelector("#detailMarketIntel").innerHTML = `${stickerMetricGridHtml({
    floor: detail.floorUsd ? `${money(detail.floorUsd)} · ${detail.floorTon.toFixed(2)} TON` : "—",
    volume24h: Number(floor.volume24hUsd || 0) > 0 ? `${money(floor.volume24hUsd)} · ${(Number(floor.volume24hTon || 0)).toFixed(2)} TON` : "—",
    totalSupply: formatMetricCount(floor.totalSupply),
    holders: formatMetricCount(floor.holders),
    ath: floor.athFloorUsd ? money(floor.athFloorUsd) : "—",
    portfolioShare: homePortfolioValue > 0 ? `${((Number(detail.floorUsd || 0) / homePortfolioValue) * 100).toFixed(2)}%` : "—",
  })}${stickerThumbsHtml(thumbs)}`;
  renderSales(detail);
  drawDetailPriceChart(detail);
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
    document.querySelector("#detailMarketIntel").innerHTML = `${stickerMetricGridHtml()}<div class="mini-thumb-row"><span class="detail-empty-state">—</span></div>`;
  }
}

function giftDetailCacheKey(detail = {}) {
  return `${String(detail.tokenAddress || detail.id || detail.name || "")}:${giftDetailRange}`;
}

async function fetchGiftDetailPayload(detail) {
  const key = giftDetailCacheKey(detail);
  if (!key) return { floor: {}, sales: [], origin: {}, rarity: {}, links: {} };
  const cached = giftDetailCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (giftDetailRequests.has(key)) return giftDetailRequests.get(key);
  const collection = detail.collectionAddress || detail.collection || detail.name || "";
  const detailParams = new URLSearchParams({
    wallet: liveWalletAddress || liveWalletData?.account?.address || "",
    nft: detail.tokenAddress || "",
    collection,
    item: detail.name || detail.collection || "",
    attributes: JSON.stringify(detail.traits || []),
    range: giftDetailRange,
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

function getGiftDetailCachedPayload(detail) {
  const cached = giftDetailCache.get(giftDetailCacheKey(detail));
  return cached && cached.expiresAt > Date.now() ? cached.value : null;
}

function isVerifiedGiftFloor(floor = {}) {
  const source = `${floor.source || ""} ${floor.marketPlatform || ""}`.toLowerCase();
  return source.includes("thermos") && (Number(floor.floorUsd || 0) > 0 || Number(floor.floorTon || 0) > 0);
}

function applyGiftVerifiedFloor(detail, payload = {}) {
  const floor = payload?.floor || {};
  const verifiedFloor = isVerifiedGiftFloor(floor);
  const floorHistoryPoints = verifiedFloor && Array.isArray(payload?.floorHistory)
    ? payload.floorHistory
      .map((point, index) => {
        const timestamp = new Date(point.timestamp || point.date || 0).getTime();
        const priceUsd = Number(point.priceUsd || point.usd || 0);
        const priceTon = Number(point.priceTon || point.ton || 0);
        if (!(priceUsd > 0)) return null;
        return {
          timestamp: Number.isFinite(timestamp) ? timestamp : Date.now() - ((payload.floorHistory.length - 1 - index) * 86400000),
          priceUsd,
          priceTon,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.timestamp - b.timestamp)
    : [];
  detail.floorTon = verifiedFloor ? Number(floor.floorTon || 0) : 0;
  detail.floorUsd = verifiedFloor ? Number(floor.floorUsd || 0) : 0;
  detail.dailyPct = verifiedFloor ? Number(floor.change24hPct || 0) : 0;
  detail.dailyUsd = detail.floorUsd && detail.dailyPct ? detail.floorUsd * (detail.dailyPct / 100) : 0;
  detail.marketPlatform = verifiedFloor ? (marketSourceLabel(floor.marketPlatform || floor.source) || "Verified Market") : "";
  detail.marketUrl = verifiedFloor ? (floor.marketUrl || "") : "";
  detail.graphImageUrl = "";
  detail.marketVerified = verifiedFloor && detail.floorUsd > 0;
  detail.floorSource = detail.marketVerified ? "backdrop" : "";
  detail.quickSellTon = detail.floorTon ? detail.floorTon * 0.95 : 0;
  detail.quickSellUsd = detail.floorUsd ? detail.floorUsd * 0.95 : 0;
  detail.pnlUsd = detail.costBasis ? detail.floorUsd - detail.costBasis : 0;
  detail.pnlPct = detail.costBasis ? ((detail.floorUsd - detail.costBasis) / detail.costBasis) * 100 : 0;
  detail.floorHistoryAvailable = detail.marketVerified && floorHistoryPoints.length >= 2;
  detail.floorHistorySource = detail.floorHistoryAvailable ? (payload.floorHistorySource || floor.floorHistorySource || "live") : "";
  detail.floorHistoryPoints = detail.floorHistoryAvailable ? floorHistoryPoints : [];
  detail.chart = detail.floorHistoryAvailable ? floorHistoryPoints.map((point) => point.priceUsd) : [];
}

function applyGiftDetailPayload(detail, payload = {}) {
  const floor = payload?.floor || {};
  const sales = payload?.sales || [];
  detail.origin = payload?.origin || detail.origin || {};
  detail.rarity = payload?.rarity || detail.rarity || {};
  detail.links = payload?.links || detail.links || {};
  detail.salesScope = payload?.salesScope || "collection";
  applyGiftVerifiedFloor(detail, payload);
  detail.giftSalesRaw = Array.isArray(sales) ? sales.slice() : [];
  detail.sales = sales.map((sale) => ({
    priceLabel: `${Number(sale.priceTon || 0).toFixed(2)} TON · ${money(sale.priceUsd || 0)}`,
    dateLabel: formatActivityDate(sale.date || Date.now()),
    marketplace: sale.marketplace || "Market",
    buyer: truncateWalletAddress(sale.buyer || ""),
    seller: truncateWalletAddress(sale.seller || ""),
    mint: Number(sale.mint || 0),
    model: sale.model || "",
    backdrop: sale.backdrop || "",
    symbol: sale.symbol || "",
  }));
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
    trend: detail.dailyPct >= 0 ? "▂▃▅▆▇" : "▇▆▅▃▂",
    badge: detail.dailyPct > 2 ? "Trending Up" : detail.dailyPct < -2 ? "Cooling" : "Stable",
    change24hPct: Number(floor.change24hPct || detail.dailyPct || 0),
    sales24h: Number(floor.sales24h || derivedSales24h || 0) > 0 ? String(Number(floor.sales24h || derivedSales24h || 0)) : "—",
    volume24h: Number(floor.volume24hUsd || derivedVolume24hUsd || 0) > 0 ? collectibleValueLabel(floor.volume24hUsd || derivedVolume24hUsd, floor.volume24hTon || derivedVolume24hTon) : "—",
    prior: Number.isFinite(Number(floor.change24hPct)) ? signedPct(Number(floor.change24hPct || 0)) : "—",
    daysToSell: avgGapHours > 0 ? `${avgGapHours.toFixed(1)} hours` : "—",
    listedSupply: Number(floor.listedCount || 0) > 0 ? String(Number(floor.listedCount || 0)) : "—",
    listedCount: Number(floor.listedCount || 0) || 0,
    totalSupply: Number(floor.totalSupply || 0) || 0,
    listingRate: Number(floor.totalSupply || 0) > 0 && Number(floor.listedCount || 0) > 0 ? `${((Number(floor.listedCount || 0) / Number(floor.totalSupply || 1)) * 100).toFixed(1)}%` : "—",
    velocityHours: avgGapHours || 0,
    bestTime: detail.marketPlatform || "Marketplace",
  };
}

async function loadGiftDetail(detail, { forceRefresh = false } = {}) {
  const requestId = ++activeGiftDetailRequest;
  detail.floorHistoryLoading = true;
  if (currentDetailAssetId() === detail.id) {
    renderGiftDetailPage(detail, { loading: true });
    window.lucide?.createIcons();
    applyCurrencyDisplay();
  }
  try {
    const payload = forceRefresh ? await fetchGiftDetailPayload(detail) : (getGiftDetailCachedPayload(detail) || await fetchGiftDetailPayload(detail));
    if (requestId !== activeGiftDetailRequest) return;
    applyGiftDetailPayload(detail, payload);
    syncGiftFloorAcrossAssets(detail);
    detail.floorHistoryLoading = false;
    renderGiftDetailPage(detail, { loading: false });
    window.lucide?.createIcons();
    applyCurrencyDisplay();
  } catch (error) {
    console.warn("Gift detail load failed", error);
    if (requestId !== activeGiftDetailRequest) return;
    detail.floorHistoryLoading = false;
    renderGiftDetailPage(detail, { loading: false });
    window.lucide?.createIcons();
    applyCurrencyDisplay();
  }
}

function buildGiftChart(detail, sales = []) {
  return [];
}

function buildStickerChart(detail, sales = []) {
  const tradePrices = sales.map((sale) => Number(sale.priceUsd || 0)).filter((value) => value > 0);
  const current = Number(detail.floorUsd || 0);
  const base = tradePrices.length ? tradePrices : current ? [current] : [];
  if (!base.length) return [];
  const values = stickerDetailRange === "30d" ? [...base, current || base[base.length - 1], current || base[base.length - 1]] : base.slice(-7);
  return values.map((value) => Number(value) || current).filter((value) => value > 0);
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

function setDetailTokenIcon(detail, tone) {
  const icon = document.querySelector("#detailIcon");
  const ghost = document.querySelector("#detailGhost");
  const image = resolveTokenImage(detail.image);
  const symbol = escapeHtml((detail.symbol || detail.name || "?").slice(0, 3).toUpperCase());
  if (icon) {
    icon.className = `asset-icon ${tone}`;
    icon.style.borderRadius = "50%";
    icon.style.overflow = "hidden";
    icon.innerHTML = image
      ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(detail.symbol || detail.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentElement.textContent='${symbol}';">`
      : symbol;
  }
  if (ghost) {
    ghost.innerHTML = image
      ? `<img src="${escapeHtml(image)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;opacity:.32;">`
      : `<i data-lucide="circle-dollar-sign"></i>`;
  }
}

function tokenDetailChart(detail) {
  const latest = Math.max(0, Number(detail.priceUsd || 0));
  if (!latest) return [];
  return [latest, latest];
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
      const tokenAmount = rawValue.match(new RegExp(`[-+−]?\\s*[\\d,.]+(?:\\.\\d+)?\\s*${escapeRegExp(symbol)}`, "i"))?.[0]
        || rawValue.replace(/^Swapping\s+/i, "").replace(/\s+for\s+/i, " → ")
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
    <p id="detailMintLine">${escapeHtml(tokenBalanceLabel(detail))} · ${money(detail.valueUsd || 0)}</p>
    <small id="detailCategory" hidden></small>
  `;
}

function renderTokenChartControls() {
  const panel = document.querySelector(".price-panel");
  if (!panel) return;
  let controls = panel.querySelector(".token-chart-ranges");
  if (!controls) {
    controls = document.createElement("div");
    controls.className = "token-chart-ranges";
    panel.querySelector("#chartTooltip")?.insertAdjacentElement("afterend", controls);
  }
  const chart = panel.querySelector("#detailPriceChart");
  if (chart && controls.nextElementSibling !== chart) panel.insertBefore(controls, chart);
  let metrics = panel.querySelector("#tokenChartMetrics");
  if (!metrics) {
    metrics = document.createElement("div");
    metrics.id = "tokenChartMetrics";
    metrics.className = "token-chart-metrics";
    chart?.insertAdjacentElement("afterend", metrics);
  }
  if (chart && metrics.previousElementSibling !== chart) chart.insertAdjacentElement("afterend", metrics);
  const ranges = [
    ["day", "Day"],
    ["week", "Week"],
    ["month", "Month"],
    ["year", "Year"],
    ["all", "All"],
  ];
  controls.innerHTML = ranges.map(([range, label]) => (
    `<button class="mini-button ${tokenDetailRange === range ? "active" : ""}" type="button" data-token-detail-range="${range}">${label}</button>`
  )).join("");
  metrics.innerHTML = Array.from({ length: 4 }, () => `<article class="token-chart-metric"><small class="skeleton">&nbsp;</small><strong class="skeleton">&nbsp;</strong></article>`).join("");
}

function tokenChartMetricLabel(value) {
  if (!Number.isFinite(value)) return "—";
  if (priceMode === "TON") return `${value.toFixed(value >= 1 ? 2 : 4)} TON`;
  return tokenPriceLabel(value);
}

function tokenChartAxisLabel(value) {
  const number = Number(value || 0);
  const abs = Math.abs(number);
  const maximumFractionDigits = abs >= 1 ? 2
    : abs >= 0.1 ? 4
      : abs >= 0.01 ? 5
        : abs >= 0.001 ? 6
          : abs >= 0.0001 ? 7
            : 8;
  return `$${number.toLocaleString(undefined, {
    minimumFractionDigits: abs >= 1 ? 2 : 0,
    maximumFractionDigits,
  })}`;
}

function renderTokenChartMetrics(detail, values = []) {
  const root = document.querySelector("#tokenChartMetrics");
  if (!root || !Array.isArray(values) || !values.length) return;
  const high = Math.max(...values);
  const low = Math.min(...values);
  const first = values[0];
  const latest = values.at(-1);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const changePct = Number.isFinite(first) && Math.abs(first) > 0.0000001 ? ((latest - first) / first) * 100 : 0;
  const swingPct = Math.abs(low) > 0.0000001 ? ((high - low) / low) * 100 : 0;
  const items = [
    ["High", tokenChartMetricLabel(high), "positive"],
    ["Low", tokenChartMetricLabel(low), "negative"],
    ["Period", signedPct(changePct), changePct < 0 ? "negative" : "positive"],
    ["Swing", signedPct(swingPct), "neutral"],
  ];
  root.innerHTML = items.map(([label, value, tone]) => (
    `<article class="token-chart-metric ${tone}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></article>`
  )).join("");
  root.dataset.latest = tokenChartMetricLabel(latest);
  root.dataset.average = tokenChartMetricLabel(avg);
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
    <div class="holder-ring ${known ? "" : "is-loading"}" style="--holder-pct:${safe};"><span>${known ? `${safe.toFixed(1)}%` : "—"}</span></div>
    <small>Top 10 holders</small>
  </section>`;
}

function renderTonNetworkHighlights(network = {}) {
  const items = [
    ["Total Supply", network.totalSupplyTon ? `${network.totalSupplyTon} TON` : "—"],
    ["Active Wallets", network.activeWalletsMonthly || "—"],
    ["Daily Wallets", network.activeWalletsDaily || "—"],
    ["Activated Wallets", network.activatedWallets || "—"],
    ["Tx / Day", network.txPerDay || "—"],
    ["Staked TON", network.stakedTon ? `${network.stakedTon} TON` : "—"],
    ["Inflation", network.annualInflationPct ? `${network.annualInflationPct}%` : "—"],
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
  overlay.innerHTML = `<button class="sticker-thumb-backdrop" type="button" aria-label="Close"></button><section class="sticker-thumb-panel"><button class="sticker-thumb-close" type="button" aria-label="Close">×</button><img alt=""><h3></h3><p></p><small></small></section>`;
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
  overlay.querySelector("small").textContent = data.traits || "—";
  overlay.classList.add("is-open");
}

function closeStickerThumbOverlay() {
  document.getElementById("stickerThumbOverlay")?.classList.remove("is-open");
}

function formatMetricMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "—";
  if (number >= 1_000_000_000) return `$${(number / 1_000_000_000).toFixed(number >= 10_000_000_000 ? 1 : 2)}B`;
  if (number >= 1_000_000) return `$${(number / 1_000_000).toFixed(number >= 10_000_000 ? 1 : 2)}M`;
  if (number >= 1_000) return `$${(number / 1_000).toFixed(number >= 10_000 ? 1 : 2)}K`;
  return money(number);
}

function formatMetricCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "—";
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

function mapTokenChartPayload(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.prices || payload?.points || payload?.data || payload?.items || payload?.chart || [];
  if (!Array.isArray(rows)) return [];
  return normalizeTokenDetailChart(rows.map((item) => {
    if (Array.isArray(item)) return { timestamp: Number(item[0]) > 1e12 ? item[0] : Number(item[0]) * 1000, price: item[1] };
    const timestamp = Number(item.timestamp ?? item.time ?? item.t ?? item.date);
    return { timestamp: timestamp > 1e12 ? timestamp : timestamp * 1000, price: item.price ?? item.value ?? item.close ?? item.c };
  }));
}

function tokenRangeDays() {
  return { day: 1, week: 14, month: 30, year: 365, all: 1000 }[tokenDetailRange] || 1;
}

async function fetchClientTokenChart(detail) {
  const address = tokenApiAddress(detail);
  const knownGecko = { TON: "the-open-network", USDT: "tether", "USD₮": "tether", JUSDT: "tether" }[String(detail.symbol || "").toUpperCase()];
  const attempts = address ? [
    `https://jetton-index.tonscan.org/public-dyor/chart/${encodeURIComponent(address)}?interval=${tokenRangeDays()}`,
    `https://api.dedust.io/v2/assets/${encodeURIComponent(address)}/chart?period=${encodeURIComponent(tokenDetailRange)}`,
    `https://api.dedust.io/v2/prices/${encodeURIComponent(address)}/history?period=${encodeURIComponent(tokenDetailRange)}`,
    `https://api.ston.fi/v1/assets/${encodeURIComponent(address)}/chart?period=${encodeURIComponent(tokenDetailRange)}`,
    `https://api.ston.fi/v1/assets/${encodeURIComponent(address)}/price-history?period=${encodeURIComponent(tokenDetailRange)}`,
  ] : [];
  if (knownGecko) attempts.push(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(knownGecko)}/market_chart?vs_currency=usd&days=${tokenRangeDays()}`);
  for (const url of attempts) {
    try {
      const points = mapTokenChartPayload(await fetchJsonFast(url, 1800));
      if (points.length > 1) return points;
    } catch {}
  }
  return [];
}

function bestPoolForAddress(pools = [], address = "") {
  const key = tokenAddressKey(address);
  if (!key) return null;
  return pools.filter((pool) => JSON.stringify(pool).toLowerCase().includes(key))
    .sort((a, b) => poolNumber(b, ["tvl_usd", "tvl", "liquidity_usd", "liquidity.usd", "reserve_usd"]) - poolNumber(a, ["tvl_usd", "tvl", "liquidity_usd", "liquidity.usd", "reserve_usd"]))[0] || null;
}

function extractHolderRows(payload = {}) {
  return payload.addresses || payload.holders || payload.jetton_wallets || payload.items || [];
}

function holderBalance(row = {}) {
  return row.balance ?? row.amount ?? row.wallet?.balance ?? row.jetton_wallet?.balance ?? 0;
}

function tonApiInfoSupply(payload = {}, decimals = 9) {
  const raw = payload.total_supply ?? payload.totalSupply ?? payload.metadata?.total_supply ?? payload.preview?.total_supply;
  return raw ? decimalBalance(raw, decimals) : 0;
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

function bestStonPoolForToken(pools = [], address = "") {
  const key = tokenAddressKey(address);
  if (!key) return null;
  return pools.filter((pool) => JSON.stringify(pool).toLowerCase().includes(key))
    .sort((a, b) => Number(b.tvl_usd || b.tvl || b.liquidity_usd || 0) - Number(a.tvl_usd || a.tvl || a.liquidity_usd || 0))[0] || null;
}

function poolNumber(pool = {}, keys = []) {
  for (const key of keys) {
    const value = Number(key.split(".").reduce((item, part) => item?.[part], pool));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
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

function preloadGiftStaticImages(assets = []) {
  const queue = flattenCollectibleAssets(assets)
    .map((asset) => resolveTokenImage(asset.image || asset.iconUrl || asset.previewUrl || ""))
    .filter((url) => url && !preloadedGiftImages.has(url));
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
}

function refreshCollectibleDerivedUi() {
  updateAllocationUi(true);
  updateCategoryAndTopAsset();
  updateAssetsPortfolioStrip();
  renderCollectibleGrids();
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

function prefetchGiftDetails(assets = giftAssets) {
  assets.forEach((group) => {
    const children = group.children?.length ? group.children : [group];
    const representative = children.find((asset) => asset.type === "gift" && asset.tokenAddress) || group;
    if (representative.type !== "gift") return;
    queueDetailWarmup(async () => {
      try {
        await fetchGiftDetailPayload(representative);
      } finally {
        syncCollectibleGroupFromChildren(group);
        refreshCollectibleDerivedUi();
      }
    });
  });
}

function prefetchStickerDetails(assets = stickerAssets) {
  assets.forEach((group) => {
    const children = group.children?.length ? group.children : [group];
    children
      .filter((asset) => asset.type === "sticker" && asset.collectionAddress)
      .forEach((asset) => {
        queueDetailWarmup(async () => {
          try {
            const payload = await fetchStickerDetailPayload(asset);
            const floor = payload?.floor || {};
            if (Number(floor.floorUsd || 0) > 0 || Number(floor.floorTon || 0) > 0) {
              asset.floorTon = Number(floor.floorTon || asset.floorTon || 0);
              asset.floorUsd = Number(floor.floorUsd || asset.floorUsd || 0);
              asset.dailyPct = Number(floor.change24hPct || asset.dailyPct || 0);
              asset.dailyUsd = asset.floorUsd && asset.dailyPct ? asset.floorUsd * (asset.dailyPct / 100) : 0;
              asset.marketPlatform = marketSourceLabel(floor.marketPlatform || floor.source) || asset.marketPlatform || "";
              asset.marketUrl = floor.marketUrl || asset.marketUrl || "";
              asset.pnlUsd = asset.costBasis ? asset.floorUsd - asset.costBasis : asset.pnlUsd;
              asset.pnlPct = asset.costBasis ? ((asset.floorUsd - asset.costBasis) / asset.costBasis) * 100 : asset.pnlPct;
            }
          } finally {
            asset.priceLoading = false;
            syncCollectibleGroupFromChildren(group);
            refreshCollectibleDerivedUi();
          }
        });
      });
    });
}

function prefetchAllVisibleDetails() {
  prefetchVisibleTokenDetails(latestVisibleTokens);
  prefetchGiftDetails(giftAssets);
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
    ath: apiMetrics.ath ? tokenPriceLabel(apiMetrics.ath) : "—",
    portfolioShare: homePortfolioValue > 0 ? `${((Number(detail.valueUsd || 0) / homePortfolioValue) * 100).toFixed(2)}%` : "—",
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
  detail.historyChart = tokenDetailChart(detail).map((price, index, items) => ({
    timestamp: Date.now() - (items.length - 1 - index) * (tokenChartRangeMs() / Math.max(1, items.length - 1)),
    price,
  }));
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
  const svg = document.querySelector(options.svgSelector || "#detailPriceChart");
  if (!svg) return;
  const tooltipSelector = options.tooltipSelector || "#chartTooltip";
  const isToken = detail.type === "token";
  const showAxes = isToken || options.showAxes;
  const showArea = isToken || options.showArea;
  const showInteraction = isToken || options.interactive;
  const width = 340;
  const height = options.height || (isToken ? 230 : 150);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  if (isToken && detail.chartLoading) {
    svg.innerHTML = `<rect x="18" y="26" width="304" height="128" rx="10" fill="rgba(246,245,238,.07)" /><path d="M28 136 C82 92 132 112 178 76 S270 96 312 52" fill="none" stroke="rgba(246,245,238,.16)" stroke-width="5" stroke-linecap="round" />`;
    setText(tooltipSelector, "Loading chart...");
    return;
  }
  const sourceValues = isToken
    ? (detail.historyChart || []).map((point) => point.price)
    : detail.chart;
  if (!sourceValues?.length) {
    svg.innerHTML = `<text x="${width / 2}" y="${height / 2}" fill="var(--text-2, #92938a)" font-size="12" text-anchor="middle">No chart data available</text>`;
    const emptyLabel = detail.type === "token"
      ? tokenPriceLabel(detail.priceUsd)
      : (Number(detail.floorUsd || detail.priceUsd || 0) > 0 ? usdValueLabel(detail.floorUsd || detail.priceUsd || 0) : "—");
    setText(tooltipSelector, options.emptyTooltip || `Latest: ${emptyLabel}`);
    return;
  }
  const values = priceMode === "TON" ? sourceValues.map((value) => value / usdTonRate) : sourceValues;
  const reference = isToken ? Number.NaN : detail.costBasis || sourceValues[0];
  const hasReference = isToken ? false : (Number(detail.costBasis || 0) > 0 || !options.hideReferenceWhenMissing);
  const costBasis = priceMode === "TON" ? reference / usdTonRate : reference;
  const padX = showAxes ? 30 : 18;
  const padTop = showAxes ? 30 : 18;
  const padBottom = showAxes ? 42 : 24;
  const rawMin = hasReference ? Math.min(...values, costBasis) : Math.min(...values);
  const rawMax = hasReference ? Math.max(...values, costBasis) : Math.max(...values);
  const actualRange = Math.max(0, rawMax - rawMin);
  const baselineMagnitude = Math.max(Math.abs(rawMax), Math.abs(rawMin), 0.00000001);
  const minimumRange = isToken
    ? baselineMagnitude * 0.0012
    : baselineMagnitude * 0.015;
  const displayRange = Math.max(actualRange, minimumRange);
  const verticalPadding = displayRange * (isToken ? 0.18 : 0.22);
  const min = Math.max(0, rawMin - verticalPadding);
  const max = rawMax + verticalPadding;
  const point = (value, index) => {
    const x = padX + (index / (values.length - 1)) * (width - padX * 2);
    const y = height - padBottom - ((value - min) / Math.max(0.0000001, max - min)) * (height - padTop - padBottom);
    return [x, y];
  };
  const points = values.map(point);
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const costY = hasReference ? point(costBasis, 0)[1] : 0;
  const latest = values[values.length - 1];
  const label = priceMode === "TON"
    ? `${latest.toFixed(latest >= 1 ? 2 : 4)} TON`
    : (detail.type === "token" ? tokenPriceLabel(latest) : usdValueLabel(latest));
  const boughtLabel = priceMode === "TON" ? `${costBasis.toFixed(2)} TON` : usdValueLabel(costBasis);
  const referenceText = hasReference ? (options.referenceText || `Bought at ${boughtLabel}`) : "";
  const circles = detail.type === "token" ? "" : points.map(([x, y], index) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${showInteraction ? "3.5" : "4"}" fill="#FFFFFF" data-price="${values[index]}" data-date="Point ${index + 1}" />`).join("");
  const latestLabel = priceMode === "TON" ? `${latest.toFixed(4)} TON` : tokenPriceLabel(latest);
  const baselineY = costY.toFixed(2);
  const bottomY = height - padBottom;
  const gridYs = [0.2, 0.5, 0.8].map((ratio) => (padTop + ((height - padTop - padBottom) * ratio)).toFixed(2));
  const area = `M ${points[0][0].toFixed(2)} ${bottomY.toFixed(2)} L ${line.replaceAll(",", " ")} L ${points[points.length - 1][0].toFixed(2)} ${bottomY.toFixed(2)} Z`;
  const chartPoints = isToken
    ? (detail.historyChart || []).map((item, index) => ({
      x: points[index][0],
      y: points[index][1],
      value: values[index],
      timestamp: item.timestamp || (Date.now() - (values.length - 1 - index) * (tokenChartRangeMs() / Math.max(1, values.length - 1))),
    }))
    : (detail.floorHistoryPoints || []).map((item, index) => ({
      x: points[index]?.[0] || padX,
      y: points[index]?.[1] || bottomY,
      value: values[index],
      timestamp: item.timestamp || (Date.now() - (values.length - 1 - index) * ((giftDetailRange === "30d" ? 30 : 7) * 86400000 / Math.max(1, values.length - 1))),
    })).filter((point) => Number.isFinite(point.value));
  const leftTick = chartPoints[0]?.timestamp ? tokenChartRangeLabel(chartPoints[0].timestamp, true) : "Start";
  const rightTick = chartPoints.at(-1)?.timestamp ? tokenChartRangeLabel(chartPoints.at(-1).timestamp, true) : "Now";
  const minLabel = priceMode === "TON" ? `${rawMin.toFixed(rawMin >= 1 ? 2 : 4)} TON` : tokenChartAxisLabel(rawMin);
  const maxLabel = priceMode === "TON" ? `${rawMax.toFixed(rawMax >= 1 ? 2 : 4)} TON` : tokenChartAxisLabel(rawMax);
  const tokenLabels = showAxes
    ? `<text x="${padX}" y="${padTop - 6}" fill="#7E8797" font-size="10">${escapeHtml(maxLabel)}</text>
       <text x="${padX}" y="${bottomY + 16}" fill="#7E8797" font-size="10">${escapeHtml(minLabel)}</text>
       <text x="${padX}" y="${height - 8}" fill="#6B7280" font-size="10">${escapeHtml(leftTick)}</text>
       <text x="${width - padX}" y="${height - 8}" fill="#6B7280" font-size="10" text-anchor="end">${escapeHtml(rightTick)}</text>`
    : "";
  svg.innerHTML = `
    ${showArea ? `<defs>
      <linearGradient id="detailAreaFade" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="rgba(59,108,248,.24)" />
        <stop offset="100%" stop-color="rgba(9,11,18,0)" />
      </linearGradient>
      <filter id="tokenLineGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>` : ""}
    ${gridYs.map((y) => `<line x1="${padX}" x2="${width - padX}" y1="${y}" y2="${y}" stroke="rgba(255,255,255,.08)" stroke-width="1" />`).join("")}
    ${showArea ? `<path d="${area}" fill="url(#detailAreaFade)" />` : ""}
    ${hasReference ? `<line x1="${padX}" y1="${baselineY}" x2="${width - padX}" y2="${baselineY}" stroke="var(--text-3, #4B5563)" stroke-dasharray="5 5" />` : ""}
    ${referenceText ? `<text x="${padX}" y="${Math.max(12, costY - 7).toFixed(2)}" fill="var(--text-3, #4B5563)" font-size="11">${escapeHtml(referenceText)}</text>` : ""}
    ${showArea ? `<path d="M ${line.replaceAll(",", " ")}" fill="none" stroke="rgba(59,108,248,.24)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" filter="url(#tokenLineGlow)" /><polyline points="${line}" fill="none" stroke="#3B6CF8" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" /><circle cx="${points[points.length - 1][0].toFixed(2)}" cy="${points[points.length - 1][1].toFixed(2)}" r="4.5" fill="#3B6CF8" stroke="#fff" stroke-width="2" />` : `<polyline points="${line}" fill="none" stroke="#3B6CF8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />`}
    ${circles}
    ${tokenLabels}
    ${showInteraction ? `<g class="detail-chart-hover" style="display:none">
      <line class="detail-chart-hover-line" x1="0" x2="0" y1="${padTop}" y2="${bottomY}" stroke="rgba(255,255,255,.24)" stroke-dasharray="5 5" />
      <circle class="detail-chart-hover-dot" cx="0" cy="0" r="6" fill="#3B6CF8" stroke="#fff" stroke-width="3" />
      <rect class="detail-chart-hover-card" x="0" y="0" width="156" height="60" rx="14" fill="#121722" stroke="rgba(255,255,255,.08)" />
      <text class="detail-chart-hover-date" x="0" y="0" fill="#C9CBC4" font-size="11" font-weight="700"></text>
      <circle class="detail-chart-hover-chip" cx="0" cy="0" r="5" fill="#3B6CF8" stroke="#fff" stroke-width="2" />
      <text class="detail-chart-hover-price" x="0" y="0" fill="#F7F7F2" font-size="12" font-weight="800"></text>
    </g>` : ""}
  `;
  setText(tooltipSelector, `Latest: ${label}`);
  if (isToken) renderTokenChartMetrics(detail, values);
  if (showInteraction) attachDetailChartInteraction(svg, chartPoints, width, height, padX, padTop, bottomY, (value) => {
    if (priceMode === "TON") return `${value.toFixed(value >= 1 ? 2 : 4)} TON`;
    return `${tokenPriceLabel(value)} USD`;
  });
}

function attachDetailChartInteraction(svg, points = [], width, height, padX, padTop, bottomY, valueFormatter = (value) => `Price: ${tokenPriceLabel(value)} USD`) {
  const hover = svg.querySelector(".detail-chart-hover");
  if (!hover || points.length < 2) return;
  const line = hover.querySelector(".detail-chart-hover-line");
  const dot = hover.querySelector(".detail-chart-hover-dot");
  const card = hover.querySelector(".detail-chart-hover-card");
  const dateText = hover.querySelector(".detail-chart-hover-date");
  const priceText = hover.querySelector(".detail-chart-hover-price");
  const chip = hover.querySelector(".detail-chart-hover-chip");
  const showPoint = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const x = Math.max(padX, Math.min(width - padX, ((clientX - rect.left) / rect.width) * width));
    const nearest = points.reduce((best, point) => (Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best), points[0]);
    const cardW = 148;
    const cardH = 58;
    const cardX = Math.max(8, Math.min(width - cardW - 8, nearest.x + (nearest.x < width / 2 ? 12 : -cardW - 12)));
    const cardY = Math.max(8, Math.min(height - cardH - 28, nearest.y - cardH / 2));
    const date = new Date(nearest.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    hover.style.display = "";
    line.setAttribute("x1", nearest.x.toFixed(2));
    line.setAttribute("x2", nearest.x.toFixed(2));
    dot.setAttribute("cx", nearest.x.toFixed(2));
    dot.setAttribute("cy", nearest.y.toFixed(2));
    card.setAttribute("x", cardX.toFixed(2));
    card.setAttribute("y", cardY.toFixed(2));
    dateText.setAttribute("x", (cardX + 16).toFixed(2));
    dateText.setAttribute("y", (cardY + 22).toFixed(2));
    dateText.textContent = date;
    chip.setAttribute("cx", (cardX + 18).toFixed(2));
    chip.setAttribute("cy", (cardY + 39).toFixed(2));
    priceText.setAttribute("x", (cardX + 36).toFixed(2));
    priceText.setAttribute("y", (cardY + 43).toFixed(2));
    priceText.textContent = `Price: ${valueFormatter(nearest.value)}`;
  };
  svg.onpointerdown = (event) => {
    svg.setPointerCapture?.(event.pointerId);
    showPoint(event.clientX);
  };
  svg.onpointermove = (event) => {
    if (event.buttons || event.pointerType === "mouse") showPoint(event.clientX);
  };
  svg.onpointerleave = () => {
    hover.style.display = "none";
  };
  svg.onpointerup = () => {
    hover.style.display = "none";
  };
}

function renderWalletState() {
  document.querySelector(".app-frame")?.classList.toggle("has-wallet", walletConnected);
  walletButtons.forEach((button) => {
    const textNode = button.querySelector("span");
    const label = walletConnected ? "Connected" : "Connect";
    if (textNode) textNode.textContent = label;
    else button.textContent = label;
    button.classList.toggle("is-connected", walletConnected);
  });
  homeWalletCard?.classList.toggle("is-connected", walletConnected);
  if (homeWalletTitle) homeWalletTitle.textContent = walletConnected ? "TON wallet connected" : "TON wallet not connected";
  if (homeWalletText) homeWalletText.textContent = walletConnected ? `${currentWalletLabel()} included in portfolio.` : "Connect wallet to include TON balances.";
  if (homeWalletButton) homeWalletButton.textContent = walletConnected ? "Connected" : "Connect";
}

function openWalletSheet() {
  const sheet = document.getElementById("walletSheet");
  if (!sheet) return;
  sheet.classList.add("is-open");
  sheet.setAttribute("aria-hidden", "false");
  window.lucide?.createIcons();
}

function closeWalletSheet() {
  const sheet = document.getElementById("walletSheet");
  if (!sheet) return;
  sheet.classList.remove("is-open");
  sheet.setAttribute("aria-hidden", "true");
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

function clearLoaderStatusCycle() {
  clearInterval(loaderStatusCycleTimer);
  loaderStatusCycleTimer = 0;
}

function setLoaderStatusText(message) {
  const loaderText = document.getElementById("importLoaderText");
  if (!loaderText) return;
  loaderText.classList.add("is-fading");
  window.setTimeout(() => {
    loaderText.textContent = message;
    loaderText.classList.remove("is-fading");
  }, 180);
}

function startLoaderStatusCycle() {
  const loaderText = document.getElementById("importLoaderText");
  if (!loaderText || loaderStatusCycleTimer) return;
  loaderStatusCycleIndex = 0;
  loaderText.textContent = LOADER_FETCH_MESSAGES[loaderStatusCycleIndex];
  loaderStatusCycleTimer = window.setInterval(() => {
    loaderStatusCycleIndex = (loaderStatusCycleIndex + 1) % LOADER_FETCH_MESSAGES.length;
    setLoaderStatusText(LOADER_FETCH_MESSAGES[loaderStatusCycleIndex]);
  }, 1200);
}

function setImportLoader(active, text = "Preparing wallet import...", progress = 8) {
  const loader = document.getElementById("importLoader");
  const loaderText = document.getElementById("importLoaderText");
  const loaderBar = document.getElementById("importLoaderBar");
  if (!loader) return;
  loader.classList.toggle("is-active", active);
  loader.setAttribute("aria-hidden", active ? "false" : "true");
  const clamped = Math.max(0, Math.min(100, progress));
  const phase = clamped >= 100 ? "complete" : clamped >= 40 ? "fetching" : "scanning";
  loader.dataset.phase = phase;
  if (!active) {
    clearLoaderStatusCycle();
    loaderPhaseKey = "";
    loader.classList.remove("is-complete");
    if (loaderText) {
      loaderText.textContent = "Preparing wallet import...";
      loaderText.classList.remove("is-fading");
    }
  } else if (phase !== loaderPhaseKey) {
    loaderPhaseKey = phase;
    loader.classList.toggle("is-complete", phase === "complete");
    if (phase === "scanning") {
      clearLoaderStatusCycle();
      if (loaderText) loaderText.textContent = "Scanning wallet...";
    } else if (phase === "fetching") {
      clearLoaderStatusCycle();
      startLoaderStatusCycle();
    } else {
      clearLoaderStatusCycle();
      if (loaderText) loaderText.textContent = "Portfolio ready";
    }
  } else if (active && phase === "complete" && loaderText) {
    loaderText.textContent = "Portfolio ready";
  }
  if (loaderBar) loaderBar.style.width = `${clamped}%`;
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
    importWallet(address).catch((error) => {
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

async function importWallet(address) {
  const cleanAddress = address.trim();
  if (!cleanAddress) {
    setWalletImportStatus("Paste a TON wallet address first.", true);
    document.getElementById("walletAddressInput")?.focus();
    return;
  }
  setWalletImportStatus("Fetching wallet data...");
  const importSessionId = beginImportSession();
  resetWalletSwitchState(cleanAddress);
  setSectionLoading("tokens", "Syncing token balances...");
  setSectionLoading("gifts", "Scanning wallet gifts...");
  setSectionLoading("stickers", "Scanning sticker packs...");
  setSectionLoading("activity", "Preparing recent activity...");
  if (isGraphHistoryLoadingEnabled()) setSectionLoading("graph", "Preparing graph preview...");
  else setSectionReady("graph", "Graph history paused for this session.", { toast: false });
  renderTokenLoadingState();
  renderTokenSummary([]);
  updateCollectibleSummaryBanner("gifts");
  updateCollectibleSummaryBanner("stickers");
  syncAssetsSummary(liveWalletData, []);
  updateAllocationUi();
  setImportLoader(true, "Connecting to TON wallet...", 8);
  await nextPaint();
  try {
    const payload = await fetchWalletImport(cleanAddress);
    if (!isCurrentImportSession(importSessionId)) return;
    setImportLoader(true, "Syncing balances and token values...", 42);
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
    setImportLoader(true, "Preparing dashboard...", 68);
    const homeReadyPromise = Promise.resolve(applyImportedWallet(payload, { importSessionId }));
    startActivityPreload(liveWalletAddress || cleanAddress);
    setImportLoader(true, "Loading graph preview...", 86);
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
    setImportLoader(true, "Exact graph history continues in background...", 100);
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
      setImportLoader(false);
    }, 420);
  } catch (error) {
    if (isCurrentImportSession(importSessionId)) allocationUiLocked = false;
    setImportLoader(false);
    throw error;
  }
}

async function refreshConnectedWallet() {
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
  if (!savedAddress || liveWalletData) return;
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
  if (Number(data.summary?.tonUsdRate) > 0) usdTonRate = Number(data.summary.tonUsdRate);
  const totalUsd = Number(data.summary?.totalUsd || 0);
  homePortfolioValue = totalUsd;
  homePortfolioDelta = 0;
  homePortfolioChange = "+0.00%";
  pinCachedHistoryToCurrent(data);
  updatePortfolioRangeAnchors();
  updateDashboardFromWallet(data, totalUsd);
  updateAssetsFromWallet(data, totalUsd);
  updateWalletScreen(data, totalUsd);
  updateAnalyticsFromWallet(totalUsd);
  renderPortfolioGraph(liveHistoryByRange.has(activePortfolioRange()) ? activePortfolioRange() : "1D", true);
  resetPortfolioHeader();
  applyCurrencyDisplay();
  window.lucide?.createIcons();
  const tokensReady = Promise.resolve(updateTokensFromWallet(data, { importSessionId: options.importSessionId }));
  updateCollectiblesFromWallet(data, { importSessionId: options.importSessionId }).then(() => {
    if (!isCurrentImportSession(options.importSessionId)) return;
    updateAllocationUi();
    syncAssetsSummary();
    updateAnalyticsFromWallet(homePortfolioValue);
    prefetchAllVisibleDetails();
  }).catch((error) => console.warn("Collectibles background update failed", error));
  return tokensReady.then(() => {
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

function resetWalletSwitchState(nextAddress = "") {
  historyPreloadToken += 1;
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
  giftAssets.splice(0, giftAssets.length);
  stickerAssets.splice(0, stickerAssets.length);
  selectedAllocation = null;
  allocationState.gifts = 0;
  allocationState.tokens = 0;
  allocationState.stickers = 0;
  document.querySelectorAll("[data-range]").forEach((button) => button.classList.remove("is-loading"));
  setCollectiblesBanner("gifts", nextAddress ? "Loading wallet gifts..." : "");
  setCollectiblesBanner("stickers", nextAddress ? "Loading wallet stickers..." : "");
  renderCollectibleGrids();
  resetWalletBoundUi();
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
  updatePortfolioRangeAnchors();
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
  const walletList = document.querySelector('[data-screen="wallets"] .holdings-list');
  if (walletList) walletList.innerHTML = `<article><span class="asset-icon token-bg"><i data-lucide="wallet"></i></span><div><b>No wallet connected</b><small>Connect or paste another wallet address.</small></div><aside><b>${money(0)}</b><small>Ready</small></aside></article>`;
  window.lucide?.createIcons();
}

async function disconnectWallet() {
  closeWalletActionSheet();
  historyPreloadToken += 1;
  stopHistoryStatusPolling();
  try {
    await tonConnectUI?.disconnect?.();
  } catch (error) {
    console.warn("TON Connect disconnect failed", error);
  }
  walletConnected = false;
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
  resetWalletBoundUi();
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

function activePortfolioRange() {
  return document.querySelector("[data-range].is-active")?.dataset.range || "1D";
}

function historyStatusLabel(status) {
  return {
    ready: "Ready",
    building: "Building",
    queued: "Queued",
    missing: "Queued",
    error: "Retrying",
  }[status] || "Queued";
}

function ensureHistoryBuilder() {
  document.querySelectorAll(".history-builder").forEach((builder) => builder.remove());
  return null;
}

function renderHistoryBuilder() {
  ensureHistoryBuilder();
}

function setHistoryRangeState(range, status, pointsCount = 0, source = "") {
  historyRangeState.set(range, { status, pointsCount, source });
  if (status === "ready" && liveHistoryByRange.has(range)) loadingPortfolioRanges.delete(range);
  else if (liveWalletData) loadingPortfolioRanges.add(range);
  renderHistoryBuilder();
}

function applyHistoryStatus(statuses = []) {
  statuses.forEach((item) => setHistoryRangeState(item.range, item.status, item.pointsCount || 0, item.source || ""));
  historyRanges.forEach((range) => {
    if (!historyRangeState.has(range)) setHistoryRangeState(range, liveHistoryByRange.has(range) ? "ready" : "queued");
  });
  renderHistoryBuilder();
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
  renderHistoryBuilder();
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
  else if (hasFinalHistory(range)) loadingPortfolioRanges.delete(range);
  if (loading && !historyRangeState.has(range)) historyRangeState.set(range, { status: "queued", pointsCount: 0 });
  syncRangeLoadingButtons();
  renderHistoryBuilder();
}

function syncRangeLoadingButtons() {
  document.querySelectorAll("[data-range]").forEach((button) => {
    button.classList.toggle("is-loading", loadingPortfolioRanges.has(button.dataset.range));
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
  if (liveHistoryRequests.has(requestKey)) {
    const existing = liveHistoryRequests.get(requestKey);
    if (renderWhenDone) {
      existing.then((points) => {
        if (activeHistoryWalletKey === requestWalletKey && activePortfolioRange() === range && points?.length) {
          liveHistoryPoints = points;
          renderPortfolioGraph(range, true);
          updateHistoryStatus(`Reconstructed ${range} wallet history | ${points.length} points`);
        }
      }).catch(() => {});
    }
    return existing;
  }
  const request = (async () => {
    const payload = await requestJson(`/api/wallet/history?address=${encodeURIComponent(requestWalletAddress)}&range=${encodeURIComponent(range)}&t=${Date.now()}`, {}, `History ${range} request failed`);
    if (activeHistoryWalletKey !== requestWalletKey || walletStateKey(liveWalletAddress) !== requestWalletKey) return [];
    if (payload.status === "partial" && Array.isArray(payload.points) && payload.points.length) {
      const points = setLiveHistoryRange(range, payload.points, { status: "building", source: "partial" });
      setRangeLoading(range, true);
      if (renderWhenDone && activePortfolioRange() === range && points.length) {
        renderPortfolioGraph(range, true);
        updateHistoryStatus(`Building ${range} graph live | ${points.length} points`);
      }
      return points;
    }
    if (payload.status && payload.status !== "ready") {
      setHistoryRangeState(range, payload.status, 0, payload.source || "");
      return [];
    }
    const points = setLiveHistoryRange(range, payload.points || [], { status: "ready", source: payload.source || "api" });
    if (renderWhenDone && activePortfolioRange() === range && points.length) {
      renderPortfolioGraph(range, true);
      updateHistoryStatus(`Reconstructed ${range} wallet history | ${points.length} points`);
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

async function refreshLiveHistoryUntilReady(range, token, maxAttempts = 3) {
  let attempt = 0;
  while (token === historyPreloadToken && liveWalletAddress && !hasFinalHistory(range) && attempt < maxAttempts) {
    attempt += 1;
    setRangeLoading(range, true);
    try {
      await refreshLiveHistory(range, { renderWhenDone: activePortfolioRange() === range });
    } catch (error) {
      console.warn(`Could not preload ${range} history`, error);
    }
    const readyCount = historyRanges.filter((item) => hasFinalHistory(item)).length;
    updateHistoryStatus(hasFinalHistory(range)
      ? `Loading wallet history | ${readyCount}/${historyRanges.length} ranges ready`
      : `Still loading ${range} wallet history...`);
    if (!hasFinalHistory(range) && attempt < maxAttempts) await delay(Math.min(8000, 1800 * attempt));
  }
}

async function preloadLiveHistoryRanges() {
  if (!isGraphHistoryLoadingEnabled()) return;
  const token = ++historyPreloadToken;
  const ranges = historyRanges.filter((range) => !hasFinalHistory(range));
  if (!ranges.length) {
    updateHistoryStatus(`Wallet history ready | ${historyRanges.length}/${historyRanges.length} ranges loaded`);
    return;
  }
  ranges.forEach((range) => setRangeLoading(range, true));
  updateHistoryStatus(`Loading wallet history | 0/${historyRanges.length} ranges ready`);
  const pending = new Set(ranges);
  let pass = 0;
  while (token === historyPreloadToken && liveWalletAddress && pending.size) {
    pass += 1;
    for (const range of [...pending]) {
      if (token !== historyPreloadToken || !liveWalletAddress) return;
      if (hasFinalHistory(range)) {
        pending.delete(range);
        continue;
      }
      setRangeLoading(range, true);
      await refreshLiveHistoryUntilReady(range, token);
      if (hasFinalHistory(range)) pending.delete(range);
      const readyCount = historyRanges.filter((item) => hasFinalHistory(item)).length;
      updateHistoryStatus(pending.size
        ? `Loading wallet history | ${readyCount}/${historyRanges.length} ranges ready`
        : `Wallet history ready | ${readyCount}/${historyRanges.length} ranges loaded`);
      await delay(pass === 1 ? 1800 : 5000);
    }
  }
  if (token === historyPreloadToken) {
    const active = activePortfolioRange();
    if (liveHistoryByRange.has(active)) {
      liveHistoryPoints = liveHistoryByRange.get(active);
      renderPortfolioGraph(active, false);
    }
    const finalReadyCount = historyRanges.filter((item) => hasFinalHistory(item)).length;
    updateHistoryStatus(finalReadyCount === historyRanges.length
      ? `Wallet history ready | ${historyRanges.length}/${historyRanges.length} ranges loaded`
      : `Wallet history loaded | ${finalReadyCount}/${historyRanges.length} ranges ready`);
  }
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
  if (!liveWalletAddress) return;
  if (!isGraphHistoryLoadingEnabled()) return;
  const requestWalletAddress = liveWalletAddress;
  const requestWalletKey = walletStateKey(requestWalletAddress);
  const range = activePortfolioRange();
  let payload;
  try {
    payload = await requestJson(`/api/wallet/history?address=${encodeURIComponent(requestWalletAddress)}&range=${encodeURIComponent(range)}&t=${Date.now()}`, {}, "Wallet history refresh failed");
  } catch {
    return;
  }
  if (activeHistoryWalletKey !== requestWalletKey || walletStateKey(liveWalletAddress) !== requestWalletKey) return;
  const points = setLiveHistoryRange(range, payload.points || []);
  if (points.length) {
    setRangeLoading(range, false);
    renderPortfolioGraph(range, true);
    updateHistoryStatus(`Reconstructed ${range} wallet history | ${points.length} points`);
  }
}

function updatePortfolioRangeAnchors() {
  Object.values(portfolioRanges).forEach((range) => {
    if (range.basePoints?.length) range.basePoints[range.basePoints.length - 1].value = homePortfolioValue;
  });
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
  if (walletConnected) {
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
  const stickerCount = stickerAssets.reduce((sum, asset) => sum + Number(asset.count || 1), 0);
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
  renderActivityRows(data.activity, HOME_ACTIVITY_LIMIT);
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

function syncAssetsSummary(data = liveWalletData, tokens = latestVisibleTokens, fallbackUsd = homePortfolioValue) {
  const strip = document.querySelector('[data-screen="assets"] .portfolio-strip');
  const tokenValue = tokens.length ? tokens.reduce((sum, token) => sum + Number(token.valueUsd || 0), 0) : Number(fallbackUsd || 0);
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
    strip.innerHTML = `<article><small>Total</small><b>${totalHtml}</b></article><article><small>Items</small><b>${itemsHtml}</b></article><article><small>Wallet</small><b>${escapeHtml(address)}</b></article>`;
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
  const best = valid.reduce((a, b) => (b.change > a.change ? b : a), valid[0] || { name: "—", change: 0 });
  const worst = valid.reduce((a, b) => (b.change < a.change ? b : a), valid[0] || { name: "—", change: 0 });
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

function decimalBalance(rawBalance, decimals = 0) {
  const raw = String(rawBalance ?? "0").replace(/[^\d-]/g, "");
  const negative = raw.startsWith("-");
  const digits = negative ? raw.slice(1) : raw;
  const scale = Math.max(0, Number(decimals) || 0);
  if (!scale) return Number(raw || 0);
  const padded = digits.padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale) || "0";
  const fraction = padded.slice(-scale).replace(/0+$/, "");
  return Number(`${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`);
}

function tokenAddressKey(address) {
  return String(address || "").trim().toLowerCase();
}

async function fetchJson(url) {
  return requestJson(url, {}, "Request failed");
}

function settledValue(result, fallback = null) {
  if (result?.status === "fulfilled") return result.value;
  if (result?.reason) console.warn("Token data source failed", result.reason);
  return fallback;
}

function extractTonCenterJettons(payload) {
  return payload?.jetton_wallets || payload?.wallets || payload?.items || payload?.result?.jetton_wallets || payload?.result || [];
}

function extractStonAssets(payload) {
  return payload?.asset_list || payload?.assets || payload?.result?.asset_list || payload?.result || [];
}

function buildStonPriceMap(payload) {
  const map = new Map();
  extractStonAssets(payload).forEach((asset) => {
    const key = tokenAddressKey(asset.contract_address || asset.address || asset.jetton_address || asset.token_address);
    const price = Number(asset.dex_price_usd ?? asset.price_usd ?? asset.price);
    if (!key || !Number.isFinite(price)) return;
    map.set(key, {
      priceUsd: price,
      change24h: Number(asset.price_change_24h ?? asset.change_24h ?? asset.price_change_percent_24h),
      asset,
      marketRank: Number(asset.popularity_index ?? asset.priority ?? 0),
    });
  });
  return map;
}

function buildDedustAssetMap(assetsPayload) {
  const map = new Map();
  const assets = Array.isArray(assetsPayload) ? assetsPayload : assetsPayload?.assets || assetsPayload?.items || [];
  assets.forEach((asset) => {
    if (asset.type !== "jetton" || !asset.address) return;
    map.set(tokenAddressKey(asset.address), asset);
  });
  return map;
}

function stableAssetPrice(asset) {
  const symbol = String(asset?.metadata?.symbol || asset?.symbol || "").toUpperCase();
  return ["USDT", "USD₮", "JUSDT", "USDC", "JUSDC"].includes(symbol) ? 1 : 0;
}

function buildDedustPriceMap(poolsPayload, tonPriceUsd) {
  const map = new Map();
  const pools = Array.isArray(poolsPayload) ? poolsPayload : poolsPayload?.pools || poolsPayload?.items || [];
  pools.forEach((pool) => {
    const assets = pool.assets || [];
    const reserves = pool.reserves || [];
    const baseIndex = assets.findIndex((asset) => asset.type === "native" || stableAssetPrice(asset));
    const jettonIndex = assets.findIndex((asset, index) => index !== baseIndex && asset.type === "jetton" && asset.address);
    if (baseIndex < 0 || jettonIndex < 0) return;
    const basePrice = assets[baseIndex].type === "native" ? tonPriceUsd : stableAssetPrice(assets[baseIndex]);
    const baseReserve = decimalBalance(reserves[baseIndex], assets[baseIndex]?.metadata?.decimals ?? 9);
    const jettonReserve = decimalBalance(reserves[jettonIndex], assets[jettonIndex]?.metadata?.decimals ?? 9);
    if (baseReserve <= 0 || jettonReserve <= 0 || basePrice <= 0) return;
    const key = tokenAddressKey(assets[jettonIndex].address);
    const priceUsd = (baseReserve * basePrice) / jettonReserve;
    const liquidityUsd = baseReserve * basePrice;
    const current = map.get(key);
    if (!current || liquidityUsd > current.liquidityUsd) map.set(key, { priceUsd, liquidityUsd, source: "dedust" });
  });
  return map;
}

function pairMetric(pair, path, fallback = 0) {
  return Number(path.split(".").reduce((value, key) => value?.[key], pair) ?? fallback) || 0;
}

function pairDexName(pair = {}) {
  return String(pair.dexId || pair.dexName || pair.labels?.join(" ") || "").toLowerCase();
}

function isDedustPair(pair = {}) {
  return pairDexName(pair).includes("dedust");
}

function betterDexPair(next, current) {
  if (!current) return true;
  const nextDedust = isDedustPair(next);
  const currentDedust = isDedustPair(current);
  if (nextDedust !== currentDedust) return nextDedust;
  const nextLiquidity = pairMetric(next, "liquidity.usd");
  const currentLiquidity = pairMetric(current, "liquidity.usd");
  if (nextLiquidity !== currentLiquidity) return nextLiquidity > currentLiquidity;
  const nextVolume = pairMetric(next, "volume.h24");
  const currentVolume = pairMetric(current, "volume.h24");
  if (nextVolume !== currentVolume) return nextVolume > currentVolume;
  const nextMarketCap = Number(next.marketCap || next.fdv || 0);
  const currentMarketCap = Number(current.marketCap || current.fdv || 0);
  return nextMarketCap > currentMarketCap;
}

function dexPriceForToken(pair, tokenKey) {
  const baseKey = tokenAddressKey(pair?.baseToken?.address);
  const baseUsd = Number(pair?.priceUsd || 0);
  if (tokenKey === baseKey) return baseUsd;
  return 0;
}

function buildDexScreenerPriceMap(pairs = [], requestedKeys = null) {
  const map = new Map();
  pairs.filter((pair) => pair?.chainId === "ton").forEach((pair) => {
    const key = tokenAddressKey(pair.baseToken?.address);
    if (!key || (requestedKeys && !requestedKeys.has(key))) return;
    const priceUsd = dexPriceForToken(pair, key);
    if (!(priceUsd > 0)) return;
    if (betterDexPair(pair, map.get(key)?.pair)) {
      map.set(key, {
        priceUsd,
        change24h: Number(pair.priceChange?.h24),
        liquidityUsd: pairMetric(pair, "liquidity.usd"),
        volume24h: pairMetric(pair, "volume.h24"),
        marketCap: Number(pair.marketCap || pair.fdv || 0),
        dexId: pair.dexId,
        pair,
        source: isDedustPair(pair) ? "dexscreener-dedust" : "dexscreener",
      });
    }
  });
  return map;
}

function parsePct(value) {
  const cleaned = String(value ?? "").replace("−", "-").replace("%", "").trim();
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : NaN;
}

function buildTonApiTokenMap(payload) {
  const map = new Map();
  (payload?.balances || []).forEach((item) => {
    const address = item.jetton?.address;
    if (!address) return;
    map.set(tokenAddressKey(address), {
      priceUsd: Number(item.price?.prices?.USD || 0),
      change24h: parsePct(item.price?.diff_24h?.USD),
      decimals: item.jetton?.decimals,
      verification: item.jetton?.verification,
      name: item.jetton?.name,
      symbol: item.jetton?.symbol,
      image: item.jetton?.image,
      source: "tonapi",
    });
  });
  return map;
}

async function fetchDexScreenerPairs(addresses = []) {
  const uniqueAddresses = [...new Set(addresses.filter(Boolean))];
  const chunks = Array.from({ length: Math.ceil(uniqueAddresses.length / 30) }, (_, index) => uniqueAddresses.slice(index * 30, index * 30 + 30));
  const responses = await Promise.all(chunks.map((chunk) => fetchJson(`https://api.dexscreener.com/tokens/v1/ton/${chunk.map(encodeURIComponent).join(",")}`)));
  return responses.flatMap((payload) => Array.isArray(payload) ? payload : payload?.pairs || []);
}

function jettonMasterAddress(wallet = {}) {
  const jetton = wallet.jetton;
  return wallet.jetton_address
    || wallet.jetton_master_address
    || wallet.jetton_master
    || wallet.jetton_info?.address
    || (typeof jetton === "string" ? jetton : jetton?.address)
    || "";
}

function tokenLookupKeys(payload, wallet = {}) {
  const masterAddress = jettonMasterAddress(wallet);
  const keys = [
    masterAddress,
    payload?.address_book?.[masterAddress]?.user_friendly,
    wallet.jetton_info?.address,
    wallet.jetton?.address,
  ].filter(Boolean);
  return [...new Set(keys.map(tokenAddressKey).filter(Boolean))];
}

function tokenLookupAddresses(payload, wallet = {}) {
  const masterAddress = jettonMasterAddress(wallet);
  return [
    masterAddress,
    payload?.address_book?.[masterAddress]?.user_friendly,
    wallet.jetton_info?.address,
    wallet.jetton?.address,
  ].filter((address) => typeof address === "string" && address.trim());
}

function tonApiTokenAddressKeys(item = {}) {
  return [
    item.jetton?.address,
    item.wallet_address?.address,
    item.wallet_address,
  ].filter(Boolean).map(tokenAddressKey).filter(Boolean);
}

function tonApiBalanceTokens(payload) {
  return (payload?.balances || []).map((item, index) => {
    const jetton = item.jetton || {};
    const balance = decimalBalance(item.balance, jetton.decimals ?? 9);
    const priceUsd = Number(item.price?.prices?.USD || 0);
    const valueUsd = balance * priceUsd;
    return {
      id: `live-jetton-${index}`,
      address: jetton.address,
      name: jetton.name || jetton.symbol || `Jetton ${index + 1}`,
      symbol: jetton.symbol || `JET${index + 1}`,
      balance,
      decimals: jetton.decimals ?? 9,
      priceUsd,
      valueUsd,
      change24h: parsePct(item.price?.diff_24h?.USD),
      image: jetton.image,
      category: "TON Jetton",
      marketTrusted: priceUsd > 0,
      source: "tonapi-rates",
    };
  });
}

function firstTokenMapValue(map, keys = []) {
  for (const key of keys) {
    const value = map.get(key);
    if (value) return value;
  }
  return null;
}

function tonCenterTokenInfo(payload, masterAddress) {
  const info = payload?.metadata?.[masterAddress]?.token_info;
  if (Array.isArray(info)) return info.find((item) => item.type === "jetton_masters") || info[0] || {};
  return {};
}

function isTrustedStonAsset(priceInfo) {
  const asset = priceInfo?.asset;
  if (!asset || asset.blacklisted || asset.deprecated || asset.community) return false;
  const tags = asset.tags || [];
  return Boolean(asset.default_symbol || tags.includes("asset:essential") || tags.includes("asset:popular") || tags.includes("high_liquidity"));
}

function isTrustedDedustAsset(asset) {
  if (!asset) return false;
  return Number(asset.riskScore ?? 1) <= 0.6;
}

function isBlockedByDedust(asset) {
  return asset && Number(asset.riskScore ?? 0) > 0.8;
}

function hasUsableDexMarket(priceInfo) {
  return Number(priceInfo?.priceUsd || 0) > 0 && Number(priceInfo?.liquidityUsd || 0) > 0;
}

function failsMarketCapSanity(valueUsd, priceInfo) {
  const cap = Number(priceInfo?.marketCap || 0);
  return cap > 0 && valueUsd > cap * 1.05;
}

function pickTokenPrice(tonApiPrice, dexPrice, dedustPrice) {
  if (Number(dexPrice?.priceUsd) > 0) return dexPrice;
  if (Number(dedustPrice?.priceUsd) > 0) return dedustPrice;
  return null;
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
  const stableRank = (token) => ["USDT", "USD₮", "JUSDT", "USDC", "JUSDC"].includes(String(token.symbol || "").toUpperCase()) ? 0 : 1;
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
    <p class="token-summary-meta ${tone}">${signedMoney(pnl.delta)} · ${signedPct(pnl.pct)} · ${tokens.length} token${tokens.length === 1 ? "" : "s"}</p>
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
      value: `${money(token.valueUsd)} · ${Number.isFinite(token.change24h) ? signedPct(token.change24h) : "24h n/a"}`,
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
    const changeText = Number.isFinite(token.change24h) && hasPrice ? signedPct(token.change24h) : "—";
    const valueLabel = Number(token.valueUsd || 0) > 0 ? money(token.valueUsd) : "—";
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
  if (!walletConnected || !tokens.length) return;
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
  setSectionReady("tokens", tokens.length ? `Tokens ready${jettonCount ? ` · ${jettonCount} jettons loaded` : ""}` : "Token screen is ready");
  return tokens;
}

const collectiblePayloadCache = new Map();
const collectiblePayloadRequests = new Map();

function demoStickerFallbackAssets() {
  return demoStickerAssets.map((asset) => ({ ...structuredClone(asset), isDemo: true }));
}

function fetchWalletCollectiblesPayload(walletAddress) {
  const key = String(walletAddress || "").toLowerCase();
  if (collectiblePayloadCache.has(key)) return Promise.resolve(collectiblePayloadCache.get(key));
  if (collectiblePayloadRequests.has(key)) return collectiblePayloadRequests.get(key);
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
  const gifts = groupGiftAssets(items.filter((item) => item.type === "gift").map((item, index) => liveCollectibleAsset(item, "gift", index, { suppressMarket: true })));
  const stickers = groupStickerAssets(items.filter((item) => item.type === "sticker").map((item, index) => liveCollectibleAsset(item, "sticker", index, { suppressMarket: true })));
  giftAssets.splice(0, giftAssets.length, ...gifts);
  stickerAssets.splice(0, stickerAssets.length, ...stickers);
  [...gifts, ...stickers].forEach((asset) => {
    assetDetails[asset.id] = asset;
    (asset.children || []).forEach((child) => { assetDetails[child.id] = child; });
  });
  setCollectiblesBanner("gifts", gifts.length ? "" : "No on-chain wallet gifts found. Telegram profile gifts can be added by username next.");
  setCollectiblesBanner("stickers", stickers.length ? "" : "No on-chain sticker packs found in this wallet.");
  renderCollectibleGrids();
  updateAllocationUi();
  syncAssetsSummary();
  if (gifts.length) {
    setCollectiblesBanner("gifts", "Loading gift floors...");
    hydrateGiftModelFloors(gifts).finally(() => {
      if (hasPendingCollectiblePrices("gifts")) setCollectiblesBanner("gifts", "Some exact floors are unavailable");
      else setCollectiblesBanner("gifts", "");
    });
  }
  return true;
}

function updateCollectiblesFromWallet(data, options = {}) {
  const walletAddress = liveWalletAddress || data?.account?.address;
  if (!walletAddress) return Promise.resolve([]);
  const hasSnapshot = renderImportedCollectiblesSnapshot(data?.assets?.collectibles);
  return Promise.allSettled([
    updateGiftsFromWallet(walletAddress, { loading: !hasSnapshot, importSessionId: options.importSessionId }),
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
      stickerAssets.splice(0, stickerAssets.length, ...demoStickerFallbackAssets());
      setCollectiblesBanner("stickers", "Showing demo data");
      renderCollectibleGrids();
      setSectionReady("stickers", "Sticker screen ready · demo data");
      return [];
    }
    const assets = groupStickerAssets(rows.map((item, index) => liveCollectibleAsset(item, "sticker", index)));
    stickerAssets.splice(0, stickerAssets.length, ...assets);
    assets.forEach((asset) => {
      assetDetails[asset.id] = asset;
      (asset.children || []).forEach((child) => { assetDetails[child.id] = child; });
    });
    setCollectiblesBanner("stickers", assets.some((asset) => Number(asset.floorUsd || 0) > 0) ? "" : "Fetching sticker prices...");
    renderCollectibleGrids();
    updateCollectibleSummaryBanner("stickers");
    prefetchStickerDetails(assets);
    setSectionReady("stickers", `Stickers ready · ${assets.length} collection${assets.length === 1 ? "" : "s"} loaded`);
    return assets;
  } catch (error) {
    console.warn("stickers live data failed", error);
    if (!isCurrentImportSession(options.importSessionId)) return [];
    stickerAssets.splice(0, stickerAssets.length, ...demoStickerFallbackAssets());
    setCollectiblesBanner("stickers", "Showing demo data");
    renderCollectibleGrids();
    setSectionReady("stickers", "Sticker screen ready · demo data");
    return [];
  }
}

async function updateCollectiblesFromGetgems(walletAddress, kind, options = {}) {
  if (!walletAddress) return [];
  if (options.loading !== false) setSectionLoading(kind, kind === "gifts" ? "Loading wallet gifts..." : "Loading wallet collectibles...");
  if (options.loading !== false) setCollectibleLoading(kind, true);
  try {
    const payload = await fetchWalletCollectiblesPayload(walletAddress);
    if (!isCurrentImportSession(options.importSessionId)) return [];
    const rows = payload?.[kind] || [];
    if (!rows.length) {
      const target = kind === "gifts" ? giftAssets : stickerAssets;
      if (kind === "stickers") {
        target.splice(0, target.length, ...demoStickerFallbackAssets());
        setCollectiblesBanner(kind, "Showing demo data");
        setSectionReady(kind, "Sticker screen ready · demo data");
      } else {
        target.splice(0, target.length);
        setCollectiblesBanner(kind, "No on-chain wallet gifts found. Telegram profile gifts can be added by username next.");
        setSectionReady(kind, "Gifts ready · no wallet gifts found");
      }
      renderCollectibleGrids();
      return [];
    }
    const assets = kind === "stickers"
      ? groupStickerAssets(rows.map((item, index) => liveCollectibleAsset(item, "sticker", index)))
      : groupGiftAssets(rows.map((item, index) => liveCollectibleAsset(item, "gift", index, { suppressMarket: true })));
    const target = kind === "gifts" ? giftAssets : stickerAssets;
    target.splice(0, target.length, ...assets);
    assets.forEach((asset) => {
      assetDetails[asset.id] = asset;
      (asset.children || []).forEach((child) => { assetDetails[child.id] = child; });
    });
    setCollectiblesBanner(kind, "");
    renderCollectibleGrids();
    if (kind === "gifts") {
      preloadGiftStaticImages(assets);
      setCollectiblesBanner(kind, "Loading model floors...");
      hydrateGiftModelFloors(assets).finally(() => {
        if (hasPendingCollectiblePrices("gifts")) setCollectiblesBanner(kind, "Some model floors are still unavailable");
        else setCollectiblesBanner(kind, "");
      });
    } else prefetchStickerDetails(assets);
    setSectionReady(kind, `${kind === "gifts" ? "Gifts" : "Stickers"} ready · ${assets.length} ${assets.length === 1 ? "collection" : "collections"} loaded`);
    return assets;
  } catch (error) {
    console.warn(`${kind} live data failed`, error);
    if (!isCurrentImportSession(options.importSessionId)) return [];
    if (kind === "gifts") giftAssets.splice(0, giftAssets.length);
    else stickerAssets.splice(0, stickerAssets.length, ...demoStickerFallbackAssets());
    setCollectiblesBanner(kind, kind === "gifts" ? "Live data unavailable" : "Live data unavailable — showing demo data");
    renderCollectibleGrids();
    setSectionReady(kind, kind === "gifts" ? "Gift screen ready · live data unavailable" : "Sticker screen ready · demo data");
    return [];
  }
}

function groupStickerAssets(assets = []) {
  const groups = new Map();
  assets.forEach((asset) => {
    const brand = stickerBrandName(asset);
    const key = brand.toLowerCase();
    if (!groups.has(key)) groups.set(key, { ...asset, children: [], childCollections: [], floorUsd: 0, floorTon: 0, initUsd: 0, initTon: 0, count: 0, family: brand, subtitle: "" });
    const group = groups.get(key);
    group.children.push(asset);
    const childLabel = asset.collection || asset.name || asset.characterName;
    if (childLabel && !group.childCollections.includes(childLabel)) group.childCollections.push(childLabel);
    group.count += Number(asset.count || 1);
    group.floorUsd += Number(asset.floorUsd || 0);
    group.floorTon += Number(asset.floorTon || 0);
    group.name = brand;
    group.collection = brand;
    group.creator = brand;
    group.packId = `${brand} Collection`;
    group.image = group.image || asset.image;
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
  return [...groups.values()].map((group, index) => {
    const preview = group.childCollections.slice(0, 3).join(", ");
    const more = group.childCollections.length > 3 ? ` +${group.childCollections.length - 3}` : "";
    return {
      ...group,
      image: STICKER_SOURCE_IMAGES[group.name] || group.image,
      creator: group.family || group.name,
      subtitle: preview ? `${preview}${more}` : (group.family || group.name),
      costBasis: group.initUsd || group.costBasis || 0,
      pnlUsd: group.initUsd ? group.floorUsd - group.initUsd : group.pnlUsd,
      pnlPct: group.initUsd ? ((group.floorUsd - group.initUsd) / group.initUsd) * 100 : group.pnlPct,
      id: `live-sticker-pack-${group.collection || group.name || index}`.replace(/[^a-z0-9_-]/gi, "-"),
    };
  });
}

function groupGiftAssets(assets = []) {
  const groups = new Map();
  assets.forEach((asset) => {
    const name = String(asset.collection || asset.name || "Telegram Gifts").trim();
    const source = String(asset.marketPlatform || "").trim();
    const key = `${name.toLowerCase()}::${source.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, {
      ...asset,
      children: [],
      floorUsd: 0,
      floorTon: 0,
      initUsd: 0,
      initTon: 0,
      dailyUsd: 0,
      count: 0,
      tags: [],
    });
    const group = groups.get(key);
    group.children.push(asset);
    group.count += Number(asset.count || 1);
    group.floorUsd += Number(asset.floorUsd || 0);
    group.floorTon += Number(asset.floorTon || 0);
    group.initUsd += Number(asset.initUsd || 0);
    group.initTon += Number(asset.initTon || 0);
    group.dailyUsd += Number(asset.dailyUsd || 0);
    if (asset.tag) group.tags.push(asset.tag);
    group.name = name;
    group.collection = name;
    group.creator = source ? `Floor · ${source}` : (asset.creator || group.creator || name);
    group.provenance = source ? `${name} · ${source}` : name;
    group.image = group.image || asset.image;
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
  const attrValue = (label, fallback = "—") => {
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
  const marketVerified = options.suppressMarket ? false : ((Number(item.floorUsd || 0) > 0 || Number(item.floorTon || 0) > 0) && Boolean(item.marketPlatform || item.source || item.marketUrl));
  const floorUsd = marketVerified ? Number(item.floorUsd || 0) : 0;
  const floorTon = marketVerified ? Number(item.floorTon || 0) : 0;
  return {
    id: `live-${kind}-${item.tokenAddress || index}`.replace(/[^a-z0-9_-]/gi, "-"),
    type: kind,
    name: item.name || (isGift ? "Telegram Gift" : "Sticker Pack"),
    collection: item.collection || "Telegram Collection",
    creator: item.collection || "Telegram",
    image: item.image,
    animatedImage: item.animatedImage || item.animationUrl || item.animatedUrl || item.mediaUrl || "",
    animationUrl: item.animationUrl || item.animatedImage || "",
    mediaType: item.mediaType || "",
    layeredMedia: item.layeredMedia || null,
    collectionAddress: item.collectionAddress,
    tokenAddress: item.tokenAddress,
    icon: isGift ? "gift" : "sticker",
    tag: Number(item.mintIndex || index + 1),
    traits: [
      { label: "Model", value: attrValue("model", "TON NFT"), rarity: attrRarity("model") },
      { label: "Backdrop", value: attrValue("backdrop", item.collection?.slice(0, 16) || "Collection"), rarity: attrRarity("backdrop") },
      { label: "Symbol", value: attrValue("symbol", "Wallet"), rarity: attrRarity("symbol") },
    ],
    mint: { current: Number(item.mintIndex || index + 1), total: Math.max(Number(item.mintIndex || index + 1), 1) },
    floorUsd,
    floorTon,
    marketVerified,
    priceLoading: !marketVerified,
    dailyUsd: 0,
    dailyPct: marketVerified ? Number(item.change24hPct || 0) : 0,
    pnlUsd: costBasis ? floorUsd - costBasis : 0,
    pnlPct: costBasis ? ((floorUsd - costBasis) / costBasis) * 100 : 0,
    status: item.listed ? "Listed on Getgems" : "Unlisted",
    acquired: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
    acquiredSort: Date.now(),
    costBasis,
    upgraded: "Imported from connected TON wallet",
    provenance: `${item.collection || "Collection"} · ${truncateWalletAddress(item.tokenAddress || "")}`,
    comboRank: item.description || "Live wallet collectible",
    exactCount: "Trait data from marketplace metadata",
    quickSellTon: marketVerified ? floorTon * 0.95 : 0,
    quickSellUsd: marketVerified ? floorUsd * 0.95 : 0,
    initUsd: Number(item.initUsd || 0),
    initTon: Number(item.initTon || 0),
    marketPlatform: marketVerified ? (item.marketPlatform || "") : "",
    marketUrl: marketVerified ? (item.marketUrl || "") : "",
    collectionId: item.collectionId || "",
    characterId: item.characterId || "",
    characterName: item.characterName || "",
    source: item.source || "",
    brand: item.brand || "",
    categorySource: item.categorySource || "",
    sales: [],
    intel: { trend: "▂▃▅▆▇", badge: "Live", sales24h: "—", volume24h: "—", prior: "—", daysToSell: "—", listedSupply: "—", listingRate: "—", bestTime: "—" },
    chart: floorUsd ? [floorUsd, floorUsd, floorUsd, floorUsd, floorUsd, floorUsd, floorUsd] : [],
    ...(isGift ? {} : {
      format: attrValue("format", "Static"),
      edition: attrValue("edition", "Open Edition"),
      count: Number(attrValue("count", "1").replace(/\D/g, "")) || 1,
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
  return `${month} ${day} · ${hour}:${minute}`;
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
  if (/^[+\-−]/.test(value)) return value;
  if (!/(TON|USD|JETTON|[A-Z0-9$]{2,})/i.test(value)) return value;
  return `${direction === "Sent" ? "−" : "+"}${value}`;
}

function activityRowsHtml(events = [], limit = 5, emptyText = "No TON activity found yet", options = {}) {
  const usableEvents = events.map((event) => {
    const action = event.actions?.find((item) => item.simplePreview?.value) || event.actions?.[0];
    const preview = action?.simplePreview || {};
    let value = String(preview.value || preview.description?.replace(/^Swapping\s+/i, "").replace(/\s+for\s+/i, " → ") || "On-chain");
    if (/nft|gift|sticker/i.test(`${action?.type || ""} ${preview.name || ""} ${value}`)) return null;
    const tonMatch = value.match(/[-+]?\d+(?:\.\d+)?\s*TON/i);
    if (tonMatch && Math.abs(Number.parseFloat(tonMatch[0])) <= 0) return null;
    const isNegative = /^\s*-/.test(value);
    const isPositive = /^\s*\+/.test(value);
    const direction = preview.direction || (/swap/i.test(action?.type || preview.name || "") ? "Swap" : isNegative ? "Sent" : "Received");
    value = signedActivityValue(value, direction);
    const valueParts = value.split(/\s+→\s+/);
    return {
      label: direction,
      description: preview.name || action?.type || "TON activity",
      value,
      valueHtml: valueParts.length > 1
        ? `${escapeHtml(valueParts[0])}<span>${escapeHtml(`→ ${valueParts.slice(1).join(" → ")}`)}</span>`
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
  const amountParts = String(detail.amount || "0 TON").split(/\s*→\s*/);
  amountTitle.innerHTML = isSwap && amountParts.length > 1
    ? `<span class="tx-swap-sent">−${escapeHtml(amountParts[0])}</span><span class="tx-swap-received">+${escapeHtml(amountParts.slice(1).join(" → "))}</span>`
    : escapeHtml(detail.amount || "0 TON");
  document.getElementById("txUsdValue").textContent = isSwap ? "" : (detail.usdValue || "n/a");
  document.getElementById("txSubtitle").textContent = `${detail.type || "Transaction"} · ${detail.timestamp ? formatActivityDate(detail.timestamp) : ""}`;
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
      if (document.querySelector('[data-screen="activity"].is-active')) renderFullActivity(fullActivityEvents);
      preloadFullActivityBackground(address);
      setSectionReady("activity", `Activity ready · ${fullActivityEvents.length} transactions loaded`);
    }
  } catch (error) {
    console.warn("Full activity load failed", error);
    if (document.querySelector('[data-screen="activity"].is-active')) {
      document.querySelector('[data-screen="activity"] .holdings-list').innerHTML = activityRowsHtml([], 1000, "Could not load wallet history");
      window.lucide?.createIcons();
    }
    setSectionReady("activity", "Activity ready · unavailable");
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
  const canvas = host instanceof HTMLCanvasElement ? host : getOrCreateCanvas(host, "donut-chart-canvas", 160, 160);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const ratio = window.devicePixelRatio || 1;
  const cssSize = Math.max(120, Math.round(host.getBoundingClientRect().width || 160));
  canvas.style.width = `${cssSize}px`;
  canvas.style.height = `${cssSize}px`;
  canvas.width = Math.round(cssSize * ratio);
  canvas.height = Math.round(cssSize * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const cx = cssSize / 2;
  const cy = cssSize / 2;
  const r = cx * 0.72;
  const stroke = cx * 0.24;
  const styles = getComputedStyle(document.documentElement);
  const total = Math.max(1, allocationState.gifts + allocationState.tokens + allocationState.stickers);
  const segments = [
    { pct: allocationState.gifts / total, color: styles.getPropertyValue("--blue").trim() },
    { pct: allocationState.tokens / total, color: styles.getPropertyValue("--mint").trim() },
    { pct: allocationState.stickers / total, color: styles.getPropertyValue("--amber").trim() },
  ];
  ctx.clearRect(0, 0, cssSize, cssSize);
  let angle = -Math.PI / 2;
  const gap = 0.08;
  let remaining = Math.max(0, Math.min(1, progress));
  segments.forEach((segment, index) => {
    if (remaining <= 0) return;
    const pct = Math.min(segment.pct, remaining);
    const sweep = segment.pct * 2 * Math.PI - gap;
    const animatedSweep = pct * 2 * Math.PI - (pct === segment.pct ? gap : 0);
    const mid = angle + sweep / 2;
    const lift = selectedAllocation === index ? stroke * 0.34 : 0;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(mid) * lift, cy + Math.sin(mid) * lift, r, angle, angle + Math.max(0, animatedSweep));
    ctx.strokeStyle = segment.color;
    ctx.lineWidth = stroke;
    ctx.lineCap = "round";
    ctx.stroke();
    remaining -= segment.pct;
    angle += segment.pct * 2 * Math.PI;
  });
  const legendItems = document.querySelectorAll(".allocation-list article");
  document.querySelector(".allocation-list")?.classList.toggle("is-filtered", selectedAllocation !== null);
  legendItems.forEach((item, index) => item.classList.toggle("is-selected", selectedAllocation === index));
}

const portfolioRanges = {
  "1D": {
    label: "Today",
    defaultLabel: "12:00",
    ruler: [
      { label: "09:00", index: 0 },
      { label: "12:00", index: 3 },
      { label: "15:00", index: 6 },
      { label: "18:00", index: 9 },
      { label: "20:00", index: 11 },
    ],
    value: "$0.00",
    change: "+2.37%",
    points: [
      { label: "09:00", date: "May 17 09:00", value: 15104, change: "+0.6%", x: 0, y: 126 },
      { label: "10:00", date: "May 17 10:00", value: 15620, change: "+0.8%", x: 28, y: 112 },
      { label: "11:00", date: "May 17 11:00", value: 16210, change: "+1.0%", x: 57, y: 101 },
      { label: "12:00", date: "May 17 12:00", value: 16578, change: "+1.1%", x: 85, y: 96 },
      { label: "13:00", date: "May 17 13:00", value: 16180, change: "+0.7%", x: 113, y: 104 },
      { label: "14:00", date: "May 17 14:00", value: 15890, change: "-0.1%", x: 142, y: 111 },
      { label: "15:00", date: "May 17 15:00", value: 16025, change: "-0.3%", x: 170, y: 108 },
      { label: "16:00", date: "May 17 16:00", value: 16670, change: "+0.9%", x: 198, y: 91 },
      { label: "17:00", date: "May 17 17:00", value: 17140, change: "+1.4%", x: 227, y: 78 },
      { label: "18:00", date: "May 17 18:00", value: 17499, change: "+1.8%", x: 255, y: 70 },
      { label: "19:00", date: "May 17 19:00", value: 17920, change: "+2.1%", x: 283, y: 53 },
      { label: "20:00", date: "May 17 20:00", value: 0, change: "+0.00%", x: 340, y: 34 },
    ],
    area: "M0 126 C32 118 46 92 78 96 C112 101 120 58 154 66 C191 75 198 116 232 92 C260 72 282 42 340 34 V160 H0 Z",
    line: "M0 126 C32 118 46 92 78 96 C112 101 120 58 154 66 C191 75 198 116 232 92 C260 72 282 42 340 34",
    point: [340, 34],
  },
  "7D": {
    label: "May 11",
    defaultLabel: "Mon 12:00",
    ruler: [
      { label: "Mon", index: 0 },
      { label: "Tue", index: 1 },
      { label: "Wed", index: 2 },
      { label: "Thu", index: 3 },
      { label: "Fri", index: 4 },
      { label: "Sat", index: 5 },
      { label: "Sun", index: 6 },
    ],
    value: "$17,980",
    change: "+4.90%",
    points: [
      { label: "Mon 12:00", date: "May 11", value: 14880, change: "+0.4%" },
      { label: "Tue 12:00", date: "May 12", value: 15620, change: "+1.2%" },
      { label: "Wed 12:00", date: "May 13", value: 15980, change: "+0.9%" },
      { label: "Thu 12:00", date: "May 14", value: 16840, change: "+2.0%" },
      { label: "Fri 12:00", date: "May 15", value: 17060, change: "+1.5%" },
      { label: "Sat 12:00", date: "May 16", value: 17240, change: "+1.7%" },
      { label: "Sun 12:00", date: "May 17", value: 17980, change: "+4.90%" },
    ],
    area: "M0 118 C42 104 62 122 96 94 C134 62 162 86 196 70 C232 54 258 68 340 38 V160 H0 Z",
    line: "M0 118 C42 104 62 122 96 94 C134 62 162 86 196 70 C232 54 258 68 340 38",
    point: [340, 38],
  },
  "1M": {
    label: "Apr 17",
    defaultLabel: "May 17",
    ruler: [
      { label: "May 1", index: 0 },
      { label: "May 8", index: 1 },
      { label: "May 15", index: 2 },
      { label: "May 22", index: 3 },
    ],
    value: "$16,860",
    change: "+9.25%",
    points: [
      { label: "May 1", date: "May 1", value: 15120, change: "+1.4%" },
      { label: "May 8", date: "May 8", value: 15880, change: "+2.1%" },
      { label: "May 15", date: "May 15", value: 16420, change: "+3.0%" },
      { label: "May 22", date: "May 22", value: 16860, change: "+9.25%" },
    ],
    area: "M0 132 C44 128 74 108 108 112 C148 118 168 84 210 78 C252 72 286 52 340 40 V160 H0 Z",
    line: "M0 132 C44 128 74 108 108 112 C148 118 168 84 210 78 C252 72 286 52 340 40",
    point: [340, 40],
  },
  "3M": {
    label: "Feb 17",
    defaultLabel: "Mar 15",
    ruler: [
      { label: "Mar", index: 0 },
      { label: "Apr", index: 1 },
      { label: "May", index: 2 },
    ],
    value: "$14,240",
    change: "+29.35%",
    points: [
      { label: "Mar 15", date: "Mar 15", value: 11960, change: "+3.8%" },
      { label: "Apr 15", date: "Apr 15", value: 13280, change: "+5.4%" },
      { label: "May 15", date: "May 15", value: 14240, change: "+29.35%" },
    ],
    area: "M0 140 C38 126 66 132 102 110 C146 84 172 104 214 76 C254 48 294 58 340 30 V160 H0 Z",
    line: "M0 140 C38 126 66 132 102 110 C146 84 172 104 214 76 C254 48 294 58 340 30",
    point: [340, 30],
  },
  "1Y": {
    label: "May 2025",
    defaultLabel: "May 2026",
    ruler: [
      { label: "Jan", index: 0 },
      { label: "Mar", index: 1 },
      { label: "May", index: 2 },
      { label: "Jul", index: 3 },
      { label: "Sep", index: 4 },
      { label: "Nov", index: 5 },
    ],
    value: "$14,260",
    change: "-18.42%",
    points: [
      { label: "Jan 2026", date: "Jan 2026", value: 22580, change: "+8.1%" },
      { label: "Feb 2026", date: "Feb 2026", value: 21840, change: "+4.4%" },
      { label: "Mar 2026", date: "Mar 2026", value: 20720, change: "-1.2%" },
      { label: "Apr 2026", date: "Apr 2026", value: 21360, change: "+1.8%" },
      { label: "May 2026", date: "May 2026", value: 19940, change: "-5.6%" },
      { label: "Jun 2026", date: "Jun 2026", value: 20310, change: "-3.9%" },
      { label: "Jul 2026", date: "Jul 2026", value: 19180, change: "-9.2%" },
      { label: "Aug 2026", date: "Aug 2026", value: 19540, change: "-7.4%" },
      { label: "Sep 2026", date: "Sep 2026", value: 18730, change: "-11.8%" },
      { label: "Oct 2026", date: "Oct 2026", value: 19060, change: "-10.2%" },
      { label: "Nov 2026", date: "Nov 2026", value: 18190, change: "-14.6%" },
      { label: "Dec 2026", date: "Dec 2026", value: 0, change: "+0.00%" },
    ],
    area: "M0 146 C50 142 80 126 118 118 C158 108 178 78 218 86 C258 94 286 48 340 24 V160 H0 Z",
    line: "M0 146 C50 142 80 126 118 118 C158 108 178 78 218 86 C258 94 286 48 340 24",
    point: [340, 24],
  },
};

function renderPortfolioGraph(range = "1D", animate = false) {
  const data = portfolioRanges[range] || portfolioRanges["1D"];
  preparePortfolioRange(data, range);
  const graph = document.querySelector('[data-screen="home"] .graph-card');
  const svg = graph?.querySelector(".value-graph svg");
  if (!svg) return;
  svg.querySelector(".area")?.setAttribute("d", data.area);
  svg.querySelector(".line")?.setAttribute("d", data.line);
  renderGraphRuler(data);
  renderExtremeLabels(data.points);
  document.querySelector('[data-screen="home"] .value-graph')?.classList.remove("is-touching");
  graph.querySelectorAll("[data-range]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.range === range);
    button.classList.toggle("is-loading", loadingPortfolioRanges.has(button.dataset.range));
  });
  resetPortfolioHeader(range);
  if (animate) animatePortfolioGraphLine();
}

function preparePortfolioRange(data, range) {
  if (!data.basePoints) data.basePoints = data.points.map((point) => ({ ...point }));
  data.activeRange = range;
  data.points = buildRangePoints(data, range);
  const values = data.points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const valuePadding = Math.max((max - min) * 0.12, homePortfolioValue * 0.01);
  const scaledMin = min - valuePadding;
  const scaledMax = max + valuePadding;
  const plotTop = 28;
  const plotBottom = 132;
  data.points.forEach((point, index) => {
    point.x = data.points.length === 1 ? 0 : (index / (data.points.length - 1)) * 340;
    point.y = plotBottom - ((point.value - scaledMin) / Math.max(1, scaledMax - scaledMin)) * (plotBottom - plotTop);
  });
  const line = data.points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  data.line = line;
  data.area = `${line} L340 160 L0 160 Z`;
}

function buildRangePoints(data, range) {
  const rangeHistory = liveHistoryByRange.get(range) || (range === "1D" ? liveHistoryPoints : []);
  if (liveWalletData && rangeHistory.length) {
    const guideEvery = liveGuideStep(range, rangeHistory.length);
    return rangeHistory.map((point, index) => {
      const date = new Date(point.timestamp);
      const previous = rangeHistory[Math.max(0, index - 1)];
      return {
        label: formatRangeDate(range, date),
        detailLabel: formatRangeDetailDate(range, date),
        value: point.value,
        change: index === 0 ? "+0.00%" : `${point.value >= previous.value ? "+" : ""}${((point.value - previous.value) / Math.max(1, previous.value) * 100).toFixed(2)}%`,
        guide: index === 0 || index === rangeHistory.length - 1 || index % guideEvery === 0,
      };
    });
  }
  if (liveWalletData) return buildLoadingRangePoints(range);
  const now = currentGraphEnd();
  const configs = {
    "1D": { start: addMinutes(now, -144 * 5), count: 145, step: 5, guide: 36 },
    "7D": { start: addMinutes(now, -168 * 60), count: 169, step: 60, guide: 24 },
    "1M": { start: addMinutes(now, -360 * 120), count: 361, step: 120, guide: 84 },
    "3M": { start: addMinutes(now, -91 * 1440), count: 92, step: 1440, guide: 31 },
    "1Y": { start: new Date(now.getFullYear(), now.getMonth() - 11, now.getDate(), now.getHours(), 0), count: 12, monthly: true, guide: 2 },
  };
  const config = configs[range];
  if (!config) return data.basePoints.map((point) => ({ ...point }));
  return Array.from({ length: config.count }, (_, index) => {
    const date = config.monthly ? addMonths(config.start, index) : addMinutes(config.start, index * config.step);
    const value = portfolioValueAt(date, now);
    const previousDate = config.monthly ? addMonths(config.start, Math.max(0, index - 1)) : addMinutes(config.start, Math.max(0, index - 1) * config.step);
    const previousValue = index === 0 ? value : portfolioValueAt(previousDate, now);
    const changePct = previousValue ? ((value - previousValue) / previousValue) * 100 : 0;
    return {
      label: formatRangeDate(range, date),
      detailLabel: formatRangeDetailDate(range, date),
      value,
      change: `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`,
      guide: isGuidePoint(range, date, index, config),
    };
  });
}

function liveGuideStep(range, length) {
  if (range === "1D") return Math.max(1, Math.ceil(length / 5));
  if (range === "7D") return 1;
  if (range === "1M") return Math.max(1, Math.ceil(length / 5));
  if (range === "1Y") return Math.max(1, Math.ceil(length / 6));
  return Math.max(1, Math.ceil(length / 4));
}

function buildLoadingRangePoints(range) {
  const now = currentGraphEnd();
  const count = range === "1D" ? 25 : range === "7D" ? 15 : 31;
  const stepMinutes = range === "1D" ? 60 : range === "7D" ? 12 * 60 : 24 * 60;
  const start = range === "1Y"
    ? new Date(now.getFullYear(), now.getMonth() - 12, now.getDate(), 12, 0, 0, 0)
    : addMinutes(now, -(count - 1) * stepMinutes);
  return Array.from({ length: count }, (_, index) => {
    const date = range === "1Y" ? addMonths(start, index) : addMinutes(start, index * stepMinutes);
    return {
      label: formatRangeDate(range, date),
      detailLabel: formatRangeDetailDate(range, date),
      value: homePortfolioValue,
      change: "+0.00%",
      guide: true,
      isLoading: true,
    };
  });
}

function currentGraphEnd() {
  const now = new Date();
  now.setSeconds(0, 0);
  return now;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function addMonths(date, monthsToAdd) {
  return new Date(date.getFullYear(), date.getMonth() + monthsToAdd, date.getDate(), date.getHours(), date.getMinutes());
}

function portfolioValueAt(date, now = currentGraphEnd()) {
  if (liveWalletData && liveHistoryPoints.length) return livePortfolioValueAt(date);
  if (homePortfolioValue <= 0) return 0;
  const daysAgo = Math.max(0, (now.getTime() - date.getTime()) / 86400000);
  const trendPct = Math.min(0.28, daysAgo * 0.0012);
  const wavePct =
    Math.sin(daysAgo * 0.42 + 1.4) * 0.026 +
    Math.sin(daysAgo * 0.083 + 0.7) * 0.052 +
    Math.sin(daysAgo * 3.2 + 0.35) * 0.009;
  const currentWavePct = Math.sin(1.4) * 0.026 + Math.sin(0.7) * 0.052 + Math.sin(0.35) * 0.009;
  const value = homePortfolioValue * (1 + trendPct + wavePct - currentWavePct);
  return Math.max(homePortfolioValue * 0.12, value);
}

function livePortfolioValueAt(date) {
  const target = date.getTime();
  const points = liveHistoryByRange.get(activePortfolioRange()) || liveHistoryPoints;
  if (!points.length) return homePortfolioValue;
  if (points.length === 1 || target <= points[0].timestamp) return points[0].value;
  if (target >= points[points.length - 1].timestamp) return points[points.length - 1].value;
  const rightIndex = points.findIndex((point) => point.timestamp >= target);
  const left = points[Math.max(0, rightIndex - 1)];
  const right = points[rightIndex];
  const span = Math.max(1, right.timestamp - left.timestamp);
  const pct = (target - left.timestamp) / span;
  return left.value + (right.value - left.value) * pct;
}

function isGuidePoint(range, date, index, config) {
  if (range === "3M") return date.getDate() === 1 || index === config.count - 1;
  if (range === "1Y") return index % config.guide === 0;
  if (range === "1M") return index % config.guide === 0;
  return index % config.guide === 0 || index === config.count - 1;
}

function formatRangeDate(range, date) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hhmm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (range === "1D") return hhmm;
  if (range === "7D") return `${days[date.getDay()]} ${hhmm}`;
  if (range === "1M") return `${months[date.getMonth()]} ${date.getDate()} ${hhmm}`;
  if (range === "3M") return `${months[date.getMonth()]} ${date.getDate()}`;
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatRangeDetailDate(range, date) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hhmm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (range === "3M" || range === "1Y") return `${days[date.getDay()]} ${mm}/${dd}/${date.getFullYear()}`;
  return `${days[date.getDay()]} ${mm}/${dd}/${date.getFullYear()}, ${hhmm}`;
}

function renderGraphRuler(data) {
  const ruler = document.getElementById("portfolioGraphRuler");
  if (!ruler) return;
  ruler.style.gridTemplateColumns = "none";
  const guided = data.points.filter((point) => point.guide);
  const maxMarkers = data.activeRange === "7D" ? 8 : data.activeRange === "1Y" ? 6 : 5;
  const step = Math.max(1, Math.ceil(guided.length / maxMarkers));
  const markers = guided.filter((_, index) => index === 0 || index === guided.length - 1 || index % step === 0);
  ruler.innerHTML = markers.map((point, rulerIndex) => {
    const left = point ? (point.x / 340) * 100 : 0;
    const edge = rulerIndex === 0 ? "is-start" : rulerIndex === markers.length - 1 ? "is-end" : "";
    const label = graphRulerLabel(data.activeRange, point.label);
    return `<span class="${edge}" style="left:${left}%">${label}</span>`;
  }).join("");
}

function graphRulerLabel(range, label) {
  if (range === "1D") return label;
  if (range === "7D") return label.split(" ")[0];
  if (range === "1M") return label.split(" ").slice(0, 2).join(" ");
  if (range === "3M") return label.split(" ")[0];
  if (range === "1Y") return label.split(" ")[0];
  return label;
}

function renderExtremeLabels(points = []) {
  const graph = document.querySelector('[data-screen="home"] .value-graph');
  if (!graph || !points.length) return;
  graph.querySelectorAll(".graph-extreme-label").forEach((node) => node.remove());
  if (points.every((point) => point.isLoading)) return;
  if (liveWalletData && homePortfolioValue > 0 && points.some((point) => point.value > homePortfolioValue * 20)) return;
  const minPoint = points.reduce((lowest, point) => (point.value < lowest.value ? point : lowest), points[0]);
  const maxPoint = points.reduce((highest, point) => (point.value > highest.value ? point : highest), points[0]);
  [
    { point: maxPoint, type: "max" },
    { point: minPoint, type: "min" },
  ].forEach(({ point, type }) => {
    const label = document.createElement("span");
    label.className = `graph-extreme-label is-${type}`;
    label.textContent = money(point.value);
    graph.appendChild(label);
    placeExtremeLabel(label, point, type);
  });
}

function placeExtremeLabel(label, point, type) {
  const graph = document.querySelector('[data-screen="home"] .value-graph');
  if (!graph) return;
  const { x, y } = graphSvgToLocal(point);
  const labelWidth = label.offsetWidth || 58;
  const left = Math.max(labelWidth / 2, Math.min(graph.clientWidth - labelWidth / 2, x));
  label.style.left = `${left}px`;
  label.style.top = `${type === "max" ? Math.max(4, y - 20) : Math.min(graph.clientHeight - 16, y + 12)}px`;
}

function setGraphTooltipFromPointer(event) {
  const active = document.querySelector("[data-range].is-active")?.dataset.range || "1D";
  const data = portfolioRanges[active] || portfolioRanges["1D"];
  const points = data.points || [];
  const point = graphPointFromPointer(event, points, active);
  positionGraphHover(point, true);
}

function setPortfolioHeader(value, change) {
  const title = document.querySelector('[data-screen="home"] .graph-head h1');
  const badge = document.querySelector('[data-screen="home"] .portfolio-actions-row span');
  if (title) title.textContent = money(homePortfolioValue);
  if (badge) {
    const active = document.querySelector("[data-range].is-active")?.dataset.range || "1D";
    const current = portfolioRanges[active] || portfolioRanges["1D"];
    const currentValue = latestPortfolioValue(active);
    const delta = value - currentValue;
    badge.textContent = `${signedMoney(delta)} | ${change}`;
    badge.classList.toggle("negative", change.trim().startsWith("-"));
  }
}

function latestPortfolioValue(range) {
  const data = portfolioRanges[range] || portfolioRanges["1D"];
  const points = data.points?.length ? data.points : data.basePoints || [];
  return points.at(-1)?.value || homePortfolioValue;
}

function rangePnl(range) {
  const data = portfolioRanges[range] || portfolioRanges["1D"];
  const points = data.points?.length ? data.points : data.basePoints || [];
  const first = points[0]?.value || latestPortfolioValue(range);
  const last = latestPortfolioValue(range);
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

function graphPointFromPointer(event, points, range) {
  const svg = document.querySelector('[data-screen="home"] .value-graph svg');
  if (!svg || !points.length) return points.at(-1);
  const svgPoint = svg.createSVGPoint();
  svgPoint.x = event.clientX;
  svgPoint.y = event.clientY;
  const localPoint = svgPoint.matrixTransform(svg.getScreenCTM().inverse());
  const viewX = Math.min(340, Math.max(0, localPoint.x));
  const nearest = points.reduce((best, point) => (Math.abs(point.x - viewX) < Math.abs(best.x - viewX) ? point : best), points[0]);
  return {
    ...nearest,
    detailLabel: nearest.detailLabel || getDetailedPointLabel(range, nearest.label),
  };
}

function getDetailedPointLabel(range, label) {
  return label;
}

function getStrictPointLabel(range, left, right, localPct) {
  if (localPct >= 1) return right.label;
  if (range === "1D") {
    const leftMinutes = timeLabelToMinutes(left.label);
    const rightMinutes = timeLabelToMinutes(right.label);
    const exactMinutes = Math.floor(leftMinutes + (rightMinutes - leftMinutes) * localPct);
    return minutesToTimeLabel(exactMinutes);
  }
  if (range === "7D") {
    return interpolateDayTimeLabel(left.label, right.label, localPct, 60);
  }
  if (range === "1M" || range === "3M") {
    return interpolateMonthDayLabel(left.label, right.label, localPct, range === "1M" ? 120 : 24 * 60);
  }
  if (range === "1Y") {
    return interpolateMonthYearLabel(left.label, right.label, localPct);
  }
  return left.label;
}

function timeLabelToMinutes(label) {
  const time24 = label.match(/(\d{1,2}):(\d{2})$/);
  if (time24) return Number(time24[1]) * 60 + Number(time24[2]);
  const match = label.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/);
  if (!match) return 0;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3];
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function minutesToTimeLabel(totalMinutes) {
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function interpolateDayTimeLabel(leftLabel, rightLabel, localPct, stepMinutes = 60) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const leftDay = days.indexOf(leftLabel.slice(0, 3));
  const rightDay = days.indexOf(rightLabel.slice(0, 3));
  const daySpan = Math.max(1, (rightDay - leftDay + 7) % 7);
  const total = 12 * 60 + Math.floor((24 * 60 * daySpan * localPct) / stepMinutes) * stepMinutes;
  const exactDay = leftDay + Math.floor(total / (24 * 60));
  return `${days[exactDay % 7]} ${minutesToTimeLabel(total)}`;
}

function interpolateMonthDayLabel(leftLabel, rightLabel, localPct, stepMinutes = 24 * 60) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [leftMonth, leftDayRaw] = leftLabel.split(" ");
  const [rightMonth, rightDayRaw] = rightLabel.split(" ");
  const leftMonthIndex = months.indexOf(leftMonth);
  const rightMonthIndex = months.indexOf(rightMonth);
  const leftDay = Number(leftDayRaw);
  const rightDay = Number(rightDayRaw);
  const leftAbsoluteMinutes = (leftMonthIndex * 31 + leftDay) * 24 * 60;
  const rightAbsoluteMinutes = (rightMonthIndex * 31 + rightDay) * 24 * 60;
  const exactMinutes = leftAbsoluteMinutes + (rightAbsoluteMinutes - leftAbsoluteMinutes) * localPct;
  const snappedMinutes = Math.floor(exactMinutes / stepMinutes) * stepMinutes;
  const exactAbsolute = Math.floor(snappedMinutes / (24 * 60));
  const month = months[Math.max(0, Math.min(11, Math.floor((exactAbsolute - 1) / 31)))];
  const day = ((exactAbsolute - 1) % 31) + 1;
  return stepMinutes < 24 * 60 ? `${month} ${day} ${minutesToTimeLabel(snappedMinutes)}` : `${month} ${day}`;
}

function interpolateMonthYearLabel(leftLabel, rightLabel, localPct) {
  const months = ["Jan", "Feb", "Mar", "May", "Jul", "Aug", "Sep", "Nov"];
  return localPct < 1 ? leftLabel : rightLabel;
}

function positionGraphHover(point, visible) {
  const graph = document.querySelector('[data-screen="home"] .value-graph');
  if (!graph || !point) return;
  const svg = graph.querySelector("svg");
  if (!svg) return;
  let dot = graph.querySelector(".graph-hover-dot");
  let label = graph.querySelector(".graph-value-label");
  let guide = graph.querySelector(".graph-guide-line");
  if (!dot) {
    dot = document.createElement("span");
    dot.className = "graph-hover-dot";
    graph.appendChild(dot);
  }
  if (!label) {
    label = document.createElement("span");
    label.className = "graph-value-label";
    graph.appendChild(label);
  }
  if (!guide) {
    guide = document.createElement("span");
    guide.className = "graph-guide-line";
    graph.appendChild(guide);
  }
  const { x, y } = graphSvgToLocal(point);
  const labelWidth = 74;
  const rightSide = x < graph.clientWidth / 2;
  const desiredX = rightSide ? x + 44 : x - 44;
  const safeLabelX = Math.max(labelWidth / 2, Math.min(graph.clientWidth - labelWidth / 2, desiredX));
  dot.style.left = `${x}px`;
  dot.style.top = `${y}px`;
  guide.style.left = `${x}px`;
  guide.style.height = `${graph.querySelector("svg")?.clientHeight || 196}px`;
  label.style.left = `${safeLabelX}px`;
  label.style.top = `${Math.max(34, y - 4)}px`;
  label.innerHTML = `<b>${money(point.value)}</b><small>${point.detailLabel || point.label || point.date}</small>`;
  graph.classList.toggle("is-touching", visible);
}

function graphSvgToLocal(point) {
  const graph = document.querySelector('[data-screen="home"] .value-graph');
  const svg = graph?.querySelector("svg");
  if (!graph || !svg) return { x: 0, y: 0 };
  const graphRect = graph.getBoundingClientRect();
  const svgPoint = svg.createSVGPoint();
  svgPoint.x = point.x;
  svgPoint.y = point.y;
  const screenPoint = svgPoint.matrixTransform(svg.getScreenCTM());
  return { x: screenPoint.x - graphRect.left, y: screenPoint.y - graphRect.top };
}

function placeGraphElement(element, point, offsets) {
  const graph = document.querySelector('[data-screen="home"] .value-graph');
  if (!graph) return;
  const { x, y } = graphSvgToLocal(point);
  element.style.left = `${Math.max(4, Math.min(graph.clientWidth - 58, x + offsets.xOffset))}px`;
  element.style.top = `${Math.max(8, y + offsets.yOffset)}px`;
}

function animatePortfolioGraphLine() {
  const graph = document.querySelector('[data-screen="home"] .value-graph');
  const line = graph?.querySelector(".line");
  const area = graph?.querySelector(".area");
  if (!graph || !line || !area) return;
  const length = line.getTotalLength();
  graph.classList.add("graph-drawing");
  line.style.transition = "none";
  line.style.strokeDasharray = `${length}px`;
  line.style.strokeDashoffset = `${length}px`;
  area.style.opacity = "0";
  line.getBoundingClientRect();
  requestAnimationFrame(() => {
    line.style.transition = "stroke-dashoffset .8s cubic-bezier(.22, 1, .36, 1)";
    line.style.strokeDashoffset = "0";
    area.style.opacity = "1";
  });
  setTimeout(() => {
    line.style.strokeDasharray = "";
    line.style.strokeDashoffset = "";
    line.style.transition = "";
    graph.classList.remove("graph-drawing");
  }, 800);
}

function playHomeEntrance() {
  const home = document.querySelector('[data-screen="home"]');
  const line = home?.querySelector(".value-graph .line");
  const area = home?.querySelector(".value-graph .area");
  const value = home?.querySelector(".graph-head h1");
  const badge = home?.querySelector(".portfolio-actions-row span");
  const donut = home?.querySelector(".donut-chart");
  const legendItems = home?.querySelectorAll(".allocation-list article") || [];
  const performers = home?.querySelectorAll(".performer-row article") || [];
  const rows = home?.querySelectorAll(".activity-row") || [];
  if (!home || !line || !area || !value || !badge) return;

  home.classList.remove("home-animating", "home-ready");
  void home.offsetWidth;
  home.classList.add("home-animating");
  badge.classList.remove("is-visible");
  donut?.classList.remove("is-complete");
  legendItems.forEach((item) => item.classList.remove("legend-in"));
  performers.forEach((card) => card.classList.remove("bars-in"));
  rows.forEach((row) => row.classList.remove("row-in"));
  value.textContent = money(0);
  renderDonut(0);

  animatePortfolioGraphLine();

  const activeRange = document.querySelector("[data-range].is-active")?.dataset.range || "1D";
  const targetValue = homePortfolioValue;
  const valueStart = performance.now();
  function countValue(now) {
    const progress = Math.min(1, (now - valueStart) / 800);
    const eased = 1 - Math.pow(1 - progress, 3);
    value.textContent = money(targetValue * eased);
    if (progress < 1) requestAnimationFrame(countValue);
    else resetPortfolioHeader(activeRange);
  }
  requestAnimationFrame(countValue);

  const donutStart = performance.now();
  function drawDonut(now) {
    const progress = Math.min(1, (now - donutStart) / 600);
    renderDonut(1 - Math.pow(1 - progress, 3));
    if (progress < 1) requestAnimationFrame(drawDonut);
    else {
      setTimeout(() => {
        legendItems.forEach((item, index) => setTimeout(() => item.classList.add("legend-in"), index * 150));
        setTimeout(() => donut?.classList.add("is-complete"), legendItems.length * 150 + 200);
      }, 100);
    }
  }
  requestAnimationFrame(drawDonut);

  setTimeout(() => {
    resetPortfolioHeader();
    badge.classList.add("is-visible");
    setTimeout(() => {
      performers.forEach((card, index) => setTimeout(() => card.classList.add("bars-in"), index * 100));
      rows.forEach((row, index) => setTimeout(() => row.classList.add("row-in"), index * 80));
      const finishDelay = Math.max((performers.length - 1) * 100, (rows.length - 1) * 80) + 360;
      setTimeout(() => {
        home.classList.remove("home-animating");
        home.classList.add("home-ready");
      }, finishDelay);
    }, 220);
  }, 800);
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

function getOrCreateCanvas(host, id, width, height) {
  let canvas = host.querySelector("canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = id;
    canvas.width = width;
    canvas.height = height;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    host.prepend(canvas);
  }
  return canvas;
}

function renderAnalyticsChart() {
  const analyticsScreen = document.querySelector('[data-screen="analytics"]');
  const svg = analyticsScreen?.querySelector(".value-graph svg");
  if (!svg) return;
  const activeHistory = liveHistoryByRange.get(activePortfolioRange()) || liveHistoryPoints;
  const perfData = activeHistory.length
    ? activeHistory.map((point) => point.value)
    : [0, 0, 0, 0, 0, 0, 0];
  const width = 340;
  const height = 140;
  const padding = 16;
  const min = Math.min(...perfData);
  const max = Math.max(...perfData);
  const points = perfData.map((value, index) => {
    const x = (index / (perfData.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((value - min) / Math.max(1, max - min)) * (height - padding * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  let polyline = svg.querySelector("#analytics-performance-line");
  if (!polyline) {
    polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.id = "analytics-performance-line";
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", "#3B6CF8");
    polyline.setAttribute("stroke-width", "5");
    polyline.setAttribute("stroke-linecap", "round");
    polyline.setAttribute("stroke-linejoin", "round");
    svg.appendChild(polyline);
  }
  polyline.setAttribute("points", points.join(" "));
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
      renderGiftDetailPage(detail, { loading: true });
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
  let nextScreen = target.dataset.screenTarget;
  const currentScreen = document.querySelector(".screen.is-active")?.dataset.screen;
  if (nextScreen === "detail") {
    detailReturnScreen = currentScreen || "assets";
    closeGiftPfpTray();
    renderAssetDetail(target.dataset.asset);
  }
  if (nextScreen === "gift-brand") renderGiftBrand(target.dataset.asset);
  if (nextScreen === "gift-model-group") {
    renderGiftModelGroup(target.dataset.asset);
    nextScreen = "gift-brand";
  }
  if (nextScreen === "sticker-brand") renderStickerBrand(target.dataset.asset);
  if (nextScreen === "activity") loadFullActivity();
  if (currentScreen === "detail" && nextScreen === "assets") nextScreen = detailReturnScreen;
  showScreen(nextScreen);
});

walletButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (walletConnected) {
      openWalletActionSheet();
      return;
    }
    openWalletSheet();
  });
});

document.querySelector(".wallet-sheet-backdrop")?.addEventListener("click", closeWalletSheet);
document.querySelector(".wallet-sheet-close")?.addEventListener("click", closeWalletSheet);
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
    if (button.dataset.walletConnect === "Address") {
      document.getElementById("walletAddressInput")?.focus();
      setWalletImportStatus("Paste the wallet address to import live data.");
      return;
    }
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
    await importWallet(input?.value || "");
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
const homeGraph = document.querySelector('[data-screen="home"] .value-graph');
function beginGraphInteraction(graph, pointEvent) {
  graph.classList.add("is-touching");
  setGraphTooltipFromPointer(pointEvent);
}

function updateGraphInteraction(graph, pointEvent) {
  if (!graph.classList.contains("is-touching")) graph.classList.add("is-touching");
  setGraphTooltipFromPointer(pointEvent);
}

function endGraphInteraction(graph) {
  graph.classList.remove("is-touching");
  resetPortfolioHeader();
}

function touchPointEvent(event) {
  const touch = event.touches[0] || event.changedTouches[0];
  return touch ? { clientX: touch.clientX, clientY: touch.clientY } : null;
}

homeGraph?.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch") return;
  if (event.target.closest("[data-range]")) return;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  beginGraphInteraction(event.currentTarget, event);
});
homeGraph?.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  if (event.target.closest("[data-range]")) return;
  if (event.currentTarget.classList.contains("is-touching")) updateGraphInteraction(event.currentTarget, event);
});
homeGraph?.addEventListener("pointerup", (event) => {
  if (event.pointerType === "touch") return;
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  endGraphInteraction(event.currentTarget);
});
homeGraph?.addEventListener("pointercancel", (event) => {
  if (event.pointerType === "touch") return;
  endGraphInteraction(event.currentTarget);
});
homeGraph?.addEventListener("pointerleave", (event) => {
  if (event.pointerType === "mouse") {
    endGraphInteraction(event.currentTarget);
  }
});
homeGraph?.addEventListener("touchstart", (event) => {
  if (event.target.closest("[data-range]")) return;
  const point = touchPointEvent(event);
  if (!point) return;
  event.preventDefault();
  beginGraphInteraction(event.currentTarget, point);
}, { passive: false });
homeGraph?.addEventListener("touchmove", (event) => {
  if (event.target.closest("[data-range]")) return;
  const point = touchPointEvent(event);
  if (!point) return;
  event.preventDefault();
  updateGraphInteraction(event.currentTarget, point);
}, { passive: false });
homeGraph?.addEventListener("touchend", (event) => {
  if (event.target.closest("[data-range]")) return;
  event.preventDefault();
  endGraphInteraction(event.currentTarget);
}, { passive: false });
homeGraph?.addEventListener("touchcancel", (event) => {
  if (event.target.closest("[data-range]")) return;
  endGraphInteraction(event.currentTarget);
}, { passive: false });
document.querySelector(".donut-chart")?.addEventListener("click", (event) => {
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left - rect.width / 2;
  const y = event.clientY - rect.top - rect.height / 2;
  let angle = Math.atan2(y, x) + Math.PI / 2;
  if (angle < 0) angle += Math.PI * 2;
  const total = Math.max(1, allocationState.gifts + allocationState.tokens + allocationState.stickers);
  const giftPct = allocationState.gifts / total;
  const tokenPct = allocationState.tokens / total;
  const cutoffs = [giftPct, giftPct + tokenPct, 1];
  const hit = cutoffs.findIndex((cutoff) => angle / (Math.PI * 2) <= cutoff);
  selectedAllocation = selectedAllocation === hit ? null : hit;
  renderDonut();
});
document.querySelectorAll(".allocation-list article").forEach((item, index) => {
  item.addEventListener("click", (event) => {
    event.stopPropagation();
    selectedAllocation = selectedAllocation === index ? null : index;
    renderDonut();
  });
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".allocation-card")) {
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
initTonConnect();
renderWalletState();
applyCurrencyDisplay();
restoreSavedWallet();
if (document.querySelector('[data-screen="home"].is-active')) {
  playHomeEntrance();
  homeEntrancePlayed = true;
}
