const mongoose = require('mongoose');
require('dotenv').config();

async function createIndexes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pos-saas');
    
    console.log('Creating indexes for better performance...');
    
    // Create indexes for SupplierTransaction
    await mongoose.connection.collection('suppliertransactions').createIndex({ 
      store: 1, 
      supplier: 1, 
      paymentDate: -1 
    });
    
    await mongoose.connection.collection('suppliertransactions').createIndex({ 
      store: 1, 
      paymentDate: -1 
    });
    
    await mongoose.connection.collection('suppliertransactions').createIndex({ 
      store: 1 
    });
    
    console.log('Indexes created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error creating indexes:', error);
    process.exit(1);
  }
}

createIndexes();