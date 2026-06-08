const { createModel } = require('../utils/firestoreModel');

const Leave = createModel('leave', {
  beforeSave: async function () {
    this.updatedAt = new Date();
  },
});

module.exports = Leave;
