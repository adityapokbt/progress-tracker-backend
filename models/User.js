const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 100
  },
  phoneNumber: { 
    type: String, 
    required: true,
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6
  },
  storeName: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 100
  },
  storeType: { 
    type: String, 
    enum: ['Clothing', 'Footwear', 'General', 'Electronics', 'Grocery', 'Hardware', 'Restaurant', 'Pharmacy', 'Other'],
    required: true
  },
  address: {
    province: { type: String, required: true },
    district: { type: String, required: true },
    municipality: { type: String, required: true },
    wardNo: { type: Number, required: true },
    street: { type: String, required: true }
  },
  panVatNumber: { 
    type: String, 
    trim: true,
    maxlength: 20
  },
  productKey: {
    type: String,
    required: true,
    unique: true
  },
  isProductKeyUsed: {
    type: Boolean,
    default: true
  },
  
  // OTP fields
  resetPasswordOTP: {
    type: String,
    select: false
  },
  resetPasswordExpires: {
    type: Date,
    select: false
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

userSchema.pre('save', async function(next) {
  // Only hash the password if it's modified (or new)
  if (!this.isModified('password')) return next();
  
  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.correctPassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model('User', userSchema);