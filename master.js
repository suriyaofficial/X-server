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
  getCountFromServer,
} = require("@firebase/firestore");
const firebaseConfig = require("./master_firebaseconfig");
const http = require("http");
const app = express();
app.use(cors()); // Enable CORS for all routes
const port = 3100;
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
app.use(bodyParser.json());
const server = http.createServer(app);

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
    console.error(`🚀path:/all/business :error ${error}`);
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
    console.error(`🚀path:/feedback/business :error ${error}`);
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

    // --- Pagination ---
    const limitNumber = Math.min(
      Math.max(parseInt(pageSize, 10) || 10, 1),
      100
    );
    const currentPage = Math.max(parseInt(pageNo, 10) || 1, 1);
    const offset = (currentPage - 1) * limitNumber;

    // --- Firestore ref ---
    const feedbacksCol = collection(db, "business", businessId, "feedbacks");
    const constraints = [];

    // --- Filters ---
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

    // --- Date Range ---
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

    // --- Sorting ---
    const orderField =
      sortBy === "overAllExperience" ? "overAllExperience" : "timestamp";
    const orderDirection = sortOrder === "asc" ? "asc" : "desc";

    // --- Get Total Count (unfiltered) ---
    const totalSnap = await getCountFromServer(feedbacksCol);
    const totalCount = totalSnap.data().count;

    // --- Get Filtered Count (with filters) ---
    const filterQuery = query(feedbacksCol, ...constraints);
    const filteredSnap = await getCountFromServer(filterQuery);
    const filteredCount = filteredSnap.data().count;

    // --- Fetch with sorting + pseudo offset ---
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
    feedbackSnap.forEach((docSnap) => {
      const d = docSnap.data();
      // timestamp safe read

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
