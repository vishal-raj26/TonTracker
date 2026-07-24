const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

const root = path.resolve(__dirname, "..");
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, "utf8").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) return;
    const name = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!(name in process.env)) process.env[name] = value;
  });
}

const apiId = Number(process.env.TELEGRAM_API_ID || 0);
const apiHash = String(process.env.TELEGRAM_API_HASH || "");
const sessionFile = path.join(root, ".telegram-session");
const session = fs.existsSync(sessionFile) ? fs.readFileSync(sessionFile, "utf8").trim() : "";

if (!apiId || !apiHash) {
  console.error("Missing TELEGRAM_API_ID or TELEGRAM_API_HASH in .env");
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve, reject) => {
  if (process.env.TELEGRAM_NON_INTERACTIVE === "1") {
    reject(new Error(`${question.replace(/:\s*$/, "")} is required`));
    return;
  }
  rl.question(question, (answer) => resolve(answer.trim()));
});

function stringify(value) {
  return JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item), 2);
}

async function main() {
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 5,
  });

  console.log("Starting Telegram login...");
  await client.start({
    phoneNumber: async () => {
      console.log("Using Telegram phone number...");
      return process.env.TELEGRAM_PHONE || ask("Phone number with country code: ");
    },
    password: async () => {
      console.log("Telegram requested 2FA password.");
      return process.env.TELEGRAM_PASSWORD || ask("2FA password: ");
    },
    phoneCode: async () => {
      console.log("Using Telegram login code...");
      return process.env.TELEGRAM_CODE || ask("Telegram login code: ");
    },
    onError: (error) => console.error(error),
  });

  fs.writeFileSync(sessionFile, client.session.save());
  console.log(`Saved Telegram session to ${sessionFile}`);

  const giftId = BigInt(process.env.TELEGRAM_TEST_GIFT_ID || "6042113507581755979");
  if (!Api.payments.GetResaleStarGifts) {
    const preview = await client.invoke(new Api.payments.GetStarGiftUpgradePreview({ giftId }));
    console.log(stringify({
      ok: true,
      schemaMissing: "payments.GetResaleStarGifts",
      giftId,
      note: "Auth works and Telegram accepts the base gift id, but this GramJS schema is older than the resale method.",
      sampleAttributes: (preview.sampleAttributes || []).slice(0, 12),
    }));
    return;
  }

  const result = await client.invoke(new Api.payments.GetResaleStarGifts({
    giftId,
    sortByPrice: true,
    attributesHash: BigInt(0),
    offset: "",
    limit: 5,
  }));

  console.log(stringify({
    count: result.count,
    nextOffset: result.nextOffset || "",
    attributes: (result.attributes || []).slice(0, 10),
    counters: (result.counters || []).slice(0, 10),
    gifts: (result.gifts || []).slice(0, 5),
  }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
