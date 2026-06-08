const mongoose = require('mongoose');

const payrollSchema = new mongoose.Schema({
  staff: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  year: {
    type: Number,
    required: true,
    min: 2020,
    max: 2100
  },
  basicSalary: {
    type: Number,
    required: true,
    min: 0
  },
  allowance: {
    type: Number,
    default: 0,
    min: 0
  },
  deduction: {
    type: Number,
    default: 0,
    min: 0
  },
  netSalary: {
    type: Number,
    required: true,
    min: 0
  },
  paymentDate: Date,
  status: {
    type: String,
    enum: ['pending', 'paid', 'cancelled'],
    default: 'pending'
  },
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

// CORRECT unique index - ensure only this one exists
payrollSchema.index({ staff: 1, month: 1, year: 1, user: 1 }, { unique: true });
payrollSchema.index({ user: 1, status: 1 });
payrollSchema.index({ user: 1, month: 1, year: 1 });

// Pre-save hook to calculate netSalary
payrollSchema.pre('save', function(next) {
  // Always calculate netSalary on save
  this.netSalary = this.basicSalary + (this.allowance || 0) - (this.deduction || 0);
  next();
});

// Add a static method to safely check for duplicates
payrollSchema.statics.safeCreate = async function(payrollData) {
  const session = await this.startSession();
  try {
    session.startTransaction();
    
    // Check for existing payroll within transaction
    const existing = await this.findOne({
      staff: payrollData.staff,
      month: payrollData.month,
      year: payrollData.year,
      user: payrollData.user
    }).session(session);
    
    if (existing) {
      await session.abortTransaction();
      session.endSession();
      throw new Error('Payroll already exists');
    }
    
    const payroll = new this(payrollData);
    await payroll.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    
    return payroll;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

module.exports = mongoose.model('Payroll', payrollSchema);