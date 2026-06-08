const express = require('express');
const auth = require('../middleware/auth');
const { db } = require('../firebase');
const { FieldValue } = require('firebase-admin/firestore');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const router = express.Router();

// Helper function to get next PO number
const generatePONumber = async (storeId) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  
  // Count POs for this store in current month
  const startOfMonth = new Date(year, now.getMonth(), 1);
  const endOfMonth = new Date(year, now.getMonth() + 1, 0);
  
  const purchaseOrdersRef = db.collection('purchaseOrders');
  const snapshot = await purchaseOrdersRef
    .where('store', '==', storeId)
    .where('createdAt', '>=', startOfMonth)
    .where('createdAt', '<=', endOfMonth)
    .get();
  
  const count = snapshot.size;
  return `PO-${year}${month}-${(count + 1).toString().padStart(4, '0')}`;
};

// Helper function to find purchase order by ID and store
const findPurchaseOrderById = async (id, storeId) => {
  const poRef = db.collection('purchaseOrders').doc(id);
  const poDoc = await poRef.get();
  
  if (!poDoc.exists) return null;
  
  const po = { id: poDoc.id, ...poDoc.data() };
  
  // Verify store ownership
  if (po.store !== storeId) return null;
  
  // Fetch supplier data if needed
  if (po.supplier && typeof po.supplier === 'string') {
    const supplierRef = db.collection('suppliers').doc(po.supplier);
    const supplierDoc = await supplierRef.get();
    if (supplierDoc.exists) {
      po.supplier = { id: supplierDoc.id, ...supplierDoc.data() };
    }
  }
  
  return po;
};

// Helper function to find supplier by ID
const findSupplierById = async (id) => {
  const supplierRef = db.collection('suppliers').doc(id);
  const supplierDoc = await supplierRef.get();
  
  if (!supplierDoc.exists) return null;
  return { id: supplierDoc.id, ...supplierDoc.data() };
};

// Helper function to find settings by store
const findSettingsByStore = async (storeId) => {
  const settingsRef = db.collection('settings');
  const snapshot = await settingsRef.where('store', '==', storeId).limit(1).get();
  
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
};

// Helper function to update product stock
const updateProductStock = async (productId, quantity, storeId) => {
  const productRef = db.collection('products').doc(productId);
  const productDoc = await productRef.get();
  
  if (productDoc.exists) {
    const product = productDoc.data();
    if (product.store === storeId) {
      await productRef.update({
        stock: FieldValue.increment(quantity),
        updatedAt: new Date()
      });
    }
  }
};

// Function to generate PDF buffer
const generatePDFBuffer = async (purchaseOrder, settings) => {
  return new Promise((resolve, reject) => {
    try {
      console.log('=== PDF GENERATION START ===');
      
      const doc = new PDFDocument({ 
        margin: 40, 
        size: 'A4',
        bufferPages: true
      });
      
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        console.log('=== PDF GENERATION COMPLETE ===');
        resolve(pdfData);
      });

      const shopInfo = settings.shopInfo || {};
      
      // Store information (left side)
      doc.fontSize(16).font('Helvetica-Bold')
         .text(shopInfo.name || 'Your Store', 50, 50);
      
      doc.fontSize(10).font('Helvetica');
      let y = 70;
      
      if (shopInfo.address) {
        doc.text(shopInfo.address, 50, y);
        y += 15;
      }
      if (shopInfo.contactNumber) {
        doc.text(`Phone: ${shopInfo.contactNumber}`, 50, y);
        y += 15;
      }
      if (shopInfo.email) {
        doc.text(`Email: ${shopInfo.email}`, 50, y);
        y += 15;
      }

      // Dates (right side)
      y = 70;
      const rightX = 350;
      
      const orderDate = purchaseOrder.orderDate?.toDate ? purchaseOrder.orderDate.toDate() : new Date(purchaseOrder.orderDate);
      doc.text(`Date: ${orderDate.toLocaleDateString()}`, rightX, y);
      y += 15;
      
      if (purchaseOrder.expectedDeliveryDate) {
        const deliveryDate = purchaseOrder.expectedDeliveryDate.toDate ? purchaseOrder.expectedDeliveryDate.toDate() : new Date(purchaseOrder.expectedDeliveryDate);
        doc.text(`Expected Delivery: ${deliveryDate.toLocaleDateString()}`, rightX, y);
        y += 15;
      } else {
        doc.text('Expected Delivery: Not specified', rightX, y);
        y += 15;
      }

      // Main title - centered
      y += 30;
      doc.fontSize(20).font('Helvetica-Bold')
         .text('PURCHASE ORDER', 0, y, { align: 'center' });
      
      y += 40;

      // Supplier information
      doc.fontSize(12).font('Helvetica-Bold').text('Supplier Information:', 50, y);
      y += 20;
      
      const supplier = purchaseOrder.supplier;
      doc.font('Helvetica');
      doc.text(supplier.name || supplier.companyName || 'Unknown Supplier', 50, y);
      y += 15;
      
      if (supplier.phone) {
        doc.text(`Phone: ${supplier.phone}`, 50, y);
        y += 15;
      }
      
      if (supplier.email) {
        doc.text(`Email: ${supplier.email}`, 50, y);
        y += 15;
      }

      // Items table
      y += 20;
      const tableTop = y;
      
      // Table headers
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Product', 50, tableTop);
      doc.text('Brand', 150, tableTop);
      doc.text('Fabric', 220, tableTop);
      doc.text('Size', 280, tableTop);
      doc.text('Color', 320, tableTop);
      doc.text('Qty', 380, tableTop);
      
      // Draw line under headers
      doc.moveTo(50, tableTop + 15).lineTo(450, tableTop + 15).stroke();
      
      // Table rows
      y = tableTop + 25;
      doc.font('Helvetica').fontSize(10);
      
      purchaseOrder.items.forEach((item, index) => {
        if (y > 650) {
          doc.addPage();
          y = 50;
        }
        
        doc.text(item.product || '-', 50, y);
        doc.text(item.brand || '-', 150, y);
        doc.text(item.fabric || '-', 220, y);
        doc.text(item.size || '-', 280, y);
        doc.text(item.color || '-', 320, y);
        doc.text(item.quantity.toString(), 380, y);
        y += 20;
      });

      // Notes section
      if (purchaseOrder.notes) {
        y += 30;
        doc.fontSize(12).font('Helvetica-Bold').text('Notes:', 50, y);
        y += 20;
        doc.font('Helvetica').fontSize(10).text(purchaseOrder.notes, 50, y, {
          width: 500,
          align: 'left'
        });
        y += 30;
      }

      // Footer
      y = Math.max(y, 650);
      
      // QR Code on left
      if (settings.qrCodeImage) {
        try {
          let qrBuffer;
          
          if (typeof settings.qrCodeImage === 'string' && settings.qrCodeImage.startsWith('data:image/')) {
            const base64Data = settings.qrCodeImage.replace(/^data:image\/\w+;base64,/, '');
            qrBuffer = Buffer.from(base64Data, 'base64');
          } else if (typeof settings.qrCodeImage === 'string') {
            qrBuffer = Buffer.from(settings.qrCodeImage, 'base64');
          } else if (Buffer.isBuffer(settings.qrCodeImage)) {
            qrBuffer = settings.qrCodeImage;
          }
          
          if (qrBuffer && qrBuffer.length > 0) {
            doc.image(qrBuffer, 50, y, { width: 60, height: 60 });
            doc.fontSize(8).text('Scan for contact information', 45, y + 65);
          }
        } catch (qrError) {
          console.error('Error adding QR code to PDF:', qrError);
        }
      }
      
      // Signature on right
      doc.fontSize(10);
      doc.text('_________________________', 400, y + 20);
      doc.text('Authorized Signature', 400, y + 35);
      doc.text(shopInfo.name || 'Your Company', 400, y + 50);

      doc.end();
    } catch (error) {
      console.error('Error generating PDF:', error);
      reject(error);
    }
  });
};

// Helper function to send email with PDF
const sendEmailWithPDF = async (purchaseOrder, storeId) => {
  try {
    const settings = await findSettingsByStore(storeId);
    
    if (!settings) {
      throw new Error('Settings not found for this store');
    }
    
    const pdfBuffer = await generatePDFBuffer(purchaseOrder, settings);
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    
    const shopInfo = settings.shopInfo || {};
    const supplier = purchaseOrder.supplier;
    
    const mailOptions = {
      from: `"${shopInfo.name || 'My Shop'}" <${process.env.EMAIL_USER}>`,
      to: supplier.email,
      subject: `Purchase Order - ${purchaseOrder.poNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; text-align: center;">PURCHASE ORDER</h2>
          <hr style="border: 1px solid #ddd;">
          
          <p>Dear ${supplier.contactPerson || supplier.name},</p>
          
          <p>Please find attached our purchase order #${purchaseOrder.poNumber}.</p>
          
          <p><strong>Expected Delivery Date:</strong> ${purchaseOrder.expectedDeliveryDate ? new Date(purchaseOrder.expectedDeliveryDate).toLocaleDateString() : 'Not specified'}</p>
          
          <p>Thank you for your business!</p>
          
          <br>
          <p>Best regards,<br><strong>${shopInfo.name || 'My Shop'}</strong></p>
        </div>
      `,
      attachments: [
        {
          filename: `Purchase_Order_${purchaseOrder.poNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };
    
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email with PDF:', error);
    throw error;
  }
};

// Get all purchase orders for the authenticated user's store
router.get('/', auth, async (req, res) => {
  try {
    const { status, supplier, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    let query = db.collection('purchaseOrders').where('store', '==', req.user.id);
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    if (supplier) {
      query = query.where('supplier.id', '==', supplier);
    }
    
    const snapshot = await query
      .orderBy('createdAt', 'desc')
      .limit(limitNum)
      .get();
    
    // For pagination with startAfter, we need a more complex approach
    // For simplicity, we'll fetch all and slice
    const allSnapshot = await db.collection('purchaseOrders')
      .where('store', '==', req.user.id)
      .get();
    
    const total = allSnapshot.size;
    
    const purchaseOrders = [];
    for (const doc of snapshot.docs) {
      const po = { id: doc.id, ...doc.data() };
      
      // Fetch supplier details if it's a reference ID
      if (po.supplier && typeof po.supplier === 'string') {
        const supplierData = await findSupplierById(po.supplier);
        if (supplierData) {
          po.supplier = supplierData;
        }
      }
      
      purchaseOrders.push(po);
    }
    
    res.status(200).json({
      status: 'success',
      results: purchaseOrders.length,
      data: { 
        purchaseOrders,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (err) {
    console.error('Error fetching purchase orders:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching purchase orders'
    });
  }
});

// Get a specific purchase order
router.get('/:id', auth, async (req, res) => {
  try {
    const purchaseOrder = await findPurchaseOrderById(req.params.id, req.user.id);
    
    if (!purchaseOrder) {
      return res.status(404).json({
        status: 'fail',
        message: 'Purchase order not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: { purchaseOrder }
    });
  } catch (err) {
    console.error('Error fetching purchase order:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching purchase order'
    });
  }
});

// Create a new purchase order
router.post('/', auth, async (req, res) => {
  try {
    // Validate items
    if (!req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'At least one item is required'
      });
    }
    
    // Validate each item
    for (let i = 0; i < req.body.items.length; i++) {
      const item = req.body.items[i];
      if (!item.product || item.product.trim() === '') {
        return res.status(400).json({
          status: 'fail',
          message: `Product name is required for item ${i + 1}`
        });
      }
      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({
          status: 'fail',
          message: `Valid quantity is required for item ${i + 1}`
        });
      }
    }
    
    // Generate PO number if not provided
    let poNumber = req.body.poNumber;
    if (!poNumber) {
      poNumber = await generatePONumber(req.user.id);
    }
    
    // Check if PO number already exists
    const posRef = db.collection('purchaseOrders');
    const existingSnapshot = await posRef
      .where('poNumber', '==', poNumber)
      .where('store', '==', req.user.id)
      .limit(1)
      .get();
    
    if (!existingSnapshot.empty) {
      return res.status(400).json({
        status: 'fail',
        message: 'PO number already exists'
      });
    }
    
    // Handle supplier (could be object or ID)
    let supplierData = req.body.supplier;
    if (supplierData && typeof supplierData === 'string') {
      const supplier = await findSupplierById(supplierData);
      if (!supplier) {
        return res.status(400).json({
          status: 'fail',
          message: 'Supplier not found'
        });
      }
      supplierData = supplier;
    }
    
    const purchaseOrderData = {
      poNumber,
      store: req.user.id,
      supplier: supplierData,
      items: req.body.items,
      status: req.body.status || 'Pending',
      orderDate: req.body.orderDate ? new Date(req.body.orderDate) : new Date(),
      notes: req.body.notes || '',
      createdAt: new Date(),
      updatedAt: new Date(),
      emailSent: false,
      whatsappSent: false
    };
    
    if (req.body.expectedDeliveryDate) {
      purchaseOrderData.expectedDeliveryDate = new Date(req.body.expectedDeliveryDate);
    }
    
    const docRef = await posRef.add(purchaseOrderData);
    const purchaseOrder = { id: docRef.id, ...purchaseOrderData };
    
    // If auto-send email is enabled, send the email with PDF
    if (req.body.autoSendEmail && supplierData.email) {
      try {
        await sendEmailWithPDF(purchaseOrder, req.user.id);
        
        // Update email sent status
        await docRef.update({
          emailSent: true,
          sentAt: new Date(),
          updatedAt: new Date()
        });
        purchaseOrder.emailSent = true;
      } catch (emailError) {
        console.error('Error sending email:', emailError);
      }
    }
    
    res.status(201).json({
      status: 'success',
      message: 'Purchase order created successfully',
      data: { purchaseOrder }
    });
  } catch (err) {
    console.error('Error creating purchase order:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error creating purchase order'
    });
  }
});

// Update a purchase order
router.put('/:id', auth, async (req, res) => {
  try {
    const poRef = db.collection('purchaseOrders').doc(req.params.id);
    const poDoc = await poRef.get();
    
    if (!poDoc.exists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Purchase order not found'
      });
    }
    
    const existingPO = { id: poDoc.id, ...poDoc.data() };
    
    if (existingPO.store !== req.user.id) {
      return res.status(403).json({
        status: 'fail',
        message: 'Unauthorized'
      });
    }
    
    // Validate items if provided
    if (req.body.items && Array.isArray(req.body.items)) {
      for (let i = 0; i < req.body.items.length; i++) {
        const item = req.body.items[i];
        if (!item.product || item.product.trim() === '') {
          return res.status(400).json({
            status: 'fail',
            message: `Product name is required for item ${i + 1}`
          });
        }
      }
    }
    
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };
    
    // Handle date conversions
    if (req.body.orderDate) {
      updateData.orderDate = new Date(req.body.orderDate);
    }
    if (req.body.expectedDeliveryDate) {
      updateData.expectedDeliveryDate = new Date(req.body.expectedDeliveryDate);
    }
    
    await poRef.update(updateData);
    const updatedDoc = await poRef.get();
    const purchaseOrder = { id: updatedDoc.id, ...updatedDoc.data() };
    
    res.status(200).json({
      status: 'success',
      message: 'Purchase order updated successfully',
      data: { purchaseOrder }
    });
  } catch (err) {
    console.error('Error updating purchase order:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error updating purchase order'
    });
  }
});

// Update purchase order status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status, cancellationReason, cancellationNotes, items } = req.body;
    const validStatuses = ['Pending', 'Approved', 'Received', 'Cancelled', 'Partially Received'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid status'
      });
    }
    
    const poRef = db.collection('purchaseOrders').doc(req.params.id);
    const poDoc = await poRef.get();
    
    if (!poDoc.exists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Purchase order not found'
      });
    }
    
    const existingPO = { id: poDoc.id, ...poDoc.data() };
    
    if (existingPO.store !== req.user.id) {
      return res.status(403).json({
        status: 'fail',
        message: 'Unauthorized'
      });
    }
    
    const updateData = { 
      status, 
      updatedAt: new Date() 
    };
    
    // Add cancellation details if cancelling
    if (status === 'Cancelled') {
      if (!cancellationReason) {
        return res.status(400).json({
          status: 'fail',
          message: 'Cancellation reason is required'
        });
      }
      updateData.cancellationReason = cancellationReason;
      updateData.cancellationNotes = cancellationNotes || '';
    }
    
    // Update received quantities if provided
    if (items && (status === 'Received' || status === 'Partially Received')) {
      updateData.items = items;
    }
    
    await poRef.update(updateData);
    
    // If status is set to Received, update product stock
    if (status === 'Received') {
      for (const item of existingPO.items) {
        // Try to find product by name (or you could store productId in the PO)
        const productsRef = db.collection('products');
        const productSnapshot = await productsRef
          .where('name', '==', item.product)
          .where('store', '==', req.user.id)
          .limit(1)
          .get();
        
        if (!productSnapshot.empty) {
          const productDoc = productSnapshot.docs[0];
          const receivedQty = item.receivedQuantity || item.quantity;
          await productDoc.ref.update({
            stock: FieldValue.increment(receivedQty),
            updatedAt: new Date()
          });
        }
      }
    }
    
    const updatedDoc = await poRef.get();
    const purchaseOrder = { id: updatedDoc.id, ...updatedDoc.data() };
    
    res.status(200).json({
      status: 'success',
      message: 'Purchase order status updated successfully',
      data: { purchaseOrder }
    });
  } catch (err) {
    console.error('Error updating purchase order status:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error updating purchase order status'
    });
  }
});

// Send email with PDF attachment
router.post('/send-email-with-attachment', auth, async (req, res) => {
  try {
    const { poId } = req.body;
    
    if (!poId) {
      return res.status(400).json({
        status: 'error',
        message: 'Purchase order ID is required'
      });
    }
    
    const purchaseOrder = await findPurchaseOrderById(poId, req.user.id);
    
    if (!purchaseOrder) {
      return res.status(404).json({
        status: 'fail',
        message: 'Purchase order not found'
      });
    }
    
    if (!purchaseOrder.supplier.email) {
      return res.status(400).json({
        status: 'fail',
        message: 'Supplier does not have an email address'
      });
    }
    
    await sendEmailWithPDF(purchaseOrder, req.user.id);
    
    // Update purchase order with email sent status
    const poRef = db.collection('purchaseOrders').doc(poId);
    await poRef.update({
      emailSent: true,
      sentAt: new Date(),
      updatedAt: new Date()
    });
    
    res.status(200).json({
      status: 'success',
      message: 'Email sent successfully with PDF attachment'
    });
  } catch (error) {
    console.error('Error sending email with attachment:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to send email with attachment: ' + error.message
    });
  }
});

// Send purchase order via Email
router.post('/:id/send/email', auth, async (req, res) => {
  try {
    const purchaseOrder = await findPurchaseOrderById(req.params.id, req.user.id);
    
    if (!purchaseOrder) {
      return res.status(404).json({
        status: 'fail',
        message: 'Purchase order not found'
      });
    }
    
    if (!purchaseOrder.supplier.email) {
      return res.status(400).json({
        status: 'fail',
        message: 'Supplier does not have an email address'
      });
    }
    
    await sendEmailWithPDF(purchaseOrder, req.user.id);
    
    // Update purchase order with email sent status
    const poRef = db.collection('purchaseOrders').doc(req.params.id);
    await poRef.update({
      emailSent: true,
      sentAt: new Date(),
      updatedAt: new Date()
    });
    
    const updatedDoc = await poRef.get();
    const updatedPO = { id: updatedDoc.id, ...updatedDoc.data() };
    
    res.status(200).json({
      status: 'success',
      message: 'Purchase order sent via email successfully',
      data: { purchaseOrder: updatedPO }
    });
  } catch (err) {
    console.error('Error sending email:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error sending purchase order via email'
    });
  }
});

// Mark as sent via WhatsApp
router.post('/:id/send/whatsapp', auth, async (req, res) => {
  try {
    const poRef = db.collection('purchaseOrders').doc(req.params.id);
    const poDoc = await poRef.get();
    
    if (!poDoc.exists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Purchase order not found'
      });
    }
    
    const purchaseOrder = { id: poDoc.id, ...poDoc.data() };
    
    if (purchaseOrder.store !== req.user.id) {
      return res.status(403).json({
        status: 'fail',
        message: 'Unauthorized'
      });
    }
    
    if (!purchaseOrder.supplier.phone) {
      return res.status(400).json({
        status: 'fail',
        message: 'Supplier does not have a phone number'
      });
    }
    
    await poRef.update({
      whatsappSent: true,
      sentAt: new Date(),
      updatedAt: new Date()
    });
    
    const updatedDoc = await poRef.get();
    const updatedPO = { id: updatedDoc.id, ...updatedDoc.data() };
    
    res.status(200).json({
      status: 'success',
      message: 'Purchase order marked as sent via WhatsApp',
      data: { purchaseOrder: updatedPO }
    });
  } catch (err) {
    console.error('Error updating WhatsApp status:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error updating WhatsApp status'
    });
  }
});

// Delete a purchase order
router.delete('/:id', auth, async (req, res) => {
  try {
    const poRef = db.collection('purchaseOrders').doc(req.params.id);
    const poDoc = await poRef.get();
    
    if (!poDoc.exists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Purchase order not found'
      });
    }
    
    const purchaseOrder = { id: poDoc.id, ...poDoc.data() };
    
    if (purchaseOrder.store !== req.user.id) {
      return res.status(403).json({
        status: 'fail',
        message: 'Unauthorized'
      });
    }
    
    await poRef.delete();
    
    res.status(200).json({
      status: 'success',
      message: 'Purchase order deleted successfully',
      data: null
    });
  } catch (err) {
    console.error('Error deleting purchase order:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error deleting purchase order'
    });
  }
});

// Test endpoint for QR code
router.post('/test-qr-pdf', auth, async (req, res) => {
  try {
    const settings = await findSettingsByStore(req.user.id);
    
    if (!settings) {
      return res.status(404).json({
        status: 'fail',
        message: 'Settings not found'
      });
    }
    
    // Create a test purchase order
    const testPO = {
      poNumber: 'TEST-PO-001',
      supplier: {
        name: 'Test Supplier',
        companyName: 'Test Company',
        phone: '123-456-7890',
        email: 'test@supplier.com',
        contactPerson: 'Test Person'
      },
      items: [
        {
          product: 'Test Product',
          quantity: 10,
          brand: 'Test Brand',
          fabric: 'Test Fabric',
          size: 'M',
          color: 'Red'
        }
      ],
      orderDate: new Date(),
      notes: 'This is a test purchase order with QR code'
    };
    
    const pdfBuffer = await generatePDFBuffer(testPO, settings);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=test-purchase-order.pdf');
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Error testing QR PDF:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error testing QR PDF'
    });
  }
});

module.exports = router;