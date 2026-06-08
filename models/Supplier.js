const { createModel } = require('../utils/firestoreModel');

const Supplier = createModel('suppliers', {
  beforeSave: async function () {
    this.updatedAt = new Date();
  },
});

module.exports = Supplier;
