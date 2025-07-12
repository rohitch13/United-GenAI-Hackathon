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
const collectionName = 'inspectors'; // The Firestore collection to import data into

console.log(`Starting CSV import to collection: ${collectionName}`);

const results = [];
fs.createReadStream('Data/aircraft_inspection_assignments.csv')
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', () => {
    results.forEach(row => {
      const docId = row['Inspector ID'];
      if (docId) {
        // The rest of the row becomes the document data
        const data = {
            inspector_name: row['Inspector Name'] || '',
            inspector_id: row['Inspector ID'] || '',
            aircraft_id: row['Aircraft ID'] || '',
            date_assigned: row['Date Assigned'] || '',
            shift: row['Shift'] || '',
            inspection_zone: row['Inspection Zone'] || '',
            location: row['Location'] || '',
        };

        db.collection(collectionName).doc(docId).set(data)
          .then(() => {
            console.log(`Document ${docId} successfully written!`);
          })
          .catch((error) => {
            console.error(`Error writing document ${docId}: `, error);
          });
      }
    });
    console.log('CSV file successfully processed.');
  }); 