const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');
const Product = require('../models/Product');
const PaymentRecord = require('../models/PaymentRecord');

// Get all credit customers with their bills
router.get('/credit/customers', async (req, res) => {
  try {
    const creditBills = await Bill.find({ 
      'payment.type': { $in: ['single', 'split'] },
      'payment.methods': { $elemMatch: { method: 'credit' } },
      'customer.phone': { $exists: true, $ne: null }
    }).sort({ createdAt: -1 });

    const customersMap = new Map();
    
    creditBills.forEach(bill => {
      const customerKey = bill.customer.phone;
      
      if (!customersMap.has(customerKey)) {
        customersMap.set(customerKey, {
          id: bill.customer.id,
          name: bill.customer.name,
          phone: bill.customer.phone,
          bills: [],
          totalDue: 0
        });
      }
      
      const customer = customersMap.get(customerKey);
      const outstandingAmount = bill.payment.outstandingAmount || 0;
      
      customer.bills.push({
        ...bill.toObject(),
        outstandingAmount: outstandingAmount
      });
      customer.totalDue += outstandingAmount;
    });

    res.json({
      success: true,
      customers: Array.from(customersMap.values())
    });
  } catch (error) {
    console.error('Error fetching credit customers:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch credit customers' 
    });
  }
});

// Process payment for a bill or customer (supports split payments)
router.post('/credit/process-payment', async (req, res) => {
  try {
    const { 
      customerPhone, 
      billId, 
      payments, // Array of { method, amount, transactionId }
      newOutstandingAmount 
    } = req.body;

    if (newOutstandingAmount !== undefined) {
      const bill = await Bill.findById(billId);
      if (!bill) {
        return res.status(404).json({ success: false, error: 'Bill not found' });
      }

      bill.payment.outstandingAmount = parseFloat(newOutstandingAmount);
      await bill.save();

      return res.json({ 
        success: true, 
        message: 'Bill outstanding amount updated successfully',
        bill: bill
      });
    }

    if (billId) {
      const bill = await Bill.findById(billId);
      if (!bill) {
        return res.status(404).json({ success: false, error: 'Bill not found' });
      }

      const currentOutstanding = bill.payment.outstandingAmount || bill.total;
      const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

      if (totalPaid > currentOutstanding) {
        return res.status(400).json({ success: false, error: 'Payment amount exceeds outstanding balance' });
      }

      // Update total paid and outstanding amount
      bill.payment.totalPaid = (bill.payment.totalPaid || 0) + totalPaid;
      bill.payment.outstandingAmount = currentOutstanding - totalPaid;

      // Initialize payment methods if empty
      if (!bill.payment.methods) {
        bill.payment.methods = [];
      }

      // Add new payment methods
      const newPayments = payments.map(p => ({
        method: p.method,
        amount: parseFloat(p.amount),
        transactionId: p.transactionId || ''
      }));

      // If there's an outstanding amount, add it as a credit payment method
      if (bill.payment.outstandingAmount > 0) {
        // Remove any existing credit payment methods to avoid duplication
        bill.payment.methods = bill.payment.methods.filter(p => p.method !== 'credit');
        // Add the remaining balance as a credit payment method
        bill.payment.methods.push({
          method: 'credit',
          amount: bill.payment.outstandingAmount,
          transactionId: ''
        });
      }

      // Update payment type
      bill.payment.type = newPayments.length > 1 || bill.payment.outstandingAmount > 0 ? 'split' : 'single';
      bill.payment.methods.push(...newPayments);

      await bill.save();

      // Create payment records for non-credit payments
      for (const payment of newPayments) {
        if (payment.method !== 'credit') {
          await PaymentRecord.create({
            billId: bill._id,
            customerPhone: customerPhone,
            amount: payment.amount,
            paymentMethod: payment.method,
            transactionId: payment.transactionId,
            paymentDate: new Date(),
            isPartial: bill.payment.outstandingAmount > 0
          });
        }
      }

      return res.json({ 
        success: true, 
        message: 'Payment processed successfully',
        bill
      });
    } else {
      const customerBills = await Bill.find({ 
        'customer.phone': customerPhone, 
        'payment.outstandingAmount': { $gt: 0 }
      });

      const totalDue = customerBills.reduce((sum, bill) => sum + (bill.payment.outstandingAmount || bill.total), 0);
      const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

      if (totalPaid > totalDue) {
        return res.status(400).json({ success: false, error: 'Payment amount exceeds total due' });
      }

      let remainingPayment = totalPaid;
      for (const bill of customerBills) {
        const currentOutstanding = bill.payment.outstandingAmount || bill.total;
        const paymentForBill = Math.min(remainingPayment, currentOutstanding);
        if (paymentForBill <= 0) continue;

        bill.payment.totalPaid = (bill.payment.totalPaid || 0) + paymentForBill;
        bill.payment.outstandingAmount = currentOutstanding - paymentForBill;

        // Initialize payment methods if empty
        if (!bill.payment.methods) {
          bill.payment.methods = [];
        }

        // Distribute payment across methods
        let paymentRemaining = paymentForBill;
        const billPaymentMethods = [];
        for (const payment of payments) {
          if (paymentRemaining <= 0) break;
          const amountToUse = Math.min(parseFloat(payment.amount), paymentRemaining);
          billPaymentMethods.push({
            method: payment.method,
            amount: amountToUse,
            transactionId: payment.transactionId
          });
          paymentRemaining -= amountToUse;
        }

        // If there's an outstanding amount, add it as a credit payment method
        if (bill.payment.outstandingAmount > 0) {
          bill.payment.methods = bill.payment.methods.filter(p => p.method !== 'credit');
          bill.payment.methods.push({
            method: 'credit',
            amount: bill.payment.outstandingAmount,
            transactionId: ''
          });
        }

        bill.payment.type = billPaymentMethods.length > 1 || bill.payment.outstandingAmount > 0 ? 'split' : 'single';
        bill.payment.methods.push(...billPaymentMethods);

        await bill.save();

        // Create payment records for non-credit payments
        for (const method of billPaymentMethods) {
          if (method.method !== 'credit') {
            await PaymentRecord.create({
              billId: bill._id,
              customerPhone: customerPhone,
              amount: method.amount,
              paymentMethod: method.method,
              transactionId: method.transactionId,
              paymentDate: new Date(),
              isPartial: bill.payment.outstandingAmount > 0
            });
          }
        }

        remainingPayment -= paymentForBill;
      }

      res.json({ 
        success: true, 
        message: 'Payment processed successfully for customer' 
      });
    }
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process payment' 
    });
  }
});

// Update payment for a bill
router.patch('/:id/payment', async (req, res) => {
  try {
    const { payment } = req.body;
    
    const bill = await Bill.findByIdAndUpdate(
      req.params.id,
      { payment },
      { new: true }
    );

    if (!bill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }

    res.json({ 
      success: true, 
      message: 'Payment updated successfully',
      bill: bill
    });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update payment' 
    });
  }
});

// Get today's profit calculation
router.get('/profit/today', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayBills = await Bill.find({
      createdAt: {
        $gte: today,
        $lt: tomorrow
      }
    });

    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let itemsSold = 0;

    for (const bill of todayBills) {
      for (const item of bill.items) {
        const product = await Product.findById(item.productId);
        
        if (product) {
          const itemRevenue = item.price * item.quantity;
          const itemCost = product.cost * item.quantity;
          const itemProfit = itemRevenue - itemCost;
          
          totalRevenue += itemRevenue;
          totalCost += itemCost;
          totalProfit += itemProfit;
          itemsSold += item.quantity;
        }
      }
    }

    res.json({
      success: true,
      profitData: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        itemsSold: itemsSold,
        billsCount: todayBills.length,
        profitMargin: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100 * 100) / 100 : 0,
        date: today.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error('Error calculating today\'s profit:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to calculate today\'s profit' 
    });
  }
});

// Get profit for a specific date range
router.get('/profit/range', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const bills = await Bill.find({
      createdAt: {
        $gte: start,
        $lte: end
      }
    });

    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let itemsSold = 0;

    for (const bill of bills) {
      for (const item of bill.items) {
        const product = await Product.findById(item.productId);
        
        if (product) {
          const itemRevenue = item.price * item.quantity;
          const itemCost = product.cost * item.quantity;
          const itemProfit = itemRevenue - itemCost;
          
          totalRevenue += itemRevenue;
          totalCost += itemCost;
          totalProfit += itemProfit;
          itemsSold += item.quantity;
        }
      }
    }

    res.json({
      success: true,
      profitData: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        itemsSold: itemsSold,
        billsCount: bills.length,
        profitMargin: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100 * 100) / 100 : 0,
        startDate: start,
        endDate: end
      }
    });
  } catch (error) {
    console.error('Error calculating profit for date range:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to calculate profit for date range' 
    });
  }
});

// Get next bill number
router.get('/next-number', async (req, res) => {
  try {
    const lastBill = await Bill.findOne().sort({ billNumber: -1 });
    const nextBillNumber = lastBill ? lastBill.billNumber + 1 : 1;
    
    res.json({ success: true, nextBillNumber });
  } catch (error) {
    console.error('Error getting next bill number:', error);
    res.status(500).json({ success: false, error: 'Failed to get next bill number' });
  }
});

// Create a new bill (supports split payments)
router.post('/', async (req, res) => {
  try {
    const billData = req.body;
    
    // Validate payment data
    if (billData.payment.type === 'split') {
      const totalMethodAmount = billData.payment.methods.reduce((sum, method) => sum + method.amount, 0);
      if (totalMethodAmount !== billData.payment.totalPaid + (billData.payment.outstandingAmount || 0)) {
        return res.status(400).json({ success: false, error: 'Total paid amount plus outstanding amount must equal sum of payment method amounts' });
      }
    }

    const newBill = new Bill(billData);
    const savedBill = await newBill.save();
    
    for (const item of billData.items) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: -item.quantity } }
      );
    }
    
    res.json({ success: true, bill: savedBill });
  } catch (error) {
    console.error('Error creating bill:', error);
    res.status(500).json({ success: false, error: 'Failed to create bill' });
  }
});

// Get all bills with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const bills = await Bill.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Bill.countDocuments();
    
    res.json({
      success: true,
      bills,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching bills:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch bills' });
  }
});

// Get specific bill by billNumber
router.get('/:billNumber', async (req, res) => {
  try {
    const bill = await Bill.findOne({ billNumber: req.params.billNumber });
    
    if (!bill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }
    
    res.json({ success: true, bill });
  } catch (error) {
    console.error('Error fetching bill:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch bill' });
  }
});

// Delete a bill
router.delete('/:id', async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    
    if (!bill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }
    
    for (const item of bill.items) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: item.quantity } }
      );
    }
    
    await Bill.findByIdAndDelete(req.params.id);
    
    res.json({ success: true, message: 'Bill deleted successfully' });
  } catch (error) {
    console.error('Error deleting bill:', error);
    res.status(500).json({ success: false, error: 'Failed to delete bill' });
  }
});

// Get today's sales summary
router.get('/sales/today', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayBills = await Bill.find({
      createdAt: {
        $gte: today,
        $lt: tomorrow
      }
    });
    
    const totalSales = todayBills.reduce((sum, bill) => sum + bill.total, 0);
    const billsCount = todayBills.length;
    
    res.json({
      totalSales,
      billsCount,
      bills: todayBills
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get yesterday's sales for comparison
router.get('/sales/yesterday', async (req, res) => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);
    
    const yesterdayBills = await Bill.find({
      createdAt: {
        $gte: yesterday,
        $lt: today
      }
    });
    
    const totalSales = yesterdayBills.reduce((sum, bill) => sum + bill.total, 0);
    
    res.json({
      totalSales,
      billsCount: yesterdayBills.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get last 7 days sales for trend graph
router.get('/sales/last7days', async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const bills = await Bill.find({
      createdAt: {
        $gte: sevenDaysAgo,
        $lt: tomorrow
      }
    });
    
    const salesByDay = {};
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(sevenDaysAgo);
      date.setDate(date.getDate() + i);
      const dayName = daysOfWeek[date.getDay()];
      salesByDay[dayName] = 0;
    }
    
    bills.forEach(bill => {
      const dayName = daysOfWeek[bill.createdAt.getDay()];
      salesByDay[dayName] += bill.total;
    });
    
    const last7DaysSales = daysOfWeek.map(day => salesByDay[day]);
    
    res.json({
      last7DaysSales,
      daysOfWeek
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get top products by quantity sold today
router.get('/sales/today/products', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const bills = await Bill.aggregate([
      {
        $match: {
          createdAt: {
            $gte: today,
            $lt: tomorrow
          }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: {
            productId: '$items.productId',
            name: '$items.name',
            category: '$items.category'
          },
          totalQuantity: { $sum: '$items.quantity' }
        }
      },
      {
        $sort: { totalQuantity: -1 }
      }
    ]);
    
    const totalQuantitySold = bills.reduce((sum, item) => sum + item.totalQuantity, 0);
    
    const bestSellers = bills.slice(0, 3).map(item => ({
      productId: item._id.productId,
      name: item._id.name,
      category: item._id.category || 'Uncategorized',
      quantity: item.totalQuantity
    }));
    
    const worstSeller = bills.length > 0 ? {
      productId: bills[bills.length - 1]._id.productId,
      name: bills[bills.length - 1]._id.name,
      category: bills[bills.length - 1]._id.category || 'Uncategorized',
      quantity: bills[bills.length - 1].totalQuantity
    } : null;
    
    res.json({
      success: true,
      bestSellers,
      worstSeller,
      totalQuantitySold
    });
  } catch (error) {
    console.error('Error fetching today\'s top products:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch today\'s top products' });
  }
});

// Get new customers this month
router.get('/customers/new-this-month', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const newCustomers = await Bill.aggregate([
      { $match: { 'customer.phone': { $ne: null } } },
      {
        $group: {
          _id: '$customer.phone',
          firstPurchase: { $min: '$createdAt' }
        }
      },
      {
        $match: {
          firstPurchase: { $gte: startOfMonth, $lt: endOfMonth }
        }
      },
      { $count: 'count' }
    ]);

    res.json({ count: newCustomers[0]?.count || 0 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get returning customers percentage this month
router.get('/customers/returning-percentage', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const thisMonthCustomers = await Bill.distinct('customer.phone', {
      createdAt: { $gte: startOfMonth, $lt: endOfMonth },
      'customer.phone': { $ne: null }
    });

    if (thisMonthCustomers.length === 0) {
      return res.json({ percentage: 0 });
    }

    const returningCount = await Bill.aggregate([
      { $match: { 'customer.phone': { $in: thisMonthCustomers } } },
      {
        $group: {
          _id: '$customer.phone',
          firstPurchase: { $min: '$createdAt' }
        }
      },
      { $match: { firstPurchase: { $lt: startOfMonth } } },
      { $count: 'count' }
    ]);

    const percentage = Math.round(((returningCount[0]?.count || 0) / thisMonthCustomers.length) * 100);

    res.json({ percentage });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get credit customers count all-time
router.get('/customers/credit-count', async (req, res) => {
  try {
    const creditCustomers = await Bill.distinct('customer.phone', {
      'payment.methods': { $elemMatch: { method: 'credit' } },
      'customer.phone': { $ne: null }
    });

    res.json({ count: creditCustomers.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get top spender this month
router.get('/customers/top-spender-this-month', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const topSpender = await Bill.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth, $lt: endOfMonth },
          'customer.phone': { $ne: null }
        }
      },
      {
        $group: {
          _id: {
            phone: '$customer.phone',
            name: '$customer.name'
          },
          totalSpent: { $sum: '$total' }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 1 }
    ]);

    if (topSpender.length === 0) {
      return res.json({ name: '', phone: '' });
    }

    res.json({
      name: topSpender[0]._id.name,
      phone: topSpender[0]._id.phone
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all credit bills
router.get('/credit-bills', async (req, res) => {
  try {
    const creditBills = await Bill.find({ 
      'payment.methods': { $elemMatch: { method: 'credit' } }
    });
    res.json({ success: true, bills: creditBills });
  } catch (error) {
    console.error('Error fetching credit bills:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch credit bills' });
  }
});

// Get payment methods distribution
router.get('/payment-methods/distribution', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      query.createdAt = {
        $gte: start,
        $lte: end
      };
    }

    const bills = await Bill.find(query);
    
    const distribution = {
      cash: { count: 0, amount: 0 },
      card: { count: 0, amount: 0 },
      ewallet: { count: 0, amount: 0 },
      credit: { count: 0, amount: 0 }
    };
    
    bills.forEach(bill => {
      if (bill.payment.type === 'single') {
        const method = bill.payment.methods[0].method;
        distribution[method].count++;
        distribution[method].amount += bill.payment.methods[0].amount;
      } else {
        bill.payment.methods.forEach(method => {
          distribution[method.method].count++;
          distribution[method.method].amount += method.amount;
        });
      }
    });
    
    res.json({
      success: true,
      distribution,
      totalBills: bills.length,
      totalAmount: bills.reduce((sum, bill) => sum + bill.total, 0)
    });
  } catch (error) {
    console.error('Error fetching payment methods distribution:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment methods distribution' });
  }
});

module.exports = router;