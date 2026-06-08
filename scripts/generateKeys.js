const ProductKey = require('../models/ProductKey');
require('dotenv').config();

const generateProductKey = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = 'POS-';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) key += '-';
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
};

const generateKeys = async () => {
  try {
    console.log('Using Firebase Firestore');

    const keys = [];
    const batchSize = 100;
    const totalKeys = 500;

    console.log(`Generating ${totalKeys} product keys...`);

    for (let i = 0; i < totalKeys; i++) {
      keys.push({
        key: generateProductKey(),
        createdBy: 'admin',
        createdAt: new Date(),
        isUsed: false,
      });

      if (keys.length === batchSize || i === totalKeys - 1) {
        await ProductKey.insertMany(keys);
        console.log(`Generated ${i + 1}/${totalKeys} keys`);
        keys.length = 0;
      }
    }

    console.log('Successfully generated 500 product keys!');
    console.log('Keys are now available for signup.');

    const sampleKeys = await ProductKey.find().limit(5);
    console.log('\nSample product keys:');
    sampleKeys.forEach((key, index) => {
      console.log(`${index + 1}. ${key.key}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error generating keys:', error);
    process.exit(1);
  }
};

generateKeys();
