const ProductKey = require('../models/ProductKey');
require('dotenv').config();

const verifyKeys = async () => {
  try {
    const totalKeys = await ProductKey.countDocuments();
    const unusedKeys = await ProductKey.countDocuments({ isUsed: false });
    const usedKeys = await ProductKey.countDocuments({ isUsed: true });

    console.log('Product Key Statistics:');
    console.log(`Total keys: ${totalKeys}`);
    console.log(`Unused keys: ${unusedKeys}`);
    console.log(`Used keys: ${usedKeys}`);

    const sampleUnusedKeys = await ProductKey.find({ isUsed: false }).limit(10);
    console.log('\nSample unused keys:');
    sampleUnusedKeys.forEach((key, index) => {
      console.log(`${index + 1}. ${key.key}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error verifying keys:', error);
    process.exit(1);
  }
};

verifyKeys();
