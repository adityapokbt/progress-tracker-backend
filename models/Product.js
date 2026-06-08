const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: 100
  },
  nepaliName: {
    type: String,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  
  // Categorization - REMOVED ALL ENUM CONSTRAINTS
  category: {
    type: String,
    required: [true, 'Category is required']
  },
  subcategory: {
    type: String,
    required: [true, 'Subcategory is required']
  },
  
  // Variants & Specifications - REMOVED ALL ENUM CONSTRAINTS
  size: {
    type: String,
    required: [true, 'Size is required']
  },
  color: {
    type: String,
    required: [true, 'Color is required']
  },
  material: {
    type: String,
    default: 'Cotton'
  },
  
  // Pricing & Costing
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  cost: {
    type: Number,
    required: [true, 'Cost is required'],
    min: [0, 'Cost cannot be negative']
  },
  
  // Inventory Management
  stock: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock cannot be negative'],
    default: 0
  },
  lowStockAlert: {
    type: Number,
    required: [true, 'Low stock alert is required'],
    min: [0, 'Low stock alert cannot be negative'],
    default: 5
  },
  
  // Identification
  productId: {
    type: String,
    unique: true,
    sparse: true
  },
  sku: {
    type: String,
    unique: true,
    sparse: true
  },
  barcode: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Additional Information
  supplier: {
    type: String,
    trim: true
  },
  countryOfOrigin: {
    type: String,
    default: "Nepal"
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

// Update the updatedAt field before saving and generate productId if not provided
productSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Generate productId if not provided (use SKU or create from name)
  if (!this.productId) {
    if (this.sku) {
      this.productId = this.sku;
    } else {
      // Create a simple productId from name and random number
      const nameAbbr = this.name.substring(0, 3).toUpperCase();
      const random = Math.floor(1000 + Math.random() * 9000);
      this.productId = `${nameAbbr}-${random}`;
    }
  }
  
  next();
});

// Virtual for profit margin
productSchema.virtual('profitMargin').get(function() {
  if (this.price && this.cost) {
    return ((this.price - this.cost) / this.price) * 100;
  }
  return 0;
});

// Virtual for status
productSchema.virtual('status').get(function() {
  if (this.stock === 0) return 'Out of Stock';
  if (this.stock <= this.lowStockAlert) return 'Low Stock';
  return 'In Stock';
});

// Ensure virtual fields are serialized
productSchema.set('toJSON', { virtuals: true });   
productSchema.set('toObject', { virtuals: true });

// Index for better search performance
productSchema.index({ name: 'text', nepaliName: 'text', description: 'text' });
productSchema.index({ category: 1, subcategory: 1 });
productSchema.index({ size: 1, color: 1 });
productSchema.index({ store: 1 });
productSchema.index({ sku: 1 });
productSchema.index({ barcode: 1 });
productSchema.index({ productId: 1 });

module.exports = mongoose.model('Product', productSchema);