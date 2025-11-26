const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const stream = require("stream");
const { initializeApp } = require("firebase/app");
const http = require("http");
const app = express();
const { google } = require("googleapis");
const {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit: fbLimit,
  getDocs: getDocsExtra,
  Timestamp,
  serverTimestamp,
  getCountFromServer,
  deleteDoc,
  arrayUnion,

  limit: fsLimit,

  startAfter,
} = require("@firebase/firestore");
const { buildCSV } = require("./createCSV");
const { getData, setData, deleteData } = require("./firebaseFunction");
const { createTransporter } = require("./transporter");
const { getOAuth2ClientForEmail, saveTokensLocal } = require("./oauth_drive");
const firebaseConfig = require("./feedback_firebaseconfig");
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const server = http.createServer(app);
app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json());
require("dotenv").config();
const fs = require("fs").promises; // at top of file with other requires
const DATA_DIR = path.join(__dirname, "data");
const SCUBA_JSON_PATH = path.join(DATA_DIR, "scuba.json");
const TelegramBot = require("node-telegram-bot-api");
const port = 3100;
server.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
// import/initialize db and generateShortCode as you already have

// Init Telegram bot (no polling needed if only sending messages)
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error("Missing BOT_TOKEN in environment");
}
const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const BASE_URL = process.env.BASE_URL || "https://server-ag3p.onrender.com";

// Matches both CInvoiceID and CEstimateID Zoho links
const ZOHO_LINK_REGEX = /^https:\/\/zohoinvoicepay\.in\/invoice\/scuba\/secure\?(CInvoiceID|CEstimateID)=[A-Za-z0-9-]+$/;
app.get("/", function (req, res) {
  let option = { root: path.join(__dirname) };
  let fileName = "index.html";
  console.log("🚀-*-*-*server refresh -*-*-*🚀");
  res.sendFile(fileName, option);
});

// --- POST /scuba (write request body to Firestore at collection "content", doc "scuba") ---
app.post("/scuba", async (req, res) => {
  try {
    const data = req.body;
    if (!data || Object.keys(data).length === 0) {
      return res
        .status(400)
        .json({ status: "Bad Request", message: "Request body is empty" });
    }

    const usersCollectionRef = collection(db, "dive_hrzn");
    const userDocRef = doc(usersCollectionRef, "scuba");

    // Option A: overwrite the document
    await setDoc(userDocRef, data);

    // Option B (if you prefer to merge instead of overwrite):
    // await setDoc(userDocRef, data, { merge: true });

    return res
      .status(201)
      .json({ status: "OK", message: "scuba data saved", id: "scuba" });
  } catch (error) {
    console.error("POST /scuba error:", error);
    return res.status(500).json({
      status: "Internal Server Error",
      message: error.message || error,
    });
  }
});

app.post("/scuba/:sku", async (req, res) => {
  try {
    const { sku } = req.params;
    const data = req.body;
    if (!data || Object.keys(data).length === 0) {
      return res
        .status(400)
        .json({ status: "Bad Request", message: "Request body is empty" });
    }

    const usersCollectionRef = collection(db, "dive_hrzn_SKU");
    const userDocRef = doc(usersCollectionRef, sku);

    // Option A: overwrite the document
    await setDoc(userDocRef, data);

    // Option B (if you prefer to merge instead of overwrite):
    // await setDoc(userDocRef, data, { merge: true });

    return res
      .status(201)
      .json({ status: "OK", message: "scuba data saved", id: "scuba" });
  } catch (error) {
    console.error("POST /scuba error:", error);
    return res.status(500).json({
      status: "Internal Server Error",
      message: error.message || error,
    });
  }
});
// --- GET /scuba (read the document content/scuba from Firestore) ---
app.get("/scuba", async (req, res) => {
  try {
    const usersCollectionRef = collection(db, "dive_hrzn");
    const userDocRef = doc(usersCollectionRef, "scuba");

    const snap = await getDoc(userDocRef);
    if (!snap.exists()) {
      return res
        .status(404)
        .json({ status: "Not Found", message: "scuba document not found" });
    }

    const data = snap.data();
    return res.status(200).json(data);
  } catch (error) {
    console.error("GET /scuba error:", error);
    return res.status(500).json({
      status: "Internal Server Error",
      message: error.message || error,
    });
  }
});
app.get("/scuba/:sku", async (req, res) => {
  try {
    const { sku } = req.params;
    const usersCollectionRef = collection(db, "dive_hrzn_SKU");
    const userDocRef = doc(usersCollectionRef, sku);

    const snap = await getDoc(userDocRef);
    if (!snap.exists()) {
      return res
        .status(404)
        .json({ status: "Not Found", message: "scuba document not found" });
    }

    const data = snap.data();
    return res.status(200).json(data);
  } catch (error) {
    console.error("GET /scuba error:", error);
    return res.status(500).json({
      status: "Internal Server Error",
      message: error.message || error,
    });
  }
});

app.get("/view/:kind/:code", async (req, res) => {
  const code = req.params.code;
  const usersCollectionRef = collection(db, "dive_hrzn_shortlinks");
  const userDocRef = doc(usersCollectionRef, code);
  const snap = await getDoc(userDocRef);
  if (!snap.exists()) {
    return res
      .status(404)
      .json({ status: "Not Found", message: "scuba document not found" });
  }
  const data = snap.data();
  return res.redirect(data.link);
});

function generateShortCode(length = 6) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function createZohoShortlink(enqId, link) {
  if (!link) {
    throw new Error("Link is required");
  }
  const trimmed = link.trim();
  const match = trimmed.match(ZOHO_LINK_REGEX);
  if (!match) {
    throw new Error("Invalid Zoho invoice/estimate link format");
  }
  const idType = match[1]; // "CInvoiceID" or "CEstimateID"
  const kind = idType === "CInvoiceID" ? "invoice" : "quote";
  const data = {
    enqId,
    kind,              // "invoice" | "quote"
    link: trimmed,
    active: true,
    createdAt: new Date().toISOString(),
  };
  const usersCollectionRef = collection(db, "dive_hrzn_shortlinks");
  const userDocRef = doc(usersCollectionRef, enqId);
  await setDoc(userDocRef, data, { merge: true });
  const shortUrl = `${BASE_URL}/view/${kind}/${enqId}`;
  return shortUrl;
}

// Helper: escape text for MarkdownV2
function escapeMarkdownV2(text = "") {
  return String(text).replace(/([_\*\[\]\(\)~`>#+\-=|{}\.!\\])/g, "\\$1");
}

app.post("/scuba/enquiries/request", async (req, res) => {
  try {
    const body = req.body || {};
    console.log("🚀 ~ body:", body)
    console.log("🚀 ~ body:", body)
    console.log("🚀 ~ body:", body)

    let data = {
      name: body.name,
      email: body.email,
      phoneNo: body.phoneNo,
      title: body.title,
      sku: body.sku,
      initiatedDate:
        body.initiatedDate || new Date().toISOString().split("T")[0],

      groupSize: 0,

      status: "Created",
      paymentStatus: "",
      createdAt: serverTimestamp(),
      knowSwimming: false,
      preferredDate: null, // keep empty for now, will store timestamp later
      link: "",
      deal: "open",
    };

    if (!data.name) return res.status(400).json({ error: "name required" });
    if (!data.phoneNo)
      return res.status(400).json({ error: "whatsapp number required" });

    const enquiriesCollectionRef = collection(db, "dive_hrzn_enquiries");

    // 🔥 THIS reads only 1 aggregation result, NOT all docs
    const snapshot = await getCountFromServer(enquiriesCollectionRef);
    const count = snapshot.data().count;

    // Generate next ENQ number
    const nextNumber = String(count + 1).padStart(3, "0");
    const code = `ENQ-${nextNumber}`;
    data.enqNo = code;
    const enquiriesDocRef = doc(enquiriesCollectionRef, code);
    await setDoc(enquiriesDocRef, data);
    const usersDocRef = doc(db, "dive_hrzn_users", body.email);
    await updateDoc(usersDocRef, {
      enquiries: arrayUnion(code),
    });
    const phoneDigits = data.phoneNo.replace(/\D+/g, "");
    const whatsappText =
      "🌊 Hey! You just reached the underwater world. Our dive team will get back to you shortly 🤿✨";

    const whatsappURL = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
      whatsappText
    )}`;

    const nameEsc = escapeMarkdownV2(data.name || "N/A");
    const phoneEsc = escapeMarkdownV2(data.phoneNo || "N/A");
    const emailEsc = escapeMarkdownV2(data.email || "N/A");
    const serviceEsc = escapeMarkdownV2(data.title || "N/A");
    const skuEsc = escapeMarkdownV2(data.sku || "N/A");
    const initiatedEsc = escapeMarkdownV2(data.initiatedDate || "N/A");
    const codeEsc = escapeMarkdownV2(code);

    const sep = "\\-".repeat(36);

    const message = [
      "📩 *New Scuba Booking Request*",
      sep,
      `🆔 ${codeEsc}`,
      "",
      `👤 *Name:* ${nameEsc}`,
      `📱 *WhatsApp:* ${phoneEsc}`,
      `📧 *Email:* ${emailEsc}`,
      `🏷️ *Service:* ${serviceEsc}`,
      `🔖 *SKU:* ${skuEsc}`,
      `📅 *Initiated:* ${initiatedEsc}`,
      sep,
      `Status: *${escapeMarkdownV2(data.status)}*`,
    ].join("\n");

    const rawChatIds = process.env.CHAT_ID;
    const chatIds = rawChatIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (chatIds.length === 0) {
      console.error("No CHAT_ID configured");
      return res
        .status(500)
        .json({ error: "Server misconfigured (CHAT_ID missing)" });
    }

    const promises = chatIds.map(async (chatId) => {
      try {
        return await bot.sendMessage(chatId, message, {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "💬 WhatsApp Customer",
                  url: whatsappURL,
                },
                // Optional: add a quick "Mark In Progress" callback button if you want later
                // { text: "🔁 Mark In Progress", callback_data: `mark:${code}:in_progress` }
              ],
            ],
          },
        });
      } catch (err) {
        console.error(
          "Telegram send error for chatId",
          chatId,
          err?.response || err
        );
        return null;
      }
    });

    await Promise.all(promises);

    return res.status(201).json({
      success: true,
      code,
      saved: data,
      telegramSentTo: chatIds.length,
    });
  } catch (err) {
    console.error("Error in /scuba/booking/request:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
});
app.post("/scuba/enquiries/update/:enqId", async (req, res) => {
  try {
    const body = req.body || {};
    console.log("🚀 ~ body:", body)
    const enqId = req.params.enqId || {};
    const ref = doc(db, "dive_hrzn_enquiries", enqId);
    if (body?.link) {
      try {
        body.link = await createZohoShortlink(enqId, body.link);
      } catch (e) {
        console.error("Zoho link error:", e.message);
        return res.status(400).json({ error: e.message });
      }
    }
    updateDoc(ref, body).catch((err) => {
      console.error(`Failed updating ${enqId}`, err.code);
      return null;
    });
    return res.status(201).json({
      success: true,
      enqId,
      updated: body,
    });
  } catch (err) {
    console.error("Error in /scuba/booking/request:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/auth/google-login", async (req, res) => {
  try {
    const { email, firstName, lastName, profileImage } = req.body;
    const existing = await getData(db, "dive_hrzn_users", email);
    if (existing) {
      console.log(`🚀-*-*-* ${email} logged_In -*-*-*🚀`);
      res.status(200).json({ message: "logged_In", data: existing });
    } else {
      const usersCollectionRef = collection(db, "dive_hrzn_users");
      const userDocRef = doc(usersCollectionRef, email);
      await setDoc(userDocRef, {
        email,
        firstName,
        lastName,
        profileImage,
      });

      res.status(201).json({
        result: "user registered Successfully",
        data: {
          email,
          firstName,
          lastName,
          profileImage,
          phoneNo: null,
        },
      });
    }
  } catch (error) {
    console.error(`🚀path:/login :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});
app.post("/auth/update-phone", async (req, res) => {
  try {
    const { email, phoneNo } = req.body;
    const existing = await getData(db, "dive_hrzn_users", email);
    const usersDocRef = doc(db, "dive_hrzn_users", email);
    let data = await updateDoc(usersDocRef, {
      phoneNo: phoneNo,
    });
    res.status(201).json({
      result: "user registered Successfully",
      data: data,
    });
  } catch (error) {
    console.error(`🚀path:/login :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});

// app.get("/scuba/enquiries/all", async (req, res) => {
//   try {
//     const colRef = collection(db, "dive_hrzn_enquiries");

//     const snapshot = await getDocs(colRef);

//     const enquiries = snapshot.docs.map((doc) => ({
//       id: doc.id,
//       ...doc.data(),
//     }));

//     return res.status(200).json({
//       success: true,
//       total: enquiries.length,
//       enquiries,
//     });
//   } catch (err) {
//     console.error("Error fetching enquiries:", err);
//     return res.status(500).json({ error: "Something went wrong" });
//   }
// });

/**
 * GET /scuba/enquiries/all
 *
 * Query params:
 *  - skus             (comma separated) e.g. skus=SCUBA-EXP-DSD,SCUBA-EXP-BDAY
 *  - paymentStatuses  (comma separated)
 *  - statuses         (comma separated)
 *  - dateFrom         (YYYY-MM-DD or ISO)  (inclusive)
 *  - dateTo           (YYYY-MM-DD or ISO)  (inclusive)
 *  - today=true       (if present, overrides dateFrom/dateTo to today's range in server timezone)
 *  - q                (search exact phone or email)
 *  - pageSize         (number, default 50, max 200)
 *  - pageToken        (doc id of last item from previous page)
 *  - sortDir          asc | desc  (default desc)
 */
function toArrayParam(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.map(String);
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseDateParam(val) {
  if (!val) return null;
  // Accept YYYY-MM-DD or full ISO; create Date object at start of day (00:00) for from, and end for to handled by caller
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d;
}

app.get("/scuba/enquiries/all", async (req, res) => {
  try {
    const {
      skus,
      paymentStatuses,
      statuses,
      dateFrom,
      dateTo,
      today,
      q,
      pageSize = 50,
      pageToken,
      sortDir = "desc",
      deal,
    } = req.query || {};

    const skusArr = toArrayParam(skus);
    const payArr = toArrayParam(paymentStatuses);
    const statusArr = toArrayParam(statuses);
    const dealArr = toArrayParam(deal);

    // Build base collection ref
    const colRef = collection(db, "dive_hrzn_enquiries");

    // We'll collect where filters in an array and apply them to the query progressively.
    const filters = [];
    let usedIn = false;

    // Helper to attach equality vs in
    const attachFilter = (arr, field) => {
      if (!arr || arr.length === 0) return;
      if (arr.length === 1) {
        filters.push([field, "==", arr[0]]);
      } else if (!usedIn && arr.length <= 10) {
        filters.push([field, "in", arr]);
        usedIn = true;
      } else {
        throw new Error(`Too many values for '${field}' (max 10 for 'in')`);
      }
    };

    attachFilter(skusArr, "sku");
    attachFilter(payArr, "paymentStatus");
    attachFilter(statusArr, "status");
    attachFilter(dealArr, "deal");

    // Date range handling (assumes createdAt is Firestore Timestamp)
    let fromTs = null;
    let toTs = null;

    if (
      today !== undefined &&
      (today === "true" || today === "1" || today === "True")
    ) {
      // Today's range in server timezone
      const now = new Date();
      const y = now.getFullYear(),
        m = now.getMonth(),
        d = now.getDate();
      const start = new Date(Date.UTC(y, m, d, 0, 0, 0)); // midnight UTC of that local day may be off if you want local timezone
      // If you need local timezone calculation, replace above with timezone-aware logic.
      fromTs = Timestamp.fromDate(start);
      const end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
      toTs = Timestamp.fromDate(end);
    } else {
      const df = parseDateParam(dateFrom);
      const dt = parseDateParam(dateTo);
      if (df) {
        // start of day (00:00:00)
        const s = new Date(
          df.getFullYear(),
          df.getMonth(),
          df.getDate(),
          0,
          0,
          0,
          0
        );
        fromTs = Timestamp.fromDate(s);
      }
      if (dt) {
        // end of day (23:59:59.999)
        const e = new Date(
          dt.getFullYear(),
          dt.getMonth(),
          dt.getDate(),
          23,
          59,
          59,
          999
        );
        toTs = Timestamp.fromDate(e);
      }
    }

    if (fromTs && toTs) {
      filters.push(["createdAt", ">=", fromTs]);
      filters.push(["createdAt", "<=", toTs]);
    } else if (fromTs) {
      filters.push(["createdAt", ">=", fromTs]);
    } else if (toTs) {
      filters.push(["createdAt", "<=", toTs]);
    }

    // Search exact phone/email (if provided). We'll run these as separate queries if q is present.
    if (q) {
      // try phone exact first then email
      const phoneQuery = query(
        colRef,
        where("phoneNo", "==", q),
        orderBy("createdAt", sortDir === "asc" ? "asc" : "desc"),
        fsLimit(Math.min(Number(pageSize) || 50, 200))
      );
      const snapPhone = await getDocs(phoneQuery);
      if (!snapPhone.empty) {
        const docs = snapPhone.docs.map((d) => ({ id: d.id, ...d.data() }));
        return res.json({
          success: true,
          total: docs.length,
          enquiries: docs,
          nextPageToken:
            docs.length === Math.min(Number(pageSize) || 50, 200)
              ? docs[docs.length - 1].id
              : null,
        });
      }
      // fallback to email exact
      const emailQuery = query(
        colRef,
        where("email", "==", q),
        orderBy("createdAt", sortDir === "asc" ? "asc" : "desc"),
        fsLimit(Math.min(Number(pageSize) || 50, 200))
      );
      const snapEmail = await getDocs(emailQuery);
      const docs = snapEmail.docs.map((d) => ({ id: d.id, ...d.data() }));
      return res.json({
        success: true,
        total: docs.length,
        enquiries: docs,
        nextPageToken:
          docs.length === Math.min(Number(pageSize) || 50, 200)
            ? docs[docs.length - 1].id
            : null,
      });
    }

    // Build the main query progressively
    let qref = colRef;
    for (const f of filters) {
      const [field, op, val] = f;
      qref = query(qref, where(field, op, val));
    }

    // Order by createdAt (required when using range filters on createdAt)
    const dir = sortDir === "asc" ? "asc" : "desc";
    qref = query(qref, orderBy("createdAt", dir));

    // Handle cursor-based pagination via pageToken (doc id)
    const limitNum = Math.min(Number(pageSize) || 50, 200);
    qref = query(qref, fsLimit(limitNum));

    if (pageToken) {
      // try to fetch the doc and startAfter it
      const cursorRef = doc(db, "dive_hrzn_enquiries", pageToken);
      const cursorSnap = await getDoc(cursorRef);
      if (cursorSnap.exists()) {
        qref = query(qref, startAfter(cursorSnap));
      } // if invalid token, we ignore
    }

    const snap = await getDocs(qref);
    const enquiries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextPageToken =
      enquiries.length === limitNum ? enquiries[enquiries.length - 1].id : null;

    return res.json({
      success: true,
      total: enquiries.length,
      nextPageToken,
      enquiries,
    });
  } catch (err) {
    console.error("enquiries/all error:", err);
    return res
      .status(500)
      .json({ error: "Something went wrong", details: err.message });
  }
});

app.get("/temp/fix-createdAt", async (req, res) => {
  try {
    const updates = [];

    for (let i = 1; i <= 19; i++) {
      const num = String(i).padStart(3, "0"); // 001 ... 019
      const id = `ENQ-${num}`;

      const ref = doc(db, "dive_hrzn_enquiries", id);

      updates.push(
        updateDoc(ref, {
          knowSwimming: false,
          preferredDate: null, // keep empty for now, will store timestamp later
          link: "",
        }).catch((err) => {
          console.error(`Failed updating ${id}`, err.code);
          return null;
        })
      );
    }

    await Promise.all(updates);

    return res.json({
      success: true,
      message: "Updated createdAt for ENQ-001 to ENQ-019",
    });
  } catch (err) {
    console.error("TEMP FIX ERROR:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});
