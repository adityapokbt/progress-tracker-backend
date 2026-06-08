const bcrypt = require('bcryptjs');
const { createModel } = require('../utils/firestoreModel');

const User = createModel('users', {
  hiddenFields: ['password', 'resetPasswordOTP', 'resetPasswordExpires'],
  beforeSave: async function (isNew) {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 12);
  },
  methods: {
    async correctPassword(candidatePassword) {
      return bcrypt.compare(candidatePassword, this.password);
    },
    toJSON() {
      const user = this.toObject();
      delete user.password;
      delete user.resetPasswordOTP;
      delete user.resetPasswordExpires;
      return user;
    },
  },
});

module.exports = User;
