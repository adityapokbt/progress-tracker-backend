require('dotenv').config();
const { db } = require('../firebase');
const { writeBatch, collection, doc, getDocs, query, limit } = require('firebase/firestore');

const generateProductKey = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = 'POS';

  for (let i = 0; i < 3; i++) {
    let part = '';
    for (let j = 0; j < 4; j++) {
      part += chars[Math.floor(Math.random() * chars.length)];
    }
    key += '-' + part;
  }

  return key;
};

const generateKeys = async () => {
  try {
    const totalKeys = 500;
    const batchSize = 100;
    
    console.log('🚀 Generating 500 product keys...');
    console.log(`📊 Using Firebase Project: ${process.env.FIREBASE_PROJECT_ID}`);
    console.log(`📊 Firebase API Key exists: ${!!process.env.FIREBASE_API_KEY}`);

    let batch = writeBatch(db);
    let batchCount = 0;
    
    for (let i = 0; i < totalKeys; i++) {
      const key = generateProductKey();
      const docRef = doc(collection(db, 'productKeys'));
      
      batch.set(docRef, {
        key,
        createdBy: 'admin',
        createdAt: new Date(),
        isUsed: false
      });
      
      batchCount++;
      
      if (batchCount === batchSize || i === totalKeys - 1) {
        await batch.commit();
        console.log(`✓ Generated ${i + 1}/${totalKeys} keys`);
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    console.log('\n✅ SUCCESS: 500 product keys created!');
    
    // Display sample keys
    const q = query(collection(db, 'productKeys'), limit(5));
    const snapshot = await getDocs(q);
    console.log('\n📝 Sample product keys (first 5):');
    let index = 1;
    snapshot.forEach(doc => {
      console.log(`${index++}. ${doc.data().key}`);
    });
    
    console.log('\n🎉 Keys are ready! You can now use them for signup.');
    process.exit(0);

  } catch (err) {
    console.error('❌ Error generating keys:', err);
    process.exit(1);
  }
};

generateKeys();