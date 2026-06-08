// transaction routes (with added /pending-payments route)
const express = require('express');
const { mongooseCompat } = require('../utils/firestoreModel');
const mongoose = mongooseCompat;
const auth = require('../middleware/auth');
const SupplierTransaction = require('../models/SupplierTransaction');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const router = express.Router();

// IMPORTANT: Specific routes must come BEFORE parameterized routes
// Get transaction summary for dashboard - MUST COME FIRST
router.get('/summary', auth, async (req, res) => {
  try {
    console.log('Calculating transaction summary...');
    
    // SIMPLE calculation - get the latest balance for each supplier
    const transactions = await SupplierTransaction.find({ 
      store: req.user._id 
    })
    .populate('supplier')
    .sort({ paymentDate: -1, createdAt: -1 })
    .limit(1000);
    
    console.log(`Found ${transactions.length} transactions`);
    
    // Group by supplier and get latest balance
    const supplierBalances = {};
    
    transactions.forEach(transaction => {
      if (!transaction.supplier || !transaction.supplier._id) return;
      
      const supplierId = transaction.supplier._id.toString();
      
      // Only take the first (latest) transaction for each supplier
      if (!supplierBalances[supplierId]) {
        supplierBalances[supplierId] = transaction.balanceAfter || 0;
      }
    });
    
    // Calculate totals
    let totalPayable = 0;
    let totalReceivable = 0;
    
    Object.values(supplierBalances).forEach(balance => {
      if (balance > 0) {
        totalPayable += balance;
      } else if (balance < 0) {
        totalReceivable += Math.abs(balance);
      }
    });
    
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
// Add this route after your existing routes in supplier transaction routes
router.get('/pending-payments', auth, async (req, res) => {
  try {
   const pendingTransactions = await SupplierTransaction.find({
  store: req.user._id,
  $or: [
    { balanceAfter: { $gt: 0 } },  // Positive balances (advances/credits)
    { balanceAfter: { $lt: 0 } }   // Negative balances (refunds)
  ]
})
.populate('supplier', 'name companyName')
.sort({ balanceAfter: -1 });  // This will still put largest positive first

// For total pending, you might want the absolute sum
const totalPending = pendingTransactions.reduce((sum, transaction) => {
  return sum + Math.abs(transaction.balanceAfter || 0);
}, 0);
    
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
    let filter = { store: req.user._id };
    
    if (supplier) filter.supplier = supplier;
    if (type) filter.type = type;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const transactions = await SupplierTransaction.find(filter)
      .populate('supplier', 'name companyName')
      .populate('purchaseOrder', 'poNumber')
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(limitNum);
    
    const total = await SupplierTransaction.countDocuments(filter);
    
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

// Get a specific transaction - THIS MUST COME AFTER /summary
router.get('/:id', auth, async (req, res) => {
  try {
    // Check if the ID is a valid ObjectId to prevent errors
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid transaction ID format'
      });
    }
    
    const transaction = await SupplierTransaction.findOne({
      _id: req.params.id,
      store: req.user._id
    })
    .populate('supplier', 'name companyName')
    .populate('purchaseOrder', 'poNumber');
    
    if (!transaction) {
      return res.status(404).json({
        status: 'fail',
        message: 'Transaction not found'
      });
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
// Create a new transaction - FIXED PAYMENT MODE HANDLING
router.post('/', auth, async (req, res) => {
  try {
     const { supplier, type, amount, paymentDate, paymentMode, referenceNumber } = req.body;
    
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
    
    // Prepare transaction data
    const transactionData = {
      ...req.body,
      store: req.user._id,
      amount: parseFloat(amount) // Ensure amount is a number
    };
    
    // For Credit transactions, don't include paymentMode at all
    if (type === 'Credit') {
      delete transactionData.paymentMode;
    } else {
      // Validate payment mode for non-Credit transactions
      if (!paymentMode || !['Cash', 'Bank Transfer', 'Esewa', 'Khalti', 'ConnectIPS', 'Cheque'].includes(paymentMode)) {
        return res.status(400).json({
          status: 'fail',
          message: 'Valid payment mode is required for non-Credit transactions'
        });
      }
    }
    
    // Get the previous balance
    const lastTransaction = await SupplierTransaction.findOne({
      supplier: req.body.supplier,
      store: req.user._id
    }).sort({ paymentDate: -1 });
    
    const previousBalance = lastTransaction ? lastTransaction.balanceAfter : 0;
    transactionData.balanceBefore = previousBalance;
    
    // Calculate new balance based on transaction type
    let newBalance;
    if (type === 'Payment' || type === 'Refund') {
      newBalance = previousBalance - parseFloat(amount);
    } else {
      newBalance = previousBalance + parseFloat(amount);
    }
    
    transactionData.balanceAfter = newBalance;
    
    const transaction = await SupplierTransaction.create(transactionData);
    
    // Populate supplier and purchase order details
    await transaction.populate('supplier', 'name companyName');
    if (transaction.purchaseOrder) {
      await transaction.populate('purchaseOrder', 'poNumber');
    }
    
    res.status(201).json({
      status: 'success',
      data: { transaction }
    });
  } catch (err) {
    console.error('Error creating transaction:', err);
    
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
      message: 'Error creating transaction'
    });
  }
});

// Update a transaction - FIXED BALANCE RECALCULATION
router.put('/:id', auth, async (req, res) => {
  try {
    // Validate ObjectId first
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid transaction ID format'
      });
    }
    
    // Find the existing transaction
    const existingTransaction = await SupplierTransaction.findOne({
      _id: req.params.id,
      store: req.user._id
    });
    
    if (!existingTransaction) {
      return res.status(404).json({
        status: 'fail',
        message: 'Transaction not found'
      });
    }
    
    // Prepare updates
    const updates = { ...req.body };
    
    // Convert amount to number if provided
    if (updates.amount !== undefined) {
      updates.amount = parseFloat(updates.amount);
      if (isNaN(updates.amount) || updates.amount <= 0) {
        return res.status(400).json({
          status: 'fail',
          message: 'Valid positive amount is required'
        });
      }
    }
    
    // Convert paymentDate to Date if provided
    if (updates.paymentDate !== undefined) {
      updates.paymentDate = new Date(updates.paymentDate);
      if (isNaN(updates.paymentDate.getTime())) {
        return res.status(400).json({
          status: 'fail',
          message: 'Valid payment date is required'
        });
      }
    }
    
    // Validate transaction type if provided
    if (updates.type !== undefined && !['Payment', 'Credit', 'Refund', 'Advance'].includes(updates.type)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Valid transaction type is required'
      });
    }
    
    // For Credit transactions, remove paymentMode
    const finalType = updates.type || existingTransaction.type;
    if (finalType === 'Credit') {
      delete updates.paymentMode;
    } else if (updates.paymentMode !== undefined) {
      // Validate payment mode for non-Credit transactions
      if (!['Cash', 'Bank Transfer', 'Esewa', 'Khalti', 'ConnectIPS', 'Cheque'].includes(updates.paymentMode)) {
        return res.status(400).json({
          status: 'fail',
          message: 'Valid payment mode is required for non-Credit transactions'
        });
      }
    }
    
    // If amount, type, or paymentDate is changed, we need to recalculate ALL balances for this supplier
    const needsRecalculation = updates.amount !== undefined || updates.type !== undefined || updates.paymentDate !== undefined;
    
    if (needsRecalculation) {
      console.log('Recalculating balances due to financial field changes...');
      
      // Get ALL transactions for this supplier, sorted by date and creation time
      const allTransactions = await SupplierTransaction.find({
        supplier: existingTransaction.supplier,
        store: req.user._id
      }).sort({ paymentDate: 1, createdAt: 1 });
      
      let runningBalance = 0;
      const transactionsToUpdate = [];
      
      // First pass: calculate new balances and collect transactions that need updating
      for (const transaction of allTransactions) {
        let transactionAmount = transaction.amount;
        let transactionType = transaction.type;
        
        // If this is the transaction being updated, use new values
        if (transaction._id.toString() === req.params.id) {
          transactionAmount = updates.amount !== undefined ? updates.amount : transaction.amount;
          transactionType = updates.type !== undefined ? updates.type : transaction.type;
        }
        
        // Store the previous balance before updating
        const previousBalance = runningBalance;
        
        // Calculate new balance
        if (transactionType === 'Payment' || transactionType === 'Refund') {
          runningBalance -= transactionAmount;
        } else {
          runningBalance += transactionAmount;
        }
        
        // Store transaction update data
        transactionsToUpdate.push({
          _id: transaction._id,
          balanceBefore: previousBalance,
          balanceAfter: runningBalance,
          isCurrent: transaction._id.toString() === req.params.id
        });
      }
      
      // Second pass: update all transactions with new balances
      for (const transactionUpdate of transactionsToUpdate) {
        if (transactionUpdate.isCurrent) {
          // For the current transaction, add balance updates
          updates.balanceBefore = transactionUpdate.balanceBefore;
          updates.balanceAfter = transactionUpdate.balanceAfter;
        } else {
          // For other transactions, only update balances
          await SupplierTransaction.findByIdAndUpdate(
            transactionUpdate._id,
            {
              balanceBefore: transactionUpdate.balanceBefore,
              balanceAfter: transactionUpdate.balanceAfter
            }
          );
        }
      }
    }
    
    // Remove fields that shouldn't be updated directly
    delete updates.store;
    delete updates.supplier;
    delete updates.purchaseOrder;
    delete updates.createdAt;
    
    const updatedTransaction = await SupplierTransaction.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    )
    .populate('supplier', 'name companyName')
    .populate('purchaseOrder', 'poNumber');
    
    console.log('Transaction updated successfully:', {
      id: updatedTransaction._id,
      type: updatedTransaction.type,
      amount: updatedTransaction.amount,
      balanceBefore: updatedTransaction.balanceBefore,
      balanceAfter: updatedTransaction.balanceAfter
    });
    
    res.status(200).json({
      status: 'success',
      data: { transaction: updatedTransaction }
    });
  } catch (err) {
    console.error('Error updating transaction:', err);
    
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
      message: 'Error updating transaction'
    });
  }
});

// Delete a transaction
router.delete('/:id', auth, async (req, res) => {
  try {
    // Validate ObjectId first
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid transaction ID format'
      });
    }
    
    const transaction = await SupplierTransaction.findOne({
      _id: req.params.id,
      store: req.user._id
    });
    
    if (!transaction) {
      return res.status(404).json({
        status: 'fail',
        message: 'Transaction not found'
      });
    }
    
    // Check for subsequent transactions
    const hasSubsequentTransactions = await SupplierTransaction.exists({
      supplier: transaction.supplier,
      store: req.user._id,
      paymentDate: { $gt: transaction.paymentDate }
    });
    
    if (hasSubsequentTransactions) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot delete transaction with subsequent transactions'
      });
    }
    
    await SupplierTransaction.findByIdAndDelete(req.params.id);
    
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