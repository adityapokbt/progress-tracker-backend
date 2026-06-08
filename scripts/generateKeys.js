const mongoose = require('mongoose');
const ProductKey = require('../models/ProductKey');
require('dotenv').config();

// Generate random product key
const generateProductKey = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = 'POS-';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) key += '-';
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
};

// Connect to MongoDB and generate keys
const generateKeys = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pos-saas');
    console.log('Connected to MongoDB');

    // Clear existing keys (optional)
    // await ProductKey.deleteMany({});
    // console.log('Cleared existing keys');

    const keys = [];
    const batchSize = 100;
    const totalKeys = 500;

    console.log(`Generating ${totalKeys} product keys...`);

    for (let i = 0; i < totalKeys; i++) {
      const key = generateProductKey();
      keys.push({
        key,
        createdBy: new mongoose.Types.ObjectId(), // dummy admin ID
        createdAt: new Date()
      });

      // Insert in batches to avoid memory issues
      if (keys.length === batchSize || i === totalKeys - 1) {
        await ProductKey.insertMany(keys);
        console.log(`Generated ${i + 1}/${totalKeys} keys`);
        keys.length = 0; // Clear the array
      }
    }

    console.log('✅ Successfully generated 500 product keys!');
    console.log('Keys are now available for signup.');

    // Display some sample keys
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