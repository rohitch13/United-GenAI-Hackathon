import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import fs from 'fs';
import path from 'path';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBlWHSZTflw67kCU2PyfiIuzUyvyuSOawg",
    authDomain: "adsp-34002-ip07-visionary-ai.firebaseapp.com",
    projectId: "adsp-34002-ip07-visionary-ai",
    storageBucket: "adsp-34002-ip07-visionary-ai.firebasestorage.app",
    messagingSenderId: "139431081773",
    appId: "1:139431081773:web:420dfd09d65abe7e0945a4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

const uploadImage = async () => {
    try {
        // Read the image file
        const imagePath = path.join(process.cwd(), 'Data', 'image', 'broken-tray.png');
        const imageBuffer = fs.readFileSync(imagePath);
        
        // Create a reference to the file in Firebase Storage
        const storageRef = ref(storage, 'report-images/broken-tray.png');
        
        // Upload the file
        console.log('Uploading image to Firebase Storage...');
        const snapshot = await uploadBytes(storageRef, imageBuffer, {
            contentType: 'image/png'
        });
        
        // Get the download URL
        const downloadURL = await getDownloadURL(snapshot.ref);
        console.log('Image uploaded successfully!');
        console.log('Download URL:', downloadURL);
        
        return downloadURL;
    } catch (error) {
        console.error('Error uploading image:', error);
        throw error;
    }
};

// Run the upload
uploadImage().then(() => {
    console.log('Upload script completed');
    process.exit(0);
}).catch((error) => {
    console.error('Upload script failed:', error);
    process.exit(1);
}); 