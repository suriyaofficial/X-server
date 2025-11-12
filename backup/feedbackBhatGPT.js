/**
 * server.js
 *
 * Single-file Node.js server that:
 * - Hosts your existing feedback API (based on the code you shared)
 * - Adds OAuth2 Google Drive integration with a local token store (drive_tokens.json)
 * - Automatically refreshes access tokens and persists refreshed tokens
 * - Saves CSV as Google Sheet into user's Drive in folder: APPNAME-YYYY-MM
 *
 * Usage:
 *  - Create .env with required vars (see below)
 *  - Ensure ./master_firebaseconfig.js exists and exports firebase config
 *  - npm install express body-parser uuid cors nodemailer googleapis stream firebase @firebase/firestore dotenv
 *
 * .env example:
 *   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
 *   GOOGLE_CLIENT_SECRET=...
 *   GOOGLE_REDIRECT_URI=http://localhost:3100/auth/google/callback
 *   FRONTEND_URL=http://localhost:3000
 *   APP_NAME=FeedbackApp
 *
 * NOTE: This file intentionally keeps tokens in a local JSON file (drive_tokens.json).
 * For production, use an encrypted DB or secret store.
 */

require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const nodemailer = require("nodemailer");
const stream = require("stream");
const fs = require("fs");
const fsp = fs.promises;
const { google } = require("googleapis");
const http = require("http");

// Firebase imports (compatible with your existing code)
const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit: fbLimit,
  startAfter,
  getDocs: getDocsExtra,
  Timestamp,
  serverTimestamp,
  getCountFromServer,
} = require("@firebase/firestore");

const firebaseConfig = require("../feedback_firebaseconfig");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const port = process.env.PORT || 3100;
const server = http.createServer(app);
server.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

console.log("env GOOGLE_CLIENT_ID:", !!process.env.GOOGLE_CLIENT_ID);

// ------------------------------
// Existing helpers (getData / setData)
// ------------------------------
const getData = async (dbRef, collectionName, docId) => {
  try {
    if (!docId) {
      // If docId not provided return null (to match usage in your original code)
      return null;
    }
    const DocRef = doc(dbRef, collectionName, docId);
    const DocSnap = await getDoc(DocRef);
    return DocSnap.exists() ? DocSnap.data() : null;
  } catch (err) {
    console.error("getData error:", err);
    throw err;
  }
};
const setData = async (dbRef, collectionName, docId, updatedData) => {
  const DocRef = doc(dbRef, collectionName, docId);
  await setDoc(DocRef, updatedData);
};

// ------------------------------
// CSV helpers (your original functions)
// ------------------------------
function csvEscape(val) {
  if (val === null || typeof val === "undefined") return "";
  if (val && typeof val.toMillis === "function") {
    val = new Date(val.toMillis()).toISOString();
  }
  if (typeof val === "object") val = JSON.stringify(val);
  const s = String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCSV(rows) {
  if (!rows || !rows.length) return "";
  const keys = [];
  for (const r of rows) {
    Object.keys(r).forEach((k) => {
      if (!keys.includes(k)) keys.push(k);
    });
  }
  const header = keys.join(",");
  const lines = rows.map((r) =>
    keys
      .map((k) => csvEscape(typeof r[k] === "undefined" ? "" : r[k]))
      .join(",")
  );
  return [header, ...lines].join("\n");
}

// ------------------------------
// Token local-store (drive_tokens.json) helpers
// ------------------------------
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

// ------------------------------
// OAuth routes
// ------------------------------
app.get("/auth/google", (req, res) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ||
      "http://localhost:3100/auth/google/callback"
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
  });

  res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send("Missing code in callback");

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI ||
        "http://localhost:3100/auth/google/callback"
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
    const userinfo = await oauth2.userinfo.get();
    const email = userinfo.data.email;
    if (!email) return res.status(500).send("Unable to get user email");

    await saveTokensLocal(email, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
      token_type: tokens.token_type,
      createdAt: Date.now(),
    });

    return res.redirect(
      `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/drive-connected?email=${encodeURIComponent(email)}`
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    return res.status(500).send("Auth error: " + (err.message || err));
  }
});

// ------------------------------
// Your existing routes (login, add business, feedback, export) - adapted minimal versions
// Keep your existing implementations; below are the core ones you shared earlier (kept as-is)
// ------------------------------
app.get("/", function (req, res) {
  let option = { root: path.join(__dirname) };
  let fileName = "index.html";
  console.log("🚀-*-*-*server refresh -*-*-*🚀");
  res.sendFile(fileName, option);
});

app.post("/feedback/admin/login", async (req, res) => {
  try {
    const { email, name, photoUrl } = req.body;
    const existing = await getData(db, "admin_list", email);
    if (existing) {
      console.log(`🚀-*-*-* ${email} logged_In -*-*-*🚀`);
      res.status(200).json({ message: "logged_In", data: existing });
    } else {
      const usersCollectionRef = collection(db, "admin_list");
      const userDocRef = doc(usersCollectionRef, email);
      await setDoc(userDocRef, {
        email,
        name,
        photoUrl,
        business: [],
        plan: "Solo",
      });

      res.status(201).json({
        result: "user registered Successfully",
        data: {
          email,
          name,
          photoUrl,
          business: [],
          plan: "Solo",
        },
      });
    }
  } catch (error) {
    console.error(`🚀path:/login :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});

app.get("/feedback/admin/all/business", async (req, res) => {
  try {
    const { email } = req.query;
    const existing = await getData(db, "admin_list", email);
    if (existing) {
      res.status(200).json(existing.business);
    } else {
      res.status(200).json({ info: "No business found" });
    }
  } catch (error) {
    console.error(`🚀path:/all/business :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});

app.post("/feedback/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const feedbackData = req.body || {};
    const feedbackRef = doc(
      collection(db, "business", businessId, "feedbacks")
    ); // auto id
    await setDoc(feedbackRef, {
      ...feedbackData,
      timestamp: serverTimestamp(),
    });

    if (feedbackRef.id) {
      res.status(200).json(feedbackRef.id);
    } else {
      res.status(200).json({ info: "No business found" });
    }
  } catch (error) {
    console.error(`🚀path:/feedback/business :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});

app.post("/feedback/admin/business", async (req, res) => {
  try {
    const {
      businessName,
      tagLine,
      sliderDesign,
      placeId,
      emailNotifier,
      warningRatingThreshold,
    } = req.body;
    const email = req.query.email;
    const uuid = await uuidv4();
    const business_uuid = uuid.slice(0, 23);
    const existing = await getData(db, "admin_list", email);
    const urlEncode = Buffer.from(
      JSON.stringify({
        businessId: business_uuid,
      })
    ).toString("base64");
    const data = {
      businessId: business_uuid,
      businessName: businessName,
    };
    const overAllData = {
      businessId: business_uuid,
      businessName: businessName,
      tagLine: tagLine,
      sliderDesign: sliderDesign,
      placeId: placeId,
      emailNotifier: emailNotifier ? emailNotifier : email,
      warningRatingThreshold: warningRatingThreshold,
      url: `www.feedback.web.app/${urlEncode}`,
    };
    const updatedData = {
      ...existing,
      business: [...(existing?.business || []), data],
    };
    await setData(db, "admin_list", email, updatedData);
    const existingBusinessId = await getData(db, "business", business_uuid);
    if (!existingBusinessId) {
      const businessCollectionRef = collection(db, "business");
      const businessDocRef = doc(businessCollectionRef, business_uuid);
      await setDoc(businessDocRef, overAllData);
    } else {
      res.status(500).json({
        message: `try again business id already exists`,
      });
    }
    res.status(200).json({
      message: `added successfully`,
      url: `www.feedback.web.app/${urlEncode}`,
    });
  } catch (error) {
    console.error(`error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});

app.delete("/feedback/admin/business/:businessId", async (req, res) => {
  try {
    const email = req.query.email;
    const { businessId } = req.params;
    const existing = await getData(db, "admin_list", email);
    const updatedList = (existing?.business || []).filter(
      (b) => b.businessId !== businessId
    );
    const updatedData = { ...existing, business: updatedList };
    await setData(db, "admin_list", email, updatedData);

    return res.status(200).json({
      message: "deleted successfully",
      deletedId: businessId,
      remaining: updatedList.length,
    });
  } catch (error) {
    console.error(`🚀 path:/feedback/business DELETE :error`, error);
    return res.status(500).json({
      status: "Internal Server Error",
      message: error?.message || error,
    });
  }
});

app.get("/feedback/business/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const existing = await getData(db, "business", businessId);
    if (existing) {
      res.status(200).json(existing);
    } else {
      res.status(200).json({ info: "No business found" });
    }
  } catch (error) {
    console.error(`🚀path:/wanderer :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});

// Admin feedbacks list (with pagination + filters) - using your original approach
app.get("/feedback/admin/feedbacks/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const {
      pageNo = 1,
      pageSize = 10,
      sortBy = "timestamp",
      sortOrder = "desc",
      activityType,
      intrestedInOWC,
      knownSwimming,
      overAllExperienceMin,
      overAllExperienceMax,
      startTime,
      endTime,
    } = req.query;

    const limitNumber = Math.min(
      Math.max(parseInt(pageSize, 10) || 10, 1),
      100
    );
    const currentPage = Math.max(parseInt(pageNo, 10) || 1, 1);
    const offset = (currentPage - 1) * limitNumber;

    const feedbacksCol = collection(db, "business", businessId, "feedbacks");
    const constraints = [];

    if (activityType)
      constraints.push(where("activityType", "==", activityType));
    if (typeof intrestedInOWC !== "undefined")
      constraints.push(
        where(
          "intrestedInOWC",
          "==",
          String(intrestedInOWC).toLowerCase() === "true"
        )
      );
    if (typeof knownSwimming !== "undefined")
      constraints.push(
        where(
          "knownSwimming",
          "==",
          String(knownSwimming).toLowerCase() === "true"
        )
      );
    if (typeof overAllExperienceMin !== "undefined")
      constraints.push(
        where("overAllExperience", ">=", Number(overAllExperienceMin))
      );
    if (typeof overAllExperienceMax !== "undefined")
      constraints.push(
        where("overAllExperience", "<=", Number(overAllExperienceMax))
      );

    const toTimestamp = (val) => {
      if (!val) return null;
      if (!Number.isNaN(Number(val))) return Timestamp.fromMillis(Number(val));
      const d = new Date(val);
      return Number.isNaN(d.getTime())
        ? null
        : Timestamp.fromMillis(d.getTime());
    };
    const startTs = toTimestamp(startTime);
    const endTs = toTimestamp(endTime);
    if (startTs) constraints.push(where("timestamp", ">=", startTs));
    if (endTs) constraints.push(where("timestamp", "<=", endTs));

    const orderField =
      sortBy === "overAllExperience" ? "overAllExperience" : "timestamp";
    const orderDirection = sortOrder === "asc" ? "asc" : "desc";

    const totalSnap = await getCountFromServer(feedbacksCol);
    const totalCount = totalSnap.data().count;

    const filterQuery = query(feedbacksCol, ...constraints);
    const filteredSnap = await getCountFromServer(filterQuery);
    const filteredCount = filteredSnap.data().count;

    const dataQuery = query(
      feedbacksCol,
      ...constraints,
      orderBy(orderField, orderDirection),
      fbLimit(offset + limitNumber + 1)
    );

    const snap = await getDocsExtra(dataQuery);
    const allDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const paginatedDocs = allDocs.slice(offset, offset + limitNumber);
    const nextPageAvailable = allDocs.length > offset + limitNumber;
    const returnedCount = paginatedDocs.length;

    return res.status(200).json({
      data: paginatedDocs,
      nextPageAvailable,
      meta: {
        pageNo: currentPage,
        pageSize: limitNumber,
        returnedCount,
        filteredCount,
        totalCount,
        sortBy: orderField,
        sortOrder: orderDirection,
      },
    });
  } catch (error) {
    console.error("🚀 path:/feedback/admin/feedbacks error:", error);
    return res.status(500).json({
      status: "Internal Server Error",
      message: error?.message || error,
    });
  }
});

// Dashboard stats endpoint (keeps your caching behavior)
app.get("/feedback/admin/dashboard/:businessId/dashboard", async (req, res) => {
  try {
    const { businessId } = req.params;
    const { forceRefresh } = req.query;

    const businessDocRef = doc(db, "business", businessId);
    const businessSnap = await getDoc(businessDocRef);
    if (!businessSnap.exists()) {
      return res.status(404).json({ error: "Business not found" });
    }

    const businessData = businessSnap.data();
    if (businessData && businessData.stats && !forceRefresh) {
      return res.status(200).json({
        source: "cache",
        stats: businessData.stats,
      });
    }

    const feedbacksCol = collection(db, "business", businessId, "feedbacks");
    const feedbackSnap = await getDocs(feedbacksCol);
    const totalFeedbacks = feedbackSnap.size;
    let sumOverall = 0;
    const overallCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let interestCounts = { interestedInOWC: 0, notInterested: 0 };
    const activityCounts = {};

    feedbackSnap.forEach((docSnap) => {
      const d = docSnap.data();
      const rating = Number(d.overAllExperience) || 0;
      if (rating >= 1 && rating <= 5) {
        overallCounts[rating] = (overallCounts[rating] || 0) + 1;
        sumOverall += rating;
      }
      if (d.intrestedInOWC === true) {
        interestCounts.interestedInOWC += 1;
      } else {
        interestCounts.notInterested += 1;
      }
      const activity = d["activityType"] || d.activityType || "unknown";
      activityCounts[activity] = (activityCounts[activity] || 0) + 1;
    });

    const avgOverallExperience =
      totalFeedbacks > 0
        ? parseFloat((sumOverall / totalFeedbacks).toFixed(2))
        : 0;

    const stats = {
      totalFeedbacks,
      avgOverallExperience,
      overallCounts,
      interestCounts,
      activityCounts,
      lastUpdatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(businessDocRef, { stats });
    } catch (writeErr) {
      console.error("Failed to write cached stats:", writeErr);
    }

    return res.status(200).json({
      source: "computed",
      stats,
    });
  } catch (error) {
    console.error("Error in dashboard endpoint:", error);
    return res.status(500).json({ error: error.message || error });
  }
});

// Export endpoint (keeps original fire-and-forget email export behavior)
app.get("/feedback/admin/feedbacks/:businessId/export", async (req, res) => {
  try {
    const { businessId } = req.params;
    const provider = (req.query.provider || "gmail")
      .replace(/"/g, "")
      .toLowerCase();

    if (!["gmail", "zoho"].includes(provider)) {
      return res
        .status(400)
        .json({ error: 'provider must be "gmail" or "zoho"' });
    }

    const businessRef = doc(db, "business", businessId);
    const businessSnap = await getDoc(businessRef);
    if (!businessSnap.exists()) {
      return res.status(404).json({ error: "Business not found" });
    }
    const businessData = businessSnap.data();
    const toEmail = businessData.emailNotifier;
    if (!toEmail) {
      return res.status(400).json({ error: "Business.emailNotifier not set" });
    }

    const creds =
      provider === "gmail"
        ? {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS,
            host: process.env.GMAIL_HOST,
            port: process.env.GMAIL_PORT,
            secure: process.env.GMAIL_SECURE === "true",
          }
        : {
            user: process.env.ZOHO_USER,
            pass: process.env.ZOHO_PASS,
            host: process.env.ZOHO_HOST,
            port: process.env.ZOHO_PORT,
            secure: process.env.ZOHO_SECURE === "true",
          };

    if (!creds.user || !creds.pass) {
      return res.status(500).json({
        error: `SMTP credentials for ${provider} are not set in environment`,
      });
    }

    res.status(202).json({
      message: "Export job accepted. CSV will be created and emailed shortly.",
      businessId,
      provider,
    });

    (async () => {
      try {
        const feedbacksCol = collection(
          db,
          "business",
          businessId,
          "feedbacks"
        );
        const feedbackSnap = await getDocs(feedbacksCol);
        const docs = feedbackSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (!docs.length) {
          console.log(
            `[export-job] No feedback docs for business ${businessId}. No email sent.`
          );
          return;
        }

        const normalized = docs.map((d) => {
          const out = {};
          for (const key of Object.keys(d)) {
            const val = d[key];
            if (val && typeof val.toMillis === "function") {
              out[key] = new Date(val.toMillis()).toISOString();
            } else {
              out[key] = val;
            }
          }
          return out;
        });

        const csv = buildCSV(normalized);
        const filename = `feedbacks_${businessId}_${Date.now()}.csv`;

        const transporter = createTransporter(provider, creds);
        const fromEmail = creds.user;

        const mailOptions = {
          from: `"Feedback Export" <${fromEmail}>`,
          to: toEmail,
          subject: `Feedback export for business ${businessId}`,
          text: `Attached is the CSV export of ${docs.length} feedback documents for business ${businessId}.`,
          attachments: [{ filename, content: csv }],
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(
          `[export-job] Email sent for business ${businessId} via ${provider}. info=`,
          {
            accepted: info.accepted,
            rejected: info.rejected,
            response: info.response,
          }
        );
      } catch (innerErr) {
        console.error(
          `[export-job] Error processing export for business ${businessId}:`,
          innerErr
        );
      }
    })();

    return;
  } catch (err) {
    console.error("Export route immediate validation error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// createTransporter helper (kept as your original)
function createTransporter(provider, creds) {
  if (provider === "gmail") {
    return nodemailer.createTransport({
      host: creds.host || "smtp.gmail.com",
      port: creds.port ? Number(creds.port) : 465,
      secure: typeof creds.secure !== "undefined" ? creds.secure : true,
      auth: {
        user: creds.user,
        pass: creds.pass,
      },
    });
  }
  if (provider === "zoho") {
    return nodemailer.createTransport({
      host: creds.host || "smtp.zoho.com",
      port: creds.port ? Number(creds.port) : 465,
      secure: typeof creds.secure !== "undefined" ? creds.secure : true,
      auth: {
        user: creds.user,
        pass: creds.pass,
      },
    });
  }
  throw new Error("Unsupported provider: " + provider);
}

// ------------------------------
// Save-to-drive endpoint using local token store + auto-refresh
// ------------------------------
app.post(
  "/feedback/admin/feedbacks/:businessId/save-to-drive",
  async (req, res) => {
    try {
      const { businessId } = req.params;
      const { email } = req.body;
      if (!email)
        return res.status(400).json({ error: "email required in body" });

      let oauth2Client;
      try {
        oauth2Client = await getOAuth2ClientForEmail(email);
      } catch (err) {
        console.error("Token/refresh error:", err.message || err);
        return res
          .status(401)
          .json({ error: "Re-auth required", detail: err.message });
      }

      const drive = google.drive({ version: "v3", auth: oauth2Client });

      const feedbacksCol = collection(db, "business", businessId, "feedbacks");
      const feedbackSnap = await getDocs(feedbacksCol);
      const docs = feedbackSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!docs.length)
        return res
          .status(400)
          .json({ error: "No feedback documents to export" });

      const csv = buildCSV(
        docs.map((d) => {
          const out = {};
          for (const k of Object.keys(d)) {
            const v = d[k];
            if (v && typeof v.toMillis === "function")
              out[k] = new Date(v.toMillis()).toISOString();
            else out[k] = v;
          }
          return out;
        })
      );

      const date = new Date();
      const folderName = `${
        process.env.APP_NAME || "FeedbackApp"
      }-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      const foldersRes = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed = false`,
        fields: "files(id, name)",
        spaces: "drive",
      });

      let folderId;
      if (foldersRes.data.files && foldersRes.data.files.length > 0) {
        folderId = foldersRes.data.files[0].id;
      } else {
        const folderCreateRes = await drive.files.create({
          resource: {
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
          },
          fields: "id",
        });
        folderId = folderCreateRes.data.id;
      }

      const fileMetadata = {
        name: `feedbacks_${businessId}_${Date.now()}.csv`,
        parents: [folderId],
        mimeType: "application/vnd.google-apps.spreadsheet",
      };

      const media = {
        mimeType: "text/csv",
        body: stream.Readable.from([csv]),
      };

      const fileRes = await drive.files.create({
        resource: fileMetadata,
        media,
        fields: "id, name, webViewLink",
      });

      return res.status(200).json({
        message: "Saved to Drive (Google Sheet)",
        sheetId: fileRes.data.id,
        sheetLink: fileRes.data.webViewLink,
      });
    } catch (err) {
      console.error("save-to-drive error:", err);
      return res.status(500).json({ error: err.message || String(err) });
    }
  }
);

// ------------------------------
// CORS headers (kept at bottom as in your original file)
// ------------------------------
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});
