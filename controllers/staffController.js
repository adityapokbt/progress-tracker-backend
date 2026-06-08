const { db } = require('../firebase');
const { FieldValue } = require('firebase-admin/firestore');

// Helper function to find staff by ID and store
const findStaffById = async (id, storeId) => {
  if (!id) return null;
  const staffRef = db.collection('staff').doc(id);
  const staffDoc = await staffRef.get();
  
  if (!staffDoc.exists) return null;
  const staff = { id: staffDoc.id, ...staffDoc.data() };
  if (staff.store !== storeId) return null;
  return staff;
};

// Helper function to check if staff has related records
const hasRelatedRecords = async (staffId, storeId) => {
  const attendanceSnapshot = await db.collection('attendance')
    .where('staffId', '==', staffId)
    .where('store', '==', storeId)
    .limit(1)
    .get();
  
  const payrollSnapshot = await db.collection('payrolls')
    .where('staffId', '==', staffId)
    .where('store', '==', storeId)
    .limit(1)
    .get();
  
  const leaveSnapshot = await db.collection('leaves')
    .where('staffId', '==', staffId)
    .where('store', '==', storeId)
    .limit(1)
    .get();
  
  return !attendanceSnapshot.empty || !payrollSnapshot.empty || !leaveSnapshot.empty;
};

// Get all staff with filtering and pagination
exports.getAllStaff = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, position, status } = req.query;
    
    let query = db.collection('staff')
      .where('store', '==', req.user.id);
    
    const snapshot = await query
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get();
    
    const staff = [];
    for (const doc of snapshot.docs) {
      let staffMember = { id: doc.id, ...doc.data() };
      
      // Apply filters in memory (Firestore doesn't support text search well)
      if (search) {
        const searchLower = search.toLowerCase();
        const matches = staffMember.name?.toLowerCase().includes(searchLower) ||
                       staffMember.email?.toLowerCase().includes(searchLower) ||
                       staffMember.phone?.includes(search);
        if (!matches) continue;
      }
      if (position && staffMember.position !== position) continue;
      if (status && staffMember.status !== status) continue;
      
      staff.push(staffMember);
    }
    
    const totalSnapshot = await db.collection('staff')
      .where('store', '==', req.user.id)
      .get();
    const total = totalSnapshot.size;
    
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
    console.error('Error fetching staff:', err);
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
    const staff = await findStaffById(req.params.id, req.user.id);
    
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: { staff }
    });
  } catch (err) {
    console.error('Error fetching staff member:', err);
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
      store: req.user.id,
      createdBy: req.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: req.body.status || 'active'
    };
    
    const staffRef = db.collection('staff');
    const docRef = await staffRef.add(staffData);
    const newStaff = { id: docRef.id, ...staffData };
    
    res.status(201).json({
      success: true,
      message: 'Staff member created successfully',
      data: { staff: newStaff }
    });
  } catch (err) {
    console.error('Error creating staff member:', err);
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
    const staff = await findStaffById(req.params.id, req.user.id);
    
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }
    
    const staffRef = db.collection('staff').doc(req.params.id);
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };
    
    await staffRef.update(updateData);
    const updatedDoc = await staffRef.get();
    const updatedStaff = { id: updatedDoc.id, ...updatedDoc.data() };
    
    res.status(200).json({
      success: true,
      message: 'Staff member updated successfully',
      data: { staff: updatedStaff }
    });
  } catch (err) {
    console.error('Error updating staff member:', err);
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
    const staff = await findStaffById(req.params.id, req.user.id);
    
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }
    
    // Check if staff has related records
    const hasRecords = await hasRelatedRecords(req.params.id, req.user.id);
    
    if (hasRecords) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete staff member with existing records. Please deactivate instead.'
      });
    }
    
    await db.collection('staff').doc(req.params.id).delete();
    
    res.status(200).json({
      success: true,
      message: 'Staff member deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting staff member:', err);
    res.status(500).json({
      success: false,
      message: 'Error deleting staff member',
      error: err.message
    });
  }
};

// Get staff statistics
// Replace the getStaffStats function with this version
exports.getStaffStats = async (req, res) => {
  try {
    let totalStaff = 0;
    let activeStaff = 0;
    const positionMap = new Map();
    
    try {
      const snapshot = await db.collection('staff')
        .where('store', '==', req.user.id)
        .get();
      
      totalStaff = snapshot.size;
      
      for (const doc of snapshot.docs) {
        const staff = doc.data();
        if (staff.status === 'active') activeStaff++;
        if (staff.status === 'active' && staff.position) {
          positionMap.set(staff.position, (positionMap.get(staff.position) || 0) + 1);
        }
      }
    } catch (staffErr) {
      console.error('Error fetching staff:', staffErr);
    }
    
    const positionStats = Array.from(positionMap.entries()).map(([position, count]) => ({
      _id: position,
      count
    })).sort((a, b) => b.count - a.count);
    
    let pendingPayroll = 0;
    try {
      const payrollSnapshot = await db.collection('payrolls')
        .where('store', '==', req.user.id)
        .where('status', '==', 'pending')
        .get();
      pendingPayroll = payrollSnapshot.size;
    } catch (payrollErr) {
      console.error('Error fetching payroll:', payrollErr);
    }
    
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
    console.error('Error fetching staff statistics:', err);
    res.status(200).json({
      success: true,
      data: {
        totalStaff: 0,
        activeStaff: 0,
        inactiveStaff: 0,
        positionStats: [],
        pendingPayroll: 0
      }
    });
  }
};