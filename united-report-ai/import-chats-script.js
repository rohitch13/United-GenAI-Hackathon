const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-parser');

// --- IMPORTANT ---
// 1. Download your service account key JSON file from your Firebase project settings.
//    (Project Settings -> Service accounts -> Generate new private key)
// 2. Place the downloaded file in this same directory.
const serviceAccount = require('./adsp-34002-ip07-visionary-ai-firebase-adminsdk-fbsvc-993035b8fb.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const collectionName = 'report-chats'; // The Firestore collection to import data into

console.log(`Starting CSV import to collection: ${collectionName}`);

const results = [];
fs.createReadStream('Data/report-chats.csv')
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', () => {
    results.forEach(row => {
      const docId = row['chat_id'];
      if (docId) {
        // The rest of the row becomes the document data
        const data = {
            report_id: row['report_id'] || '',
            last_message: row['last_message'] || '',
            last_message_time: new Date(row['last_message_time']),
            message_count: parseInt(row['message_count']) || 0,
            created_at: new Date(row['created_at']),
        };

        db.collection(collectionName).doc(docId).set(data)
          .then(() => {
            console.log(`Chat document ${docId} successfully written!`);
          })
          .catch((error) => {
            console.error(`Error writing chat document ${docId}: `, error);
          });
      }
    });
    console.log('Report-chats CSV file successfully processed.');
  }); 