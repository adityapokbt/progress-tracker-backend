const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  staff: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  checkIn: {
    type: Date
  },
  checkOut: Date,
  status: {
    type: String,
    enum: ['present', 'absent', 'late', 'on_leave', 'half_day'],
    required: true
  },
  notes: String,
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

// Compound index to ensure one attendance record per staff per day
attendanceSchema.index({ staff: 1, date: 1 }, { unique: true });
attendanceSchema.index({ user: 1, date: 1 });
attendanceSchema.index({ status: 1, date: 1 });

// Virtual for calculating hours worked
attendanceSchema.virtual('hoursWorked').get(function() {
  if (this.checkIn && this.checkOut) {
    const diff = this.checkOut - this.checkIn;
    return (diff / (1000 * 60 * 60)).toFixed(2);
  }
  return 0;
});

module.exports = mongoose.model('Attendance', attendanceSchema);