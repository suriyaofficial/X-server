const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
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
const firebaseConfig = require("./spend_firebaseconfig");
const http = require("http");
const socketIo = require("socket.io");
const app = express();
app.use(cors()); // Enable CORS for all routes
const port = 3100;
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
app.use(bodyParser.json());
const server = http.createServer(app);
var admin = require("firebase-admin");

var serviceAccount = require("./travel-spend-tracker-firebase-adminsdk-rel8k-42b360b1ed.json");
// const { deleteDoc } = require("firebase/firestore");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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

app.post("/verifyToken", async (req, res) => {
  const idToken = req.body.idToken;

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    res.status(200).send({ uid });
  } catch (error) {
    res.status(401).send("Unauthorized");
  }
});

app.get("/", function (req, res) {
  let option = { root: path.join(__dirname) };
  let fileName = "index.html";
  res.sendFile(fileName, option);
});

app.post("/login", async (req, res) => {
  try {
    const { wandererId, wanderer, wandererPhoto } = req.body;
    const wandererDocRef = doc(db, "wanderer_list", wandererId);
    const wandererDocSnap = await getDoc(wandererDocRef);
    const existingWanderer = wandererDocSnap.data();
    if (existingWanderer) {
      res.status(200).json({ status: "login done", data: existingWanderer });
    } else {
      const usersCollectionRef = collection(db, "wanderer_list");
      const userDocRef = doc(usersCollectionRef, wandererId);
      await setDoc(userDocRef, {
        wandererId,
        wanderer,
        wandererPhoto,
        activeWander: [],
        completedWander: [],
        invite: [],
        plan: "Basic",
        paymentMethod: ["Cash", "Card", "UPI"],
      });
      res.status(201).json({
        result: "user registered successfully",
        data: {
          wandererId,
          wanderer,
          wandererPhoto,
          activeWander: [],
          completedWander: [],
          invite: [],
          plan: "Basic",
          paymentMethod: ["Cash", "Card", "UPI"],
        },
      });
    }
  } catch (error) {
    // console.log("🚀 ~ file: spend.js:79 ~ app.post ~ error:", error)
  }
});

app.get("/wanderer", async (req, res) => {
  const { wandererId } = req.query;
  const wandererDocRef = doc(db, "wanderer_list", wandererId);
  const wandererDocSnap = await getDoc(wandererDocRef);
  const existingWanderer = wandererDocSnap.data();
  // console.log("🚀 ~ file: spend.js:89 ~ app.get ~ existingWanderer:", existingWanderer)
  if (existingWanderer) {
    res.status(200).json({
      wanderer: existingWanderer.wanderer,
      wandererId,
      wandererPhoto: existingWanderer.wandererPhoto,
    });
  } else {
    res.status(200).json();
  }
});
app.post("/create_wander", async (req, res) => {
  try {
    const {
      wanderType,
      WanderName,
      WanderDestination,
      WanderBudget,
      inviteWanderer,
      wandererList,
    } = req.body;
    // console.log("🚀 ~ file: spend.js:98 ~ app.post ~ inviteWanderer:", inviteWanderer)
    // console.log("🚀 ~ file: spend.js:98 ~ app.post ~ WanderBudget:", WanderBudget)
    // console.log("🚀 ~ file: spend.js:98 ~ app.post ~ WanderDestination:", WanderDestination)
    // console.log("🚀 ~ file: spend.js:98 ~ app.post ~ WanderName:", WanderName)
    // console.log("🚀 ~ file: spend.js:98 ~ app.post ~ wanderType:", wanderType)
    const wanderer_id = req.query.wanderer_id;
    // console.log("🚀 ~ file: spend.js:99 ~ app.post ~ wanderer_id:", wanderer_id)
    const wander_uuid =
      wanderType === "GroupWander"
        ? `GroupWander_${await uuidv4()}`
        : `SoloWander${await uuidv4()}`;
    if (wanderer_id) {
      const wandererDocRef = doc(db, "wanderer_list", wanderer_id);
      const wandererDocSnap = await getDoc(wandererDocRef);
      const existingWanderer = wandererDocSnap.data();
      let data = existingWanderer.activeWander;
      // await sendInvite(inviteWanderer,wander_uuid,WanderName)
      if (data.length === 0) {
        if (wanderType === "GroupWander") {
          const tripCollectionRef = collection(db, "wander_list");
          const tripDocRef = doc(tripCollectionRef, wander_uuid);
          console.log(
            "🚀 ~ file: spend.js:117 ~ app.post ~ tripDocRef:",
            tripDocRef
          );
          await setDoc(tripDocRef, {
            wander_uuid,
            WanderName,
            wanderType,
            WanderDestination,
            WanderBudget,
            inviteWanderer,
            WanderAdmin: wanderer_id,
            WanderUtilized: 0,
            wandererList,
            expenses: [],
          });
          const updatedData = {
            ...existingWanderer,
            activeWander: [
              ...existingWanderer.activeWander,
              { wander_uuid, WanderName },
            ],
          };
          await setDoc(wandererDocRef, updatedData);
          await sendInvite(inviteWanderer, wander_uuid, WanderName);
          res.status(201).json({ status: "trip created" });
        } else {
          res.status(501).json({ message: "developing on going " });
        }
      } else {
        res.status(403).json({
          error: "Forbidden",
          message: `Upgrade your plan to add more trip.`,
        });
      }
    } else {
      res.status(400).json({
        error: "Bad Request",
        message: "Missing required query parameter: 'userId'",
      });
    }
  } catch (error) {
    // console.log("🚀 ~ file: spend.js:133 ~ app.post ~ error:", error)
  }
});

const sendInvite = (inviteWanderer, wander_uuid, WanderName) => {
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
};

app.get("/wander/inivitation", async (req, res) => {
  const { wandererId } = req.query;
  const wandererDocRef = doc(db, "wanderer_list", wandererId);
  const wandererDocSnap = await getDoc(wandererDocRef);
  const existingWanderer = wandererDocSnap.data();
  if (existingWanderer) {
    res.status(200).json({ invite: existingWanderer.invite });
  } else {
    res.status(200).json();
  }
});
app.put("/accept/wander/inivitation", async (req, res) => {
  try {
    const { wanderer_id } = req.query;
    // console.log("🚀 ~ file: spend.js:164 ~ app.put ~ wanderer_id:", wanderer_id)
    const { wander_uuid, status } = req.body;
    // console.log("🚀 ~ file: spend.js:166 ~ app.put ~ status:", status)
    // console.log("🚀 ~ file: spend.js:166 ~ app.put ~ wander_uuid:", wander_uuid)
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
        console.log(
          "🚀 ~ file: spend.js:196 ~ app.put ~ existingWander:",
          existingWander
        );
        console.log(
          "🚀 ~ file: spend.js:194 ~ app.put ~ existingWanderer:",
          existingWanderer.wandererId
        );
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
        // console.log("🚀 ~ file: spend.js:203 ~ app.put ~ updatedWanderData:", updatedWanderData)

        // Save the updated data back to Firestore
        await setDoc(wandererDocRef, updatedData);
        await setDoc(wanderDocRef, updatedWanderData);
        res.status(200).json({ message: "done" });
      }
    } else {
      res.status(400).json({ message: "already you have active wander" });
    }
  } catch (error) {
    // console.log("🚀 ~ file: spend.js:215 ~ app.put ~ error:", error)
  }
});
app.get("/active/wander", async (req, res) => {
  const { wandererId } = req.query;
  const wandererDocRef = doc(db, "wanderer_list", wandererId);
  const wandererDocSnap = await getDoc(wandererDocRef);
  const existingWanderer = wandererDocSnap.data();
  if (existingWanderer) {
    res.status(200).json({ activeWander: existingWanderer.activeWander });
  } else {
    res.status(200).json();
  }
});
app.get("/wander", async (req, res) => {
  const { wanderId } = req.query;
  // console.log("🚀 ~ file: spend.js:224 ~ app.get ~ wanderId:", wanderId)
  const wanderDocRef = doc(db, "wander_list", wanderId);
  const wanderDocSnap = await getDoc(wanderDocRef);
  const existingwander = wanderDocSnap.data();
  if (existingwander) {
    res.status(200).json({ existingwander });
  } else {
    res.status(200).json();
  }
});
app.post("/addExpense", async (req, res) => {
  const wanderId = req.query.wander_id;
  const body = req.body;
  //   console.log("🚀 ~ file: spend.js:316 ~ app.post ~ body:", body);
  if (wanderId) {
    // console.log("🚀 ~ file: spend.js:316 ~ app.post ~ tripId:", wanderId);
    const wanderDocRef = doc(db, "wander_list", wanderId);
    const wanderDocSnap = await getDoc(wanderDocRef);
    const wanderResult = wanderDocSnap.data();
    // console.log(
    //   "🚀 ~ file: spend.js:322 ~ app.post ~ tripResult:",
    //   wanderResult
    // );
    const exp_uuid = `exp_${await uuidv4()}`;
    const newExp = { ...body, exp_uuid, key: exp_uuid };
    // console.log("🚀 ~ file: spend.js:330 ~ app.post ~ newExp:", newExp);
    let updatedWanderData = { ...wanderResult };
    if (body.spendFrom === "trip_budget") {
      updatedWanderData.WanderBudget =
        (updatedWanderData.WanderBudget || 0) - body.expenseAmount;
      updatedWanderData.WanderUtilized =
        (updatedWanderData.WanderUtilized || 0) + body.expenseAmount;
    }

    // Update the expenses array
    updatedWanderData.expenses = [...(wanderResult.expenses || []), newExp];
    console.log(
      "🚀 ~ file: spend.js:330 ~ app.post ~ updatedData:",
      updatedWanderData
    );
    await setDoc(wanderDocRef, updatedWanderData);
    res.status(201).json({ message: "Expense added successfully" });
  } else {
    res.status(404).json({ status: "trip id is need" });
  }
});

app.put("/editExpense", async (req, res) => {
  const { amount, tag, note, date, payment_mode } = req.body;
  const tripId = req.query.trip_id;
  const expId = req.query.exp_id;
  const tripDocRef = doc(db, "triplist", tripId);
  const tripDocSnap = await getDoc(tripDocRef);
  const tripResult = tripDocSnap.data();
  const updatedExp = { date, amount, tag, note, payment_mode };
  const index = tripResult.expenses.findIndex(
    (expense) => expense.exp_uuid === expId
  );
  if (index !== -1) {
    // Update the expense object
    tripResult.expenses[index] = {
      ...tripResult.expenses[index],
      date,
      amount,
      tag,
      note,
      payment_mode,
    };
    // You may want to update the document in the database here
    await updateDoc(tripDocRef, { expenses: tripResult.expenses });
    res.status(200).json({
      message: "Expense updated successfully",
      expense: tripResult.expenses[index],
    });
    return;
  } else {
    res.status(404).json({ error: "Expense not found" });
  }
  // res.status(200).json({ tripResult });
});
app.delete("/deleteExpense", async (req, res) => {
  const wanderId = req.query.wander_id;
  const expId = req.query.exp_id;
  const wanderDocRef = doc(db, "wander_list", wanderId);
  const wanderDocSnap = await getDoc(wanderDocRef);
  const wanderResult = wanderDocSnap.data();

  const index = wanderResult.expenses.findIndex(
    (expense) => expense.exp_uuid === expId
  );
  console.log("🚀 ~ file: spend.js:393 ~ app.delete ~ index:", index);
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
  console.log(
    "🚀 ~ file: spend.js:416 ~ app.delete ~ wanderResult:",
    wanderResult
  );

  //   Update the document with new data
  await updateDoc(wanderDocRef, {
    expenses: wanderResult.expenses,
    WanderBudget: wanderResult.WanderBudget,
    WanderUtilized: wanderResult.WanderUtilized,
  });
  res.status(200).json("deleted");
  return;
});

app.post("/completeWander", async (req, res) => {
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
    console.log(
      "🚀 ~ file: spend.js:430 ~ wander.wandererList.forEach ~ userResult:",
      userResult
    );
    await updateDoc(userDocRef, {
      activeWander: userResult.activeWander,
      completedWander: userResult.completedWander,
    });
    //     await setDoc(userDocRef, updatedData);
  });

  res.status(200).json({ message: "Trip closed successfully" });
});
app.post("/deleteWander", async (req, res) => {
  const wanderId = req.query.wander_id;
  //   console.log("🚀 ~ file: spend.js:453 ~ app.post ~ wanderId:", wanderId);
  const wander = req.body;
  console.log("🚀 ~ file: spend.js:455 ~ app.post ~ wander:", wander);
  const wanderDocRef = doc(db, "wander_list", wanderId);
  await deleteDoc(wanderDocRef);

  wander.wandererList.forEach(async (wanderer) => {
    const userDocRef = doc(db, "wanderer_list", wanderer.wanderer_id);
    const wanderer_name = wanderer.wanderer_name;
    const userDocSnap = await getDoc(userDocRef);
    const userResult = userDocSnap.data();

    const activeIndex = userResult.activeWander.indexOf(wanderId);
    const completeIndex = userResult.completedWander.indexOf(wanderId);
    const inviteIndex = userResult.invite.indexOf(wanderId);

    activeIndex ? userResult.activeWander.splice(activeIndex, 1) : null;
    completeIndex ? userResult.completedWander.splice(completeIndex, 1) : null;
    inviteIndex ? userResult.invite.splice(inviteIndex, 1) : null;
    userResult.activeWander.splice(activeIndex, 1);

    await updateDoc(userDocRef, {
      activeWander: userResult.activeWander,
      completedWander: userResult.completedWander,
      invite: userResult.invite,
    });
    //     await setDoc(userDocRef, updatedData);
  });

  res.status(200).json({ message: "Trip closed successfully" });
});

app.get("/all/wander", async (req, res) => {
  const { wandererId } = req.query;
  const wandererDocRef = doc(db, "wanderer_list", wandererId);
  const wandererDocSnap = await getDoc(wandererDocRef);
  const existingWanderer = wandererDocSnap.data();
  if (existingWanderer) {
    const wanderList = [
      existingWanderer.activeWander,
      existingWanderer.completedWander,
    ];

    res.status(200).json({
      activeWander: existingWanderer.activeWander,
      completedWander: existingWanderer.completedWander,
    });
  } else {
    res.status(200).json();
  }
});
app.get("/tripExpense", async (req, res) => {
  const tripId = req.query.trip_id;
  const tripDocRef = doc(db, "triplist", tripId);
  const tripDocSnap = await getDoc(tripDocRef);
  const tripResult = tripDocSnap.data();
  res.status(200).json({ tripResult });
});
app.post("/addCustom", async (req, res) => {
  const wanderId = req.query.wander_id;
  const wander = [
    {
      _suriya_skydiver: 0,
      key: "exp_5dcb3989-5ea1-4820-b1e6-49f7c5d807a6",
      expenseCategory: "sim",
      _suriya_boss: 1250,
      expenseDescription: "sim",
      spendFrom: "trip_budget",
      expenseDate: "01-09-2024",
      splitBy: "unequally",
      expenseAmount: 2500,
      _suriya_r: 1250,
    },
    {
      expenseDescription: "airport to station ",
      expenseAmount: 300,
      splitBy: "equally",
      spendFrom: "trip_budget",
      _suriya_boss: 100,
      expenseCategory: "transport",
      expenseDate: "01-09-2024",
      key: "exp_ed957a51-01c1-4a72-8b3b-c02b50ea769f",
      _suriya_r: 100,
      _suriya_skydiver: 100,
    },
    {
      _suriya_r: 33.33,
      expenseAmount: 100,
      _suriya_boss: 33.33,
      _suriya_skydiver: 33.33,
      expenseCategory: "transport",
      spendFrom: "trip_budget",
      splitBy: "equally",
      key: "exp_796e4fe5-5033-458b-ab20-ba2480de829f",
      expenseDescription: "station to rambukana",
      expenseDate: "01-09-2024",
    },
    {
      _suriya_boss: 40,
      expenseCategory: "food",
      _suriya_skydiver: 40,
      expenseAmount: 120,
      expenseDate: "01-09-2024",
      _suriya_r: 40,
      spendFrom: "trip_budget",
      splitBy: "equally",
      expenseDescription: "breakfast",
      key: "exp_8202ef27-6213-4df4-bddb-51459a3e3d09",
    },
    {
      _suriya_r: 1000,
      splitBy: "equally",
      expenseAmount: 3000,
      expenseCategory: "sightseeing",
      source: "W1::suriya_r_card",
      expenseDate: "01-09-2024",
      key: "exp_4d750928-efda-4cc2-8a47-c2fbcc47d98c",
      expenseDescription: "elephant ophenage",
      spendFrom: "W1::suriya_r",
      _suriya_skydiver: 1000,
      _suriya_boss: 1000,
    },
    {
      key: "exp_ce0e107f-9a1e-438f-8346-0bbf25185b2b",
      expenseDescription: "to kandy",
      _suriya_skydiver: 100,
      expenseCategory: "transport",
      _suriya_r: 100,
      splitBy: "equally",
      _suriya_boss: 100,
      expenseDate: "01-09-2024",
      spendFrom: "trip_budget",
      expenseAmount: 300,
    },
    {
      _suriya_skydiver: 900,
      _suriya_boss: 900,
      expenseAmount: 2700,
      _suriya_r: 900,
      expenseCategory: "miscellaneous",
      expenseDate: "01-09-2024",
      splitBy: "equally",
      expenseDescription: "license",
      key: "exp_ae88b81b-5955-4275-a7d1-c9e0b799a79b",
      spendFrom: "trip_budget",
    },
    {
      _suriya_skydiver: 533.33,
      expenseDate: "01-09-2024",
      _suriya_r: 533.33,
      expenseAmount: 1600,
      spendFrom: "trip_budget",
      _suriya_boss: 533.33,
      splitBy: "equally",
      key: "exp_28d4f734-e52f-4c92-9f95-2e303591c047",
      expenseCategory: "accommodation",
      expenseDescription: "room",
    },
    {
      expenseCategory: "miscellaneous",
      expenseDate: "02-09-2024",
      expenseDescription: "mudguard",
      source: "W1::suriya_r_card",
      _suriya_boss: 0,
      key: "exp_d976c177-ea98-42a1-b27e-c907fcdb2835",
      _suriya_skydiver: 0,
      splitBy: "unequally",
      spendFrom: "W1::suriya_r",
      _suriya_r: 2000,
      expenseAmount: 2000,
    },
    {
      key: "exp_2092c219-d075-415c-a1e4-f6a5423c31dc",
      spendFrom: "W1::suriya_r",
      _suriya_skydiver: 1000,
      expenseCategory: "food",
      expenseDate: "03-09-2024",
      _suriya_boss: 500,
      source: "W1::suriya_r_card",
      splitBy: "unequally",
      expenseDescription: "swaberry farm",
      expenseAmount: 2500,
      _suriya_r: 1000,
    },
    {
      _suriya_boss: 40,
      expenseCategory: "sightseeing",
      expenseAmount: 120,
      splitBy: "equally",
      spendFrom: "trip_budget",
      _suriya_skydiver: 40,
      expenseDescription: "dairy farm",
      key: "exp_f454895a-a8d9-42c1-b056-71e4151e77d2",
      expenseDate: "03-09-2024",
      _suriya_r: 40,
    },
    {
      expenseAmount: 500,
      _suriya_skydiver: 166.67,
      key: "exp_7d12735f-6323-42f1-91ed-917b262cefe0",
      _suriya_r: 166.67,
      expenseDescription: "ambulawawa tower",
      spendFrom: "trip_budget",
      splitBy: "equally",
      expenseDate: "02-09-2024",
      expenseCategory: "sightseeing",
      _suriya_boss: 166.67,
    },
    {
      spendFrom: "trip_budget",
      expenseAmount: 400,
      expenseDescription: "lunch",
      splitBy: "unequally",
      expenseDate: "04-09-2024",
      _suriya_boss: 200,
      _suriya_r: 200,
      _suriya_skydiver: 0,
      key: "exp_0c0ad4f8-b2af-47c8-9a15-80c05438668a",
      expenseCategory: "food",
    },
    {
      spendFrom: "trip_budget",
      _suriya_boss: 1333.33,
      expenseDate: "02-09-2024",
      expenseCategory: "transport",
      splitBy: "equally",
      _suriya_r: 1333.33,
      key: "exp_79d71026-0e28-4447-97d7-bf1119e7d252",
      expenseAmount: 4000,
      expenseDescription: "rentalbike",
      _suriya_skydiver: 1333.33,
    },
  ];

  //   console.log("🚀 ~ file: spend.js:316 ~ app.post ~ body:", body);
  if (wanderId) {
    // console.log("🚀 ~ file: spend.js:316 ~ app.post ~ tripId:", wanderId);
    const wanderDocRef = doc(db, "wander_list", wanderId);
    const wanderDocSnap = await getDoc(wanderDocRef);
    const wanderResult = wanderDocSnap.data();
    console.log(
      "🚀 ~ file: spend.js:677 ~ app.post ~ wanderResult:",
      wanderResult
    );
    await updateDoc(wanderDocRef, { expenses: wander });
    // console.log(
    //   "🚀 ~ file: spend.js:322 ~ app.post ~ tripResult:",
    //   wanderResult
    // );

    // console.log("🚀 ~ file: spend.js:330 ~ app.post ~ newExp:", newExp);

    res.status(201).json({ message: "Expense added successfully" });
  } else {
    res.status(404).json({ status: "trip id is need" });
  }
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// app.get('/getDeatils/', async (req, res) => {
//     const docRef = doc(db, 'zurich', 'yogon');
//     const docSnap = await getDoc(docRef);
//     const currentData = docSnap.exists() ? docSnap.data() : {};
//     res.status(200).json({ currentData });
//     // io.emit('message', true);

// });

// app.post('/send/', authorization, async (req, res) => {
//     const NewMsg = req.body.msg;
//     const uuid = await uuidv4()
//     const docRef = doc(db, 'chatRoom', 'general');
//     const docSnap = await getDoc(docRef);
//     const currentData = docSnap.exists() ? docSnap.data() : {};
//     const getUser = currentData.content || [];
//     let newMsgData = { "msg_Id": uuid, "msg": NewMsg, "user_name": req.username }
//     const updatedMsgData = [...getUser, newMsgData];
//     const usersCollectionRef = collection(db, 'chatRoom');
//     const userDocRef = doc(usersCollectionRef, 'general');
//     await setDoc(userDocRef, { ...currentData, "content": updatedMsgData });
//     res.status(201).json({ result: "created" });
//     io.emit('message', `send_Successfully`);

//     // }
// });
// // app.use((req, res) => {
// //     res.status(200).send('server running---ok');
// // });
// app.post('/userNameCheck/', async (req, res) => {
//     const { username } = req.body;
//     const docRef = doc(db, 'chatAppUser', username);
//     const docSnap = await getDoc(docRef);
//     const existingWanderer = docSnap.data();
//     if (existingWanderer) {
//         res.status(400).json({ result: 'user already exists' });
//     } else {
//         res.status(201).json({ result: 'username availble' });
//     }
// });

// app.get('/activeuser/', authorization, async (req, res) => {
//     const querySnapshot = await getDocs(collection(db, "chatAppUser"));
//     let alluser = []
//     querySnapshot.forEach((doc) => {
//         if (doc.data().username != req.username) {
//             data = { username: doc.data().username, active: doc.data().active }
//             alluser.push(data)
//         }
//     });
//     res.status(200).json(alluser);

// });
// app.get('/typing/', authorization, async (req, res) => {
//     io.emit('typing', `${req.username} is typing....`);
//     res.status(200).json();

// });
// app.post('/register/', async (req, res) => {
//     const { username, password } = req.body;
//     const hashedpassword = await bcrypt.hash(password, 10);
//     const docRef = doc(db, 'wanderer_list', username);
//     const docSnap = await getDoc(docRef);
//     const existingWanderer = docSnap.data();
//     if (existingWanderer) {
//         res.status(400).json({ result: 'user already exists' });
//     } else {
//         return
//         const usersCollectionRef = collection(db, 'wanderer_list');
//         const userDocRef = doc(usersCollectionRef, username);
//         await setDoc(userDocRef, { username, hashedpassword, active: false });
//         res.status(201).json({ result: 'user registered successfully' });
//     }
// });
