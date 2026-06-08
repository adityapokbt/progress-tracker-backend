const { db } = require('../firebase');
const { FieldValue } = require('firebase-admin/firestore');

// Helper function to find staff by ID and store
const findStaffById = async (id, storeId) => {
  const staffRef = db.collection('staff').doc(id);
  const staffDoc = await staffRef.get();
  
  if (!staffDoc.exists) return null;
  const staff = { id: staffDoc.id, ...staffDoc.data() };
  if (staff.store !== storeId) return null;
  return staff;
};

// Get leave requests
exports.getLeaveRequests = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type } = req.query;
    
    let query = db.collection('leaves')
      .where('store', '==', req.user.id);
    
    if (status) query = query.where('status', '==', status);
    if (type) query = query.where('type', '==', type);
    
    const snapshot = await query
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get();
    
    const leaveRequests = [];
    for (const doc of snapshot.docs) {
      const leave = { id: doc.id, ...doc.data() };
      
      // Fetch staff details
      const staff = await findStaffById(leave.staffId, req.user.id);
      if (staff) {
        leave.staff = { id: staff.id, name: staff.name, position: staff.position };
      }
      
      leaveRequests.push(leave);
    }
    
    const totalSnapshot = await db.collection('leaves')
      .where('store', '==', req.user.id)
      .get();
    const total = totalSnapshot.size;
    
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
    console.error('Error fetching leave requests:', err);
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
    
    // Validate staff exists and belongs to the same store
    const staff = await findStaffById(staffId, req.user.id);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    
    // Check for overlapping leave requests
    const overlappingSnapshot = await db.collection('leaves')
      .where('staffId', '==', staffId)
      .where('store', '==', req.user.id)
      .where('status', 'in', ['pending', 'approved'])
      .get();
    
    let hasOverlap = false;
    for (const doc of overlappingSnapshot.docs) {
      const existing = doc.data();
      const existingStart = existing.startDate.toDate();
      const existingEnd = existing.endDate.toDate();
      
      if ((start <= existingEnd && end >= existingStart)) {
        hasOverlap = true;
        break;
      }
    }
    
    if (hasOverlap) {
      return res.status(400).json({
        success: false,
        message: 'Overlapping leave request exists'
      });
    }
    
    const leaveData = {
      staffId,
      staffName: staff.name,
      store: req.user.id,
      type,
      startDate: start,
      endDate: end,
      reason: reason || '',
      status: 'pending',
      createdBy: req.user.id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const leavesRef = db.collection('leaves');
    const docRef = await leavesRef.add(leaveData);
    const newLeave = { id: docRef.id, ...leaveData };
    
    res.status(201).json({
      success: true,
      message: 'Leave request submitted successfully',
      data: { leaveRequest: newLeave }
    });
  } catch (err) {
    console.error('Error submitting leave request:', err);
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
    
    const leaveRef = db.collection('leaves').doc(req.params.id);
    const leaveDoc = await leaveRef.get();
    
    if (!leaveDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }
    
    const leave = leaveDoc.data();
    
    // Check if leave belongs to the same store
    if (leave.store !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const updateData = {
      status,
      updatedAt: new Date()
    };
    
    if (status === 'approved') {
      updateData.approvedBy = req.user.id;
      updateData.rejectionReason = null;
    } else if (status === 'rejected') {
      updateData.rejectionReason = rejectionReason;
    }
    
    await leaveRef.update(updateData);
    const updatedDoc = await leaveRef.get();
    const updatedLeave = { id: updatedDoc.id, ...updatedDoc.data() };
    
    res.status(200).json({
      success: true,
      message: `Leave request ${status} successfully`,
      data: { leaveRequest: updatedLeave }
    });
  } catch (err) {
    console.error('Error updating leave request:', err);
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
    
    // Validate staff exists and belongs to the same store
    const staff = await findStaffById(staffId, req.user.id);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }
    
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31);
    endOfYear.setHours(23, 59, 59, 999);
    
    // Get approved leave for current year
    const snapshot = await db.collection('leaves')
      .where('staffId', '==', staffId)
      .where('store', '==', req.user.id)
      .where('status', '==', 'approved')
      .where('startDate', '>=', startOfYear)
      .where('endDate', '<=', endOfYear)
      .get();
    
    // Calculate total leave days
    let totalLeaveDays = 0;
    for (const doc of snapshot.docs) {
      const leave = doc.data();
      const start = leave.startDate.toDate();
      const end = leave.endDate.toDate();
      const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      totalLeaveDays += duration;
    }
    
    // Standard leave entitlements
    const leaveEntitlements = {
      annual: staff.annualLeaveDays || 18,
      sick: staff.sickLeaveDays || 12,
      maternity: staff.maternityLeaveDays || 98,
      paternity: staff.paternityLeaveDays || 15
    };
    
    res.status(200).json({
      success: true,
      data: {
        staff: {
          id: staff.id,
          name: staff.name,
          position: staff.position
        },
        leaveBalance: {
          annual: leaveEntitlements.annual,
          sick: leaveEntitlements.sick,
          maternity: leaveEntitlements.maternity,
          paternity: leaveEntitlements.paternity,
          used: totalLeaveDays,
          remaining: Math.max(0, leaveEntitlements.annual - totalLeaveDays)
        }
      }
    });
  } catch (err) {
    console.error('Error fetching leave balance:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching leave balance',
      error: err.message
    });
  }
};