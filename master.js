const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
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
} = require("@firebase/firestore");
const firebaseConfig = require("./master_firebaseconfig");
const http = require("http");
const socketIo = require("socket.io");
const { timeStamp } = require("console");
const app = express();
app.use(cors()); // Enable CORS for all routes
const port = 3100;
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
app.use(bodyParser.json());
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*", // Specify the allowed origin for Socket.io
    // methods: ["GET", "POST"]
  },
});

io.on("connection", (socket) => {
  // Listen for messages from the client
  // Disconnect event
  socket.on("disconnect", (msg) => {});
});

server.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});

app.get("/", function (req, res) {
  let option = { root: path.join(__dirname) };
  let fileName = "index.html";
  console.log("🚀-*-*-*server refresh -*-*-*🚀");
  res.sendFile(fileName, option);
});

const getData = async (db, collectionName, docId) => {
  const DocRef = docId
    ? doc(db, collectionName, docId)
    : collection(db, collectionName);
  const DocSnap = await getDoc(DocRef);
  return (existing = DocSnap.data());
};
const setData = async (db, collectionName, docId, updatedData) => {
  const DocRef = doc(db, collectionName, docId);
  await setDoc(DocRef, updatedData);
};
const checkPlan = async (req, res, next) => {
  const plans = await getData(db, "plans", "plan_limits");
  try {
    const email = req.query.email;
    const existing = await getData(db, "admin_list", email);
    if (existing.business.length < plans[existing.plan]) {
      next();
    } else if (existing.plan === "Pro") {
      const plan = await getData(db, "pro_plan", email);
      if (existing.business.length < plan.limit) {
        next();
      } else if (existing.business.length == plan.limit) {
        throw new Error(
          `you have reached the maximum number of business for your ${existing.plan}plan.`
        );
      }
    } else if (existing.business.length == plans[existing.plan]) {
      throw new Error(
        `you have reached the maximum number of business for your ${existing.plan}plan.`
      );
    }
  } catch (error) {
    res.status(401).json({
      error: `you have reached the maximum number of business for yourplan.`,
    });
  }
};

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
    console.error(`🚀path:/wanderer :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});
app.post("/feedback/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const feedbackData = ({
      email,
      phoneNo,
      activityType,
      sliderDesignoverAllExperience,
      comments,
      intrestedInOWC,
      knownSwimming,
    } = req.body);
    // const  feedbackData ={"email": "scubadiver.suriya@gmail.com", "phoneNo": "7092925555", "Activity Type": "dsd", "overAllExperience": 4, "comments": "thanks", "intrestedInOWC": true, "knownSwimming": true}
    const feedbackRef = doc(
      collection(db, "business", businessId, "feedbacks")
    ); // auto id
    await setDoc(feedbackRef, {
      ...feedbackData,
      timestamp: serverTimestamp(),
    });
    // return feedbackRef.id;
    if (feedbackRef.id) {
      res.status(200).json(feedbackRef.id);
    } else {
      res.status(200).json({ info: "No business found" });
    }
  } catch (error) {
    console.error(`🚀path:/wanderer :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});

app.post("/feedback/admin/business", checkPlan, async (req, res) => {
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
      business: [...existing.business, data],
    };
    console.log("🚀 ~ updatedData:", updatedData);
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
    const updatedList = existing.business.filter(
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
    console.log("🚀 ~ existing:", existing);
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

app.get("/feedback/admin/feedbacks/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const {
      pageSize = 100,
      sortBy = "timestamp",
      sortOrder = "desc",
      activityType,
      intrestedInOWC,
      knownSwimming,
      overAllExperienceMin,
      overAllExperienceMax,
      startTime,
      endTime,
      cursor,
      lastTimestamp, // optional helper for tie-break when sorting by overAllExperience
    } = req.query;

    // Validate pageSize
    const limitNumber = Math.min(
      Math.max(parseInt(pageSize, 10) || 20, 1),
      100
    );

    // Build collection ref
    const feedbacksCol = collection(db, "business", businessId, "feedbacks");

    // Start building where clauses
    const constraints = [];

    // equality filters
    if (activityType) {
      constraints.push(where("activityType", "==", activityType));
    }

    if (typeof intrestedInOWC !== "undefined") {
      const boolVal = String(intrestedInOWC).toLowerCase() === "true";
      constraints.push(where("intrestedInOWC", "==", boolVal));
    }

    if (typeof knownSwimming !== "undefined") {
      const boolVal = String(knownSwimming).toLowerCase() === "true";
      constraints.push(where("knownSwimming", "==", boolVal));
    }

    // numeric range for overAllExperience
    if (typeof overAllExperienceMin !== "undefined") {
      const minVal = Number(overAllExperienceMin);
      if (!Number.isNaN(minVal))
        constraints.push(where("overAllExperience", ">=", minVal));
    }
    if (typeof overAllExperienceMax !== "undefined") {
      const maxVal = Number(overAllExperienceMax);
      if (!Number.isNaN(maxVal))
        constraints.push(where("overAllExperience", "<=", maxVal));
    }

    // timestamp range filters (accept epoch ms or ISO)
    const toTimestamp = (val) => {
      if (!val) return null;
      // if numeric string or number -> treat as ms
      if (!Number.isNaN(Number(val))) {
        return Timestamp.fromMillis(Number(val));
      }
      // try Date parse
      const d = new Date(val);
      if (!Number.isNaN(d.getTime())) return Timestamp.fromMillis(d.getTime());
      return null;
    };

    const startTs = toTimestamp(startTime);
    const endTs = toTimestamp(endTime);
    if (startTs) constraints.push(where("timestamp", ">=", startTs));
    if (endTs) constraints.push(where("timestamp", "<=", endTs));

    // Decide ordering
    const orderField =
      sortBy === "overAllExperience" ? "overAllExperience" : "timestamp";
    const orderDirection = sortOrder === "asc" ? "asc" : "desc";

    // Build base query with orderBy; for stable pagination we always include timestamp as second order if sorting by something else
    const qConstraints = [];
    // push where constraints first
    constraints.forEach((c) => qConstraints.push(c));

    qConstraints.push(orderBy(orderField, orderDirection));
    // If sorting by overAllExperience, also order by timestamp as tie-breaker
    if (orderField !== "timestamp") {
      qConstraints.push(
        orderBy("timestamp", orderDirection === "asc" ? "asc" : "desc")
      );
    }

    // Cursor handling (startAfter)
    let builtQuery;
    if (cursor) {
      // If sorting by timestamp, cursor expected as epoch ms or ISO
      if (orderField === "timestamp") {
        const cursorTs = toTimestamp(cursor);
        if (!cursorTs) {
          return res
            .status(400)
            .json({
              error:
                "Invalid cursor for timestamp. Use epoch ms or ISO date string.",
            });
        }
        // startAfter needs the same ordering field(s) value(s)
        builtQuery = query(
          feedbacksCol,
          ...qConstraints,
          startAfter(cursorTs),
          fbLimit(limitNumber)
        );
      } else {
        // sorting by overAllExperience - cursor expected to be numeric (overAllExperience)
        const cursorVal = Number(cursor);
        if (Number.isNaN(cursorVal)) {
          return res
            .status(400)
            .json({
              error: "Invalid cursor for overAllExperience. Provide a number.",
            });
        }
        // For stable pagination include timestamp as second cursor value if provided
        if (lastTimestamp) {
          const lastTs = toTimestamp(lastTimestamp);
          if (!lastTs) {
            return res
              .status(400)
              .json({
                error:
                  "Invalid lastTimestamp. Use epoch ms or ISO date string.",
              });
          }
          builtQuery = query(
            feedbacksCol,
            ...qConstraints,
            startAfter(cursorVal, lastTs),
            fbLimit(limitNumber)
          );
        } else {
          // only overAllExperience cursor -> Firestore will use single-field cursor
          builtQuery = query(
            feedbacksCol,
            ...qConstraints,
            startAfter(cursorVal),
            fbLimit(limitNumber)
          );
        }
      }
    } else {
      builtQuery = query(feedbacksCol, ...qConstraints, fbLimit(limitNumber));
    }

    // Execute
    const snap = await getDocsExtra(builtQuery);
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Compute nextCursor for pagination: use last doc's ordering value(s)
    let nextCursor = null;
    if (snap.docs.length > 0) {
      const lastDoc = snap.docs[snap.docs.length - 1];
      const lastData = lastDoc.data();
      if (orderField === "timestamp") {
        // return epoch ms of last timestamp
        if (lastData.timestamp && lastData.timestamp.toMillis) {
          nextCursor = String(lastData.timestamp.toMillis());
        } else {
          // fallback - return undefined
          nextCursor = null;
        }
      } else {
        // overAllExperience cursor and lastTimestamp tie-breaker
        const val =
          typeof lastData.overAllExperience !== "undefined"
            ? lastData.overAllExperience
            : null;
        const ts =
          lastData.timestamp && lastData.timestamp.toMillis
            ? String(lastData.timestamp.toMillis())
            : null;
        nextCursor = { cursor: val, lastTimestamp: ts };
      }
    }

    return res.status(200).json({
      data: docs,
      nextCursor,
      meta: {
        pageSize: limitNumber,
        returned: docs.length,
        sortBy: orderField,
        sortOrder: orderDirection,
      },
    });
  } catch (error) {
    console.error("🚀 path:/feedback/admin/feedbacks error:", error);
    // If missing composite index Firestore error includes a link; forward that message for dev visibility
    return res.status(500).json({
      status: "Internal Server Error",
      message: error?.message || error,
    });
  }
});
// Dashboard stats endpoint
// GET /feedback/admin/dashboard/:businessId
// Optional query param: forceRefresh=true  (will recompute from feedback docs and overwrite cache)
app.get("/feedback/admin/dashboard/:businessId/dashboard", async (req, res) => {
  try {
    const { businessId } = req.params;
    const { forceRefresh } = req.query;

    // 1) Try to read cached stats stored in the business doc (prefer this)
    const businessDocRef = doc(db, "business", businessId);
    const businessSnap = await getDoc(businessDocRef);
    if (!businessSnap.exists()) {
      return res.status(404).json({ error: "Business not found" });
    }

    const businessData = businessSnap.data();

    // If cached stats exist and no forceRefresh, return them
    if (businessData && businessData.stats && !forceRefresh) {
      return res.status(200).json({
        source: "cache",
        stats: businessData.stats,
      });
    }

    // 2) Otherwise compute stats by scanning the feedbacks subcollection
    // NOTE: This will read all feedback documents — expensive for a very large dataset.
    const feedbacksCol = collection(db, "business", businessId, "feedbacks");
    const feedbackSnap = await getDocs(feedbacksCol);
    const totalFeedbacks = feedbackSnap.size;

    // initialize aggregations
    let sumOverall = 0;
    const overallCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; // counts for 1..5
    let interestCounts = { interestedInOWC: 0, notInterested: 0 };
    const activityCounts = {}; // dynamic map activityType -> count
    // optional: sample of recent comments and sample emails
    const recent = [];

    feedbackSnap.forEach((docSnap) => {
      const d = docSnap.data();

      // timestamp safe read
      const tsMillis = d.timestamp && d.timestamp.toMillis ? d.timestamp.toMillis() : null;

      const rating = Number(d.overAllExperience) || 0;
      if (rating >= 1 && rating <= 5) {
        overallCounts[rating] = (overallCounts[rating] || 0) + 1;
        sumOverall += rating;
      }

      // interest
      if (d.intrestedInOWC === true) {
        interestCounts.interestedInOWC += 1;
      } else {
        interestCounts.notInterested += 1;
      }

      // activity type (your field name is "Activity Type" in docs; your API uses activityType)
      const activity = d["activityType"] || d.activityType || "unknown";
      activityCounts[activity] = (activityCounts[activity] || 0) + 1;

      // collect some recent items for dashboard (up to 10)
      if (recent.length < 10) {
        recent.push({
          id: docSnap.id,
          timestamp: tsMillis,
          email: d.email,
          phoneNo: d.phoneNo,
          activity,
          overAllExperience: d.overAllExperience,
          comments: d.comments,
          intrestedInOWC: d.intrestedInOWC,
          knownSwimming: d.knownSwimming,
        });
      }
    });

    const avgOverallExperience =
      totalFeedbacks > 0 ? parseFloat((sumOverall / totalFeedbacks).toFixed(2)) : 0;

    const stats = {
      totalFeedbacks,
      avgOverallExperience,
      overallCounts,
      interestCounts,
      activityCounts,
      // recentSample: recent,
      lastUpdatedAt: Date.now(),
    };

    // 3) cache back into the business doc for faster dashboard reads later
    // We will write a `stats` field on the business document. Overwrites existing stats.
    try {
      await updateDoc(businessDocRef, { stats });
    } catch (writeErr) {
      // If update fails (permissions) just log and continue — still return computed stats.
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


app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});
