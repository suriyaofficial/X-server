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
const port = 3100;
server.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
const axios = require("axios");
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

app.get("/quote/:code", async (req, res) => {
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
  return res.redirect(data.longUrl);
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

app.post("/api/create-short-url", async (req, res) => {
  const { longUrl } = req.body;
  const data = req.body;
  const code = generateShortCode();
  const usersCollectionRef = collection(db, "dive_hrzn_shortlinks");
  const userDocRef = doc(usersCollectionRef, code);
  await setDoc(userDocRef, data);
  res.json({
    shortUrl: `https://server-ag3p.onrender.com/quote/${code}`,
  });
});

app.post("/scuba/booking/request", async (req, res) => {
  try {
    // const data = req.body;
    const data = {
      name: 'suriya',
      phone: '+917092925555',
      email: 'suriyaboss1@gmail.com',
    };

    const code = generateShortCode(10);
    const usersCollectionRef = collection(db, "dive_hrzn_enquiries");
    const userDocRef = doc(usersCollectionRef, code);

    await setDoc(userDocRef, data);

    // Telegram
    const BOT_TOKEN = "8548958946:AAEKVVu-SbXwfOK1cQe1G5r5Nd-sLMEonVI";
    const CHAT_ID = "5225155056";

    // Creative WhatsApp text
    const whatsappText = encodeURIComponent(
      "🌊 Hey! You just reached the underwater world. Our dive team will get back to you shortly 🤿✨"
    );

    const whatsappURL = `https://wa.me/${data.phone}?text=${whatsappText}`;

    const message = `
📩 *New Scuba Booking Request*
------------------------------------
🆔 *Code:* ${code}

👤 *Name:* ${data.name || "N/A"}
📱 *Phone:* ${data.phone || "N/A"}
📧 *Email:* ${data.email || "N/A"}
------------------------------------
    `;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "💬 WhatsApp Customer",
              url: whatsappURL,
            },
          ],
        ],
      },
    });

    res.status(201).json({ success: true, code, saved: data });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});
