const mongoose = require('mongoose');

// Nepal districts by province
const nepaliDistrictsByProvince = {
  'Province 1': [
    'Bhojpur', 'Dhankuta', 'Ilam', 'Jhapa', 'Khotang', 'Morang', 'Okhaldhunga', 
    'Panchthar', 'Sankhuwasabha', 'Solukhumbu', 'Sunsari', 'Taplejung', 'Terhathum', 'Udayapur'
  ],
  'Madhesh': [
    'Bara', 'Dhanusha', 'Mahottari', 'Parsa', 'Rautahat', 'Saptari', 'Sarlahi', 'Siraha'
  ],
  'Bagmati': [
    'Bhaktapur', 'Chitwan', 'Dhading', 'Dolakha', 'Kathmandu', 'Kavrepalanchok', 
    'Lalitpur', 'Makwanpur', 'Nuwakot', 'Ramechhap', 'Rasuwa', 'Sindhuli', 'Sindhupalchok'
  ],
  'Gandaki': [
    'Baglung', 'Gorkha', 'Kaski', 'Lamjung', 'Manang', 'Mustang', 'Myagdi', 
    'Nawalpur', 'Parbat', 'Syangja', 'Tanahun'
  ],
  'Lumbini': [
    'Arghakhanchi', 'Banke', 'Bardiya', 'Dang', 'Gulmi', 'Kapilvastu', 'Parasi', 
    'Palpa', 'Pyuthan', 'Rolpa', 'Rukum East', 'Rupandehi'
  ],
  'Karnali': [
    'Dailekh', 'Dolpa', 'Humla', 'Jajarkot', 'Jumla', 'Kalikot', 'Mugu', 
    'Rukum West', 'Salyan', 'Surkhet'
  ],
  'Sudurpashchim': [
    'Achham', 'Baitadi', 'Bajhang', 'Bajura', 'Dadeldhura', 'Darchula', 
    'Doti', 'Kailali', 'Kanchanpur'
  ]
};

const supplierSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Supplier name is required'],
    trim: true,
    maxlength: 100
  },
  companyName: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    maxlength: 100
  },
  contactPerson: {
    type: String,
    required: [true, 'Contact person name is required'],
    trim: true
  },
  
  // Contact Information
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    validate: {
      validator: function(v) {
        return /^[9][6-8][0-9]{8}$/.test(v.replace(/\D/g, ''));
      },
      message: 'Please enter a valid Nepali phone number (98XXXXXXXX)'
    }
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Email is optional
        return /\S+@\S+\.\S+/.test(v);
      },
      message: 'Please enter a valid email address'
    }
  },
  
  // Address (Nepal context)
  province: {
    type: String,
    required: [true, 'Province is required'],
    enum: Object.keys(nepaliDistrictsByProvince)
  },
  district: {
    type: String,
    required: [true, 'District is required'],
    validate: {
      validator: function(v) {
        return nepaliDistrictsByProvince[this.province]?.includes(v);
      },
      message: 'District must be valid for the selected province'
    }
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true
  },
  streetAddress: {
    type: String,
    trim: true
  },
  
  // Business Information
  panVatNumber: {
    type: String,
    trim: true
  },
  bankAccountDetails: {
    bankName: String,
    accountNumber: String,
    accountHolder: String
  },
  
  // Additional Information
  notes: {
    type: String,
    maxlength: 500
  },
  creditTerms: {
    type: Number, // days
    default: 0
  },
  deliveryPreferences: {
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
supplierSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Supplier', supplierSchema);