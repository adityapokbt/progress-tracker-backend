// supplierTransaction model (no changes needed, provided for completeness)
const mongoose = require('mongoose');

const supplierTransactionSchema = new mongoose.Schema({
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  purchaseOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder'
  },
  type: {
    type: String,
    enum: ['Payment', 'Credit', 'Refund', 'Advance'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  },
paymentMode: {
  type: String,
  enum: ['Cash', 'Bank Transfer', 'Esewa', 'Khalti', 'ConnectIPS', 'Cheque', ''],
  default: ''
},
  paymentDate: {
    type: Date,
    default: Date.now
  },
  referenceNumber: {
    type: String
  },
  description: {
    type: String
  },
  
  // Store Reference
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
supplierTransactionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('SupplierTransaction', supplierTransactionSchema);