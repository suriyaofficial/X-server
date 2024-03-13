const express = require('express');
const bodyParser = require('body-parser');
const path = require('path')
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const cors = require("cors");
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, collection } = require('@firebase/firestore');
const firebaseConfig = require('./firebaseconfig');
const http = require('http');
const socketIo = require('socket.io');

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
    }
});

io.on('connection', (socket) => {
    console.log('A user connected');

    // Listen for messages from the client
    // Disconnect event
    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

server.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}`);
});

// ... rest of your code ...



app.get('/', function (req, res) {
    let option = { root: path.join(__dirname) }
    let fileName = 'index.html'
    res.sendFile(fileName, option)
})
const authorization = (req, res, next) => {
    // console.log("🚀 ~ file: app.js:32 ~ authorization ~ req:")
    // console.log("🚀 ~ file: app.js:32 ~ authorization ~ req:", req.headers.authorization)
    const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
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

app.post('/add/device/', authorization, async (req, res) => {
    const NewDeviceName = req.body.deviceName;
    const uuid = await uuidv4()
    const docRef = doc(db, 'Users', req.username);
    const docSnap = await getDoc(docRef);
    const currentData = docSnap.exists() ? docSnap.data() : {};
    const getUser = currentData.device || [];
    const deviceNameExist = getUser.some(device => device.deviceName === NewDeviceName);
    if (deviceNameExist) {
        res.status(409).json({
            "error": "Device Name already exists",
            "message": `The device with name ${NewDeviceName} already exists in the system.`
        });
    } else {
        let newDevice = { "deviceName": NewDeviceName, "deviceId": uuid, "status": false }
        const updatedDevices = [...getUser, newDevice];
        const usersCollectionRef = collection(db, 'Users');
        const userDocRef = doc(usersCollectionRef, req.username);
        await setDoc(userDocRef, { ...currentData, "device": updatedDevices });
        res.status(201).json({ result: "created" });
    }
});
app.get('/getStatus/', authorization, async (req, res) => {
    const docRef = doc(db, 'Users', req.username);
    const docSnap = await getDoc(docRef);
    const currentData = docSnap.exists() ? docSnap.data() : {};
    const getUser = currentData.device || [];
    res.status(200).json({ getUser });
    // io.emit('message', true);


});
app.post('/userNameCheck/', async (req, res) => {
    const { username } = req.body;
    console.log("🚀 ~ file: app.js:141 ~ app.post ~ username:", username)
    const docRef = doc(db, 'Users', username);
    const docSnap = await getDoc(docRef);
    const existingUser = docSnap.data();
    if (existingUser) {
        res.status(400).json({ result: 'user already exists' });
    } else {
        res.status(201).json({ result: 'username availble' });
    }
});
app.put('/control/device/', authorization, async (req, res) => {
    const { id, status } = req.body;
    const docRef = doc(db, 'Users', req.username);
    const docSnap = await getDoc(docRef);
    let Data = docSnap.data()
    const newData = { ...Data };
    const deviceToUpdate = newData.device.find(device => device.deviceId === id);
    if (deviceToUpdate) {
        console.log("🚀 ~ file: app.js:106 ~ app.put ~ deviceToUpdate:")
        deviceToUpdate.status = status;
        await setDoc(docRef, newData);
        res.status(200).json({ result: "changed" });
        io.emit('message', `chanage`);
    } else {
        res.status(404).json({ result: "device Id not found" });
    }
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
    const docRef = doc(db, 'Users', username);
    const docSnap = await getDoc(docRef);
    const existingUser = docSnap.data();
    if (existingUser) {
        res.status(400).json({ result: 'user already exists' });
    } else {
        const usersCollectionRef = collection(db, 'Users');
        const userDocRef = doc(usersCollectionRef, username);
        await setDoc(userDocRef, {
            username, hashedpassword, "device": [{ "deviceName": "light1", "deviceId": uuid, "status": false }]
        });
        res.status(201).json({ result: 'user registered successfully' });
    }
});

app.use((req, res) => {
    res.status(200).send('server running---ok');
});


app.get('/weather/', authorization, (req, res) => {
    res.status(200).send(`Hi! ${req.username} Today's weather is cloudy.`);
});

app.get('/msg/', authorization, (req, res) => {
    res.status(200).send(`Hi! greeting ${req.username}`);
    console.log("🚀 ~ file: app.js:145 ~ app.get ~ req.username:", req.username)
});

app.post('/createPost/', async (req, res) => {
    const { username, body } = req.body;
    // get data//
    const docRef = doc(db, 'Post', "posts");
    const docSnap = await getDoc(docRef);
    let Data = docSnap.data();
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