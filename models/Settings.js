const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  // Store Reference
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Theme Settings
  theme: {
    type: String,
    enum: ['light', 'dark'],
    default: 'light'
  },
  
  // VAT Settings
  vatEnabled: {
    type: Boolean,
    default: false
  },
  vatRate: {
    type: Number,
    min: 0,
    max: 100,
    default: 13
  },
  
  // Pricing Mode
  pricingMode: {
    type: String,
    enum: ['fixed', 'variable'],
    default: 'fixed'
  },
  
  // Billing Settings
  billingFolder: {
    type: String,
    default: '/bills'
  },
  
  // Shop Information
  shopInfo: {
    name: {
      type: String,
      default: 'My Shop'
    },
    address: {
      type: String,
      default: '123 Main Street, Kathmandu'
    },
    phone: {
      type: String,
      default: '+977-1-1234567'
    },
    contactNumber: {
      type: String,
      default: '9852052566'
    },
    email: {
      type: String,
      default: 'shop@example.com'
    },
    facebook: String,
    youtube: String,
    tiktok: String,
    instagram: String
  },
  
  // Inventory Options (Dynamic)
  inventoryOptions: {
    categories: {
      type: mongoose.Schema.Types.Mixed,
      default: {
        "Men's Clothing": ["T-Shirts", "Shirts", "Pants", "Jackets", "Traditional"],
        "Women's Clothing": ["Dresses", "Blouses", "Skirts", "Sarees", "Kurtas"],
        "Kids' Clothing": ["Onesies", "Kids T-Shirts", "Kids Pants", "Kids Dresses"],
        "Accessories": ["Bags", "Hats", "Belts", "Watches", "Jewelry"],
        "Footwear": ["Shoes", "Sandals", "Boots", "Slippers"]
      }
    },
    sizes: {
      type: [String],
      default: ["XS", "S", 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free Size']
    },
    colors: {
      type: [String],
      default: ["Black", "White", "Red", "Blue", "Green", "Yellow", "Pink", "Purple", "Brown", "Gray", "Multi"]
    }
  },
  
  // QR Code Settings
  qrCodeImage: {
    type: Buffer, // Store QR code image as binary data
    default: null
  },
  qrCodeImageType: {
    type: String,
    default: 'png'
  },
  qrCodeContent: {
    type: String,
    default: ''
  },
  qrCodeHash: {
    type: String,
    default: ''
  },
  
  // Transaction Settings
  transactionSettings: {
    allowDelete: {
      type: Boolean,
      default: true
    },
    deleteRequiresPassword: {
      type: Boolean,
      default: false
    }
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
settingsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Settings', settingsSchema);