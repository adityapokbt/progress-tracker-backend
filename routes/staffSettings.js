// routes/staffSettings.js
const express = require('express');
const router = express.Router();
const { 
  getStaffSettings, 
  updateStaffSettings,  // Make sure this is imported
  resetStaffSettings    // And this too
} = require('../controllers/staffSettingsController');
const auth = require('../middleware/auth');

// GET settings
router.get('/settings', auth, getStaffSettings);

// PUT settings (ADD THIS ROUTE)
router.put('/settings', auth, updateStaffSettings);

// POST reset settings (ADD THIS ROUTE)
router.post('/settings/reset', auth, resetStaffSettings);

module.exports = router;