const express = require('express');
const auth = require('../middleware/auth');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const SupplierTransaction = require('../models/SupplierTransaction');
const Product = require('../models/Product');
const router = express.Router();

// Get all suppliers for the authenticated user's store
router.get('/', auth, async (req, res) => {
  try {
    const suppliers = await Supplier.find({ store: req.user._id });
    res.status(200).json({
      status: 'success',
      results: suppliers.length,
      data: { suppliers }
    });
  } catch (err) {
    console.error('Error fetching suppliers:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching suppliers'
    });
  }
});

// Get a specific supplier
router.get('/:id', auth, async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ 
      _id: req.params.id, 
      store: req.user._id 
    });
    
    if (!supplier) {
      return res.status(404).json({
        status: 'fail',
        message: 'Supplier not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: { supplier }
    });
  } catch (err) {
    console.error('Error fetching supplier:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching supplier'
    });
  }
});

// Create a new supplier
router.post('/', auth, async (req, res) => {
  try {
    const supplierData = {
      ...req.body,
      store: req.user._id
    };
    
    const supplier = await Supplier.create(supplierData);
    
    res.status(201).json({
      status: 'success',
      data: { supplier }
    });
  } catch (err) {
    console.error('Error creating supplier:', err);
    
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(el => el.message);
      return res.status(400).json({
        status: 'fail',
        message: 'Validation error',
        errors
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Error creating supplier'
    });
  }
});

// Update a supplier
router.put('/:id', auth, async (req, res) => {
  try {
    const supplier = await Supplier.findOneAndUpdate(
      { _id: req.params.id, store: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!supplier) {
      return res.status(404).json({
        status: 'fail',
        message: 'Supplier not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: { supplier }
    });
  } catch (err) {
    console.error('Error updating supplier:', err);
    
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(el => el.message);
      return res.status(400).json({
        status: 'fail',
        message: 'Validation error',
        errors
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Error updating supplier'
    });
  }
});

// Delete a supplier
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check if supplier has associated purchase orders
    const hasOrders = await PurchaseOrder.exists({ 
      supplier: req.params.id, 
      store: req.user._id 
    });
    
    if (hasOrders) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot delete supplier with associated purchase orders'
      });
    }
    
    const supplier = await Supplier.findOneAndDelete({
      _id: req.params.id,
      store: req.user._id
    });
    
    if (!supplier) {
      return res.status(404).json({
        status: 'fail',
        message: 'Supplier not found'
      });
    }
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    console.error('Error deleting supplier:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error deleting supplier'
    });
  }
});

// Get supplier transactions
router.get('/:id/transactions', auth, async (req, res) => {
  try {
    const transactions = await SupplierTransaction.find({
      supplier: req.params.id,
      store: req.user._id
    }).sort({ paymentDate: -1 });
    
    res.status(200).json({
      status: 'success',
      results: transactions.length,
      data: { transactions }
    });
  } catch (err) {
    console.error('Error fetching supplier transactions:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching supplier transactions'
    });
  }
});

// Get supplier purchase orders
router.get('/:id/purchase-orders', auth, async (req, res) => {
  try {
    const purchaseOrders = await PurchaseOrder.find({
      supplier: req.params.id,
      store: req.user._id
    }).sort({ createdAt: -1 });
    
    res.status(200).json({
      status: 'success',
      results: purchaseOrders.length,
      data: { purchaseOrders }
    });
  } catch (err) {
    console.error('Error fetching supplier purchase orders:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching supplier purchase orders'
    });
  }
});

// Get supplier balance
router.get('/:id/balance', auth, async (req, res) => {
  try {
    const transactions = await SupplierTransaction.find({
      supplier: req.params.id,
      store: req.user._id
    }).sort({ paymentDate: -1 });
    
    // Calculate balance from the latest transaction
    const balance = transactions.length > 0 ? transactions[0].balanceAfter : 0;
    
    res.status(200).json({
      status: 'success',
      data: { balance }
    });
  } catch (err) {
    console.error('Error calculating supplier balance:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error calculating supplier balance'
    });
  }
});

module.exports = router;