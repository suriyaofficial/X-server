const { google } = require("googleapis");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
require("dotenv").config();
const TOKEN_FILE = path.join(__dirname, "drive_tokens.json");


async function ensureTokenFile() {
  try {
    await fsp.access(TOKEN_FILE);
  } catch (err) {
    await fsp.writeFile(TOKEN_FILE, JSON.stringify({}), "utf8");
  }
}

async function readAllTokens() {
  await ensureTokenFile();
  const raw = await fsp.readFile(TOKEN_FILE, "utf8");
  try {
    return JSON.parse(raw || "{}");
  } catch (e) {
    return {};
  }
}

async function writeAllTokens(map) {
  await ensureTokenFile();
  await fsp.writeFile(TOKEN_FILE, JSON.stringify(map, null, 2), "utf8");
}

async function saveTokensLocal(email, tokens) {
  if (!email) throw new Error("email required to save tokens");
  const map = await readAllTokens();
  const existing = map[email] || {};
  const merged = { ...existing, ...tokens };
  if (!tokens.refresh_token && existing.refresh_token) {
    merged.refresh_token = existing.refresh_token;
  }
  map[email] = merged;
  await writeAllTokens(map);
  console.log(`[drive-token-store] saved tokens for ${email}`);
}

async function getTokensLocal(email) {
  if (!email) throw new Error("email required");
  const map = await readAllTokens();
  return map[email] || null;
}

// ------------------------------
// OAuth client factory that auto-refreshes tokens and persists refreshed tokens
// ------------------------------
async function getOAuth2ClientForEmail(email) {
  if (!email) throw new Error("email required");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3100/auth/google/callback";

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  const stored = await getTokensLocal(email);
  if (!stored || (!stored.refresh_token && !stored.access_token)) {
    throw new Error("No stored tokens for user. Re-auth required.");
  }

  oauth2Client.setCredentials({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
    expiry_date: stored.expiry_date,
  });

  oauth2Client.on("tokens", async (newTokens) => {
    try {
      const cur = (await getTokensLocal(email)) || {};
      const merged = { ...cur, ...newTokens, updatedAt: Date.now() };
      if (!newTokens.refresh_token && cur.refresh_token)
        merged.refresh_token = cur.refresh_token;
      await saveTokensLocal(email, merged);
      console.log(
        `[drive-token-store] persisted refreshed tokens for ${email}`
      );
    } catch (err) {
      console.error(
        "[drive-token-store] error persisting refreshed tokens:",
        err
      );
    }
  });

  try {
    const at = await oauth2Client.getAccessToken();
    if (!at || !at.token) {
      // Normally fine if refresh happened and tokens event fired
      // but warn for debugging
      console.warn(
        "[drive-token-store] getAccessToken returned empty token object (may still be ok)"
      );
    }
  } catch (err) {
    console.error(
      "[drive-token-store] getAccessToken failed:",
      err && err.message ? err.message : err
    );
    throw new Error("Unable to obtain/refresh access token. Re-auth required.");
  }

  return oauth2Client;
}

module.exports = { getOAuth2ClientForEmail, saveTokensLocal, getTokensLocal };