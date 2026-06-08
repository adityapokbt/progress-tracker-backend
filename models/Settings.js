const { createModel } = require('../utils/firestoreModel');

const Settings = createModel('settings', {
  beforeSave: async function () {
    this.updatedAt = new Date();
  },
});

module.exports = Settings;
