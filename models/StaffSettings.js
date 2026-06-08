const mongoose = require('mongoose');

const staffSettingsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  openingTime: {
    type: String,
    default: '09:00',
    validate: {
      validator: function(v) {
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Invalid time format (HH:MM)'
    }
  },
  closingTime: {
    type: String,
    default: '18:00',
    validate: {
      validator: function(v) {
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Invalid time format (HH:MM)'
    }
  },
  panNumber: {
    type: String,
    default: '',
    validate: {
      validator: function(v) {
        // Allow empty string or exactly 9 digits
        return v === '' || /^\d{9}$/.test(v);
      },
      message: 'PAN number must be exactly 9 digits or empty'
    }
  },
  defaultShiftHours: {
    type: Number,
    default: 8,
    min: 1,
    max: 12
  },
  overtimeRate: {
    type: Number,
    default: 1.5,
    min: 1,
    max: 3
  },
  maxLeavesPerYear: {
    type: Number,
    default: 15,
    min: 0,
    max: 30
  },
  requireManagerApprovalForLeave: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Add index for better performance
staffSettingsSchema.index({ user: 1 });

module.exports = mongoose.model('StaffSettings', staffSettingsSchema);