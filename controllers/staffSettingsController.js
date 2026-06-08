const { db } = require('../firebase');
const { FieldValue } = require('firebase-admin/firestore');

// Helper function to find or create staff settings
const findOrCreateStaffSettings = async (storeId) => {
  const settingsRef = db.collection('staffSettings');
  const snapshot = await settingsRef.where('store', '==', storeId).limit(1).get();
  
  if (!snapshot.empty) {
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  }
  
  // Default settings
  const defaultSettings = {
    store: storeId,
    openingTime: '09:00',
    closingTime: '18:00',
    panNumber: '',
    defaultShiftHours: 8,
    overtimeRate: 1.5,
    maxLeavesPerYear: 15,
    requireManagerApprovalForLeave: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const docRef = await settingsRef.add(defaultSettings);
  return { id: docRef.id, ...defaultSettings };
};

exports.getStaffSettings = async (req, res) => {
  try {
    console.log('getStaffSettings called with user:', req.user);
    
    if (!req.user || !req.user.id) {
      console.log('No user found in request');
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const settings = await findOrCreateStaffSettings(req.user.id);
    
    console.log('Returning settings:', settings);
    res.json({ settings });
  } catch (error) {
    console.error('Unexpected error in getStaffSettings:', error);
    res.status(500).json({
      message: 'Server error while fetching staff settings',
      error: error.message
    });
  }
};

exports.updateStaffSettings = async (req, res) => {
  try {
    console.log('=== updateStaffSettings START ===');
    console.log('Request user:', req.user);
    console.log('Request body:', req.body);
    
    const userId = req.user?.id;
    
    if (!userId) {
      console.log('❌ No user ID found in request');
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const currentSettings = await findOrCreateStaffSettings(userId);
    
    const settingsRef = db.collection('staffSettings').doc(currentSettings.id);
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };
    
    await settingsRef.update(updateData);
    const updatedDoc = await settingsRef.get();
    const updatedSettings = { id: updatedDoc.id, ...updatedDoc.data() };
    
    console.log('✅ Settings updated successfully:', updatedSettings);
    console.log('=== updateStaffSettings END ===');
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings: updatedSettings
    });
  } catch (error) {
    console.error('❌ Error in updateStaffSettings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating staff settings',
      error: error.message
    });
  }
};

exports.resetStaffSettings = async (req, res) => {
  try {
    console.log('=== resetStaffSettings START ===');
    
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const currentSettings = await findOrCreateStaffSettings(userId);
    
    // Reset to default values
    const defaultSettings = {
      openingTime: '09:00',
      closingTime: '18:00',
      panNumber: '',
      defaultShiftHours: 8,
      overtimeRate: 1.5,
      maxLeavesPerYear: 15,
      requireManagerApprovalForLeave: true,
      updatedAt: new Date()
    };
    
    const settingsRef = db.collection('staffSettings').doc(currentSettings.id);
    await settingsRef.update(defaultSettings);
    const updatedDoc = await settingsRef.get();
    const resetSettings = { id: updatedDoc.id, ...updatedDoc.data() };
    
    console.log('✅ Settings reset successfully:', resetSettings);
    console.log('=== resetStaffSettings END ===');
    
    res.json({
      success: true,
      message: 'Settings reset to default values successfully',
      settings: resetSettings
    });
  } catch (error) {
    console.error('❌ Error in resetStaffSettings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while resetting staff settings',
      error: error.message
    });
  }
};