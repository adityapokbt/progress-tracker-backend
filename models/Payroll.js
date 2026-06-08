const { createModel } = require('../utils/firestoreModel');

const Payroll = createModel('payroll', {
  beforeSave: async function () {
    this.updatedAt = new Date();
    if (this.grossSalary != null) {
      const deductions = (this.taxDeduction || 0) + (this.otherDeductions || 0);
      this.netSalary = this.grossSalary - deductions + (this.bonus || 0);
    }
  },
});

module.exports = Payroll;
