const { createModel } = require('../utils/firestoreModel');

const PurchaseOrder = createModel('purchaseOrders', {
  beforeSave: async function () {
    this.updatedAt = new Date();
  },
});

module.exports = PurchaseOrder;
