const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { initializeApp } = require("firebase/app");
const { getFirestore } = require("@firebase/firestore");
const { getDoc, doc, collection, setDoc } = require("firebase/firestore");
const firebaseConfig = require("./firebaseconfig"); // Import the Firebase configuration
const http = require('http')
const app = express();
app.use(express.json());
app.use(cors());





const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const PORT = process.env.PORT || 3100;
const hostname = '0.0.0.0';
const port = 3100

// init()
// const init = async () => {
//     try {
//         app.listen(PORT, () => {
//             console.log(`Server is running on port ${PORT}`);
//         });

//     } catch (error) {
//         console.log("🚀 ~ file: index.js:13 ~ init ~ error:", error)

//     }
// }

const server = http.createServer((req, res) => {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('server running---ok ')
})

server.listen(port, hostname, () => {
    console.log(`🚀 Server is running on  http://${hostname}:${port}/`)
})
app.post("/users/", async (request, response) => {
    const { username, name, password, gender, location } = request.body;
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

server.post("/login/", async (request, response) => {
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