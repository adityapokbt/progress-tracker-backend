const { createModel } = require('../utils/firestoreModel');

const SupplierTransaction = createModel('supplierTransactions', {
  beforeSave: async function () {
    this.updatedAt = new Date();
  },
});

module.exports = SupplierTransaction;
