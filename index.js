const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { initializeApp } = require("firebase/app");
const { getFirestore } = require("@firebase/firestore");
const { getDoc, doc, collection, setDoc } = require("firebase/firestore");
const firebaseConfig = require("./firebaseconfig"); // Import the Firebase configuration
const http = require('http')
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const hostname = '0.0.0.0';
const port = 3100

const authorization = async (req, res, next) => {
    const token = req.headers["authorization"] && req.headers["authorization"].split(" ")[1];
    console.log("🚀 ~ file: index.js:15 ~ authorization ~ req.headers:", req.headers)
    console.log("🚀 ~ file: index.js:15 ~ authorization ~ token:", token)

    try {
        if (token) {
            let data = jwt.verify(token, "token");
            req.username = data.username;
            next();
        } else {
            throw new Error("Token not provided");
        }
    } catch (error) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: "Unauthorized" }));

    }
};

const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/weather/') {
        authorization(req, res, async () => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/plain');
            res.end(`Hi! ${req.username}Today\'s weather is cloudy.`);
        });
    }
    else if (req.method === 'GET' && req.url === '/msg/') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Hi! greeting');
    }
    else if (req.method === 'POST' && req.url === '/login/') {

        let data = '';

        // Receive data from the request
        req.on('data', chunk => {
            data += chunk;
        });

        // Process data when the request ends
        req.on('end', async () => {
            const jsonData = JSON.parse(data);
            console.log("🚀 ~ file: index.js:55 ~ req.on ~ jsonData:", jsonData)

            // Extract the username and password
            const username = jsonData.username;
            console.log("🚀 ~ file: index.js:59 ~ req.on ~ username:", username)
            const password = jsonData.password;
            console.log("🚀 ~ file: index.js:61 ~ req.on ~ password:", password)
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

                    res.statusCode = 200
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ result: "loged in success", JWT: jwt_token }))
                } else {
                    res.statusCode = 401
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ result: "wrong password" }))
                }
            } else {
                res.statusCode = 404
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ result: "user not found" }))
            }
        });
    }
    else if (req.method === 'POST' && req.url === '/register/') {
        let data = '';

        // Receive data from the request
        req.on('data', chunk => {
            data += chunk;
        });

        // Process data when the request ends
        req.on('end', async () => {
            const jsonData = JSON.parse(data);

            // Extract necessary information from the request body
            const { username, password, } = jsonData;
            const hashedpassword = await bcrypt.hash(password, 10);

            // Check if the user already exists
            const docRef = doc(db, "Users", username);
            const docSnap = await getDoc(docRef);
            const existingUser = docSnap.data();

            if (existingUser) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ result: "user already exists" }));
            } else {
                // User does not exist, proceed with registration
                const usersCollectionRef = collection(db, "Users");
                const userDocRef = doc(usersCollectionRef, username);

                // Set user data in the database
                await setDoc(userDocRef, { username, hashedpassword });

                res.statusCode = 201;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ result: "user registered successfully" }));
            }
        });

    }
    else {
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/plain')
        res.end('server running---ok ')
    }

})

server.listen(port, () => {
    console.log(`🚀 Server is running on  http://${hostname}:${port}/`)
})
