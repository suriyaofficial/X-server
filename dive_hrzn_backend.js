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
const {  getFirestore,doc,getDoc,setDoc,collection,getDocs,updateDoc,query,where,orderBy,limit: fbLimit,getDocs: getDocsExtra,Timestamp,serverTimestamp,getCountFromServer,deleteDoc} = require("@firebase/firestore");
const { buildCSV } = require("./createCSV");
const { getData, setData,deleteData } = require("./firebaseFunction");
const { createTransporter } = require("./transporter");
const { getOAuth2ClientForEmail,saveTokensLocal, } = require("./oauth_drive");
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

app.get("/", function (req, res) {
  let option = { root: path.join(__dirname) };
  let fileName = "index.html";
  console.log("🚀-*-*-*server refresh -*-*-*🚀");
  res.sendFile(fileName, option);
});
app.get("/scuba", async (req, res) => {
  try {
    // read file and parse JSON
    const raw = await fs.readFile(SCUBA_JSON_PATH, "utf8");
    const data = JSON.parse(raw);

    res.status(200).json(data);
  } catch (error) {
    console.error(`🚀 path:/scuba error`, error);
    // if file not found, return helpful message
    if (error.code === "ENOENT") {
      return res.status(404).json({ status: "Not Found", message: "scuba.json not found on server." });
    }
    res.status(500).json({ status: "Internal Server Error", message: error.message || error });
  }
});
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});
