const express = require('express');
const auth = require('../middleware/auth');
const Product = require('../models/Product');
const Settings = require('../models/Settings');
const router = express.Router();

// Default inventory options (fallback if no settings found)
const defaultInventoryOptions = {
  categories: {
    "Men's Clothing": ["T-Shirts", "Shirts", "Pants", "Jackets", "Traditional"],
    "Women's Clothing": ["Dresses", "Blouses", "Skirts", "Sarees", "Kurtas"],
    "Kids' Clothing": ["Onesies", "Kids T-Shirts", "Kids Pants", "Kids Dresses"],
    "Accessories": ["Bags", "Hats", "Belts", "Watches", "Jewelry"],
    "Footwear": ["Shoes", "Sandals", "Boots", "Slippers"]
  },
  sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Free Size"],
  colors: ["Black", "White", "Red", "Blue", "Green", "Yellow", "Pink", "Purple", "Brown", "Gray", "Multi"]
};

const getInventoryOptions = async (storeId) => {
  try {
    // Try to fetch settings from database
    const settings = await Settings.findOne({ store: storeId });
    if (settings && settings.inventoryOptions) {
      return settings.inventoryOptions;
    }
    
    // Fallback to default options
    return defaultInventoryOptions;
  } catch (error) {
    console.error('Error fetching inventory options:', error);
    return defaultInventoryOptions;
  }
};

// Middleware to validate product data - REMOVED VALIDATION TO ALLOW ANY VALUES
const validateProductData = async (req, res, next) => {
  try {
    // ALLOW ANY CATEGORY, SUBCATEGORY, SIZE, OR COLOR
    // This enables dynamic inventory options from settings
    next();
  } catch (error) {
    console.error('Error validating product data:', error);
    next(); // Continue without validation if there's an error
  }
};

// Get all products for the authenticated user's store
router.get('/', auth, async (req, res) => {
  try {
    const products = await Product.find({ store: req.user._id });
    res.status(200).json({
      status: 'success',
      results: products.length,
      data: { products }
    });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching products'
    });
  }
});

// Get a specific product
router.get('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findOne({ 
      _id: req.params.id, 
      store: req.user._id 
    });
    
    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: { product }
    });
  } catch (err) {
    console.error('Error fetching product:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching product'
    });
  }
});

// Create a new product
router.post('/', auth, validateProductData, async (req, res) => {
  try {
    console.log('Creating product with data:', req.body);
    
    // Add the store ID to the product data
    const productData = {
      ...req.body,
      store: req.user._id
    };
    
    const product = await Product.create(productData);
    
    res.status(201).json({
      status: 'success',
      data: { product }
    });
  } catch (err) {
    console.error('Error creating product:', err);
    
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(el => el.message);
      return res.status(400).json({
        status: 'fail',
        message: 'Validation error',
        errors
      });
    }
    
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      const value = err.keyValue[field];
      return res.status(400).json({
        status: 'fail',
        message: `${field} '${value}' already exists`
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Error creating product'
    });
  }
});

// Update a product
router.put('/:id', auth, validateProductData, async (req, res) => {
  try {
    console.log('Updating product with data:', req.body);
    
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, store: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: { product }
    });
  } catch (err) {
    console.error('Error updating product:', err);
    
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(el => el.message);
      return res.status(400).json({
        status: 'fail',
        message: 'Validation error',
        errors
      });
    }
    
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      const value = err.keyValue[field];
      return res.status(400).json({
        status: 'fail',
        message: `${field} '${value}' already exists`
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Error updating product'
    });
  }
});

// Delete a product
router.delete('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      store: req.user._id
    });
    
    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found'
      });
    }
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error deleting product'
    });
  }
});

// Get low stock products

router.get('/low-stock', auth, async (req, res) => {
  try {
    const lowStockProducts = await Product.find({
      store: req.user._id,
      stock: { $lte: mongoose.Schema.Types.Mixed, $ne: 0 }, // Incorrect syntax
      $expr: { $lte: ['$stock', '$lowStockAlert'] }
    });
    res.status(200).json({
      status: 'success',
      results: lowStockProducts.length,
      data: { products: lowStockProducts }
    });
  } catch (err) {
    console.error('Error fetching low stock products:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching low stock products'
    });
  }
});

// Get inventory options for the current store
router.get('/check/sku/:sku', auth, async (req, res) => {
  try {
    const { sku } = req.params;
    const { exclude } = req.query;
    
    const query = { 
      sku: sku,
      store: req.user._id
    };
    
    if (exclude) {
      query._id = { $ne: exclude };
    }
    
    const existingProduct = await Product.findOne(query);
    
    res.status(200).json({
      status: 'success',
      data: { unique: !existingProduct }
    });
  } catch (err) {
    console.error('Error checking SKU uniqueness:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error checking SKU uniqueness'
    });
  }
});
router.get('/check/barcode/:barcode', auth, async (req, res) => {
  try {
    const { barcode } = req.params;
    const { exclude } = req.query;
    
    const query = { 
      barcode: barcode,
      store: req.user._id
    };
    
    if (exclude) {
      query._id = { $ne: exclude };
    }
    
    const existingProduct = await Product.findOne(query);
    
    res.status(200).json({
      status: 'success',
      data: { unique: !existingProduct }
    });
  } catch (err) {
    console.error('Error checking barcode uniqueness:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error checking barcode uniqueness'
    });
  }
});
router.get('/options/inventory', auth, async (req, res) => {
  try {
    const inventoryOptions = await getInventoryOptions(req.user._id);
    
    res.status(200).json({
      status: 'success',
      data: { inventoryOptions }
    });
  } catch (err) {
    console.error('Error fetching inventory options:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching inventory options'
    });
  }
});
// routes/inventory.js

router.get('/count', auth, async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments({ store: req.user._id });
    res.status(200).json({
      status: 'success',
      data: { totalProducts }
    });
  } catch (err) {
    console.error('Error fetching total product count:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching total product count'
    });
  }
});

// Get out-of-stock product count
router.get('/out-of-stock/count', auth, async (req, res) => {
  try {
    const outOfStock = await Product.countDocuments({ store: req.user._id, stock: 0 });
    res.status(200).json({
      status: 'success',
      data: { outOfStock }
    });
  } catch (err) {
    console.error('Error fetching out-of-stock product count:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching out-of-stock product count'
    });
  }
});

module.exports = router;