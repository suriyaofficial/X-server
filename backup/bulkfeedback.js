/**
 * bulk_feedback.js
 *
 * Usage:
 *   node bulk_feedback.js [endpoint] [count] [batchSize]
 *
 * Defaults:
 *   endpoint  -> http://localhost:3100/feedback/03486c78-5fe6-4c27-9d99
 *   count     -> 10000
 *   batchSize -> 200
 *
 * This script uses only built-in Node APIs and axios (small dependency).
 * Install axios first: npm i axios
 */

const axios = require('axios');

const DEFAULT_ENDPOINT = 'http://localhost:3100/feedback/03486c78-5fe6-4c27-9d99';
const endpoint = process.argv[2] || DEFAULT_ENDPOINT;
const TOTAL = parseInt(process.argv[3] || '10000', 10);
const BATCH_SIZE = parseInt(process.argv[4] || '200', 10);

const activityTypes = ['funDive', 'dsd', 'course'];

const normalComments = [
  'It was okay',
  'Decent experience',
  'Nothing special, but fine',
  'Average service',
  'Could be better'
];

const superComments = [
  'Absolutely amazing! Highly recommended!',
  'Best experience ever — instructors were awesome!',
  'Exceeded expectations, will come back again!',
  'Fantastic dive, superb staff and safety!',
  'Amazing day — learned a lot and had so much fun!'
];

function randInt(min, max) {
  // inclusive
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPhone() {
  // Indian-style 10-digit starting with 7,8 or 9
  const start = ['7','8','9'][randInt(0,2)];
  let s = start;
  for (let i=0;i<9;i++) s += String(randInt(0,9));
  return s;
}

function randomEmail(i) {
  // simple randomized email
  const domains = ['gmail.com','hotmail.com','yahoo.com','example.com','outlook.com'];
  const uname = `user${Date.now().toString().slice(-5)}${i}${Math.floor(Math.random()*9000+1000)}`;
  const domain = domains[randInt(0, domains.length - 1)];
  return `${uname}@${domain}`;
}

function randomFeedback(i) {
  const activity = activityTypes[randInt(0, activityTypes.length - 1)];
  const overall = randInt(3,5);

  // choose comments based on overall rating
  const comments = overall <= 3
    ? normalComments[randInt(0, normalComments.length - 1)]
    : superComments[randInt(0, superComments.length - 1)];

  // intrestedInOWC & knownSwimming only relevant for 'dsd' (can be true/false randomly)
  let intrestedInOWC = false;
  let knownSwimming = false;
  if (activity === 'dsd') {
    // ~50% true each
    intrestedInOWC = Math.random() < 0.5;
    knownSwimming = Math.random() < 0.5;
  }

  return {
    email: randomEmail(i),
    phoneNo: randomPhone(),
    activityType: activity,
    overAllExperience: overall,
    comments,
    intrestedInOWC,
    knownSwimming
  };
}

async function sendOne(payload) {
  try {
    const res = await axios.post(endpoint, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    return { success: true, status: res.status };
  } catch (err) {
    // return status for logging; do not throw to allow batch to continue
    return { success: false, error: err.message, status: err.response && err.response.status };
  }
}

(async function main() {
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Total: ${TOTAL}  Batch size: ${BATCH_SIZE}`);
  let sent = 0;
  let successCount = 0;
  let failCount = 0;

  // process in batches to avoid overwhelming the server
  for (let b = 0; b < Math.ceil(TOTAL / BATCH_SIZE); b++) {
    const batch = [];
    const start = b * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, TOTAL);
    for (let i = start; i < end; i++) {
      batch.push(randomFeedback(i));
    }

    // fire batch in parallel
    const promises = batch.map(p => sendOne(p));
    const results = await Promise.all(promises);

    results.forEach(r => {
      sent++;
      if (r.success) successCount++; else failCount++;
    });

    // simple progress log
    console.log(`Batch ${b+1}/${Math.ceil(TOTAL/BATCH_SIZE)} done — sent ${sent} (success ${successCount}, fail ${failCount})`);
  }

  console.log('All done.');
  console.log(`Total sent: ${sent}, Success: ${successCount}, Fail: ${failCount}`);
})();
