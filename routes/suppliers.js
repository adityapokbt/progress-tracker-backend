const express = require('express');
const auth = require('../middleware/auth');
const { db } = require('../firebase');
const router = express.Router();

// Helper function to find supplier by ID and store
const findSupplierById = async (id, storeId) => {
  const supplierRef = db.collection('suppliers').doc(id);
  const supplierDoc = await supplierRef.get();
  
  if (!supplierDoc.exists) return null;
  const supplier = { id: supplierDoc.id, ...supplierDoc.data() };
  if (supplier.store !== storeId) return null;
  return supplier;
};

// Helper function to check if supplier has associated purchase orders
const hasAssociatedPurchaseOrders = async (supplierId, storeId) => {
  const purchaseOrdersRef = db.collection('purchaseOrders');
  const snapshot = await purchaseOrdersRef
    .where('supplier.id', '==', supplierId)
    .where('store', '==', storeId)
    .limit(1)
    .get();
  
  return !snapshot.empty;
};

// Helper function to get supplier transactions
const getSupplierTransactions = async (supplierId, storeId) => {
  const transactionsRef = db.collection('supplierTransactions');
  const snapshot = await transactionsRef
    .where('supplierId', '==', supplierId)
    .where('store', '==', storeId)
    .orderBy('paymentDate', 'desc')
    .get();
  
  const transactions = [];
  snapshot.forEach(doc => {
    transactions.push({ id: doc.id, ...doc.data() });
  });
  
  return transactions;
};

// Get all suppliers for the authenticated user's store
router.get('/', auth, async (req, res) => {
  try {
    const suppliersRef = db.collection('suppliers');
    const snapshot = await suppliersRef.where('store', '==', req.user.id).get();
    
    const suppliers = [];
    snapshot.forEach(doc => {
      suppliers.push({ id: doc.id, ...doc.data() });
    });
    
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
    const supplier = await findSupplierById(req.params.id, req.user.id);
    
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
      store: req.user.id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const suppliersRef = db.collection('suppliers');
    const docRef = await suppliersRef.add(supplierData);
    const newSupplier = { id: docRef.id, ...supplierData };
    
    res.status(201).json({
      status: 'success',
      data: { supplier: newSupplier }
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
    const supplier = await findSupplierById(req.params.id, req.user.id);
    
    if (!supplier) {
      return res.status(404).json({
        status: 'fail',
        message: 'Supplier not found'
      });
    }
    
    const supplierRef = db.collection('suppliers').doc(req.params.id);
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };
    
    await supplierRef.update(updateData);
    const updatedDoc = await supplierRef.get();
    const updatedSupplier = { id: updatedDoc.id, ...updatedDoc.data() };
    
    res.status(200).json({
      status: 'success',
      data: { supplier: updatedSupplier }
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
    const hasOrders = await hasAssociatedPurchaseOrders(req.params.id, req.user.id);
    
    if (hasOrders) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot delete supplier with associated purchase orders'
      });
    }
    
    const supplier = await findSupplierById(req.params.id, req.user.id);
    
    if (!supplier) {
      return res.status(404).json({
        status: 'fail',
        message: 'Supplier not found'
      });
    }
    
    await db.collection('suppliers').doc(req.params.id).delete();
    
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
    const transactions = await getSupplierTransactions(req.params.id, req.user.id);
    
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
    const purchaseOrdersRef = db.collection('purchaseOrders');
    const snapshot = await purchaseOrdersRef
      .where('supplier.id', '==', req.params.id)
      .where('store', '==', req.user.id)
      .orderBy('createdAt', 'desc')
      .get();
    
    const purchaseOrders = [];
    snapshot.forEach(doc => {
      purchaseOrders.push({ id: doc.id, ...doc.data() });
    });
    
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
    const transactions = await getSupplierTransactions(req.params.id, req.user.id);
    
    // Calculate balance from the latest transaction
    let balance = 0;
    if (transactions.length > 0) {
      // Use the balanceAfter from the latest transaction
      balance = transactions[0].balanceAfter || 0;
    } else {
      // If no transactions, try to get outstanding from supplier record
      const supplier = await findSupplierById(req.params.id, req.user.id);
      if (supplier && supplier.outstandingBalance) {
        balance = supplier.outstandingBalance;
      }
    }
    
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

// Get supplier outstanding balance (alias for /balance)
router.get('/:id/outstanding', auth, async (req, res) => {
  try {
    const supplier = await findSupplierById(req.params.id, req.user.id);
    
    if (!supplier) {
      return res.status(404).json({
        status: 'fail',
        message: 'Supplier not found'
      });
    }
    
    // Calculate outstanding balance from transactions
    const transactions = await getSupplierTransactions(req.params.id, req.user.id);
    let outstandingBalance = supplier.outstandingBalance || 0;
    
    if (transactions.length > 0) {
      outstandingBalance = transactions[0].balanceAfter || 0;
    }
    
    res.status(200).json({
      status: 'success',
      data: { 
        outstandingBalance,
        totalPaid: transactions.reduce((sum, t) => sum + (t.amount || 0), 0),
        transactionCount: transactions.length
      }
    });
  } catch (err) {
    console.error('Error fetching supplier outstanding balance:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching supplier outstanding balance'
    });
  }
});

// Record a supplier transaction (payment or advance)
router.post('/:id/transactions', auth, async (req, res) => {
  try {
    const { amount, type, paymentMethod, transactionId, notes } = req.body;
    
    if (!amount || !type) {
      return res.status(400).json({
        status: 'fail',
        message: 'Amount and type are required'
      });
    }
    
    const supplier = await findSupplierById(req.params.id, req.user.id);
    if (!supplier) {
      return res.status(404).json({
        status: 'fail',
        message: 'Supplier not found'
      });
    }
    
    // Get previous transactions to calculate new balance
    const previousTransactions = await getSupplierTransactions(req.params.id, req.user.id);
    const previousBalance = previousTransactions.length > 0 ? previousTransactions[0].balanceAfter : (supplier.outstandingBalance || 0);
    
    // Calculate new balance
    let newBalance = previousBalance;
    if (type === 'Payment') {
      newBalance = previousBalance - parseFloat(amount);
    } else if (type === 'Advance') {
      newBalance = previousBalance + parseFloat(amount);
    } else if (type === 'Credit') {
      newBalance = previousBalance + parseFloat(amount);
    } else if (type === 'Refund') {
      newBalance = previousBalance - parseFloat(amount);
    }
    
    const transactionData = {
      supplierId: req.params.id,
      supplierName: supplier.name,
      store: req.user.id,
      amount: parseFloat(amount),
      type,
      paymentMethod: paymentMethod || 'cash',
      transactionId: transactionId || null,
      notes: notes || null,
      balanceAfter: newBalance,
      paymentDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const transactionsRef = db.collection('supplierTransactions');
    const docRef = await transactionsRef.add(transactionData);
    const newTransaction = { id: docRef.id, ...transactionData };
    
    // Update supplier's outstanding balance
    const supplierRef = db.collection('suppliers').doc(req.params.id);
    await supplierRef.update({
      outstandingBalance: newBalance,
      updatedAt: new Date()
    });
    
    res.status(201).json({
      status: 'success',
      message: 'Transaction recorded successfully',
      data: { transaction: newTransaction, balance: newBalance }
    });
  } catch (err) {
    console.error('Error recording supplier transaction:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error recording supplier transaction'
    });
  }
});

// Get all pending payments (suppliers with outstanding balance)
router.get('/pending-payments', auth, async (req, res) => {
  try {
    const suppliersRef = db.collection('suppliers');
    const snapshot = await suppliersRef.where('store', '==', req.user.id).get();
    
    const suppliersWithOutstanding = [];
    for (const doc of snapshot.docs) {
      const supplier = { id: doc.id, ...doc.data() };
      
      // Get latest transaction balance
      const transactions = await getSupplierTransactions(supplier.id, req.user.id);
      let outstanding = supplier.outstandingBalance || 0;
      
      if (transactions.length > 0) {
        outstanding = transactions[0].balanceAfter || 0;
      }
      
      if (outstanding > 0) {
        suppliersWithOutstanding.push({
          ...supplier,
          outstandingBalance: outstanding
        });
      }
    }
    
    // Sort by outstanding balance (highest first)
    suppliersWithOutstanding.sort((a, b) => b.outstandingBalance - a.outstandingBalance);
    
    const totalPending = suppliersWithOutstanding.reduce((sum, s) => sum + s.outstandingBalance, 0);
    
    res.status(200).json({
      status: 'success',
      data: {
        suppliers: suppliersWithOutstanding,
        totalPending,
        count: suppliersWithOutstanding.length
      }
    });
  } catch (err) {
    console.error('Error fetching pending payments:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching pending payments'
    });
  }
});

// Get supplier stats
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const suppliersRef = db.collection('suppliers');
    const snapshot = await suppliersRef.where('store', '==', req.user.id).get();
    
    const totalSuppliers = snapshot.size;
    let totalOutstanding = 0;
    let activeSuppliers = 0;
    
    for (const doc of snapshot.docs) {
      const supplier = doc.data();
      
      if (supplier.status === 'active') activeSuppliers++;
      
      // Get latest transaction balance for outstanding
      const transactions = await getSupplierTransactions(doc.id, req.user.id);
      if (transactions.length > 0) {
        totalOutstanding += transactions[0].balanceAfter || 0;
      } else if (supplier.outstandingBalance) {
        totalOutstanding += supplier.outstandingBalance;
      }
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        totalSuppliers,
        activeSuppliers,
        inactiveSuppliers: totalSuppliers - activeSuppliers,
        totalOutstanding
      }
    });
  } catch (err) {
    console.error('Error fetching supplier stats:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching supplier statistics'
    });
  }
});

module.exports = router;