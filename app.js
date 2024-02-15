const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const cors = require("cors");

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, collection } = require('@firebase/firestore');
const firebaseConfig = require('./firebaseconfig');

const app = express();
// app.use(express.json());
app.use(cors());
const port = 3100;

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

app.use(bodyParser.json());

const authorization = (req, res, next) => {
    const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
    console.log('🚀 ~ authorization ~ token:', token);
    try {
        if (token) {
            let data = jwt.verify(token, 'token');
            req.username = data.username;
            next();
        } else {
            throw new Error('Token not provided');
        }
    } catch (error) {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

app.get('/weather/', authorization, (req, res) => {
    res.status(200).send(`Hi! ${req.username} Today's weather is cloudy.`);
});

app.get('/msg/', authorization, (req, res) => {
    res.status(200).send(`Hi! greeting ${req.username}`);
});

app.post('/add/device/', authorization, async (req, res) => {
    console.log("🚀 ~ file: app.js:47 ~ app.post ~ req.body:", req.body)
    const deviceName = req.body;
    const docRef = doc(db, 'Users', req.username);
    const docSnap = await getDoc(docRef);
    const getUser = docSnap.data();
    console.log("🚀 ~ file: app.js:52 ~ app.post ~ getUser:", getUser)
    const deviceNameExist = getUser.device.some(device => device.deviceName === deviceName);
    let data
    if (deviceNameExist) {
        console.log("🚀 ~ if", deviceNameExist)
        data = { "isThere": true }

    } else {
        console.log("🚀 ~ else", deviceNameExist)
        data = { "isThere": false }

    }

    res.status(200).json({ result: data });

});
app.post('/login/', async (req, res) => {
    const { username, password } = req.body;

    const docRef = doc(db, 'Users', username);
    const docSnap = await getDoc(docRef);
    const getUser = docSnap.data();

    if (getUser) {
        const passwordMatch = await bcrypt.compare(password, getUser.hashedpassword);
        if (passwordMatch) {
            const payload = { username: getUser.username };
            const jwt_token = jwt.sign(payload, 'token');

            res.status(200).json({ result: 'logged in successfully', JWT: jwt_token });
        } else {
            res.status(401).json({ result: 'wrong password' });
        }
    } else {
        res.status(404).json({ result: 'user not found' });
    }
});

app.post('/register/', async (req, res) => {
    const { username, password } = req.body;
    const hashedpassword = await bcrypt.hash(password, 10);
    const uuid = await uuidv4()
    console.log("🚀 ~ file: app.js:93 ~ app.post ~ uuid:", uuid)

    const docRef = doc(db, 'Users', username);
    const docSnap = await getDoc(docRef);
    const existingUser = docSnap.data();

    if (existingUser) {
        res.status(400).json({ result: 'user already exists' });
    } else {
        const usersCollectionRef = collection(db, 'Users');
        const userDocRef = doc(usersCollectionRef, username);
        console.log("🚀 ~ file: app.js:101 ~ app.post ~ userDocRef:", userDocRef)

        await setDoc(userDocRef, {
            username, hashedpassword, "device": [{ "deviceName": "light1", "deviceId": uuid, "status": false }]
        });

        res.status(201).json({ result: 'user registered successfully' });
    }
});
app.post('/userNameCheck/', async (req, res) => {
    console.log("🚀 ~ file: app.js:85 ~ app.post ~ req:")
    const { username } = req.body;
    const docRef = doc(db, 'Users', username);
    const docSnap = await getDoc(docRef);
    const existingUser = docSnap.data();
    if (existingUser) {
        res.status(400).json({ result: 'user already exists' });
    } else {
        res.status(201).json({ result: 'username availble' });
    }
});
app.post('/createPost/', async (req, res) => {
    console.log("🚀 ~ file: app.js:85 ~ app.post ~ req:")
    const { username, body } = req.body;
    // get data//
    const docRef = doc(db, 'Post', "posts");
    const docSnap = await getDoc(docRef);
    let Data = docSnap.data();
    console.log("🚀 ~ file: app.js:104 ~ app.post ~ docSnap:", Data.all)
    let existingData = Data.all
    let newData = {
        "userId": 123,
        "postId": existingData.length + 1,
        "body": "quia et suscipit\nsuscipit recusandae consequuntur expedita et cum\nreprehenderit molestiae ut ut quas totam\nnostrum rerum est autem sunt rem eveniet architecto"
    }
    // Add more objects as needed
    const combinedData = [...existingData, newData];

    // // set data//
    const usersCollectionRef = collection(db, 'Post');
    const userDocRef = doc(usersCollectionRef, "posts");
    await setDoc(userDocRef, { "all": combinedData }, { merge: true });

    // const existingUser = docSnap.data();
    // if (existingUser) {
    //     res.status(400).json({ result: 'user already exists' });
    // } else {
    //     res.status(201).json({ result: 'username availble' });
    // }
});
app.use((req, res) => {
    res.status(200).send('server running---ok');
});

app.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}/`);
});
