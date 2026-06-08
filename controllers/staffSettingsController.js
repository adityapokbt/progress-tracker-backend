const StaffSettings = require('../models/StaffSettings');
const User = require('../models/User'); // Make sure to import User model

exports.getStaffSettings = async (req, res) => {
  try {
    console.log('getStaffSettings called with user:', req.user);
    
    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      console.log('No user found in request');
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userId = req.user.id;

    // Try to find existing settings
    let settings = await StaffSettings.findOne({ user: userId });
    
    if (!settings) {
      console.log('No settings found, creating default settings for user:', userId);
      // Create default settings if none exist
      settings = new StaffSettings({ 
        user: userId,
        openingTime: '09:00',
        closingTime: '18:00',
        panNumber: '',
        defaultShiftHours: 8,
        overtimeRate: 1.5,
        maxLeavesPerYear: 15,
        requireManagerApprovalForLeave: true
      });
      
      try {
        await settings.save();
        console.log('Default settings created successfully');
      } catch (saveError) {
        console.error('Error saving default settings:', saveError);
        return res.status(500).json({ 
          message: 'Error creating default settings', 
          error: saveError.message 
        });
      }
    }

    console.log('Returning settings:', settings);
    res.json({ settings });
    
  } catch (error) {
    console.error('Unexpected error in getStaffSettings:', error);
    res.status(500).json({ 
      message: 'Server error while fetching staff settings', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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

    // Find and update settings
    const settings = await StaffSettings.findOneAndUpdate(
      { user: userId },
      req.body,
      { new: true, runValidators: true } // Return updated document and run validators
    );

    if (!settings) {
      console.log('❌ Settings not found for user:', userId);
      return res.status(404).json({ message: 'Staff settings not found' });
    }

    console.log('✅ Settings updated successfully:', settings);
    console.log('=== updateStaffSettings END ===');
    
    res.json({ 
      success: true,
      message: 'Settings updated successfully',
      settings 
    });
    
  } catch (error) {
    console.error('❌ Error in updateStaffSettings:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        success: false,
        message: 'Validation error',
        errors 
      });
    }
    
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

    // Reset to default values
    const settings = await StaffSettings.findOneAndUpdate(
      { user: userId },
      { 
        openingTime: '09:00',
        closingTime: '18:00',
        panNumber: '',
        defaultShiftHours: 8,
        overtimeRate: 1.5,
        maxLeavesPerYear: 15,
        requireManagerApprovalForLeave: true
      },
      { new: true, upsert: true } // Create if doesn't exist
    );

    console.log('✅ Settings reset successfully:', settings);
    console.log('=== resetStaffSettings END ===');
    
    res.json({ 
      success: true,
      message: 'Settings reset to default values successfully',
      settings 
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