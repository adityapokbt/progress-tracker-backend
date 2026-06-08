const { createModel } = require('../utils/firestoreModel');

const Staff = createModel('staff', {
  beforeSave: async function () {
    this.updatedAt = new Date();
  },
});

module.exports = Staff;
