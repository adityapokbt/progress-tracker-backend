const express = require('express');
const auth = require('../middleware/auth');
const Settings = require('../models/Settings');
const { generateQRHash, hasQRContentChanged } = require('../utils/qrCodeUtils');
const QRCode = require('qrcode');
const router = express.Router();

// Get settings for the authenticated user's store
router.get('/', auth, async (req, res) => {
  try {
    const settings = await Settings.findOne({ store: req.user._id });
    
    if (!settings) {
      return res.status(200).json({
        status: 'success',
        data: { 
          settings: {
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
            }
          }
        }
      });
    }
    
    const settingsObj = settings.toObject();
    
    if (settingsObj.qrCodeImage) {
      settingsObj.qrCodeImage = `data:image/${settings.qrCodeImageType};base64,${settings.qrCodeImage.toString('base64')}`;
    }
    
    if (settingsObj.inventoryOptions && settingsObj.inventoryOptions.categories instanceof Map) {
      settingsObj.inventoryOptions.categories = Object.fromEntries(settingsObj.inventoryOptions.categories);
    }
    
    res.status(200).json({
      status: 'success',
      data: { settings: settingsObj }
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
    const currentSettings = await Settings.findOne({ store: req.user._id });
    let updateData = { ...req.body, updatedAt: new Date() };
    
    if (req.body.shopInfo && currentSettings) {
      const newShopInfoString = JSON.stringify(req.body.shopInfo);
      const currentShopInfoString = JSON.stringify(currentSettings.shopInfo);
      
      if (newShopInfoString !== currentShopInfoString) {
        updateData.qrCodeImage = null;
        updateData.qrCodeContent = '';
        updateData.qrCodeHash = '';
      }
    }
    
    const settings = await Settings.findOneAndUpdate(
      { store: req.user._id },
      updateData,
      { new: true, runValidators: true, upsert: true }
    );
    
    const responseSettings = settings.toObject();
    if (responseSettings.qrCodeImage) {
      responseSettings.qrCodeImage = `data:image/${settings.qrCodeImageType};base64,${settings.qrCodeImage.toString('base64')}`;
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
    const { qrCodeImage, qrCodeData } = req.body;
    
    const settings = await Settings.findOneAndUpdate(
      { store: req.user._id },
      { qrCodeImage, qrCodeData },
      { new: true, upsert: true }
    );
    
    res.status(200).json({
      status: 'success',
      message: 'QR code updated successfully',
      data: { settings }
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
    const settings = await Settings.findOne({ store: req.user._id });
    
    if (!settings || !settings.qrCodeImage) {
      return res.status(404).json({
        status: 'fail',
        message: 'QR code not found'
      });
    }
    
    res.set('Content-Type', `image/${settings.qrCodeImageType}`);
    res.send(settings.qrCodeImage);
  } catch (err) {
    console.error('Error fetching QR code image:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching QR code image'
    });
  }
});

// Generate QR code from shop info
router.post('/generate-qr', auth, async (req, res) => {
  try {
    const settings = await Settings.findOne({ store: req.user._id });
    
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
      
      const updatedSettings = await Settings.findOneAndUpdate(
        { store: req.user._id },
        {
          qrCodeImage: imageBuffer,
          qrCodeImageType: 'png',
          qrCodeContent: qrContent,
          qrCodeHash: generateQRHash(qrContent),
          updatedAt: new Date()
        },
        { new: true }
      );
      
      const responseSettings = updatedSettings.toObject();
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

// Helper function to generate QR content from shop info using proper vCard format
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

module.exports = router;