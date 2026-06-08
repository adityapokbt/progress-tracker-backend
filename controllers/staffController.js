// backend/controllers/staffController.js
const Staff = require('../models/Staff');
const Attendance = require('../models/Attendance');
const Payroll = require('../models/Payroll');
const Leave = require('../models/Leave');

// Get all staff with filtering and pagination
exports.getAllStaff = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, position, status } = req.query;
    
    // Filter by the current user's ID
    const query = { user: req.user._id };
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (position) query.position = position;
    if (status) query.status = status;
    
    const staff = await Staff.find(query)
      .populate('user', 'storeName address')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });
    
    const total = await Staff.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        staff,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching staff',
      error: err.message
    });
  }
};

// Get single staff member
exports.getStaff = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id)
      .populate('user', 'storeName address');
    
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }
    
    // Check if staff belongs to the current user
    if (staff.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff member does not belong to your account.'
      });
    }
    
    res.status(200).json({
      success: true,
      data: { staff }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching staff member',
      error: err.message
    });
  }
};

// Create new staff member
exports.createStaff = async (req, res) => {
  try {
    const staffData = {
      ...req.body,
      user: req.user._id,
      createdBy: req.user._id
    };
    
    const staff = await Staff.create(staffData);
    
    res.status(201).json({
      success: true,
      message: 'Staff member created successfully',
      data: { staff }
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number already exists',
        error: err.message
      });
    }
    
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating staff member',
      error: err.message
    });
  }
};

// Update staff member
exports.updateStaff = async (req, res) => {
  try {
    let staff = await Staff.findById(req.params.id);
    
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }
    
    // Check if staff belongs to the current user
    if (staff.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff member does not belong to your account.'
      });
    }
    
    staff = await Staff.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'Staff member updated successfully',
      data: { staff }
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number already exists'
      });
    }
    
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating staff member',
      error: err.message
    });
  }
};

// Delete staff member
exports.deleteStaff = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }
    
    // Check if staff belongs to the current user
    if (staff.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff member does not belong to your account.'
      });
    }
    
    // Check if staff has related records
    const hasAttendance = await Attendance.findOne({ staff: req.params.id });
    const hasPayroll = await Payroll.findOne({ staff: req.params.id });
    const hasLeave = await Leave.findOne({ staff: req.params.id });
    
    if (hasAttendance || hasPayroll || hasLeave) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete staff member with existing records. Please deactivate instead.'
      });
    }
    
    await Staff.findByIdAndDelete(req.params.id);
    
    res.status(200).json({
      success: true,
      message: 'Staff member deleted successfully'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error deleting staff member',
      error: err.message
    });
  }
};

// Get staff statistics
exports.getStaffStats = async (req, res) => {
  try {
    const totalStaff = await Staff.countDocuments({ user: req.user._id });
    const activeStaff = await Staff.countDocuments({ 
      user: req.user._id, 
      status: 'active' 
    });
    
    const positionStats = await Staff.aggregate([
      { $match: { user: req.user._id, status: 'active' } },
      { $group: { _id: '$position', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const pendingPayroll = await Payroll.countDocuments({ user: req.user._id, status: 'pending' });
    
    res.status(200).json({
      success: true,
      data: {
        totalStaff,
        activeStaff,
        inactiveStaff: totalStaff - activeStaff,
        positionStats,
        pendingPayroll
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching staff statistics',
      error: err.message
    });
  }
};

