const express = require('express');
const auth = require('../middleware/auth');
const { db } = require('../firebase');
const { generateQRHash, hasQRContentChanged } = require('../utils/qrCodeUtils');
const QRCode = require('qrcode');
const router = express.Router();

// Default settings object
const defaultSettings = {
  theme: 'light',
  vatEnabled: false,
  vatRate: 0,
  pricingMode: 'fixed',
  billingFolder: '/bills',
  shopInfo: {
    name: 'My Shop',
    address: '123 Main Street, Kathmandu',
    phone: '+977-1-1234567',
    contactNumber: '9852052566',
    email: 'shop@example.com',
    facebook: '',
    youtube: '',
    tiktok: '',
    instagram: ''
  },
  inventoryOptions: {
    categories: {},
    sizes: [],
    colors: []
  },
  transactionSettings: {
    allowDelete: true,
    deleteRequiresPassword: false
  },
  createdAt: new Date(),
  updatedAt: new Date()
};

// Helper function to find settings by store
const findSettingsByStore = async (storeId) => {
  const settingsRef = db.collection('settings');
  const snapshot = await settingsRef.where('store', '==', storeId).limit(1).get();
  
  if (snapshot.empty) return null;
  
  const doc = snapshot.docs[0];
  const settings = { id: doc.id, ...doc.data() };
  
  // Convert Map to Object if needed
  if (settings.inventoryOptions && settings.inventoryOptions.categories instanceof Map) {
    settings.inventoryOptions.categories = Object.fromEntries(settings.inventoryOptions.categories);
  }
  
  return settings;
};

// Helper function to create or update settings
const upsertSettings = async (storeId, updateData) => {
  const settingsRef = db.collection('settings');
  const snapshot = await settingsRef.where('store', '==', storeId).limit(1).get();
  
  const dataToSave = {
    ...updateData,
    store: storeId,
    updatedAt: new Date()
  };
  
  if (snapshot.empty) {
    // Create new settings
    const docRef = await settingsRef.add({
      ...defaultSettings,
      ...dataToSave,
      createdAt: new Date()
    });
    const newDoc = await docRef.get();
    return { id: newDoc.id, ...newDoc.data() };
  } else {
    // Update existing settings
    const docRef = snapshot.docs[0].ref;
    await docRef.update(dataToSave);
    const updatedDoc = await docRef.get();
    return { id: updatedDoc.id, ...updatedDoc.data() };
  }
};

// Helper function to generate QR content from shop info
function generateQRContentFromShopInfo(shopInfo) {
  // Create proper vCard format that works on both iOS and Android
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${shopInfo.name || 'My Shop'}`,
    `ORG:${shopInfo.name || 'My Shop'}`
  ];
  
  // Format phone numbers for vCard
  const formatPhoneNumber = (phone) => {
    return phone ? phone.replace(/[^0-9+]/g, '') : '';
  };
  
  if (shopInfo.contactNumber) {
    lines.push(`TEL;TYPE=CELL,VOICE:${formatPhoneNumber(shopInfo.contactNumber)}`);
  }
  
  if (shopInfo.phone) {
    lines.push(`TEL;TYPE=WORK,VOICE:${formatPhoneNumber(shopInfo.phone)}`);
  }
  
  if (shopInfo.email) {
    lines.push(`EMAIL:${shopInfo.email}`);
  }
  
  if (shopInfo.address) {
    lines.push(`ADR;TYPE=WORK:;;${shopInfo.address};;;`);
  }
  
  // Social media links - iOS prefers these in the NOTE field
  const socialMediaNote = [];
  if (shopInfo.facebook) socialMediaNote.push(`Facebook: ${shopInfo.facebook}`);
  if (shopInfo.youtube) socialMediaNote.push(`YouTube: ${shopInfo.youtube}`);
  if (shopInfo.tiktok) {
    const tiktokId = shopInfo.tiktok.replace('@', '');
    socialMediaNote.push(`TikTok: https://tiktok.com/${tiktokId}`);
  }
  if (shopInfo.instagram) socialMediaNote.push(`Instagram: ${shopInfo.instagram}`);
  
  if (socialMediaNote.length > 0) {
    lines.push(`NOTE:${socialMediaNote.join('\\n')}`);
  }
  
  // Add URL fields for all social media (iOS recognizes these)
  if (shopInfo.facebook) lines.push(`URL:${shopInfo.facebook}`);
  if (shopInfo.youtube) lines.push(`URL:${shopInfo.youtube}`);
  if (shopInfo.tiktok) {
    const tiktokId = shopInfo.tiktok.replace('@', '');
    lines.push(`URL:https://tiktok.com/${tiktokId}`);
  }
  if (shopInfo.instagram) lines.push(`URL:${shopInfo.instagram}`);
  
  lines.push('END:VCARD');
  
  return lines.join('\n') || 'No contact information configured';
}

// Get settings for the authenticated user's store
router.get('/', auth, async (req, res) => {
  try {
    let settings = await findSettingsByStore(req.user.id);
    
    if (!settings) {
      // Return default settings if none exist
      return res.status(200).json({
        status: 'success',
        data: { settings: defaultSettings }
      });
    }
    
    // Convert QR code image to base64 for response if it exists
    if (settings.qrCodeImage && settings.qrCodeImage.buffer) {
      const qrImageBuffer = settings.qrCodeImage.buffer;
      settings.qrCodeImage = `data:image/${settings.qrCodeImageType || 'png'};base64,${qrImageBuffer.toString('base64')}`;
    } else if (settings.qrCodeImage && Buffer.isBuffer(settings.qrCodeImage)) {
      settings.qrCodeImage = `data:image/${settings.qrCodeImageType || 'png'};base64,${settings.qrCodeImage.toString('base64')}`;
    }
    
    res.status(200).json({
      status: 'success',
      data: { settings }
    });
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching settings'
    });
  }
});

// Update settings
router.put('/', auth, async (req, res) => {
  try {
    const currentSettings = await findSettingsByStore(req.user.id);
    let updateData = { ...req.body };
    
    // Check if shop info changed - if so, clear QR code
    if (req.body.shopInfo && currentSettings) {
      const newShopInfoString = JSON.stringify(req.body.shopInfo);
      const currentShopInfoString = JSON.stringify(currentSettings.shopInfo);
      
      if (newShopInfoString !== currentShopInfoString) {
        updateData.qrCodeImage = null;
        updateData.qrCodeImageType = null;
        updateData.qrCodeContent = '';
        updateData.qrCodeHash = '';
      }
    }
    
    const settings = await upsertSettings(req.user.id, updateData);
    
    // Convert QR code image to base64 for response
    const responseSettings = { ...settings };
    if (responseSettings.qrCodeImage && responseSettings.qrCodeImage.buffer) {
      const qrImageBuffer = responseSettings.qrCodeImage.buffer;
      responseSettings.qrCodeImage = `data:image/${responseSettings.qrCodeImageType || 'png'};base64,${qrImageBuffer.toString('base64')}`;
    } else if (responseSettings.qrCodeImage && Buffer.isBuffer(responseSettings.qrCodeImage)) {
      responseSettings.qrCodeImage = `data:image/${responseSettings.qrCodeImageType || 'png'};base64,${responseSettings.qrCodeImage.toString('base64')}`;
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Settings updated successfully',
      data: { settings: responseSettings }
    });
  } catch (err) {
    console.error('Error updating settings:', err);
    
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
      message: 'Error updating settings'
    });
  }
});

// Update QR code
router.post('/qr-code', auth, async (req, res) => {
  try {
    const { qrCodeImage, qrCodeData, qrCodeImageType } = req.body;
    
    // Handle base64 image data
    let qrImageBuffer = null;
    if (qrCodeImage && qrCodeImage.startsWith('data:image/')) {
      const base64Data = qrCodeImage.replace(/^data:image\/\w+;base64,/, '');
      qrImageBuffer = Buffer.from(base64Data, 'base64');
    } else if (qrCodeImage && Buffer.isBuffer(qrCodeImage)) {
      qrImageBuffer = qrCodeImage;
    }
    
    const settings = await upsertSettings(req.user.id, {
      qrCodeImage: qrImageBuffer,
      qrCodeImageType: qrCodeImageType || 'png',
      qrCodeContent: qrCodeData,
      updatedAt: new Date()
    });
    
    const responseSettings = { ...settings };
    if (responseSettings.qrCodeImage && responseSettings.qrCodeImage.buffer) {
      const qrImageBuf = responseSettings.qrCodeImage.buffer;
      responseSettings.qrCodeImage = `data:image/${responseSettings.qrCodeImageType || 'png'};base64,${qrImageBuf.toString('base64')}`;
    } else if (responseSettings.qrCodeImage && Buffer.isBuffer(responseSettings.qrCodeImage)) {
      responseSettings.qrCodeImage = `data:image/${responseSettings.qrCodeImageType || 'png'};base64,${responseSettings.qrCodeImage.toString('base64')}`;
    }
    
    res.status(200).json({
      status: 'success',
      message: 'QR code updated successfully',
      data: { settings: responseSettings }
    });
  } catch (error) {
    console.error('Error updating QR code:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating QR code'
    });
  }
});

// Get QR code image
router.get('/qr-code/image', auth, async (req, res) => {
  try {
    const settings = await findSettingsByStore(req.user.id);
    
    if (!settings || !settings.qrCodeImage) {
      // Return 204 No Content instead of 404 to prevent frontend errors
      return res.status(204).send();
    }
    
    let qrBuffer;
    if (settings.qrCodeImage.buffer) {
      qrBuffer = settings.qrCodeImage.buffer;
    } else if (Buffer.isBuffer(settings.qrCodeImage)) {
      qrBuffer = settings.qrCodeImage;
    } else {
      return res.status(204).send();
    }
    
    res.set('Content-Type', `image/${settings.qrCodeImageType || 'png'}`);
    res.send(qrBuffer);
  } catch (err) {
    console.error('Error fetching QR code image:', err);
    res.status(204).send(); // Return no content instead of error
  }
});

// Generate QR code from shop info
router.post('/generate-qr', auth, async (req, res) => {
  try {
    const settings = await findSettingsByStore(req.user.id);
    
    if (!settings) {
      return res.status(404).json({
        status: 'fail',
        message: 'Settings not found'
      });
    }
    
    const qrContent = generateQRContentFromShopInfo(settings.shopInfo);
    
    if (!qrContent || qrContent === 'No contact information configured') {
      return res.status(400).json({
        status: 'fail',
        message: 'No shop information available to generate QR code'
      });
    }
    
    // Always generate a new QR code when this endpoint is called
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(qrContent, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'H' // Highest error correction
      });
      
      const base64Data = qrCodeDataUrl.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      const updatedSettings = await upsertSettings(req.user.id, {
        qrCodeImage: imageBuffer,
        qrCodeImageType: 'png',
        qrCodeContent: qrContent,
        qrCodeHash: generateQRHash(qrContent),
        updatedAt: new Date()
      });
      
      // Convert to base64 for response
      const responseSettings = { ...updatedSettings };
      responseSettings.qrCodeImage = qrCodeDataUrl;
      
      res.status(200).json({
        status: 'success',
        message: 'QR code generated successfully',
        data: { settings: responseSettings }
      });
    } catch (qrError) {
      console.error('QR code generation error:', qrError);
      res.status(500).json({
        status: 'error',
        message: 'Failed to generate QR code image'
      });
    }
  } catch (err) {
    console.error('Error generating QR code:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error generating QR code'
    });
  }
});

// Get shop info for public QR code display (no auth required)
router.get('/public/shop-info/:storeId', async (req, res) => {
  try {
    const { storeId } = req.params;
    const settings = await findSettingsByStore(storeId);
    
    if (!settings || !settings.shopInfo) {
      return res.status(404).json({
        status: 'fail',
        message: 'Shop information not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        shopInfo: settings.shopInfo,
        qrCodeContent: settings.qrCodeContent || null
      }
    });
  } catch (err) {
    console.error('Error fetching public shop info:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching shop information'
    });
  }
});

module.exports = router;