const mongoose = require('mongoose');

const paymentRecordSchema = new mongoose.Schema({
  billId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Bill', 
    required: true 
  },
  customerPhone: { 
    type: String, 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true,
    min: 0 
  },
  paymentMethod: { 
    type: String, 
    enum: ['cash', 'card', 'ewallet', 'credit'],
    required: true 
  },
  transactionId: { 
    type: String, 
    default: '' 
  },
  paymentDate: { 
    type: Date, 
    default: Date.now 
  },
  isPartial: { 
    type: Boolean, 
    default: false 
  },
  notes: String
}, {
  timestamps: true
});

// Indexes for better query performance
paymentRecordSchema.index({ customerPhone: 1 });
paymentRecordSchema.index({ billId: 1 });
paymentRecordSchema.index({ paymentDate: -1 });

module.exports = mongoose.model('PaymentRecord', paymentRecordSchema);