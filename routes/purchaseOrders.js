const express = require('express');
const auth = require('../middleware/auth');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const Settings = require('../models/Settings');
const router = express.Router();

// Generate unique PO number
const generatePONumber = async (storeId) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  
  // Count POs for this store in current month
  const startOfMonth = new Date(year, now.getMonth(), 1);
  const endOfMonth = new Date(year, now.getMonth() + 1, 0);
  
  const count = await PurchaseOrder.countDocuments({
    store: storeId,
    createdAt: {
      $gte: startOfMonth,
      $lte: endOfMonth
    }
  });
  
  return `PO-${year}${month}-${(count + 1).toString().padStart(4, '0')}`;
};

// Function to generate PDF buffer that matches frontend preview
// Function to generate PDF buffer that matches frontend preview
// Function to generate PDF buffer that matches frontend preview
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

      // Get shop info from settings
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
      
      doc.text(`Date: ${new Date(purchaseOrder.orderDate).toLocaleDateString()}`, rightX, y);
      y += 15;
      
      if (purchaseOrder.expectedDeliveryDate) {
        doc.text(`Expected Delivery: ${new Date(purchaseOrder.expectedDeliveryDate).toLocaleDateString()}`, rightX, y);
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

      // Footer with signature and QR code
      y = Math.max(y, 650);
      
      // QR Code on left - SIMPLIFIED APPROACH
    if (settings.qrCodeImage) {
  try {
    console.log('Adding QR code to PDF...');
    console.log('QR code type in generatePDFBuffer:', typeof settings.qrCodeImage);
    
    let qrBuffer;
    
    // Handle different QR code formats
    if (typeof settings.qrCodeImage === 'string' && settings.qrCodeImage.startsWith('data:image/')) {
      console.log('QR code is data URL string');
      // Handle base64 string (remove data URL prefix if present)
      const base64Data = settings.qrCodeImage.replace(/^data:image\/\w+;base64,/, '');
      qrBuffer = Buffer.from(base64Data, 'base64');
      console.log('Converted data URL to buffer, length:', qrBuffer.length);
    }
    else if (typeof settings.qrCodeImage === 'string') {
      console.log('QR code is plain string, length:', settings.qrCodeImage.length);
      // Assume it's already base64 without prefix
      qrBuffer = Buffer.from(settings.qrCodeImage, 'base64');
      console.log('Converted plain string to buffer, length:', qrBuffer.length);
    }
    else if (Buffer.isBuffer(settings.qrCodeImage)) {
      console.log('QR code is Buffer');
      qrBuffer = settings.qrCodeImage;
    }
    else {
      console.log('QR code is in unexpected format:', typeof settings.qrCodeImage);
    }
    
    if (qrBuffer && qrBuffer.length > 0) {
      console.log('QR code buffer size:', qrBuffer.length);
      doc.image(qrBuffer, 50, y, { 
        width: 60, 
        height: 60,
        fit: [60, 60]
      });
      doc.fontSize(8).text('Scan for contact information', 45, y + 65);
      console.log('QR code added successfully');
    } else {
      console.warn('QR code buffer is empty or invalid');
      console.warn('QR code value:', settings.qrCodeImage);
    }
  } catch (qrError) {
    console.error('Error adding QR code to PDF:', qrError);
    console.error('QR code that caused error:', settings.qrCodeImage);
  }
} else {
  console.warn('No QR code image found in settings');
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
    // Get settings information
    const settings = await Settings.findOne({ store: storeId });
    
    if (!settings) {
      throw new Error('Settings not found for this store');
    }
    
    // Convert settings to object and properly handle QR code
    const settingsObj = settings.toObject();
    
    console.log('QR code in database:', !!settingsObj.qrCodeImage);
    console.log('QR code type:', typeof settingsObj.qrCodeImage);
    console.log('QR code value:', settingsObj.qrCodeImage);
    
    // Ensure shopInfo has proper structure
    if (!settingsObj.shopInfo) {
      settingsObj.shopInfo = {
        name: 'My Shop',
        address: '',
        contactNumber: '',
        email: ''
      };
    }

    // Handle different QR code formats
    if (settingsObj.qrCodeImage) {
      // If QR code is an object, try to extract the data
      if (typeof settingsObj.qrCodeImage === 'object' && settingsObj.qrCodeImage !== null) {
        console.log('QR code is an object, trying to extract data');
        
        // Try different possible properties where the image data might be stored
        if (settingsObj.qrCodeImage.data) {
          // If it has a data property (common for Mongoose buffers)
          settingsObj.qrCodeImage = `data:image/png;base64,${settingsObj.qrCodeImage.data.toString('base64')}`;
          console.log('Converted from object.data to base64');
        } 
        else if (settingsObj.qrCodeImage.buffer) {
          // If it has a buffer property
          settingsObj.qrCodeImage = `data:image/png;base64,${settingsObj.qrCodeImage.buffer.toString('base64')}`;
          console.log('Converted from object.buffer to base64');
        }
        else if (settingsObj.qrCodeImage.toString) {
          // Try to convert the object to string
          try {
            const qrString = settingsObj.qrCodeImage.toString();
            if (qrString && !qrString.startsWith('[object')) {
              settingsObj.qrCodeImage = qrString;
              console.log('Converted object to string');
            }
          } catch (e) {
            console.error('Error converting QR object to string:', e);
          }
        }
      }
      
      // If QR code is a Buffer, convert it to base64 string
      if (Buffer.isBuffer(settingsObj.qrCodeImage)) {
        console.log('Converting Buffer QR code to base64');
        settingsObj.qrCodeImage = `data:image/png;base64,${settingsObj.qrCodeImage.toString('base64')}`;
      }
      
      // If QR code is a string but doesn't have data URL prefix, add it
      if (typeof settingsObj.qrCodeImage === 'string' && 
          !settingsObj.qrCodeImage.startsWith('data:image/')) {
        console.log('Adding data URL prefix to QR code string');
        settingsObj.qrCodeImage = `data:image/png;base64,${settingsObj.qrCodeImage}`;
      }
    }

    // Generate PDF
    const pdfBuffer = await generatePDFBuffer(purchaseOrder, settingsObj);
    
    // Configure Nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    
    const shopInfo = settingsObj.shopInfo || {};
    
    // Create email content
    const mailOptions = {
      from: `"${shopInfo.name || 'My Shop'}" <${process.env.EMAIL_USER}>`,
      to: purchaseOrder.supplier.email,
      subject: `Purchase Order - ${purchaseOrder.poNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; text-align: center;">PURCHASE ORDER</h2>
          <hr style="border: 1px solid #ddd;">
          
          <p>Dear ${purchaseOrder.supplier.contactPerson || purchaseOrder.supplier.name},</p>
          
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
    
    // Send email
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email with PDF:', error);
    throw error;
  }
};

// Get all purchase orders for the authenticated user's store
// Test endpoint to verify QR code works
router.post('/test-qr-pdf', auth, async (req, res) => {
  try {
    const settings = await Settings.findOne({ store: req.user._id });
    
    if (!settings) {
      return res.status(404).json({
        status: 'fail',
        message: 'Settings not found'
      });
    }
    
    const settingsObj = settings.toObject();
    
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
    
    // Generate PDF
    const pdfBuffer = await generatePDFBuffer(testPO, settingsObj);
    
    // Send response with PDF
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
// Test endpoint to debug QR code in PDF
router.post('/debug-qr-code', auth, async (req, res) => {
  try {
    const settings = await Settings.findOne({ store: req.user._id });
    
    if (!settings) {
      return res.status(404).json({
        status: 'fail',
        message: 'Settings not found'
      });
    }
    
    const settingsObj = settings.toObject();
    
    console.log('=== DEBUG QR CODE ENDPOINT ===');
    console.log('QR code in database:', !!settingsObj.qrCodeImage);
    console.log('QR code type:', typeof settingsObj.qrCodeImage);
    
    if (settingsObj.qrCodeImage) {
      if (Buffer.isBuffer(settingsObj.qrCodeImage)) {
        console.log('QR code is Buffer, length:', settingsObj.qrCodeImage.length);
        settingsObj.qrCodeImage = `data:image/${settings.qrCodeImageType || 'png'};base64,${settingsObj.qrCodeImage.toString('base64')}`;
      } else if (typeof settingsObj.qrCodeImage === 'string') {
        console.log('QR code is string, length:', settingsObj.qrCodeImage.length);
        if (!settingsObj.qrCodeImage.startsWith('data:image/')) {
          settingsObj.qrCodeImage = `data:image/png;base64,${settingsObj.qrCodeImage}`;
        }
      }
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
      notes: 'This is a test purchase order'
    };
    
    // Generate PDF
    const pdfBuffer = await generatePDFBuffer(testPO, settingsObj);
    
    // Send response with PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=debug-purchase-order.pdf');
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Error debugging QR code:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error debugging QR code'
    });
  }
});
router.get('/', auth, async (req, res) => {
  try {
    const { status, supplier, page = 1, limit = 10 } = req.query;
    let filter = { store: req.user._id };
    
    if (status) filter.status = status;
    if (supplier) filter.supplier = supplier;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const purchaseOrders = await PurchaseOrder.find(filter)
      .populate('supplier', 'name companyName phone email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);
    
    const total = await PurchaseOrder.countDocuments(filter);
    
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
// Debug endpoint to check QR code in database
// Add this debug endpoint to your purchaseOrders.js
router.get('/debug/qr-code-detailed', auth, async (req, res) => {
  try {
    const settings = await Settings.findOne({ store: req.user._id });
    
    if (!settings) {
      return res.status(404).json({
        status: 'fail',
        message: 'Settings not found'
      });
    }
    
    const settingsObj = settings.toObject();
    
    res.status(200).json({
      status: 'success',
      data: {
        hasQRCode: !!settingsObj.qrCodeImage,
        qrCodeType: typeof settingsObj.qrCodeImage,
        qrCodeConstructor: settingsObj.qrCodeImage ? settingsObj.qrCodeImage.constructor.name : 'null',
        qrCodeKeys: settingsObj.qrCodeImage ? Object.keys(settingsObj.qrCodeImage) : [],
        qrCodeValue: settingsObj.qrCodeImage,
        qrCodeImageType: settings.qrCodeImageType,
        shopInfo: settingsObj.shopInfo
      }
    });
  } catch (error) {
    console.error('Error debugging QR code:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error debugging QR code'
    });
  }
});

// Get a specific purchase order
router.get('/:id', auth, async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findOne({ 
      _id: req.params.id, 
      store: req.user._id 
    })
    .populate('supplier', 'name companyName phone email contactPerson address')
    .populate('store', 'storeName businessName');
    
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

// Add this test endpoint to check email configuration
router.post('/test-email', auth, async (req, res) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Send to yourself for testing
      subject: 'Test Email from POS System',
      text: 'This is a test email to verify your email configuration is working.'
    };
    
    await transporter.sendMail(mailOptions);
    
    res.status(200).json({
      status: 'success',
      message: 'Test email sent successfully'
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to send test email: ' + error.message
    });
  }
});

// Create a new purchase order
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
      poNumber = await generatePONumber(req.user._id);
    }
    
    // Check if PO number already exists
    const existingPO = await PurchaseOrder.findOne({ 
      poNumber, 
      store: req.user._id 
    });
    
    if (existingPO) {
      return res.status(400).json({
        status: 'fail',
        message: 'PO number already exists'
      });
    }
    
    const purchaseOrderData = {
      ...req.body,
      poNumber,
      store: req.user._id,
      orderDate: req.body.orderDate || new Date()
    };
    
    const purchaseOrder = await PurchaseOrder.create(purchaseOrderData);
    
    // Populate the supplier details
    await purchaseOrder.populate('supplier', 'name companyName phone email contactPerson');
    
    // If auto-send email is enabled, send the email with PDF
    if (req.body.autoSendEmail) {
      try {
        // Get settings information
        const settings = await Settings.findOne({ store: req.user._id });
        
        if (settings) {
          await sendEmailWithPDF(purchaseOrder, req.user._id);
          purchaseOrder.emailSent = true;
          purchaseOrder.sentAt = new Date();
          await purchaseOrder.save();
        }
      } catch (emailError) {
        console.error('Error sending email:', emailError);
        // Don't fail the whole request if email fails
      }
    }
    
    res.status(201).json({
      status: 'success',
      message: 'Purchase order created successfully',
      data: { purchaseOrder }
    });
  } catch (err) {
    console.error('Error creating purchase order:', err);
    
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(el => el.message);
      return res.status(400).json({
        status: 'fail',
        message: 'Validation error',
        errors
      });
    }
    
    if (err.code === 11000) {
      return res.status(400).json({
        status: 'fail',
        message: 'PO number already exists'
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Error creating purchase order'
    });
  }
});
// Send email with PDF attachment (for auto-send from frontend)
// Add this route to your existing purchaseOrders.js file
// Send email with PDF attachment (for frontend to call)
router.post('/send-email-with-attachment', auth, async (req, res) => {
  try {
    const { poId } = req.body;
    
    if (!poId) {
      return res.status(400).json({
        status: 'error',
        message: 'Purchase order ID is required'
      });
    }
    
    const purchaseOrder = await PurchaseOrder.findOne({
      _id: poId,
      store: req.user._id
    }).populate('supplier', 'name companyName phone email contactPerson address');
    
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
    
    // Send email with PDF using your existing function
    await sendEmailWithPDF(purchaseOrder, req.user._id);
    
    // Update purchase order with email sent status
    purchaseOrder.emailSent = true;
    purchaseOrder.sentAt = new Date();
    await purchaseOrder.save();
    
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

// Send purchase order via Email with Nodemailer and PDF attachment
router.post('/:id/send/email-nodemailer', auth, async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findOne({
      _id: req.params.id,
      store: req.user._id
    }).populate('supplier', 'name companyName phone email contactPerson address');
    
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
    
    // Get settings information
    const settings = await Settings.findOne({ store: req.user._id });
    
    if (!settings) {
      return res.status(404).json({
        status: 'fail',
        message: 'Settings not found for this store'
      });
    }
    
    // Send email with PDF
    await sendEmailWithPDF(purchaseOrder, req.user._id);
    
    // Update purchase order with email sent status
    purchaseOrder.emailSent = true;
    purchaseOrder.sentAt = new Date();
    await purchaseOrder.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Purchase order sent via email successfully',
      data: { purchaseOrder }
    });
  } catch (err) {
    console.error('Error sending email:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error sending purchase order via email'
    });
  }
});

// Send purchase order via Email with Nodemailer and PDF attachment
router.post('/:id/send/email-nodemailer', auth, async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findOne({
      _id: req.params.id,
      store: req.user._id
    }).populate('supplier', 'name companyName phone email contactPerson address');
    
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
    
    // Get settings information
    const settings = await Settings.findOne({ store: req.user._id });
    
    if (!settings) {
      return res.status(404).json({
        status: 'fail',
        message: 'Settings not found for this store'
      });
    }
    
    // Send email with PDF
    await sendEmailWithPDF(purchaseOrder, req.user._id);
    
    // Update purchase order with email sent status
    purchaseOrder.emailSent = true;
    purchaseOrder.sentAt = new Date();
    await purchaseOrder.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Purchase order sent via email successfully',
      data: { purchaseOrder }
    });
  } catch (err) {
    console.error('Error sending email:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error sending purchase order via email'
    });
  }
});

// Update a purchase order with enhanced status handling
router.put('/:id', auth, async (req, res) => {
  try {
    // Validate ID parameter
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid purchase order ID'
      });
    }
    
    // Check if purchase order exists
    const existingPO = await PurchaseOrder.findOne({ 
      _id: req.params.id, 
      store: req.user._id 
    });
    
    if (!existingPO) {
      return res.status(404).json({
        status: 'fail',
        message: 'Purchase order not found'
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
    
    const purchaseOrder = await PurchaseOrder.findOneAndUpdate(
      { _id: req.params.id, store: req.user._id },
      req.body,
      { new: true, runValidators: true }
    )
    .populate('supplier', 'name companyName phone email contactPerson')
    .populate('store', 'storeName businessName');
    
    res.status(200).json({
      status: 'success',
      message: 'Purchase order updated successfully',
      data: { purchaseOrder }
    });
  } catch (err) {
    console.error('Error updating purchase order:', err);
    
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(el => el.message);
      return res.status(400).json({
        status: 'fail',
        message: 'Validation error',
        errors
      });
    }
    
    if (err.name === 'CastError') {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid purchase order ID'
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Error updating purchase order'
    });
  }
});

// Update purchase order status with enhanced workflow
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status, cancellationReason, cancellationNotes, items } = req.body;
    
    if (!['Pending', 'Approved', 'Received', 'Cancelled', 'Partially Received'].includes(status)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid status'
      });
    }
    
    // Additional validation for cancellation
    if (status === 'Cancelled') {
      if (!cancellationReason) {
        return res.status(400).json({
          status: 'fail',
          message: 'Cancellation reason is required'
        });
      }
    }
    
    const updateData = { status };
    
    // Add cancellation details if cancelling
    if (status === 'Cancelled') {
      updateData.cancellationReason = cancellationReason;
      updateData.cancellationNotes = cancellationNotes;
    }
    
    // Update received quantities if provided
    if (items && (status === 'Received' || status === 'Partially Received')) {
      updateData.items = items;
    }
    
    const purchaseOrder = await PurchaseOrder.findOneAndUpdate(
      { _id: req.params.id, store: req.user._id },
      updateData,
      { new: true }
    )
    .populate('supplier', 'name companyName phone email contactPerson')
    .populate('store', 'storeName businessName');
    
    if (!purchaseOrder) {
      return res.status(404).json({
        status: 'fail',
        message: 'Purchase order not found'
      });
    }
    
    // If status is set to Received, update product stock
    if (status === 'Received') {
      for (const item of purchaseOrder.items) {
        let product = await Product.findOne({ 
          name: item.product, 
          store: req.user._id 
        });
        
        if (product) {
          product.stock += item.receivedQuantity || item.quantity;
          await product.save();
        }
      }
    }
    
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

// Send purchase order via WhatsApp
router.post('/:id/send/whatsapp', auth, async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findOne({
      _id: req.params.id,
      store: req.user._id
    }).populate('supplier', 'name companyName phone email contactPerson');
    
    if (!purchaseOrder) {
      return res.status(404).json({
        status: 'fail',
        message: 'Purchase order not found'
      });
    }
    
    if (!purchaseOrder.supplier.phone) {
      return res.status(400).json({
        status: 'fail',
        message: 'Supplier does not have a phone number'
      });
    }
    
    // Update purchase order with WhatsApp sent status
    purchaseOrder.whatsappSent = true;
    purchaseOrder.sentAt = new Date();
    await purchaseOrder.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Purchase order marked as sent via WhatsApp',
      data: { purchaseOrder }
    });
  } catch (err) {
    console.error('Error updating WhatsApp status:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error updating WhatsApp status'
    });
  }
});

// Send purchase order via Email
router.post('/:id/send/email', auth, async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findOne({
      _id: req.params.id,
      store: req.user._id
    }).populate('supplier', 'name companyName phone email contactPerson');
    
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
    
    // Update purchase order with email sent status
    purchaseOrder.emailSent = true;
    purchaseOrder.sentAt = new Date();
    await purchaseOrder.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Purchase order marked as sent via email',
      data: { purchaseOrder }
    });
  } catch (err) {
    console.error('Error updating email status:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error updating email status'
    });
  }
});

// Get supplier performance
router.get('/supplier-performance/:supplierId', auth, async (req, res) => {
  try {
    const { supplierId } = req.params;
    
    const purchaseOrders = await PurchaseOrder.find({
      supplier: supplierId,
      store: req.user._id,
      status: { $in: ['Received', 'Partially Received', 'Cancelled'] }
    });
    
    let totalOrders = purchaseOrders.length;
    let completedOrders = 0;
    let cancelledOrders = 0;
    let totalDeliveryPerformance = 0;
    
    purchaseOrders.forEach(po => {
      if (po.status === 'Received' || po.status === 'Partially Received') {
        completedOrders++;
        totalDeliveryPerformance += po.deliveryPerformance || 0;
      } else if (po.status === 'Cancelled') {
        cancelledOrders++;
      }
    });
    
    const averageDeliveryPerformance = completedOrders > 0 
      ? totalDeliveryPerformance / completedOrders 
      : 0;
    
    const completionRate = totalOrders > 0 
      ? (completedOrders / totalOrders) * 100 
      : 0;
    
    const reliabilityScore = Math.max(0, Math.min(100, 
      completionRate - (cancelledOrders * 10) // Penalize for cancellations
    ));
    
    res.status(200).json({
      status: 'success',
      data: {
        totalOrders,
        completedOrders,
        cancelledOrders,
        averageDeliveryPerformance: Math.round(averageDeliveryPerformance),
        completionRate: Math.round(completionRate),
        reliabilityScore: Math.round(reliabilityScore),
        performanceRating: calculatePerformanceRating(reliabilityScore, averageDeliveryPerformance)
      }
    });
  } catch (err) {
    console.error('Error fetching supplier performance:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching supplier performance'
    });
  }
});

// Helper function to calculate performance rating
const calculatePerformanceRating = (reliabilityScore, deliveryPerformance) => {
  const overallScore = (reliabilityScore * 0.6) + (deliveryPerformance * 0.4);
  
  if (overallScore >= 90) return 'Excellent';
  if (overallScore >= 80) return 'Very Good';
  if (overallScore >= 70) return 'Good';
  if (overallScore >= 60) return 'Average';
  return 'Poor';
};

// Delete a purchase order
router.delete('/:id', auth, async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findOneAndDelete({
      _id: req.params.id,
      store: req.user._id
    });
    
    if (!purchaseOrder) {
      return res.status(404).json({
        status: 'fail',
        message: 'Purchase order not found'
      });
    }
    
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

module.exports = router;