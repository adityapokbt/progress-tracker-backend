// create-indexes.js (run this once)
const mongoose = require('mongoose');
require('dotenv').config();

async function createIndexes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Create indexes for Attendance collection
    await mongoose.connection.db.collection('attendances').createIndex({ 
      staff: 1, 
      date: 1, 
      user: 1 
    });
    
    await mongoose.connection.db.collection('attendances').createIndex({ 
      date: 1, 
      user: 1 
    });
    
    await mongoose.connection.db.collection('attendances').createIndex({ 
      user: 1, 
      status: 1 
    });
    
    // Create indexes for Staff collection
    await mongoose.connection.db.collection('staff').createIndex({ 
      email: 1, 
      user: 1 
    });
    
    await mongoose.connection.db.collection('staff').createIndex({ 
      phone: 1, 
      user: 1 
    });
    
    await mongoose.connection.db.collection('staff').createIndex({ 
      user: 1, 
      isActive: 1 
    });
    
    console.log('Indexes created successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error creating indexes:', error);
    process.exit(1);
  }
}

createIndexes();