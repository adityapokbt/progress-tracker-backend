const express = require('express');
const auth = require('../middleware/auth');
const { db } = require('../firebase');
const { FieldValue } = require('firebase-admin/firestore');
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

// Helper function to get products collection with store filter
const getProductsQuery = (storeId) => {
  return db.collection('products').where('store', '==', storeId);
};

// Helper function to find product by ID and store
const findProductById = async (id, storeId) => {
  const productRef = db.collection('products').doc(id);
  const productDoc = await productRef.get();
  
  if (!productDoc.exists) return null;
  
  const product = { id: productDoc.id, ...productDoc.data() };
  
  // Verify store ownership
  if (product.store !== storeId) return null;
  
  return product;
};

// Helper function to create a product
const createProduct = async (productData) => {
  const productsRef = db.collection('products');
  const newProduct = {
    ...productData,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const docRef = await productsRef.add(newProduct);
  return { id: docRef.id, ...newProduct };
};

// Helper function to update a product
const updateProduct = async (id, productData) => {
  const productRef = db.collection('products').doc(id);
  await productRef.update({
    ...productData,
    updatedAt: new Date()
  });
  
  const updatedDoc = await productRef.get();
  return { id: updatedDoc.id, ...updatedDoc.data() };
};

// Helper function to delete a product
const deleteProduct = async (id) => {
  const productRef = db.collection('products').doc(id);
  await productRef.delete();
};

const getInventoryOptions = async (storeId) => {
  try {
    // Try to fetch settings from database
    const settingsRef = db.collection('settings');
    const snapshot = await settingsRef.where('store', '==', storeId).limit(1).get();
    
    if (!snapshot.empty) {
      const settings = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
      if (settings.inventoryOptions) {
        return settings.inventoryOptions;
      }
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
    const productsRef = db.collection('products');
    const snapshot = await productsRef.where('store', '==', req.user.id).get();
    
    const products = [];
    snapshot.forEach(doc => {
      products.push({ id: doc.id, ...doc.data() });
    });
    
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
    const product = await findProductById(req.params.id, req.user.id);
    
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
      store: req.user.id
    };
    
    const product = await createProduct(productData);
    
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
    
    // Check if product exists and belongs to store
    const existingProduct = await findProductById(req.params.id, req.user.id);
    
    if (!existingProduct) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found'
      });
    }
    
    const product = await updateProduct(req.params.id, req.body);
    
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
    // Check if product exists and belongs to store
    const existingProduct = await findProductById(req.params.id, req.user.id);
    
    if (!existingProduct) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found'
      });
    }
    
    await deleteProduct(req.params.id);
    
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
    const productsRef = db.collection('products');
    const snapshot = await productsRef.where('store', '==', req.user.id).get();
    
    const lowStockProducts = [];
    snapshot.forEach(doc => {
      const product = { id: doc.id, ...doc.data() };
      // Check if stock is low (stock > 0 and stock <= lowStockAlert)
      if (product.stock && product.stock > 0 && product.lowStockAlert && product.stock <= product.lowStockAlert) {
        lowStockProducts.push(product);
      }
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

// Check SKU uniqueness
router.get('/check/sku/:sku', auth, async (req, res) => {
  try {
    const { sku } = req.params;
    const { exclude } = req.query;
    
    let query = db.collection('products')
      .where('sku', '==', sku)
      .where('store', '==', req.user.id);
    
    const snapshot = await query.get();
    
    let isUnique = snapshot.empty;
    
    // If there's an exclude ID and we found a product, check if it's the excluded one
    if (!isUnique && exclude) {
      const foundDoc = snapshot.docs[0];
      if (foundDoc.id === exclude) {
        isUnique = true;
      }
    }
    
    res.status(200).json({
      status: 'success',
      data: { unique: isUnique }
    });
  } catch (err) {
    console.error('Error checking SKU uniqueness:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error checking SKU uniqueness'
    });
  }
});

// Check barcode uniqueness
router.get('/check/barcode/:barcode', auth, async (req, res) => {
  try {
    const { barcode } = req.params;
    const { exclude } = req.query;
    
    let query = db.collection('products')
      .where('barcode', '==', barcode)
      .where('store', '==', req.user.id);
    
    const snapshot = await query.get();
    
    let isUnique = snapshot.empty;
    
    // If there's an exclude ID and we found a product, check if it's the excluded one
    if (!isUnique && exclude) {
      const foundDoc = snapshot.docs[0];
      if (foundDoc.id === exclude) {
        isUnique = true;
      }
    }
    
    res.status(200).json({
      status: 'success',
      data: { unique: isUnique }
    });
  } catch (err) {
    console.error('Error checking barcode uniqueness:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error checking barcode uniqueness'
    });
  }
});

// Get inventory options
router.get('/options/inventory', auth, async (req, res) => {
  try {
    const inventoryOptions = await getInventoryOptions(req.user.id);
    
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

// Get total product count
router.get('/count', auth, async (req, res) => {
  try {
    const productsRef = db.collection('products');
    const snapshot = await productsRef.where('store', '==', req.user.id).get();
    const totalProducts = snapshot.size;
    
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
    const productsRef = db.collection('products');
    const snapshot = await productsRef.where('store', '==', req.user.id).get();
    
    let outOfStock = 0;
    snapshot.forEach(doc => {
      const product = doc.data();
      if (product.stock === 0 || product.stock === undefined) {
        outOfStock++;
      }
    });
    
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

// Get categories (distinct category values from products)
router.get('/categories/list', auth, async (req, res) => {
  try {
    const productsRef = db.collection('products');
    const snapshot = await productsRef.where('store', '==', req.user.id).get();
    
    const categories = new Set();
    snapshot.forEach(doc => {
      const product = doc.data();
      if (product.category) {
        categories.add(product.category);
      }
    });
    
    res.status(200).json({
      status: 'success',
      data: { categories: Array.from(categories).sort() }
    });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching categories'
    });
  }
});

// Bulk update stock levels
router.patch('/bulk-stock', auth, async (req, res) => {
  try {
    const { updates } = req.body; // Array of { id, stock }
    
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Updates array is required'
      });
    }
    
    const batch = db.batch();
    const results = [];
    
    for (const update of updates) {
      const { id, stock } = update;
      
      // Verify product belongs to store
      const product = await findProductById(id, req.user.id);
      if (product) {
        const productRef = db.collection('products').doc(id);
        batch.update(productRef, {
          stock: stock,
          updatedAt: new Date()
        });
        results.push({ id, success: true });
      } else {
        results.push({ id, success: false, error: 'Product not found or unauthorized' });
      }
    }
    
    await batch.commit();
    
    res.status(200).json({
      status: 'success',
      data: { results }
    });
  } catch (err) {
    console.error('Error bulk updating stock:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error bulk updating stock'
    });
  }
});

module.exports = router;