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
} = require("@firebase/firestore");
const firebaseConfig = require("./master_firebaseconfig");
const http = require("http");
const socketIo = require("socket.io");
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
  const DocRef = doc(db, collectionName, docId);
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

app.post("/feedback/login", async (req, res) => {
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

app.get("/feedback/business", async (req, res) => {
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
app.post("/feedback/business", checkPlan, async (req, res) => {
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
        businessName: businessName,
        placeId: placeId,
      })
    ).toString("base64");
    const data = {
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

    res.status(200).json({
      message: `added successfully`,
      url: `www.feedback.web.app/${urlEncode}`,
    });
  } catch (error) {
    console.error(`error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});
app.delete("/feedback/business/:businessId", async (req, res) => {
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

const sendInvite = (inviteWanderer, wander_uuid, WanderName) => {
  try {
    inviteWanderer.forEach(async (invite) => {
      const userDocRef = doc(db, "wanderer_list", invite.wanderer_id);
      const wanderer_name = invite.wanderer_name;
      const userDocSnap = await getDoc(userDocRef);
      const userResult = userDocSnap.data();
      const updatedData = {
        ...userResult,
        invite: [
          ...userResult.invite,
          { WanderName, wanderer_name, wander_uuid, status: "pending" },
        ],
      };
      await setDoc(userDocRef, updatedData);
    });
  } catch (error) {
    console.error(`🚀function:send invite :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
};

app.get("/wander/inivitation", async (req, res) => {
  try {
    const { wandererId } = req.query;
    const wandererDocRef = doc(db, "wanderer_list", wandererId);
    const wandererDocSnap = await getDoc(wandererDocRef);
    const existingWanderer = wandererDocSnap.data();
    if (existingWanderer) {
      res.status(200).json({ invite: existingWanderer.invite });
    } else {
      res.status(200).json();
    }
  } catch (error) {
    console.error(`🚀GET:path:/wander/inivitation :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});
app.put("/accept/wander/inivitation", async (req, res) => {
  try {
    const { wanderer_id } = req.query;
    const { wander_uuid, status } = req.body;
    const wandererDocRef = doc(db, "wanderer_list", wanderer_id);
    const wandererDocSnap = await getDoc(wandererDocRef);
    const wanderDocRef = doc(db, "wander_list", wander_uuid);
    const wanderDocSnap = await getDoc(wanderDocRef);
    const existingWanderer = wandererDocSnap.data();
    const existingWander = wanderDocSnap.data();
    if (existingWanderer.activeWander.length === 0) {
      if (status === "accept") {
        const updatedActiveWander = [
          ...existingWanderer.activeWander,
          { wander_uuid, WanderName: existingWander.WanderName },
        ];
        // Remove the corresponding invite from the `invite` array in `existingWanderer`
        const updatedInvite = existingWanderer.invite.filter(
          (invite) => invite.wander_uuid !== existingWander.wander_uuid
        );
        // Update the status of the wanderer in `existingWander.inviteWanderer`
        const updatedInviteWanderer = existingWander.inviteWanderer.map(
          (wanderer) =>
            wanderer.wanderer_id === existingWanderer.wandererId
              ? { ...wanderer, status: "accept" }
              : wanderer
        );
        const updatedData = {
          ...existingWanderer,
          activeWander: updatedActiveWander,
          invite: updatedInvite,
        };
        // Update the `existingWander` object with the updated `inviteWanderer`
        const updatedWanderData = {
          ...existingWander,
          inviteWanderer: updatedInviteWanderer,
        };

        // Save the updated data back to Firestore
        await setDoc(wandererDocRef, updatedData);
        await setDoc(wanderDocRef, updatedWanderData);
        console.log(
          `🚀-*-*-* ${wanderer_id} Accepted the Wander Invite -*-*-*🚀`
        );

        res.status(200).json({ message: " Accepted the Wander Invite " });
      }
    } else {
      res.status(400).json({ message: "already you have active wander" });
    }
  } catch (error) {
    console.error(`🚀PUT:path:/wander/inivitation :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});
app.get("/active/wander", async (req, res) => {
  try {
    const { wandererId } = req.query;
    const wandererDocRef = doc(db, "wanderer_list", wandererId);
    const wandererDocSnap = await getDoc(wandererDocRef);
    const existingWanderer = wandererDocSnap.data();
    if (existingWanderer) {
      res.status(200).json({ activeWander: existingWanderer.activeWander });
    } else {
      res.status(200).json();
    }
  } catch (error) {
    console.error(`🚀GET:path:/active/wander :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});
app.get("/wander", async (req, res) => {
  try {
    const { wanderId } = req.query;
    const wanderDocRef = doc(db, "wander_list", wanderId);
    const wanderDocSnap = await getDoc(wanderDocRef);
    const existingwander = wanderDocSnap.data();
    if (existingwander) {
      res.status(200).json({ existingwander });
    } else {
      res.status(200).json();
    }
  } catch (error) {
    console.error(`🚀GET:path:/wander :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});
app.post("/add/expense", async (req, res) => {
  try {
    const wanderId = req.query.wander_id;
    const body = req.body;
    if (wanderId) {
      const wanderDocRef = doc(db, "wander_list", wanderId);
      const wanderDocSnap = await getDoc(wanderDocRef);
      const wanderResult = wanderDocSnap.data();
      const uuid = await uuidv4();
      const shortUuid = uuid.slice(0, 23);
      const exp_uuid = `exp_${shortUuid}`;
      const newExp = { ...body, exp_uuid, key: exp_uuid };
      let updatedWanderData = { ...wanderResult };
      if (body.spendFrom === "trip_budget") {
        updatedWanderData.WanderBudget =
          (updatedWanderData.WanderBudget || 0) - body.expenseAmount;
        updatedWanderData.WanderUtilized =
          (updatedWanderData.WanderUtilized || 0) + body.expenseAmount;
      }

      // Update the expenses array
      updatedWanderData.expenses = [...(wanderResult.expenses || []), newExp];
      await setDoc(wanderDocRef, updatedWanderData);
      console.log(
        `🚀-*-*-*  Expense Added Successfully In ${wanderId} -*-*-*🚀`
      );

      res.status(201).json({ message: "Expense Added Successfully" });
    } else {
      res.status(404).json({ message: "trip id is need" });
    }
  } catch (error) {
    console.error(`🚀POST:path:/add/expense :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});

app.delete("/delete/expense", async (req, res) => {
  try {
    const wanderId = req.query.wander_id;
    const expId = req.query.exp_id;
    const wanderDocRef = doc(db, "wander_list", wanderId);
    const wanderDocSnap = await getDoc(wanderDocRef);
    const wanderResult = wanderDocSnap.data();

    const index = wanderResult.expenses.findIndex(
      (expense) => expense.exp_uuid === expId
    );
    const expenseToDelete = wanderResult.expenses[index];

    // Update WanderBudget and WanderUtilized if spendFrom is trip_budget
    if (expenseToDelete.spendFrom === "trip_budget") {
      wanderResult.WanderBudget =
        (wanderResult.WanderBudget || 0) + expenseToDelete.expenseAmount;
      wanderResult.WanderUtilized =
        (wanderResult.WanderUtilized || 0) - expenseToDelete.expenseAmount;
    }

    // Remove the expense from the array
    wanderResult.expenses.splice(index, 1);
    //   Update the document with new data
    await updateDoc(wanderDocRef, {
      expenses: wanderResult.expenses,
      WanderBudget: wanderResult.WanderBudget,
      WanderUtilized: wanderResult.WanderUtilized,
    });
    console.log(
      `🚀-*-*-*  Expense Deleted Successfully In ${wanderId} -*-*-*🚀`
    );
    res.status(200).json({ message: "Expense Deleted Successfully" });
    return;
  } catch (error) {
    console.error(`🚀DELETE:path:/delete/expense :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});

app.post("/complete/wander", async (req, res) => {
  try {
    const wanderId = req.query.wander_id;
    const wander = req.body;

    wander.wandererList.forEach(async (wanderer) => {
      const userDocRef = doc(db, "wanderer_list", wanderer.wanderer_id);
      const wanderer_name = wanderer.wanderer_name;
      const userDocSnap = await getDoc(userDocRef);
      const userResult = userDocSnap.data();

      const activeIndex = userResult.activeWander.indexOf(wanderId);
      userResult.activeWander.splice(activeIndex, 1);
      userResult.completedWander.push({
        WanderName: wander.WanderName,
        wander_uuid: wander.wander_uuid,
        WanderDestination: wander.WanderDestination,
      });
      await updateDoc(userDocRef, {
        activeWander: userResult.activeWander,
        completedWander: userResult.completedWander,
      });
    });
    console.log(
      `🚀-*-*-*  Wander Completed Successfully  ${wanderId} -*-*-*🚀`
    );
    res.status(200).json({ message: " Wander Completed Successfully" });
  } catch (error) {
    console.error(`🚀POST:path:/complete/wander:error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});
app.post("/delete/wander", async (req, res) => {
  try {
    const wanderId = req.query.wander_id;
    const wander = req.body;
    const wanderDocRef = doc(db, "wander_list", wanderId);
    await deleteDoc(wanderDocRef);

    wander.wandererList.forEach(async (wanderer) => {
      const userDocRef = doc(db, "wanderer_list", wanderer.wanderer_id);
      const wanderer_name = wanderer.wanderer_name;
      const userDocSnap = await getDoc(userDocRef);
      const userResult = userDocSnap.data();
      userResult.activeWander = userResult.activeWander.filter(
        (activeWander) => activeWander.wander_uuid !== wanderId
      );
      userResult.invite = userResult.invite.filter(
        (invite) => invite.wander_uuid !== wanderId
      );
      await updateDoc(userDocRef, {
        activeWander: userResult.activeWander,
        invite: userResult.invite,
      });
    });
    console.log(`🚀-*-*-*  Wander Deleted Successfully  ${wanderId} -*-*-*🚀`);
    res.status(200).json({ message: "Wander Deleted Successfully" });
  } catch (error) {
    console.error(`🚀POST:path:/delete/wander :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});

app.get("/all/wander", async (req, res) => {
  try {
    const { wandererId } = req.query;
    const wandererDocRef = doc(db, "wanderer_list", wandererId);
    const wandererDocSnap = await getDoc(wandererDocRef);
    const existingWanderer = wandererDocSnap.data();
    if (existingWanderer) {
      res.status(200).json({
        activeWander: existingWanderer.activeWander,
        completedWander: existingWanderer.completedWander,
      });
    } else {
      res.status(200).json();
    }
  } catch (error) {
    console.error(`🚀GET:path:/all/wander :error ${error}`);
    res.status(500).json({ status: "Internal Server Error", message: error });
  }
});
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});
