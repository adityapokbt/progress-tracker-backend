const { db } = require('../firebase');

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
    
    console.log('🚀 Starting product key generation on Render...');
    console.log(`📊 Total keys to generate: ${totalKeys}`);

    let batch = db.batch();
    let batchCount = 0;
    
    for (let i = 0; i < totalKeys; i++) {
      const key = generateProductKey();
      const docRef = db.collection('productKeys').doc();
      
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
        batch = db.batch();
        batchCount = 0;
      }
    }

    console.log('\n✅ SUCCESS: 500 product keys created successfully!');
    
    // Display sample keys
    const snapshot = await db.collection('productKeys').limit(5).get();
    console.log('\n📝 Sample product keys (first 5):');
    let index = 1;
    snapshot.forEach(doc => {
      console.log(`${index++}. ${doc.data().key}`);
    });
    
    console.log('\n🎉 Keys are ready for user signup!');
    process.exit(0);

  } catch (err) {
    console.error('❌ Error generating keys:', err);
    process.exit(1);
  }
};

generateKeys();