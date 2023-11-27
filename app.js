const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, collection } = require('@firebase/firestore');
const firebaseConfig = require('./firebaseconfig');

const app = express();
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
    res.status(200).send('Hi! greeting');
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

    const docRef = doc(db, 'Users', username);
    const docSnap = await getDoc(docRef);
    const existingUser = docSnap.data();

    if (existingUser) {
        res.status(400).json({ result: 'user already exists' });
    } else {
        const usersCollectionRef = collection(db, 'Users');
        const userDocRef = doc(usersCollectionRef, username);

        await setDoc(userDocRef, { username, hashedpassword });

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
app.use((req, res) => {
    res.status(200).send('server running---ok');
});

app.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}/`);
});
