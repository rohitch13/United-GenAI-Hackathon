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
const collectionName = 'report-messages'; // The Firestore collection to import data into

console.log(`Starting CSV import to collection: ${collectionName}`);

const results = [];
fs.createReadStream('Data/report-messages.csv')
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', () => {
    results.forEach(row => {
      const docId = row['message_id'];
      if (docId) {
        // The rest of the row becomes the document data
        const data = {
          chat_id: row['chat_id'] || '',
          text: row['text'] || '',
          sender: row['sender'] || '',
          timestamp: new Date(row['timestamp']),
          images: null,
        };
        
        // Handle images field with proper error handling
        if (row['images'] && row['images'].trim() !== '') {
          try {
            // Clean up the JSON string - replace escaped quotes
            const cleanJson = row['images'].replace(/\\"/g, '"').replace(/^"|"$/g, '');
            data.images = JSON.parse(cleanJson);
          } catch (error) {
            console.warn(`Failed to parse images JSON for message ${docId}:`, error);
            data.images = null;
          }
        }

        db.collection(collectionName).doc(docId).set(data)
          .then(() => {
            console.log(`Message document ${docId} successfully written!`);
          })
          .catch((error) => {
            console.error(`Error writing message document ${docId}: `, error);
          });
      }
    });
    console.log('Report-messages CSV file successfully processed.');
  }); 