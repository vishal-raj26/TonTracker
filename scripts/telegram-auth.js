const fs = require("fs");
const path = require("path");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { computeCheck } = require("telegram/Password");

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
const pendingFile = path.join(root, ".telegram-login.json");
const command = process.argv[2];

if (!apiId || !apiHash) throw new Error("Missing TELEGRAM_API_ID or TELEGRAM_API_HASH in .env");

function readSession() {
  return fs.existsSync(sessionFile) ? fs.readFileSync(sessionFile, "utf8").trim() : "";
}

async function clientFromSession(session = readSession()) {
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 });
  await client.connect();
  return client;
}

async function sendCode() {
  const phone = process.env.TELEGRAM_PHONE || process.argv[3];
  if (!phone) throw new Error("Usage: node scripts/telegram-auth.js send-code +911234567890");
  const client = await clientFromSession("");
  try {
    const sent = await client.invoke(new Api.auth.SendCode({
      phoneNumber: phone,
      apiId,
      apiHash,
      settings: new Api.CodeSettings({}),
    }));
    fs.writeFileSync(pendingFile, JSON.stringify({
      phone,
      phoneCodeHash: sent.phoneCodeHash,
      session: client.session.save(),
    }, null, 2));
    console.log(`Code sent to ${phone}. Pending login saved.`);
  } finally {
    await client.disconnect();
  }
}

async function signIn() {
  const code = process.env.TELEGRAM_CODE || process.argv[3];
  if (!code) throw new Error("Usage: node scripts/telegram-auth.js sign-in 12345");
  if (!fs.existsSync(pendingFile)) throw new Error("No pending Telegram login. Run send-code first.");
  const pending = JSON.parse(fs.readFileSync(pendingFile, "utf8"));
  const client = await clientFromSession(pending.session || "");
  try {
    await client.invoke(new Api.auth.SignIn({
      phoneNumber: pending.phone,
      phoneCodeHash: pending.phoneCodeHash,
      phoneCode: code,
    }));
  } catch (error) {
    if (!/SESSION_PASSWORD_NEEDED/i.test(String(error.message || error))) throw error;
    const password = process.env.TELEGRAM_PASSWORD || process.argv[4];
    if (!password) throw new Error("Telegram requested 2FA password. Re-run sign-in with TELEGRAM_PASSWORD set.");
    const passwordInfo = await client.invoke(new Api.account.GetPassword());
    const passwordCheck = await computeCheck(passwordInfo, password);
    await client.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));
  }
  try {
    fs.writeFileSync(sessionFile, client.session.save());
    fs.rmSync(pendingFile, { force: true });
    console.log(`Telegram session saved to ${sessionFile}`);
  } finally {
    await client.disconnect();
  }
}

async function main() {
  if (command === "send-code") return sendCode();
  if (command === "sign-in") return signIn();
  throw new Error("Use: send-code or sign-in");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
