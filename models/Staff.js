// backend/models/Staff.js
const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Staff name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
  },
  address: {
    temporary: String,
    permanent: {
      type: String,
      required: [true, 'Permanent address is required']
    }
  },
  position: {
    type: String,
    required: [true, 'Position is required'],
    enum: ['Store Manager', 'Sales Associate', 'Cashier', 'Inventory Manager', 'Visual Merchandiser', 'Security Guard', 'Cleaner']
  },
  salary: {
    type: Number,
    required: [true, 'Salary is required'],
    min: [0, 'Salary cannot be negative']
  },
  joinDate: {
    type: Date,
    default: Date.now
  },
  dateOfBirth: {
    type: Date,
    required: [true, 'Date of birth is required']
  },
  citizenshipNo: {
    type: String,
    required: [true, 'Citizenship number is required']
  },
  panNo: {
    type: String,
    required: [true, 'PAN number is required']
  },
  bankAccount: {
    bankName: String,
    accountNo: {
      type: String,
      required: [true, 'Bank account number is required']
    }
  },
  emergencyContact: {
    name: {
      type: String,
      required: [true, 'Emergency contact name is required']
    },
    relation: {
      type: String,
      required: [true, 'Emergency contact relation is required']
    },
    phone: {
      type: String,
      required: [true, 'Emergency contact phone is required'],
      match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
    }
  },
  // Changed from store to user reference
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Index for better query performance
staffSchema.index({ user: 1, email: 1 }, { unique: true });
staffSchema.index({ user: 1, status: 1 });
staffSchema.index({ position: 1 });

// Virtual for age calculation
staffSchema.virtual('age').get(function() {
  return Math.floor((Date.now() - this.dateOfBirth) / (365.25 * 24 * 60 * 60 * 1000));
});

module.exports = mongoose.model('Staff', staffSchema);