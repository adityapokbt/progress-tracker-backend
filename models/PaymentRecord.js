const { createModel } = require('../utils/firestoreModel');

const PaymentRecord = createModel('paymentRecords');

module.exports = PaymentRecord;
