const { createModel } = require('../utils/firestoreModel');

const StaffSettings = createModel('staffSettings', {
  beforeSave: async function () {
    this.updatedAt = new Date();
  },
});

module.exports = StaffSettings;
