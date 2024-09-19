const express = require('express');
const bodyParser = require('body-parser');
const path = require('path')
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const cors = require("cors");
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, collection, getDocs } = require('@firebase/firestore');
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
    // console.log('A user connected');

    // Listen for messages from the client
    // Disconnect event
    socket.on('disconnect', (msg) => {
        console.log("🚀 ~ file: chat.js:33 ~ socket.on ~ msg:", msg)
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
    const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
    // console.log("🚀 ~ file: chat.js:52 ~ authorization ~ token:", token)
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

app.post('/userNameCheck/', async (req, res) => {
    const { username } = req.body;
    console.log("🚀 ~ file: app.js:141 ~ app.post ~ username:", username)
    const docRef = doc(db, 'chatAppUser', username);
    const docSnap = await getDoc(docRef);
    const existingUser = docSnap.data();
    if (existingUser) {
        res.status(400).json({ result: 'user already exists' });
    } else {
        res.status(201).json({ result: 'username availble' });
    }
});
app.post('/login/', async (req, res) => {
    const { username, password } = req.body;
    const docRef = doc(db, 'chatAppUser', username);
    const docSnap = await getDoc(docRef);
    const getUser = docSnap.data();
    console.log("🚀 ~ file: chat.js:85 ~ app.post ~ getUser:", getUser)
    if (getUser) {
        const passwordMatch = await bcrypt.compare(password, getUser.hashedpassword);
        if (passwordMatch) {
            const payload = { username: getUser.username };
            const jwt_token = jwt.sign(payload, 'token');
            getUser.active = true
            console.log("🚀 ~ file: chat.js:91 ~ app.post ~ getUser:", getUser)
            await setDoc(docRef, { ...getUser });
            res.status(200).json({ result: 'logged in successfully', username: username, JWT: jwt_token });
            io.emit('message', `active`);
        } else {
            res.status(401).json({ result: 'wrong password' });
        }
    } else {
        res.status(404).json({ result: 'user not found' });
    }
});

app.post('/logout/', authorization, async (req, res) => {
    const docRef = doc(db, 'chatAppUser', req.username);
    const docSnap = await getDoc(docRef);
    const getUser = docSnap.data();
    getUser.active = false
    await setDoc(docRef, { ...getUser });
    res.status(200).json({ result: 'logged out successfully' });
    io.emit('message', `active`);
});
app.get('/activeuser/', authorization, async (req, res) => {
    const querySnapshot = await getDocs(collection(db, "chatAppUser"));
    let alluser = []
    querySnapshot.forEach((doc) => {
        if (doc.data().username != req.username) {
            data = { username: doc.data().username, active: doc.data().active }
            alluser.push(data)
        }
    });
    res.status(200).json(alluser);

});
app.get('/typing/', authorization, async (req, res) => {
    console.log("typing............................");
    io.emit('typing', `${req.username} is typing....`);
    res.status(200).json();

});
app.post('/register/', async (req, res) => {
    const { username, password } = req.body;
    const hashedpassword = await bcrypt.hash(password, 10);
    const docRef = doc(db, 'chatAppUser', username);
    const docSnap = await getDoc(docRef);
    const existingUser = docSnap.data();
    if (existingUser) {
        res.status(400).json({ result: 'user already exists' });
    } else {
        const usersCollectionRef = collection(db, 'chatAppUser');
        const userDocRef = doc(usersCollectionRef, username);
        await setDoc(userDocRef, { username, hashedpassword, active: false });
        res.status(201).json({ result: 'user registered successfully' });
    }
});

app.get('/getStatus/', authorization, async (req, res) => {
    // console.log("🚀 ~ file: chat.js:115 ~ app.get ~ res:", res)
    const docRef = doc(db, 'chatRoom', 'general');
    const docSnap = await getDoc(docRef);
    const currentData = docSnap.exists() ? docSnap.data() : {};
    const chatRoom = currentData.content || [];
    // console.log("🚀 ~ file: chat.js:124 ~ app.get ~ getUser:", getUser)
    res.status(200).json({ chatRoom });
    // io.emit('message', true);


});


app.post('/send/', authorization, async (req, res) => {
    const NewMsg = req.body.msg;
    const uuid = await uuidv4()
    const docRef = doc(db, 'chatRoom', 'general');
    // console.log("🚀 ~ file: chat.js:136 ~ app.post ~ req.username:", req.username)
    const docSnap = await getDoc(docRef);
    const currentData = docSnap.exists() ? docSnap.data() : {};
    // console.log("🚀 ~ file: chat.js:139 ~ app.post ~ currentData:", currentData)
    const getUser = currentData.content || [];
    let newMsgData = { "msg_Id": uuid, "msg": NewMsg, "user_name": req.username }
    const updatedMsgData = [...getUser, newMsgData];
    const usersCollectionRef = collection(db, 'chatRoom');
    const userDocRef = doc(usersCollectionRef, 'general');
    await setDoc(userDocRef, { ...currentData, "content": updatedMsgData });
    res.status(201).json({ result: "created" });
    io.emit('message', `send_Successfully`);

    // }
});
// app.use((req, res) => {
//     res.status(200).send('server running---ok');
// });
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
});


