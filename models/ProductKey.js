const { createModel } = require('../utils/firestoreModel');

const ProductKey = createModel('productKeys');

module.exports = ProductKey;