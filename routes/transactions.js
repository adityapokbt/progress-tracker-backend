// transaction routes (with added /pending-payments route)
const express = require('express');
const auth = require('../middleware/auth');
const { db } = require('../firebase');
const { FieldValue } = require('firebase-admin/firestore');
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

// Helper function to get all transactions for a supplier
const getSupplierTransactions = async (supplierId, storeId) => {
  const transactionsRef = db.collection('supplierTransactions');
  const snapshot = await transactionsRef
    .where('supplierId', '==', supplierId)
    .where('store', '==', storeId)
    .orderBy('paymentDate', 'asc')
    .orderBy('createdAt', 'asc')
    .get();
  
  const transactions = [];
  snapshot.forEach(doc => {
    transactions.push({ id: doc.id, ...doc.data() });
  });
  
  return transactions;
};

// Helper function to recalculate all balances for a supplier
const recalculateSupplierBalances = async (supplierId, storeId, excludeTransactionId = null) => {
  const transactions = await getSupplierTransactions(supplierId, storeId);
  
  let runningBalance = 0;
  const batch = db.batch();
  const updatedTransactions = [];
  
  for (const transaction of transactions) {
    // Skip the excluded transaction if it's being deleted/updated
    if (excludeTransactionId && transaction.id === excludeTransactionId) {
      continue;
    }
    
    const previousBalance = runningBalance;
    const amount = transaction.amount || 0;
    
    if (transaction.type === 'Payment' || transaction.type === 'Refund') {
      runningBalance -= amount;
    } else {
      runningBalance += amount;
    }
    
    // Update transaction with new balances
    const transactionRef = db.collection('supplierTransactions').doc(transaction.id);
    batch.update(transactionRef, {
      balanceBefore: previousBalance,
      balanceAfter: runningBalance,
      updatedAt: new Date()
    });
    
    updatedTransactions.push({
      id: transaction.id,
      balanceAfter: runningBalance
    });
  }
  
  await batch.commit();
  
  // Update supplier's outstanding balance
  const supplierRef = db.collection('suppliers').doc(supplierId);
  await supplierRef.update({
    outstandingBalance: runningBalance,
    updatedAt: new Date()
  });
  
  return { finalBalance: runningBalance, updatedCount: updatedTransactions.length };
};

const validateTransaction = (transactionData) => {
  const errors = {};
  
  if (transactionData.type === 'Credit') {
    // For credit transactions, payment mode should be disabled
    if (transactionData.paymentMode) {
      errors.paymentMode = 'Payment mode should not be set for credit transactions';
    }
    if (transactionData.referenceNumber) {
      errors.referenceNumber = 'Reference number should not be set for credit transactions';
    }
  } else {
    // For non-credit transactions
    if (!transactionData.paymentMode) {
      errors.paymentMode = 'Payment mode is required';
    }
    
    if (transactionData.paymentMode && 
        !['Cash', 'Cheque'].includes(transactionData.paymentMode) && 
        !transactionData.referenceNumber) {
      errors.referenceNumber = 'Reference number is required for this payment mode';
    }
  }
  
  return errors;
};

// IMPORTANT: Specific routes must come BEFORE parameterized routes
// Get transaction summary for dashboard - MUST COME FIRST
router.get('/summary', auth, async (req, res) => {
  try {
    console.log('Calculating transaction summary...');
    
    // Get all suppliers for this store
    const suppliersRef = db.collection('suppliers');
    const suppliersSnapshot = await suppliersRef.where('store', '==', req.user.id).get();
    
    let totalPayable = 0;
    let totalReceivable = 0;
    
    // For each supplier, get latest transaction balance
    for (const supplierDoc of suppliersSnapshot.docs) {
      const supplierId = supplierDoc.id;
      const transactions = await getSupplierTransactions(supplierId, req.user.id);
      
      let latestBalance = 0;
      if (transactions.length > 0) {
        latestBalance = transactions[transactions.length - 1].balanceAfter || 0;
      } else {
        // If no transactions, use supplier's outstanding balance
        const supplier = supplierDoc.data();
        latestBalance = supplier.outstandingBalance || 0;
      }
      
      if (latestBalance > 0) {
        totalPayable += latestBalance;
      } else if (latestBalance < 0) {
        totalReceivable += Math.abs(latestBalance);
      }
    }
    
    console.log('Summary calculated:', { totalPayable, totalReceivable });
    
    res.status(200).json({
      status: 'success',
      data: {
        totalPayable,
        totalReceivable
      }
    });
    
  } catch (err) {
    console.error('Error in summary endpoint:', err);
    
    // Return zeros if anything fails
    res.status(200).json({
      status: 'success',
      data: {
        totalPayable: 0,
        totalReceivable: 0
      }
    });
  }
});

// Get pending payments
router.get('/pending-payments', auth, async (req, res) => {
  try {
    // Get all suppliers for this store
    const suppliersRef = db.collection('suppliers');
    const suppliersSnapshot = await suppliersRef.where('store', '==', req.user.id).get();
    
    const pendingTransactions = [];
    let totalPending = 0;
    
    for (const supplierDoc of suppliersSnapshot.docs) {
      const supplier = { id: supplierDoc.id, ...supplierDoc.data() };
      const transactions = await getSupplierTransactions(supplier.id, req.user.id);
      
      let latestBalance = 0;
      if (transactions.length > 0) {
        latestBalance = transactions[transactions.length - 1].balanceAfter || 0;
      } else {
        latestBalance = supplier.outstandingBalance || 0;
      }
      
      if (latestBalance !== 0) {
        pendingTransactions.push({
          id: supplier.id,
          supplier,
          balanceAfter: latestBalance,
          type: latestBalance > 0 ? 'Payable' : 'Receivable',
          paymentDate: new Date()
        });
        totalPending += Math.abs(latestBalance);
      }
    }
    
    // Sort by absolute balance (largest first)
    pendingTransactions.sort((a, b) => Math.abs(b.balanceAfter) - Math.abs(a.balanceAfter));
    
    res.status(200).json({
      status: 'success',
      data: {
        totalPending,
        transactions: pendingTransactions,
        count: pendingTransactions.length
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

// Get all transactions for the authenticated user's store
router.get('/', auth, async (req, res) => {
  try {
    const { supplier, type, page = 1, limit = 10 } = req.query;
    
    let query = db.collection('supplierTransactions')
      .where('store', '==', req.user.id);
    
    if (supplier) query = query.where('supplierId', '==', supplier);
    if (type) query = query.where('type', '==', type);
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    const snapshot = await query
      .orderBy('paymentDate', 'desc')
      .limit(limitNum)
      .get();
    
    const transactions = [];
    for (const doc of snapshot.docs) {
      const transaction = { id: doc.id, ...doc.data() };
      
      // Fetch supplier details
      if (transaction.supplierId) {
        const supplierData = await findSupplierById(transaction.supplierId, req.user.id);
        if (supplierData) {
          transaction.supplier = { id: supplierData.id, name: supplierData.name, companyName: supplierData.companyName };
        }
      }
      
      // Fetch purchase order details if exists
      if (transaction.purchaseOrderId) {
        const poRef = db.collection('purchaseOrders').doc(transaction.purchaseOrderId);
        const poDoc = await poRef.get();
        if (poDoc.exists) {
          transaction.purchaseOrder = { id: poDoc.id, poNumber: poDoc.data().poNumber };
        }
      }
      
      transactions.push(transaction);
    }
    
    // Get total count
    const totalSnapshot = await db.collection('supplierTransactions')
      .where('store', '==', req.user.id)
      .get();
    const total = totalSnapshot.size;
    
    res.status(200).json({
      status: 'success',
      results: transactions.length,
      data: { 
        transactions,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching transactions'
    });
  }
});

// Create a new transaction
router.post('/', auth, async (req, res) => {
  try {
    const { supplier: supplierId, type, amount, paymentDate, paymentMode, referenceNumber, notes, purchaseOrderId } = req.body;
    
    // Validate supplier exists and belongs to store
    const supplier = await findSupplierById(supplierId, req.user.id);
    if (!supplier) {
      return res.status(404).json({
        status: 'fail',
        message: 'Supplier not found'
      });
    }
    
    // Validate transaction
    const validationErrors = validateTransaction(req.body);
    if (Object.keys(validationErrors).length > 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Validation error',
        errors: validationErrors
      });
    }
    
    if (!type || !['Payment', 'Credit', 'Refund', 'Advance'].includes(type)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Valid transaction type is required (Payment, Credit, Refund, Advance)'
      });
    }
    
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Valid positive amount is required'
      });
    }
    
    if (!paymentDate) {
      return res.status(400).json({
        status: 'fail',
        message: 'Payment date is required'
      });
    }
    
    // Get previous balance
    const previousTransactions = await getSupplierTransactions(supplierId, req.user.id);
    let previousBalance = supplier.outstandingBalance || 0;
    
    if (previousTransactions.length > 0) {
      previousBalance = previousTransactions[previousTransactions.length - 1].balanceAfter || 0;
    }
    
    const transactionAmount = parseFloat(amount);
    let newBalance;
    
    if (type === 'Payment' || type === 'Refund') {
      newBalance = previousBalance - transactionAmount;
    } else {
      newBalance = previousBalance + transactionAmount;
    }
    
    // Prepare transaction data
    const transactionData = {
      supplierId,
      supplierName: supplier.name,
      store: req.user.id,
      type,
      amount: transactionAmount,
      paymentDate: new Date(paymentDate),
      balanceBefore: previousBalance,
      balanceAfter: newBalance,
      notes: notes || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Add payment mode for non-Credit transactions
    if (type !== 'Credit') {
      if (!paymentMode || !['Cash', 'Bank Transfer', 'Esewa', 'Khalti', 'ConnectIPS', 'Cheque'].includes(paymentMode)) {
        return res.status(400).json({
          status: 'fail',
          message: 'Valid payment mode is required for non-Credit transactions'
        });
      }
      transactionData.paymentMode = paymentMode;
      if (referenceNumber) transactionData.referenceNumber = referenceNumber;
    }
    
    // Add purchase order reference if provided
    if (purchaseOrderId) {
      const poRef = db.collection('purchaseOrders').doc(purchaseOrderId);
      const poDoc = await poRef.get();
      if (poDoc.exists) {
        transactionData.purchaseOrderId = purchaseOrderId;
        transactionData.purchaseOrderNumber = poDoc.data().poNumber;
      }
    }
    
    const transactionsRef = db.collection('supplierTransactions');
    const docRef = await transactionsRef.add(transactionData);
    
    // Update supplier's outstanding balance
    const supplierRef = db.collection('suppliers').doc(supplierId);
    await supplierRef.update({
      outstandingBalance: newBalance,
      updatedAt: new Date()
    });
    
    const newTransaction = { id: docRef.id, ...transactionData };
    
    res.status(201).json({
      status: 'success',
      data: { transaction: newTransaction }
    });
  } catch (err) {
    console.error('Error creating transaction:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error creating transaction'
    });
  }
});

// Get a specific transaction
router.get('/:id', auth, async (req, res) => {
  try {
    const transactionRef = db.collection('supplierTransactions').doc(req.params.id);
    const transactionDoc = await transactionRef.get();
    
    if (!transactionDoc.exists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Transaction not found'
      });
    }
    
    const transaction = { id: transactionDoc.id, ...transactionDoc.data() };
    
    // Verify store ownership
    if (transaction.store !== req.user.id) {
      return res.status(403).json({
        status: 'fail',
        message: 'Access denied'
      });
    }
    
    // Fetch supplier details
    if (transaction.supplierId) {
      const supplier = await findSupplierById(transaction.supplierId, req.user.id);
      if (supplier) {
        transaction.supplier = { id: supplier.id, name: supplier.name, companyName: supplier.companyName };
      }
    }
    
    // Fetch purchase order details if exists
    if (transaction.purchaseOrderId) {
      const poRef = db.collection('purchaseOrders').doc(transaction.purchaseOrderId);
      const poDoc = await poRef.get();
      if (poDoc.exists) {
        transaction.purchaseOrder = { id: poDoc.id, poNumber: poDoc.data().poNumber };
      }
    }
    
    res.status(200).json({
      status: 'success',
      data: { transaction }
    });
  } catch (err) {
    console.error('Error fetching transaction:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching transaction'
    });
  }
});

// Update a transaction
router.put('/:id', auth, async (req, res) => {
  try {
    const transactionRef = db.collection('supplierTransactions').doc(req.params.id);
    const transactionDoc = await transactionRef.get();
    
    if (!transactionDoc.exists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Transaction not found'
      });
    }
    
    const existingTransaction = { id: transactionDoc.id, ...transactionDoc.data() };
    
    // Verify store ownership
    if (existingTransaction.store !== req.user.id) {
      return res.status(403).json({
        status: 'fail',
        message: 'Access denied'
      });
    }
    
    // Check if there are subsequent transactions (by date)
    const laterTransactions = await db.collection('supplierTransactions')
      .where('supplierId', '==', existingTransaction.supplierId)
      .where('store', '==', req.user.id)
      .where('paymentDate', '>', existingTransaction.paymentDate)
      .limit(1)
      .get();
    
    if (!laterTransactions.empty) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot update transaction with subsequent transactions. Please delete later transactions first.'
      });
    }
    
    const updates = { ...req.body, updatedAt: new Date() };
    
    // Validate updates
    if (updates.type && !['Payment', 'Credit', 'Refund', 'Advance'].includes(updates.type)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Valid transaction type is required'
      });
    }
    
    if (updates.amount) {
      updates.amount = parseFloat(updates.amount);
      if (isNaN(updates.amount) || updates.amount <= 0) {
        return res.status(400).json({
          status: 'fail',
          message: 'Valid positive amount is required'
        });
      }
    }
    
    if (updates.paymentDate) {
      updates.paymentDate = new Date(updates.paymentDate);
    }
    
    // For Credit transactions, remove paymentMode
    const finalType = updates.type || existingTransaction.type;
    if (finalType === 'Credit') {
      delete updates.paymentMode;
    }
    
    // Update the transaction
    await transactionRef.update(updates);
    
    // Recalculate all balances for this supplier
    await recalculateSupplierBalances(existingTransaction.supplierId, req.user.id);
    
    const updatedDoc = await transactionRef.get();
    const updatedTransaction = { id: updatedDoc.id, ...updatedDoc.data() };
    
    // Fetch supplier details
    const supplier = await findSupplierById(updatedTransaction.supplierId, req.user.id);
    if (supplier) {
      updatedTransaction.supplier = { id: supplier.id, name: supplier.name, companyName: supplier.companyName };
    }
    
    res.status(200).json({
      status: 'success',
      data: { transaction: updatedTransaction }
    });
  } catch (err) {
    console.error('Error updating transaction:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error updating transaction'
    });
  }
});

// Delete a transaction
router.delete('/:id', auth, async (req, res) => {
  try {
    const transactionRef = db.collection('supplierTransactions').doc(req.params.id);
    const transactionDoc = await transactionRef.get();
    
    if (!transactionDoc.exists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Transaction not found'
      });
    }
    
    const transaction = { id: transactionDoc.id, ...transactionDoc.data() };
    
    // Verify store ownership
    if (transaction.store !== req.user.id) {
      return res.status(403).json({
        status: 'fail',
        message: 'Access denied'
      });
    }
    
    // Check for subsequent transactions
    const laterTransactions = await db.collection('supplierTransactions')
      .where('supplierId', '==', transaction.supplierId)
      .where('store', '==', req.user.id)
      .where('paymentDate', '>', transaction.paymentDate)
      .limit(1)
      .get();
    
    if (!laterTransactions.empty) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot delete transaction with subsequent transactions'
      });
    }
    
    await transactionRef.delete();
    
    // Recalculate balances for this supplier
    await recalculateSupplierBalances(transaction.supplierId, req.user.id, req.params.id);
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    console.error('Error deleting transaction:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error deleting transaction'
    });
  }
});

module.exports = router;