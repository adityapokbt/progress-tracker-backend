const { createModel } = require('../utils/firestoreModel');

const Attendance = createModel('attendance', {
  beforeSave: async function () {
    this.updatedAt = new Date();
  },
});

module.exports = Attendance;
