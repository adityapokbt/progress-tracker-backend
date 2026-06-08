const { createModel } = require('../utils/firestoreModel');

const Bill = createModel('bills', {
  beforeSave: async function () {
    this.updatedAt = new Date();

    if (this.payment?.type === 'split') {
      const totalMethodAmount = this.payment.methods.reduce((sum, method) => sum + method.amount, 0);
      if (totalMethodAmount !== this.payment.totalPaid) {
        throw new Error('Total paid amount must equal sum of payment method amounts');
      }
    }
  },
});

module.exports = Bill;
