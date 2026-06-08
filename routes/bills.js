// routes/bills.js
const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const auth = require('../middleware/auth');
const { db } = require('../firebase');
const { FieldValue } = require('firebase-admin/firestore');

// Helper function to generate PDF bill
const generateBillPDF = async (bill) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        bufferPages: true,
        autoFirstPage: true
      });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      doc.fontSize(20).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
      doc.moveDown();
      
      doc.fontSize(10).font('Helvetica')
        .text(`Bill Number: ${bill.billNumber}`, { continued: true })
        .text(`Date: ${new Date(bill.createdAt).toLocaleString()}`, { align: 'right' });
      
      doc.moveDown();
      
      if (bill.customer && bill.customer.name) {
        doc.fontSize(12).font('Helvetica-Bold').text('Customer Information');
        doc.fontSize(10).font('Helvetica')
          .text(`Name: ${bill.customer.name || 'N/A'}`)
          .text(`Phone: ${bill.customer.phone || 'N/A'}`);
        doc.moveDown();
      }
      
      doc.fontSize(10).font('Helvetica-Bold');
      const col1 = 50, col2 = 250, col3 = 350, col5 = 500;
      
      doc.text('Item', col1, doc.y);
      doc.text('Qty', col2, doc.y);
      doc.text('Price', col3, doc.y);
      doc.text('Total', col5, doc.y);
      
      doc.moveDown();
      doc.strokeColor('#000000').lineWidth(0.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);
      
      doc.font('Helvetica');
      let totalAmount = 0;
      
      bill.items.forEach(item => {
        const itemTotal = item.price * item.quantity;
        totalAmount += itemTotal;
        
        doc.text(item.name.substring(0, 30), col1, doc.y);
        doc.text(item.quantity.toString(), col2, doc.y);
        doc.text(`₹${item.price.toFixed(2)}`, col3, doc.y);
        doc.text(`₹${itemTotal.toFixed(2)}`, col5, doc.y);
        doc.moveDown();
      });
      
      doc.moveDown();
      doc.strokeColor('#000000').lineWidth(0.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text(`Total: ₹${totalAmount.toFixed(2)}`, 450, doc.y);
      doc.moveDown();
      
      if (bill.payment) {
        doc.font('Helvetica-Bold').text('Payment Information');
        doc.font('Helvetica');
        doc.text(`Payment Type: ${bill.payment.type || 'N/A'}`);
        
        if (bill.payment.methods && bill.payment.methods.length > 0) {
          doc.text('Payment Methods:');
          bill.payment.methods.forEach(method => {
            doc.text(`  - ${method.method}: ₹${method.amount.toFixed(2)}`);
          });
        }
        
        if (bill.payment.outstandingAmount > 0) {
          doc.font('Helvetica-Bold').fillColor('red')
            .text(`Outstanding Amount: ₹${bill.payment.outstandingAmount.toFixed(2)}`)
            .fillColor('black');
        }
      }
      
      doc.moveDown(2);
      doc.fontSize(8).font('Helvetica').text('Thank you for your business!', { align: 'center' });
      doc.end();
      
    } catch (error) {
      reject(error);
    }
  });
};

// Helper function to get next bill number
const getNextBillNumber = async (storeId) => {
  const billsRef = db.collection('bills');
  const snapshot = await billsRef
    .where('store', '==', storeId)
    .orderBy('billNumber', 'desc')
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    return 1;
  }
  
  const lastBill = snapshot.docs[0].data();
  return lastBill.billNumber + 1;
};

// ==================== DASHBOARD STATS ROUTES (Must come before /:id) ====================

// Get top spender this month
router.get('/customers/top-spender-this-month', auth, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);
    
    const billsRef = db.collection('bills');
    const snapshot = await billsRef
      .where('store', '==', req.user.id)
      .where('createdAt', '>=', startOfMonth)
      .where('createdAt', '<=', endOfMonth)
      .get();
    
    const customerSpending = new Map();
    
    snapshot.forEach(doc => {
      const bill = doc.data();
      if (bill.customer && bill.customer.phone) {
        const phone = bill.customer.phone;
        const currentSpent = customerSpending.get(phone) || 0;
        customerSpending.set(phone, {
          name: bill.customer.name || 'Unknown',
          phone: phone,
          totalSpent: currentSpent + (bill.total || 0)
        });
      }
    });
    
    let topSpender = null;
    for (const customer of customerSpending.values()) {
      if (!topSpender || customer.totalSpent > topSpender.totalSpent) {
        topSpender = customer;
      }
    }
    
    res.json({
      success: true,
      name: topSpender?.name || '',
      phone: topSpender?.phone || ''
    });
  } catch (error) {
    console.error('Error fetching top spender:', error);
    res.json({ success: true, name: '', phone: '' });
  }
});

// Get new customers this month
router.get('/customers/new-this-month', auth, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);
    
    const billsRef = db.collection('bills');
    const snapshot = await billsRef
      .where('store', '==', req.user.id)
      .where('createdAt', '>=', startOfMonth)
      .where('createdAt', '<=', endOfMonth)
      .get();
    
    const customerFirstPurchase = new Map();
    
    snapshot.forEach(doc => {
      const bill = doc.data();
      if (bill.customer && bill.customer.phone) {
        const phone = bill.customer.phone;
        let billDate;
        if (bill.createdAt && typeof bill.createdAt.toDate === 'function') {
          billDate = bill.createdAt.toDate();
        } else {
          billDate = new Date(bill.createdAt);
        }
        
        if (!customerFirstPurchase.has(phone)) {
          customerFirstPurchase.set(phone, billDate);
        } else {
          const existingDate = customerFirstPurchase.get(phone);
          if (billDate < existingDate) {
            customerFirstPurchase.set(phone, billDate);
          }
        }
      }
    });
    
    let newCustomers = 0;
    for (const firstPurchaseDate of customerFirstPurchase.values()) {
      if (firstPurchaseDate >= startOfMonth && firstPurchaseDate <= endOfMonth) {
        newCustomers++;
      }
    }
    
    res.json({ success: true, count: newCustomers });
  } catch (error) {
    console.error('Error fetching new customers:', error);
    res.json({ success: true, count: 0 });
  }
});

// Get returning customers percentage
router.get('/customers/returning-percentage', auth, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);
    
    const billsRef = db.collection('bills');
    const snapshot = await billsRef
      .where('store', '==', req.user.id)
      .where('createdAt', '>=', startOfMonth)
      .where('createdAt', '<=', endOfMonth)
      .get();
    
    const thisMonthCustomers = new Set();
    snapshot.forEach(doc => {
      const bill = doc.data();
      if (bill.customer && bill.customer.phone) {
        thisMonthCustomers.add(bill.customer.phone);
      }
    });
    
    if (thisMonthCustomers.size === 0) {
      return res.json({ success: true, percentage: 0 });
    }
    
    // Get all bills for these customers to check first purchase date
    const allBillsRef = db.collection('bills');
    const allSnapshot = await allBillsRef
      .where('store', '==', req.user.id)
      .get();
    
    const customerFirstPurchase = new Map();
    
    allSnapshot.forEach(doc => {
      const bill = doc.data();
      if (bill.customer && bill.customer.phone && thisMonthCustomers.has(bill.customer.phone)) {
        const phone = bill.customer.phone;
        let billDate;
        if (bill.createdAt && typeof bill.createdAt.toDate === 'function') {
          billDate = bill.createdAt.toDate();
        } else {
          billDate = new Date(bill.createdAt);
        }
        
        if (!customerFirstPurchase.has(phone)) {
          customerFirstPurchase.set(phone, billDate);
        } else {
          const existingDate = customerFirstPurchase.get(phone);
          if (billDate < existingDate) {
            customerFirstPurchase.set(phone, billDate);
          }
        }
      }
    });
    
    let returningCount = 0;
    for (const firstPurchaseDate of customerFirstPurchase.values()) {
      if (firstPurchaseDate < startOfMonth) {
        returningCount++;
      }
    }
    
    const percentage = Math.round((returningCount / thisMonthCustomers.size) * 100);
    
    res.json({ success: true, percentage });
  } catch (error) {
    console.error('Error fetching returning percentage:', error);
    res.json({ success: true, percentage: 0 });
  }
});

// Get credit customers count
router.get('/customers/credit-count', auth, async (req, res) => {
  try {
    const billsRef = db.collection('bills');
    const snapshot = await billsRef
      .where('store', '==', req.user.id)
      .get();
    
    const creditCustomers = new Set();
    
    snapshot.forEach(doc => {
      const bill = doc.data();
      if (bill.payment && bill.payment.methods && bill.customer && bill.customer.phone) {
        const hasCredit = bill.payment.methods.some(method => method.method === 'credit');
        if (hasCredit) {
          creditCustomers.add(bill.customer.phone);
        }
      }
    });
    
    res.json({ success: true, count: creditCustomers.size });
  } catch (error) {
    console.error('Error fetching credit count:', error);
    res.json({ success: true, count: 0 });
  }
});

// Get today's top products
router.get('/sales/today/products', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const billsRef = db.collection('bills');
    const snapshot = await billsRef
      .where('store', '==', req.user.id)
      .where('createdAt', '>=', today)
      .where('createdAt', '<', tomorrow)
      .get();
    
    const productSales = new Map();
    let totalQuantitySold = 0;
    
    snapshot.forEach(doc => {
      const bill = doc.data();
      if (bill.items && Array.isArray(bill.items)) {
        bill.items.forEach(item => {
          const productName = item.name || item.productName || 'Unknown';
          if (productSales.has(productName)) {
            const existing = productSales.get(productName);
            existing.quantity += item.quantity;
            productSales.set(productName, existing);
          } else {
            productSales.set(productName, {
              name: productName,
              category: item.category || 'Uncategorized',
              quantity: item.quantity
            });
          }
          totalQuantitySold += item.quantity;
        });
      }
    });
    
    const bestSellers = Array.from(productSales.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
    
    const worstSeller = Array.from(productSales.values())
      .sort((a, b) => a.quantity - b.quantity)[0] || null;
    
    res.json({
      success: true,
      bestSellers,
      worstSeller,
      totalQuantitySold
    });
  } catch (error) {
    console.error('Error fetching today\'s top products:', error);
    res.json({
      success: true,
      bestSellers: [],
      worstSeller: null,
      totalQuantitySold: 0
    });
  }
});

// Get today's sales summary
router.get('/sales/today', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const billsRef = db.collection('bills');
    const snapshot = await billsRef
      .where('store', '==', req.user.id)
      .where('createdAt', '>=', today)
      .where('createdAt', '<', tomorrow)
      .get();
    
    let totalSales = 0;
    const bills = [];
    
    snapshot.forEach(doc => {
      const bill = doc.data();
      totalSales += bill.total || 0;
      bills.push({ id: doc.id, ...bill });
    });
    
    res.json({
      success: true,
      totalSales,
      billsCount: snapshot.size,
      bills
    });
  } catch (error) {
    console.error('Error fetching today\'s sales:', error);
    res.json({ success: true, totalSales: 0, billsCount: 0, bills: [] });
  }
});

// Get yesterday's sales
router.get('/sales/yesterday', auth, async (req, res) => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);
    
    const billsRef = db.collection('bills');
    const snapshot = await billsRef
      .where('store', '==', req.user.id)
      .where('createdAt', '>=', yesterday)
      .where('createdAt', '<', today)
      .get();
    
    let totalSales = 0;
    snapshot.forEach(doc => {
      totalSales += doc.data().total || 0;
    });
    
    res.json({
      success: true,
      totalSales,
      billsCount: snapshot.size
    });
  } catch (error) {
    console.error('Error fetching yesterday\'s sales:', error);
    res.json({ success: true, totalSales: 0, billsCount: 0 });
  }
});

// Get last 7 days sales
router.get('/sales/last7days', auth, async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const billsRef = db.collection('bills');
    const snapshot = await billsRef
      .where('store', '==', req.user.id)
      .where('createdAt', '>=', sevenDaysAgo)
      .where('createdAt', '<', tomorrow)
      .get();
    
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const salesByDay = {};
    
    daysOfWeek.forEach(day => { salesByDay[day] = 0; });
    
    snapshot.forEach(doc => {
      const bill = doc.data();
      let billDate;
      if (bill.createdAt && typeof bill.createdAt.toDate === 'function') {
        billDate = bill.createdAt.toDate();
      } else {
        billDate = new Date(bill.createdAt);
      }
      const dayName = daysOfWeek[billDate.getDay()];
      salesByDay[dayName] += bill.total || 0;
    });
    
    const last7DaysSales = daysOfWeek.map(day => salesByDay[day]);
    
    res.json({
      success: true,
      last7DaysSales,
      daysOfWeek
    });
  } catch (error) {
    console.error('Error fetching last 7 days sales:', error);
    res.json({ success: true, last7DaysSales: [0, 0, 0, 0, 0, 0, 0], daysOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] });
  }
});

// Get today's profit
router.get('/profit/today', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const billsRef = db.collection('bills');
    const snapshot = await billsRef
      .where('store', '==', req.user.id)
      .where('createdAt', '>=', today)
      .where('createdAt', '<', tomorrow)
      .get();
    
    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let itemsSold = 0;

    for (const doc of snapshot.docs) {
      const bill = doc.data();
      
      for (const item of bill.items) {
        const itemRevenue = item.price * item.quantity;
        const itemCost = (item.costPrice || item.price * 0.7) * item.quantity;
        
        totalRevenue += itemRevenue;
        totalCost += itemCost;
        totalProfit += (itemRevenue - itemCost);
        itemsSold += item.quantity;
      }
    }

    res.json({
      success: true,
      profitData: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        itemsSold: itemsSold,
        billsCount: snapshot.size,
        profitMargin: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100 * 100) / 100 : 0,
        date: today.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error('Error calculating today\'s profit:', error);
    res.json({
      success: true,
      profitData: {
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        itemsSold: 0,
        billsCount: 0,
        profitMargin: 0,
        date: new Date().toISOString().split('T')[0]
      }
    });
  }
});

// Get profit for date range
router.get('/profit/range', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const billsRef = db.collection('bills');
    const snapshot = await billsRef
      .where('store', '==', req.user.id)
      .where('createdAt', '>=', start)
      .where('createdAt', '<=', end)
      .get();
    
    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let itemsSold = 0;

    for (const doc of snapshot.docs) {
      const bill = doc.data();
      
      for (const item of bill.items) {
        const itemRevenue = item.price * item.quantity;
        const itemCost = (item.costPrice || item.price * 0.7) * item.quantity;
        
        totalRevenue += itemRevenue;
        totalCost += itemCost;
        totalProfit += (itemRevenue - itemCost);
        itemsSold += item.quantity;
      }
    }

    res.json({
      success: true,
      profitData: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        itemsSold: itemsSold,
        billsCount: snapshot.size,
        profitMargin: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100 * 100) / 100 : 0,
        startDate: start,
        endDate: end
      }
    });
  } catch (error) {
    console.error('Error calculating profit for date range:', error);
    res.json({
      success: true,
      profitData: {
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        itemsSold: 0,
        billsCount: 0,
        profitMargin: 0,
        startDate: startDate,
        endDate: endDate
      }
    });
  }
});

// Get next bill number
router.get('/next-number', auth, async (req, res) => {
  try {
    const nextBillNumber = await getNextBillNumber(req.user.id);
    res.json({ success: true, nextBillNumber });
  } catch (error) {
    console.error('Error getting next bill number:', error);
    res.json({ success: true, nextBillNumber: 1 });
  }
});

// Create a new bill
router.post('/', auth, async (req, res) => {
  try {
    const billData = req.body;
    
    // Validate payment data
    if (billData.payment && billData.payment.type === 'split') {
      const totalMethodAmount = billData.payment.methods.reduce((sum, method) => sum + (method.amount || 0), 0);
      const totalPaidWithOutstanding = (billData.payment.totalPaid || 0) + (billData.payment.outstandingAmount || 0);
      
      if (Math.abs(totalMethodAmount - totalPaidWithOutstanding) > 0.01) {
        return res.status(400).json({ 
          success: false, 
          error: 'Total paid amount plus outstanding amount must equal sum of payment method amounts' 
        });
      }
    }
    
    const nextBillNumber = await getNextBillNumber(req.user.id);
    
    const newBill = {
      billNumber: nextBillNumber,
      store: req.user.id,
      ...billData,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const billsRef = db.collection('bills');
    const docRef = await billsRef.add(newBill);
    
    // Update product stock
    if (billData.items && Array.isArray(billData.items)) {
      for (const item of billData.items) {
        if (item.productId) {
          const productRef = db.collection('products').doc(item.productId);
          const productDoc = await productRef.get();
          if (productDoc.exists) {
            await productRef.update({
              stock: FieldValue.increment(-item.quantity)
            });
          }
        }
      }
    }
    
    const savedBill = await docRef.get();
    
    res.json({ success: true, bill: { id: savedBill.id, ...savedBill.data() } });
  } catch (error) {
    console.error('Error creating bill:', error);
    res.status(500).json({ success: false, error: 'Failed to create bill' });
  }
});

// Get all bills with pagination
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    const billsRef = db.collection('bills');
    const snapshot = await billsRef
      .where('store', '==', req.user.id)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    
    const totalSnapshot = await billsRef
      .where('store', '==', req.user.id)
      .get();
    const total = totalSnapshot.size;
    
    const bills = [];
    snapshot.forEach(doc => {
      bills.push({ id: doc.id, ...doc.data() });
    });
    
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
    res.json({ success: true, bills: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
  }
});

// Get specific bill by billNumber
router.get('/bill-number/:billNumber', auth, async (req, res) => {
  try {
    const billsRef = db.collection('bills');
    const snapshot = await billsRef
      .where('store', '==', req.user.id)
      .where('billNumber', '==', parseInt(req.params.billNumber))
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }
    
    const bill = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    res.json({ success: true, bill });
  } catch (error) {
    console.error('Error fetching bill:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch bill' });
  }
});

// Generate PDF for a bill
router.get('/:billNumber/pdf', auth, async (req, res) => {
  try {
    const billsRef = db.collection('bills');
    const snapshot = await billsRef
      .where('store', '==', req.user.id)
      .where('billNumber', '==', parseInt(req.params.billNumber))
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }
    
    const bill = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    const pdfBuffer = await generateBillPDF(bill);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=bill_${bill.billNumber}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ success: false, error: 'Failed to generate PDF' });
  }
});

// Get bill by ID (MUST BE LAST - after all specific routes)
router.get('/:id', auth, async (req, res) => {
  try {
    const billRef = db.collection('bills').doc(req.params.id);
    const billDoc = await billRef.get();
    
    if (!billDoc.exists) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }
    
    const bill = billDoc.data();
    if (bill.store !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    res.json({ success: true, bill: { id: billDoc.id, ...bill } });
  } catch (error) {
    console.error('Error fetching bill:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch bill' });
  }
});

// Delete a bill
router.delete('/:id', auth, async (req, res) => {
  try {
    const billRef = db.collection('bills').doc(req.params.id);
    const billDoc = await billRef.get();
    
    if (!billDoc.exists) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }
    
    const bill = billDoc.data();
    if (bill.store !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Restore product stock
    if (bill.items && Array.isArray(bill.items)) {
      for (const item of bill.items) {
        if (item.productId) {
          const productRef = db.collection('products').doc(item.productId);
          await productRef.update({
            stock: FieldValue.increment(item.quantity)
          });
        }
      }
    }
    
    await billRef.delete();
    
    res.json({ success: true, message: 'Bill deleted successfully' });
  } catch (error) {
    console.error('Error deleting bill:', error);
    res.status(500).json({ success: false, error: 'Failed to delete bill' });
  }
});

// Get all credit customers with their bills
router.get('/credit/customers', auth, async (req, res) => {
  try {
    const billsRef = db.collection('bills');
    const snapshot = await billsRef
      .where('store', '==', req.user.id)
      .get();
    
    const customersMap = new Map();
    
    snapshot.forEach(doc => {
      const bill = { id: doc.id, ...doc.data() };
      
      if (bill.customer && bill.customer.phone && bill.payment && bill.payment.methods) {
        const hasCredit = bill.payment.methods.some(method => method.method === 'credit');
        
        if (hasCredit) {
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
          const outstandingAmount = bill.payment?.outstandingAmount || 0;
          
          customer.bills.push({ ...bill, outstandingAmount });
          customer.totalDue += outstandingAmount;
        }
      }
    });

    res.json({
      success: true,
      customers: Array.from(customersMap.values())
    });
  } catch (error) {
    console.error('Error fetching credit customers:', error);
    res.json({ success: true, customers: [] });
  }
});

// Process payment for a bill or customer
router.post('/credit/process-payment', auth, async (req, res) => {
  try {
    const { customerPhone, billId, payments, newOutstandingAmount } = req.body;

    if (newOutstandingAmount !== undefined && billId) {
      const billRef = db.collection('bills').doc(billId);
      const billDoc = await billRef.get();
      
      if (!billDoc.exists) {
        return res.status(404).json({ success: false, error: 'Bill not found' });
      }
      
      const bill = billDoc.data();
      if (bill.store !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      await billRef.update({
        'payment.outstandingAmount': parseFloat(newOutstandingAmount),
        updatedAt: new Date()
      });

      const updatedBill = await billRef.get();
      
      return res.json({ 
        success: true, 
        message: 'Bill outstanding amount updated successfully',
        bill: { id: updatedBill.id, ...updatedBill.data() }
      });
    }

    if (billId) {
      const billRef = db.collection('bills').doc(billId);
      const billDoc = await billRef.get();
      
      if (!billDoc.exists) {
        return res.status(404).json({ success: false, error: 'Bill not found' });
      }
      
      const bill = { id: billDoc.id, ...billDoc.data() };
      if (bill.store !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      
      const currentOutstanding = bill.payment?.outstandingAmount || bill.total;
      const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

      if (totalPaid > currentOutstanding) {
        return res.status(400).json({ success: false, error: 'Payment amount exceeds outstanding balance' });
      }

      const newTotalPaid = (bill.payment?.totalPaid || 0) + totalPaid;
      const newOutstanding = currentOutstanding - totalPaid;
      
      let methods = bill.payment?.methods || [];
      
      const newPayments = payments.map(p => ({
        method: p.method,
        amount: parseFloat(p.amount),
        transactionId: p.transactionId || '',
        date: new Date()
      }));
      
      if (newOutstanding > 0) {
        methods = methods.filter(p => p.method !== 'credit');
        methods.push({
          method: 'credit',
          amount: newOutstanding,
          transactionId: '',
          date: new Date()
        });
      }
      
      methods.push(...newPayments);
      
      await billRef.update({
        'payment.totalPaid': newTotalPaid,
        'payment.outstandingAmount': newOutstanding,
        'payment.methods': methods,
        'payment.type': newPayments.length > 1 || newOutstanding > 0 ? 'split' : 'single',
        updatedAt: new Date()
      });

      // Create payment records for non-credit payments
      const paymentsRef = db.collection('paymentRecords');
      for (const payment of newPayments) {
        if (payment.method !== 'credit') {
          await paymentsRef.add({
            billId: billId,
            customerPhone: customerPhone,
            amount: payment.amount,
            paymentMethod: payment.method,
            transactionId: payment.transactionId,
            paymentDate: new Date(),
            isPartial: newOutstanding > 0,
            store: req.user.id,
            createdAt: new Date()
          });
        }
      }

      const updatedBill = await billRef.get();
      
      return res.json({ 
        success: true, 
        message: 'Payment processed successfully',
        bill: { id: updatedBill.id, ...updatedBill.data() }
      });
    } else if (customerPhone) {
      const billsRef = db.collection('bills');
      const snapshot = await billsRef
        .where('store', '==', req.user.id)
        .where('customer.phone', '==', customerPhone)
        .where('payment.outstandingAmount', '>', 0)
        .get();
      
      const customerBills = [];
      snapshot.forEach(doc => {
        customerBills.push({ id: doc.id, ...doc.data() });
      });
      
      if (customerBills.length === 0) {
        return res.json({ success: true, message: 'No outstanding bills found' });
      }

      const totalDue = customerBills.reduce((sum, bill) => sum + (bill.payment?.outstandingAmount || bill.total), 0);
      const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

      if (totalPaid > totalDue) {
        return res.status(400).json({ success: false, error: 'Payment amount exceeds total due' });
      }

      let remainingPayment = totalPaid;
      const paymentsRef = db.collection('paymentRecords');
      
      for (const bill of customerBills) {
        if (remainingPayment <= 0) break;
        
        const currentOutstanding = bill.payment?.outstandingAmount || bill.total;
        const paymentForBill = Math.min(remainingPayment, currentOutstanding);
        
        if (paymentForBill <= 0) continue;
        
        const billRef = db.collection('bills').doc(bill.id);
        const newTotalPaid = (bill.payment?.totalPaid || 0) + paymentForBill;
        const newOutstanding = currentOutstanding - paymentForBill;
        
        let methods = bill.payment?.methods || [];
        
        let paymentRemaining = paymentForBill;
        const billPaymentMethods = [];
        
        for (const payment of payments) {
          if (paymentRemaining <= 0) break;
          const amountToUse = Math.min(parseFloat(payment.amount), paymentRemaining);
          billPaymentMethods.push({
            method: payment.method,
            amount: amountToUse,
            transactionId: payment.transactionId,
            date: new Date()
          });
          paymentRemaining -= amountToUse;
        }
        
        if (newOutstanding > 0) {
          methods = methods.filter(p => p.method !== 'credit');
          methods.push({
            method: 'credit',
            amount: newOutstanding,
            transactionId: '',
            date: new Date()
          });
        }
        
        methods.push(...billPaymentMethods);
        
        await billRef.update({
          'payment.totalPaid': newTotalPaid,
          'payment.outstandingAmount': newOutstanding,
          'payment.methods': methods,
          'payment.type': billPaymentMethods.length > 1 || newOutstanding > 0 ? 'split' : 'single',
          updatedAt: new Date()
        });
        
        for (const method of billPaymentMethods) {
          if (method.method !== 'credit') {
            await paymentsRef.add({
              billId: bill.id,
              customerPhone: customerPhone,
              amount: method.amount,
              paymentMethod: method.method,
              transactionId: method.transactionId,
              paymentDate: new Date(),
              isPartial: newOutstanding > 0,
              store: req.user.id,
              createdAt: new Date()
            });
          }
        }
        
        remainingPayment -= paymentForBill;
      }

      res.json({ 
        success: true, 
        message: 'Payment processed successfully for customer' 
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Either billId or customerPhone is required' 
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
router.patch('/:id/payment', auth, async (req, res) => {
  try {
    const { payment } = req.body;
    const billRef = db.collection('bills').doc(req.params.id);
    const billDoc = await billRef.get();
    
    if (!billDoc.exists) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }
    
    const bill = billDoc.data();
    if (bill.store !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    await billRef.update({ payment, updatedAt: new Date() });
    const updatedBill = await billRef.get();
    
    res.json({ 
      success: true, 
      message: 'Payment updated successfully',
      bill: { id: updatedBill.id, ...updatedBill.data() }
    });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update payment' 
    });
  }
});

// Get all credit bills
router.get('/credit/credit-bills', auth, async (req, res) => {
  try {
    const billsRef = db.collection('bills');
    const snapshot = await billsRef
      .where('store', '==', req.user.id)
      .get();
    
    const creditBills = [];
    snapshot.forEach(doc => {
      const bill = doc.data();
      if (bill.payment && bill.payment.methods) {
        const hasCredit = bill.payment.methods.some(method => method.method === 'credit');
        if (hasCredit) {
          creditBills.push({ id: doc.id, ...bill });
        }
      }
    });
    
    creditBills.sort((a, b) => {
      const dateA = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
      const dateB = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return dateB - dateA;
    });
    
    res.json({ success: true, bills: creditBills });
  } catch (error) {
    console.error('Error fetching credit bills:', error);
    res.json({ success: true, bills: [] });
  }
});

// Get payment methods distribution
router.get('/payment-methods/distribution', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = db.collection('bills').where('store', '==', req.user.id);
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      query = query.where('createdAt', '>=', start).where('createdAt', '<=', end);
    }
    
    const snapshot = await query.get();
    
    const distribution = {
      cash: { count: 0, amount: 0 },
      card: { count: 0, amount: 0 },
      ewallet: { count: 0, amount: 0 },
      credit: { count: 0, amount: 0 }
    };
    
    let totalAmount = 0;
    
    snapshot.forEach(doc => {
      const bill = doc.data();
      totalAmount += bill.total || 0;
      
      if (bill.payment && bill.payment.methods) {
        if (bill.payment.type === 'single' && bill.payment.methods[0]) {
          const method = bill.payment.methods[0].method;
          if (distribution[method]) {
            distribution[method].count++;
            distribution[method].amount += bill.payment.methods[0].amount;
          }
        } else if (bill.payment.methods.length > 0) {
          bill.payment.methods.forEach(method => {
            if (distribution[method.method]) {
              distribution[method.method].count++;
              distribution[method.method].amount += method.amount;
            }
          });
        }
      }
    });
    
    res.json({
      success: true,
      distribution,
      totalBills: snapshot.size,
      totalAmount
    });
  } catch (error) {
    console.error('Error fetching payment methods distribution:', error);
    res.json({ 
      success: true, 
      distribution: { cash: { count: 0, amount: 0 }, card: { count: 0, amount: 0 }, ewallet: { count: 0, amount: 0 }, credit: { count: 0, amount: 0 } },
      totalBills: 0,
      totalAmount: 0
    });
  }
});

module.exports = router;