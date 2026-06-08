const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  staff: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['annual', 'sick', 'maternity', 'paternity', 'bereavement', 'other']
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: String,
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
leaveSchema.index({ staff: 1, status: 1 });
leaveSchema.index({ user: 1, status: 1 });
leaveSchema.index({ startDate: 1, endDate: 1 });

// Virtual for calculating leave duration
leaveSchema.virtual('duration').get(function() {
  const diff = this.endDate - this.startDate;
  return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates
});

module.exports = mongoose.model('Leave', leaveSchema);