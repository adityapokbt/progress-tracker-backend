const admin = require('firebase-admin');

// Initialize Firebase Admin SDK for production (Render only)
if (!admin.apps.length) {
  try {
    // Parse service account from Render environment variable
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
    
    console.log('✅ Firebase Admin SDK initialized successfully on Render');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
    console.error('Make sure FIREBASE_SERVICE_ACCOUNT environment variable is set correctly');
    process.exit(1); // Exit if Firebase fails to initialize
  }
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { db, auth, admin };