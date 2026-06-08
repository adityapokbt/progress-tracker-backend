const mongoose = require('mongoose');

const billItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  nepaliName: String,
  sku: String,
  barcode: String,
  price: { type: Number, required: true, min: 0 },
  originalPrice: Number,
  quantity: { type: Number, required: true, min: 1 },
  size: String,
  color: String,
  image: String,
  stockAtTimeOfSale: Number,
  editablePrice: Boolean,
  remarks: String // Added to support remarks for free items
});

const paymentMethodSchema = new mongoose.Schema({
  method: { 
    type: String, 
    enum: ['cash', 'card', 'ewallet', 'credit'], 
    required: true 
  },
  amount: { type: Number, required: true, min: 0 },
  transactionId: String // Optional transaction ID for card/ewallet payments
});

const paymentSchema = new mongoose.Schema({
  type: { type: String, enum: ['single', 'split'], required: true },
  methods: [paymentMethodSchema], // Array of payment methods
  totalPaid: { type: Number, required: true, min: 0 },
  change: { type: Number, default: 0, min: 0 },
  outstandingAmount: { type: Number, default: 0, min: 0 }
});

const billSchema = new mongoose.Schema({
  billNumber: { type: Number, required: true, unique: true },
  nepaliDate: { type: String, required: true },
  items: [billItemSchema],
  customer: {
    id: String,
    name: String,
    phone: String
  },
  subtotal: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  payment: paymentSchema,
  vatEnabled: { type: Boolean, default: false },
  vatRate: { type: Number, default: 0, min: 0 },
  shopName: String,
  shopInfo: {
    name: String,
    address: String,
    phone: String,
    contactNumber: String,
    email: String,
    facebook: String,
    youtube: String,
    tiktok: String,
    instagram: String
  },
  qrCodeContent: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for better query performance
billSchema.index({ billNumber: 1 });
billSchema.index({ createdAt: -1 });
billSchema.index({ 'customer.phone': 1 });

// Update the updatedAt field before saving
billSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Validate payment amounts
  if (this.payment.type === 'split') {
    const totalMethodAmount = this.payment.methods.reduce((sum, method) => sum + method.amount, 0);
    if (totalMethodAmount !== this.payment.totalPaid) {
      return next(new Error('Total paid amount must equal sum of payment method amounts'));
    }
  }
  
  next();
});

module.exports = mongoose.model('Bill', billSchema);