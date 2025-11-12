const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const querystring = require('querystring');

const { initializeApp } = require("firebase/app");
const { getFirestore } = require("@firebase/firestore");
const { getDoc, doc, collection, setDoc } = require("firebase/firestore");
const firebaseConfig = require("./firebaseconfig"); // Import the Firebase configuration
const app = express();
app.use(express.json());
app.use(cors());
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const port = 3100

const init = async () => {
    try {
        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });

    } catch (error) {
        console.log("🚀 ~ file: index.js:13 ~ init ~ error:", error)

    }
}
init()

const authorization = async (request, response, next) => {
    const token = request.headers["authorization"] && request.headers["authorization"].split(" ")[1];
    console.log("🚀 ~ file: express.js:33 ~ authorization ~ token:", token)
    try {
        let data = jwt.verify(token, "token");
        request.username = data.username;
        console.log("🚀 ~ file: express.js:37 ~ authorization ~ data:", data)
        console.log("🚀 ~ file: express.js:37 ~ authorization ~ request:", request.username)
        next();
    } catch (error) {
        response.status(401);
        response.send("unAuthorized");
    }
};

app.get("/users/", authorization, async (request, response) => {

    response.send("auth done");
});
app.post("/users/", async (request, response) => {
    const { username, password } = request.body;
    const hashedpassword = await bcrypt.hash(password, 10);
    const docRef = doc(db, "Users", username);
    const docSnap = await getDoc(docRef);
    let resumeData = docSnap.data();
    if (resumeData) {
        response.status(400);
        response.send({ result: "user already exist" })

    } else {
        const usersCollectionRef = collection(db, "Users");
        const userDocRef = doc(usersCollectionRef, username); // Replace 'userId' with your desired ID
        await setDoc(userDocRef, { username, name, hashedpassword, gender, location });
        response.status(201);
        response.send({ result: "user register sucessfully" })
    }
})

app.get("/hi/", async (request, response) => {
    response.status(200);
    response.send({ result: "request made successfully" })
})
app.post("/login/", async (request, response) => {
    const { username, password } = request.body;
    console.log("🚀 ~ file: index.js:54 ~ app.post ~ rquest.body:", request.body)
    const docRef = doc(db, "Users", username);
    const docSnap = await getDoc(docRef);
    const getUser = docSnap.data();
    console.log("🚀 ~ file: index.js:58 ~ app.post ~ getUser:", getUser)
    if (getUser) {
        console.log("user exist");
        const passwordMatch = await bcrypt.compare(password, getUser.hashedpassword);
        if (passwordMatch) {
            const payload = { username: getUser.username };
            const jwt_token = jwt.sign(payload, "token");

            response.status(200)
            response.send({ result: "loged in success", JWT: jwt_token })
        } else {
            response.status(401)
            response.send({ result: "wrong password" })
        }
    } else {
        response.status(404)
        response.send({ result: "user not found" })
    }


});