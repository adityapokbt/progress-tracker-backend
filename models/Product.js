const { createModel } = require('../utils/firestoreModel');

const Product = createModel('products', {
  beforeSave: async function () {
    this.updatedAt = new Date();

    if (!this.productId) {
      if (this.sku) {
        this.productId = this.sku;
      } else if (this.name) {
        const nameAbbr = this.name.substring(0, 3).toUpperCase();
        const random = Math.floor(1000 + Math.random() * 9000);
        this.productId = `${nameAbbr}-${random}`;
      }
    }
  },
  virtuals: {
    profitMargin() {
      if (this.price && this.cost) {
        return ((this.price - this.cost) / this.price) * 100;
      }
      return 0;
    },
    status() {
      if (this.stock === 0) return 'Out of Stock';
      if (this.stock <= this.lowStockAlert) return 'Low Stock';
      return 'In Stock';
    },
  },
});

module.exports = Product;
