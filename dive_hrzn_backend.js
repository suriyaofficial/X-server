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
  deleteField,
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
const BASE_URL = process.env.BASE_URL;

// Matches both CInvoiceID and CEstimateID Zoho links
const ZOHO_LINK_REGEX =
  /^https:\/\/zohoinvoicepay\.in\/invoice\/scuba\/secure\?(CInvoiceID|CEstimateID)=[A-Za-z0-9-]+$/;
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

app.post("/sku/details/:sku", async (req, res) => {
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
app.get("/sku/details/:sku", async (req, res) => {
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
  try {
    const { kind, code } = req.params;
    const allowedKinds = ["invoice", "quote", "refund-receipt"];
    if (!allowedKinds.includes(kind)) {
      return res
        .status(400)
        .json({ status: "Bad Request", message: "Invalid kind" });
    }
    const usersCollectionRef = collection(db, "dive_hrzn_shortlinks");
    const userDocRef = doc(usersCollectionRef, code);
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) {
      return res
        .status(404)
        .json({ status: "Not Found", message: "document not found" });
    }
    const data = snap.data();
    let targetUrl = null;
    if (kind === "invoice" || kind === "quote") {
      targetUrl = data.billingLink;
    } else if (kind === "refund-receipt") {
      targetUrl = data.refundReceiptLink;
    }
    return res.redirect(targetUrl);
  } catch (err) {
    console.error("Error in /view/:kind/:code:", err);
    return res
      .status(500)
      .json({ status: "Error", message: "Something went wrong" });
  }
});
app.get("/pay/:code", async (req, res) => {
  try {
    const { code } = req.params;

    const usersCollectionRef = collection(db, "dive_hrzn_shortlinks");
    const userDocRef = doc(usersCollectionRef, code);
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) {
      return res
        .status(404)
        .json({ status: "Not Found", message: "document not found" });
    }
    const data = snap.data();

    targetUrl = data.paymentLink;
    return res.redirect(targetUrl);
  } catch (err) {
    console.error("Error in /view/:kind/:code:", err);
    return res
      .status(500)
      .json({ status: "Error", message: "Something went wrong" });
  }
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

async function upsertShortlink(enqId, partialData) {
  const usersCollectionRef = collection(db, "dive_hrzn_shortlinks");
  const userDocRef = doc(usersCollectionRef, enqId);
  await setDoc(
    userDocRef,
    {
      ...partialData,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

// Billing (quote/invoice) Zoho helper
async function createZohoShortlink(enqId, billingLink) {
  if (!billingLink) {
    throw new Error("Link is required");
  }
  const trimmed = billingLink.trim();
  const match = trimmed.match(ZOHO_LINK_REGEX);
  if (!match) {
    throw new Error("Invalid Zoho invoice/estimate link format");
  }
  const idType = match[1]; // "CInvoiceID" or "CEstimateID"
  const kind = idType === "CInvoiceID" ? "invoice" : "quote";
  await upsertShortlink(enqId, {
    kind, // "invoice" | "quote"
    billingLink: trimmed,
    billingLinkActive: true,
    billingLinkCreatedAt: new Date().toISOString(),
  });
  const shortUrl = `${BASE_URL}/view/${kind}/${enqId}`;
  return shortUrl;
}

// Helper: escape text for MarkdownV2
function escapeMarkdownV2(text = "") {
  return String(text).replace(/([_\*\[\]\(\)~`>#+\-=|{}\.!\\])/g, "\\$1");
}

app.post("/enquiries/request", async (req, res) => {
  try {
    const body = req.body || {};
    console.log("🚀 ~ body:", body);
    console.log("🚀 ~ body:", body);
    console.log("🚀 ~ body:", body);

    let data = {
      name: body?.name || null,
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
      preferredDate: null, // keep empty for now, will store timestamp later
      deal: "open",
      price: null,
      billingLink: null,
      paymentLink: null,
      refundReceiptLink: null,
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
    const usersDocRef = doc(db, "dive_hrzn_users", data.email);

    try {
      // If user exists → append enquiry id
      await updateDoc(usersDocRef, {
        phoneNo: data.phoneNo, // keep phone up to date
        enquiries: arrayUnion(code),
      });
    } catch (err) {
      if (err.code === "not-found") {
        // User doesn't exist → create new user doc
        await setDoc(usersDocRef, {
          email: data.email,
          phoneNo: data.phoneNo,
          enquiries: [code],
          createdAt: serverTimestamp(),
        });
      } else {
        // Some other error → rethrow so it hits outer catch
        throw err;
      }
    }
    const phoneDigits = data.phoneNo.replace(/\D+/g, "");

    // ---------- NEW: prebuild all admin links for this enquiry ----------

    // In production, move this to an env var like BASE_APP_URL
    const BASE_URL = process.env.APP_BASE_URL;

    // code is your enquiry number, e.g. ENQ-020
    const quoteUrl = `${BASE_URL}/view/quote/${code}`;
    const invoiceUrl = `${BASE_URL}/view/invoice/${code}`;
    const paymentUrl = `${BASE_URL}/pay/${code}`;
    const refundReceiptUrl = `${BASE_URL}/view/refund-receipt/${code}`;
    const trackUrl = `${BASE_URL}/my-enquiries/${code}`;
    const firstName = (data.name || "").split(" ")[0] || "Buddy";
    let welcomeMsg = "";

    if (data.sku.startsWith("SCUBA")) {
      welcomeMsg = `🌊 Hey ${firstName}!  
Our dive team is currently underwater exploring the reefs 🤿🐠  
We’ll reach out shortly once they surface!  

Check your enquiry status here:
${trackUrl}

`;
    } else if (data.sku.startsWith("SKY")) {
      welcomeMsg = `🪂 Hey ${firstName}!  
Our sky team is up in the air right now ✈️🌤️  
We’ll reach out shortly as soon as they land!  

Track your booking progress here:  
${trackUrl}

`;
    } else {
      welcomeMsg = `
👋 Hi ${firstName}!  
Thanks for reaching out — we’ll contact you shortly!  
Track your enquiry:  
${trackUrl}
`;
    }

    // Template builders
    const templates = {
      welcome: welcomeMsg,
      quote: `Hi ${firstName}, here is your quote for ${data.title}:\n${quoteUrl}\n\nIf you have any questions, feel free to reply to this message.`,
      invoice: `Hi ${firstName}, here is your invoice for ${data.title}:\n${invoiceUrl}\n\nPlease review it and let us know if everything looks good.`,
      payment: `Hi ${firstName}, you can complete your booking payment for ${data.title} using this link:\n${paymentUrl}\n\nOnce paid, we’ll confirm your booking.`,
      refund: `Hi ${firstName}, your refund for ${data.title} has been processed.\nYou can view your refund receipt here:\n${refundReceiptUrl}`,
    };

    // WhatsApp URLs with message templates
    const waQuoteUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
      templates.quote
    )}`;
    const waInvoiceUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
      templates.invoice
    )}`;
    const waPaymentUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
      templates.payment
    )}`;
    const waRefundUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
      templates.refund
    )}`;
    const waWelcomeUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
      templates.welcome
    )}`;

    // ---------- existing message build ----------

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
                { text: "📑 Send Quote", url: waQuoteUrl },
                { text: "📄 Send Invoice", url: waInvoiceUrl },
              ],
              [
                { text: "💳 Send Payment Link", url: waPaymentUrl },
                { text: "💸 Send Refund Receipt", url: waRefundUrl },
              ],
              [
                {
                  text: "💬 Welcome Msg",
                  url: waWelcomeUrl,
                },
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
      enquiryId: code,
      saved: data,
      telegramSentTo: chatIds.length,
    });
  } catch (err) {
    console.error("Error in /scuba/booking/request:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
});
app.post("/enquiries/update/:enqId", async (req, res) => {
  try {
    const body = req.body || {};
    console.log("🚀 ~ body:", body);
    const enqId = req.params.enqId || {};
    const ref = doc(db, "dive_hrzn_enquiries", enqId);
    if (body.billingLink) {
      try {
        body.billingLink = await createZohoShortlink(enqId, body.billingLink);
      } catch (e) {
        console.error("Zoho billing link error:", e.message);
        return res.status(400).json({ error: e.message });
      }
    }

    // 2️⃣ Payment link → store raw in shortlinks, expose short URL in enquiry
    if (body.paymentLink) {
      try {
        const raw = body.paymentLink.trim();

        await upsertShortlink(enqId, {
          paymentLink: raw,
          paymentLinkActive: true,
          paymentLinkCreatedAt: new Date().toISOString(),
        });

        // Exposed to customer as /pay/:enqId
        body.paymentLink = `${BASE_URL}/pay/${enqId}`;
      } catch (e) {
        console.error("Payment link error:", e.message);
        return res.status(400).json({ error: e.message });
      }
    }

    // 3️⃣ Refund receipt link → store raw in shortlinks, expose short URL in enquiry
    if (body.refundReceiptLink) {
      try {
        const raw = body.refundReceiptLink.trim();

        await upsertShortlink(enqId, {
          refundReceiptLink: raw,
          refundReceiptLinkActive: true,
          refundReceiptLinkCreatedAt: new Date().toISOString(),
        });

        body.refundReceiptLink = `${BASE_URL}/view/refund-receipt/${enqId}`;
      } catch (e) {
        console.error("Refund receipt link error:", e.message);
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
app.get("/all/enquiries", async (req, res) => {
  try {
    const { deal, q, id, email } = req.query || {};
    const colRef = collection(db, "dive_hrzn_enquiries");

    // 1️⃣ If "id" is provided: get that single document by ID
    if (id) {
      const docRef = doc(db, "dive_hrzn_enquiries", id);
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        // No document found with that ID
        return res.json({
          success: true,
          total: 0,
          enquiries: [],
        });
      }

      const enquiry = { id: snap.id, ...snap.data() };

      // 2️⃣ If both id and email are provided, validate email
      if (email) {
        const storedEmail = (enquiry.email || "").trim().toLowerCase();
        const providedEmail = String(email).trim().toLowerCase();

        if (storedEmail !== providedEmail) {
          return res.status(401).json({
            success: false,
            message: "Authentication failed. Email does not match.",
          });
        }
      }

      // 3️⃣ If only id (or email matched), return same result as before
      const enquiries = [enquiry];

      return res.json({
        success: true,
        total: enquiries.length,
        enquiries, // always an array
      });
    }
    if (q || deal) {
      let qRef = colRef;

      if (q) {
        qRef = query(qRef, where("email", "==", q));
      }

      if (deal) {
        qRef = query(qRef, where("deal", "==", deal));
      }

      const snap = await getDocs(qRef);
      const enquiries = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      return res.json({
        success: true,
        total: enquiries.length,
        enquiries,
      });
    }

    // 4️⃣ No params: return ALL documents in the collection
    const snap = await getDocs(colRef);
    const enquiries = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return res.json({
      success: true,
      total: enquiries.length,
      enquiries,
    });
  } catch (err) {
    console.error("enquiries/all error:", err);
    return res
      .status(500)
      .json({ error: "Something went wrong", details: err.message });
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
        enquiries: [],
        phoneNo: null,
        createdAt: serverTimestamp(),
      });

      res.status(201).json({
        result: "user registered Successfully",
        data: {
          email,
          firstName,
          lastName,
          profileImage,
          phoneNo: null,
          createdAt: serverTimestamp(),
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

app.get("/my/details/:email", async (req, res) => {
  console.log("🚀 ~ get:");
  try {
    const { email } = req.params;
    const existing = await getData(db, "dive_hrzn_users", email);
    if (existing) {
      res.status(200).json({ message: "logged_In", data: existing });
    }
  } catch (error) {
    console.error(`🚀path:/ :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
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
          link: deleteField(),
          // billingLink: null,
          // paymentLink: null,
          // refundReceiptLink: null,
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
