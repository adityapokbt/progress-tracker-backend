const Leave = require('../models/Leave');
const Staff = require('../models/Staff');

// Get leave requests
exports.getLeaveRequests = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type } = req.query;
    
    const query = { user: req.user._id };
    
    if (status) query.status = status;
    if (type) query.type = type;
    
    const leaveRequests = await Leave.find(query)
      .populate('staff', 'name position')
      .populate('approvedBy', 'name')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });
    
    const total = await Leave.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        leaveRequests,
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
      message: 'Error fetching leave requests',
      error: err.message
    });
  }
};

// Request leave
exports.requestLeave = async (req, res) => {
  try {
    const { staffId, type, startDate, endDate, reason } = req.body;
    
    // Validate staff exists and belongs to the same user
    const staff = await Staff.findOne({ _id: staffId, user: req.user._id });
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }
    
    // Check for overlapping leave requests
    const overlappingLeave = await Leave.findOne({
      staff: staffId,
      status: { $in: ['pending', 'approved'] },
      $or: [
        { startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } }
      ]
    });
    
    if (overlappingLeave) {
      return res.status(400).json({
        success: false,
        message: 'Overlapping leave request exists'
      });
    }
    
    const leaveData = {
      staff: staffId,
      type,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason,
      user: req.user._id,
      createdBy: req.user._id
    };
    
    const leaveRequest = await Leave.create(leaveData);
    await leaveRequest.populate('staff', 'name position');
    
    res.status(201).json({
      success: true,
      message: 'Leave request submitted successfully',
      data: { leaveRequest }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error submitting leave request',
      error: err.message
    });
  }
};

// Update leave status
exports.updateLeaveStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    
    const leaveRequest = await Leave.findById(req.params.id)
      .populate('staff', 'name position');
    
    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }
    
    // Check if leave belongs to the same user
    if (leaveRequest.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    leaveRequest.status = status;
    
    if (status === 'approved') {
      leaveRequest.approvedBy = req.user._id;
      leaveRequest.rejectionReason = undefined;
    } else if (status === 'rejected') {
      leaveRequest.rejectionReason = rejectionReason;
    }
    
    const updatedLeave = await leaveRequest.save();
    await updatedLeave.populate('approvedBy', 'name');
    
    res.status(200).json({
      success: true,
      message: `Leave request ${status} successfully`,
      data: { leaveRequest: updatedLeave }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error updating leave request',
      error: err.message
    });
  }
};

// Get staff leave balance
exports.getLeaveBalance = async (req, res) => {
  try {
    const { staffId } = req.params;
    
    // Validate staff exists and belongs to the same user
    const staff = await Staff.findOne({ _id: staffId, user: req.user._id });
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }
    
    const currentYear = new Date().getFullYear();
    
    // Get approved leave for current year
    const approvedLeave = await Leave.find({
      staff: staffId,
      status: 'approved',
      startDate: { $gte: new Date(currentYear, 0, 1) },
      endDate: { $lte: new Date(currentYear, 11, 31) }
    });
    
    // Calculate total leave days
    const totalLeaveDays = approvedLeave.reduce((total, leave) => {
      const duration = Math.ceil((leave.endDate - leave.startDate) / (1000 * 60 * 60 * 24)) + 1;
      return total + duration;
    }, 0);
    
    // Standard leave entitlements (customize as needed)
    const leaveEntitlements = {
      annual: 18,
      sick: 12,
      maternity: 98,
      paternity: 15
    };
    
    res.status(200).json({
      success: true,
      data: {
        staff: {
          name: staff.name,
          position: staff.position
        },
        leaveBalance: {
          annual: leaveEntitlements.annual - totalLeaveDays,
          sick: leaveEntitlements.sick,
          maternity: leaveEntitlements.maternity,
          paternity: leaveEntitlements.paternity,
          used: totalLeaveDays,
          remaining: leaveEntitlements.annual - totalLeaveDays
        },
        leaveHistory: approvedLeave
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching leave balance',
      error: err.message
    });
  }
};