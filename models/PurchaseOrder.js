const mongoose = require('mongoose');

const purchaseOrderSchema = new mongoose.Schema({
  poNumber: {
    type: String,
    required: true,
    unique: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  items: [{
    product: {
      type: String,
      required: true,
      trim: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    receivedQuantity: {
      type: Number,
      default: 0,
      min: 0
    },
    size: {
      type: String,
      trim: true
    },
    color: {
      type: String,
      trim: true
    },
    fabric: {
      type: String,
      trim: true
    },
    brand: {
      type: String,
      trim: true
    }
  }],
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Received', 'Cancelled', 'Partially Received'],
    default: 'Pending'
  },
  cancellationReason: {
    type: String,
    enum: ['', 'By Mistake', 'Supplier Issue', 'Price Change', 'Product Unavailable', 'Other'],
    default: ''
  },
  cancellationNotes: {
    type: String,
    trim: true
  },
  cancellationSource: {
    type: String,
    enum: ['', 'Customer', 'Supplier'],
    default: ''
  },
  orderDate: {
    type: Date,
    default: Date.now
  },
  expectedDeliveryDate: {
    type: Date
  },
  actualDeliveryDate: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  },
  deliveryPerformance: {
    type: Number, // Percentage of items delivered
    default: 0
  },
  whatsappSent: {
    type: Boolean,
    default: false
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  sentAt: {
    type: Date
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  qrCodeImage: {
    type: String, // Store as base64 string
    default: ''
  },
  qrCodeData: {
    type: String,
    default: ''
  }
});

// Update the updatedAt field before saving
purchaseOrderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Calculate delivery performance
  if (this.items && this.items.length > 0) {
    const totalOrdered = this.items.reduce((sum, item) => sum + item.quantity, 0);
    const totalReceived = this.items.reduce((sum, item) => sum + (item.receivedQuantity || 0), 0);
    this.deliveryPerformance = totalOrdered > 0 ? (totalReceived / totalOrdered) * 100 : 0;
  }
  
  // If status is changed to Received or Partially Received, set actual delivery date
  if (this.isModified('status') && (this.status === 'Received' || this.status === 'Partially Received')) {
    this.actualDeliveryDate = new Date();
  }
  
  next();
});

// Index for better performance
purchaseOrderSchema.index({ store: 1, poNumber: 1 });
purchaseOrderSchema.index({ store: 1, supplier: 1 });
purchaseOrderSchema.index({ store: 1, status: 1 });

const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);
module.exports = PurchaseOrder;