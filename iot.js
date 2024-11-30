const express = require('express');
const WebSocket = require('ws'); 
const bodyParser = require('body-parser');
const path = require('path')
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const cors = require("cors");
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, collection } = require('@firebase/firestore');
const firebaseConfig = require('./firebaseconfig_iot');
const http = require('http');

const app = express();
app.use(cors()); // Enable CORS for all routes

const port = 3100;
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Pending feedback tracker
const pendingFeedback = new Map();

wss.on('headers', async (headers, req) => {
    console.log("Connection initiated with headers:", headers);
});

wss.on('connection', async (ws, req) => {
    // Extract headers from the request
    const zapId = req.headers['zapID']; // Assuming 'zapId' is the header name
    const apiKey = req.headers['apiKey'];     // Assuming 'apikey' is the header name

    if (!zapId || !apiKey) {
        console.log('Connection failed: Missing zapId or apiKey.');
        ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized: Missing zapId or apiKey.' }));
        ws.close();
        return;
    }
    if(apiKey!="ak12al12aksl1"){
        console.log('Connection failed: wrong  apiKey.');
        ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized: wrong  apiKey.' }));
        ws.close();
        return;
    }

    console.log(`Received connection request: zapId=${zapId}, apiKey=${apiKey}`);

    // // Validate zapId and apiKey against Firebase Firestore
    // const docRef = doc(db, 'Devices', zapId);
    // const docSnap = await getDoc(docRef);

    // if (!docSnap.exists() || docSnap.data().apiKey !== apiKey) {
    //     console.log('Connection failed: Invalid zapId or apiKey.');
    //     ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized: Invalid zapId or apiKey.' }));
    //     ws.close();
    //     return;
    // }

    // console.log(`Device ${zapId} authenticated successfully.`);
    // ws.send(JSON.stringify({ type: 'verified', message: 'Connection verified' }));

    // Handle incoming messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'feedback') {
                console.log(`Feedback received: ${JSON.stringify(data)}`);
            } else {
                console.log(`Message received: ${JSON.stringify(data)}`);
            }
        } catch (err) {
            console.error('Error parsing WebSocket message:', err.message);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format.' }));
        }
    });

    // Handle disconnection
    ws.on('close', () => {
        console.log(`Device ${zapId} disconnected.`);
    });
});



server.listen(port, () => {
    console.log(`🚀 -Server is running on http://localhost:${port}`);
});

// ... rest of your code ...



app.get('/', function (req, res) {
    let option = { root: path.join(__dirname) }
    let fileName = 'index.html'
    res.sendFile(fileName, option)
})
const authorization = (req, res, next) => {
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
    const userData = docSnap.data();

    if (!userData) {
        return res.status(404).json({ result: "User not found" });
    }

    const deviceToUpdate = userData.device.find(device => device.deviceId === id);
    if (!deviceToUpdate) {
        return res.status(404).json({ result: "Device not found" });
    }

    // Update device status in database
    deviceToUpdate.status = status;
    await setDoc(docRef, userData);

    // Emit the message to the ESP
    const message = JSON.stringify({ zapId:"zap_8_1711",deviceId: id, status });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });

    pendingFeedback.set(id, { status, retries: 0 }); // Track pending feedback

    // Retry mechanism
    const retryInterval = setInterval(async () => {
        if (pendingFeedback.has(id)) {
            const feedbackData = pendingFeedback.get(id);
            if (feedbackData.retries >= 5) { // Retry up to 5 times
                console.log(`Failed to get feedback for device ${id}`);
                pendingFeedback.delete(id);
                clearInterval(retryInterval);
            } else {
                feedbackData.retries++;
                console.log(`Retrying command for device ${id}`);
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(message);
                    }
                });
            }
        } else {
            clearInterval(retryInterval);
        }
    }, 5000);

    res.status(200).json({ result: "Command sent, awaiting feedback" });
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

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
});


app.get('/weather/', authorization, (req, res) => {
    res.status(200).send(`Hi! ${req.username} Today's weather is cloudy.`);
});

app.get('/msg/', authorization, (req, res) => {
    res.status(200).send(`Hi! greeting ${req.username}`);
    console.log("🚀 ~ file: app.js:145 ~ app.get ~ req.username:", req.username)
});

app.get('/webhook', (req, res) => {
    console.log("🚀 ~ file: app.js:218 ~ app.get ~ req, res:", req.query)
    // res.status(200).send({ "status": "ok" });
    res.status(200).send(req.query);
});