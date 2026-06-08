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

// Get payroll records
exports.getPayrolls = async (req, res) => {
  try {
    const { staffId, month, year, status, page = 1, limit = 10 } = req.query;
    
    let query = db.collection('payrolls')
      .where('store', '==', req.user.id);
    
    if (staffId) query = query.where('staffId', '==', staffId);
    if (month) query = query.where('month', '==', parseInt(month));
    if (year) query = query.where('year', '==', parseInt(year));
    if (status && status !== 'all') query = query.where('status', '==', status);
    
    const snapshot = await query
      .orderBy('year', 'desc')
      .orderBy('month', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get();
    
    const payrolls = [];
    for (const doc of snapshot.docs) {
      const payroll = { id: doc.id, ...doc.data() };
      
      // Fetch staff details
      const staff = await findStaffById(payroll.staffId, req.user.id);
      if (staff) {
        payroll.staff = { id: staff.id, name: staff.name, position: staff.position, email: staff.email, phone: staff.phone };
      }
      
      payrolls.push(payroll);
    }
    
    const totalSnapshot = await db.collection('payrolls')
      .where('store', '==', req.user.id)
      .get();
    const total = totalSnapshot.size;
    
    res.json({
      success: true,
      payrolls,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Error fetching payrolls:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payrolls',
      error: error.message
    });
  }
};

// Generate payroll for staff member
exports.generatePayroll = async (req, res) => {
  try {
    console.log('Generate payroll request body:', req.body);
    const { staffId, month, year, salary, allowance, deduction, status } = req.body;
    
    if (!staffId || !month || !year || salary === undefined) {
      return res.status(400).json({
        success: false,
        message: 'staffId, month, year, and salary are required fields'
      });
    }
    
    const parsedMonth = parseInt(month);
    const parsedYear = parseInt(year);
    
    const staff = await findStaffById(staffId, req.user.id);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found or access denied'
      });
    }
    
    console.log('Staff found:', staff.name);
    
    const basicSalary = parseFloat(salary) || 0;
    const allowanceAmount = parseFloat(allowance) || 0;
    const deductionAmount = parseFloat(deduction) || 0;
    const netSalary = basicSalary + allowanceAmount - deductionAmount;
    
    // Check for existing payroll
    const existingSnapshot = await db.collection('payrolls')
      .where('staffId', '==', staffId)
      .where('month', '==', parsedMonth)
      .where('year', '==', parsedYear)
      .where('store', '==', req.user.id)
      .limit(1)
      .get();
    
    if (!existingSnapshot.empty) {
      return res.status(400).json({
        success: false,
        message: `Payroll already exists for ${staff.name} for ${parsedMonth}/${parsedYear}`
      });
    }
    
    const payrollData = {
      staffId,
      staffName: staff.name,
      store: req.user.id,
      month: parsedMonth,
      year: parsedYear,
      basicSalary,
      allowance: allowanceAmount,
      deduction: deductionAmount,
      netSalary,
      status: status || 'pending',
      createdBy: req.user.id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const payrollsRef = db.collection('payrolls');
    const docRef = await payrollsRef.add(payrollData);
    
    res.status(201).json({
      success: true,
      message: 'Payroll generated successfully',
      payroll: { id: docRef.id, ...payrollData }
    });
  } catch (error) {
    console.error('Error in generatePayroll:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating payroll',
      error: error.message
    });
  }
};

// Update payroll
exports.updatePayroll = async (req, res) => {
  try {
    const payrollRef = db.collection('payrolls').doc(req.params.id);
    const payrollDoc = await payrollRef.get();
    
    if (!payrollDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found or access denied'
      });
    }
    
    const payroll = payrollDoc.data();
    if (payroll.store !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const { allowance, deduction, status } = req.body;
    const updateData = { updatedAt: new Date() };
    
    if (Number.isFinite(allowance) && allowance >= 0) updateData.allowance = allowance;
    if (Number.isFinite(deduction) && deduction >= 0) updateData.deduction = deduction;
    if (status && ['pending', 'paid', 'cancelled'].includes(status)) updateData.status = status;
    
    // Recalculate net salary
    const basicSalary = payroll.basicSalary;
    const newAllowance = updateData.allowance !== undefined ? updateData.allowance : payroll.allowance;
    const newDeduction = updateData.deduction !== undefined ? updateData.deduction : payroll.deduction;
    updateData.netSalary = basicSalary + newAllowance - newDeduction;
    
    await payrollRef.update(updateData);
    const updatedDoc = await payrollRef.get();
    
    res.status(200).json({
      success: true,
      message: 'Payroll updated successfully',
      data: { payroll: { id: updatedDoc.id, ...updatedDoc.data() } }
    });
  } catch (err) {
    console.error('Error updating payroll:', err);
    res.status(500).json({
      success: false,
      message: 'Error updating payroll',
      error: err.message
    });
  }
};

// Update payroll status
exports.updatePayrollStatus = async (req, res) => {
  try {
    const { status, paymentDate } = req.body;
    
    const payrollRef = db.collection('payrolls').doc(req.params.id);
    const payrollDoc = await payrollRef.get();
    
    if (!payrollDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found or access denied'
      });
    }
    
    const payroll = payrollDoc.data();
    if (payroll.store !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const updateData = {
      status,
      updatedAt: new Date()
    };
    
    if (paymentDate) updateData.paymentDate = new Date(paymentDate);
    if (status === 'paid') updateData.paidAt = new Date();
    
    await payrollRef.update(updateData);
    const updatedDoc = await payrollRef.get();
    
    res.status(200).json({
      success: true,
      message: 'Payroll status updated successfully',
      data: { payroll: { id: updatedDoc.id, ...updatedDoc.data() } }
    });
  } catch (err) {
    console.error('Error updating payroll status:', err);
    res.status(500).json({
      success: false,
      message: 'Error updating payroll status',
      error: err.message
    });
  }
};

// Get payroll summary
// Get payroll summary with proper handling of empty data
exports.getPayrollSummary = async (req, res) => {
  try {
    const { month, year } = req.query;
    
    let query = db.collection('payrolls')
      .where('store', '==', req.user.id);
    
    if (month && year) {
      query = query.where('month', '==', parseInt(month))
                   .where('year', '==', parseInt(year));
    }
    
    const snapshot = await query.get();
    
    const payrolls = [];
    let totalBasicSalary = 0;
    let totalSalary = 0;
    let totalAllowances = 0;
    let totalDeductions = 0;
    const uniqueStaffIds = new Set();
    
    for (const doc of snapshot.docs) {
      const payroll = { id: doc.id, ...doc.data() };
      
      // Convert dates if they exist
      if (payroll.createdAt && payroll.createdAt.toDate) {
        payroll.createdAt = payroll.createdAt.toDate();
      }
      if (payroll.updatedAt && payroll.updatedAt.toDate) {
        payroll.updatedAt = payroll.updatedAt.toDate();
      }
      if (payroll.paymentDate && payroll.paymentDate.toDate) {
        payroll.paymentDate = payroll.paymentDate.toDate();
      }
      
      // Fetch staff details
      if (payroll.staffId) {
        const staffRef = db.collection('staff').doc(payroll.staffId);
        const staffDoc = await staffRef.get();
        if (staffDoc.exists) {
          const staffData = staffDoc.data();
          payroll.staff = {
            _id: staffDoc.id,
            id: staffDoc.id,
            name: staffData.name,
            position: staffData.position,
            email: staffData.email,
            phone: staffData.phone
          };
          uniqueStaffIds.add(payroll.staffId);
        }
      }
      
      payrolls.push(payroll);
      totalBasicSalary += payroll.basicSalary || 0;
      totalSalary += payroll.netSalary || 0;
      totalAllowances += payroll.allowance || 0;
      totalDeductions += payroll.deduction || 0;
    }
    
    // If no payroll data, return zeros instead of error
    res.status(200).json({
      success: true,
      data: {
        month: month ? parseInt(month) : null,
        year: year ? parseInt(year) : null,
        payrolls,
        summary: {
          totalStaff: uniqueStaffIds.size,
          totalBasicSalary: Math.round(totalBasicSalary),
          totalAllowances: Math.round(totalAllowances),
          totalDeductions: Math.round(totalDeductions),
          totalSalary: Math.round(totalSalary),
          paid: payrolls.filter(p => p.status === 'paid').length,
          pending: payrolls.filter(p => p.status === 'pending').length,
          cancelled: payrolls.filter(p => p.status === 'cancelled').length
        }
      }
    });
  } catch (err) {
    console.error('Error fetching payroll summary:', err);
    // Return empty data instead of error
    res.status(200).json({
      success: true,
      data: {
        payrolls: [],
        summary: {
          totalStaff: 0,
          totalBasicSalary: 0,
          totalAllowances: 0,
          totalDeductions: 0,
          totalSalary: 0,
          paid: 0,
          pending: 0,
          cancelled: 0
        }
      }
    });
  }
};

// Check if payroll exists
exports.checkPayrollExists = async (req, res) => {
  try {
    const { staffId, month, year } = req.query;
    
    if (!staffId || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'staffId, month, and year are required'
      });
    }
    
    const snapshot = await db.collection('payrolls')
      .where('staffId', '==', staffId)
      .where('month', '==', parseInt(month))
      .where('year', '==', parseInt(year))
      .where('store', '==', req.user.id)
      .limit(1)
      .get();
    
    const exists = !snapshot.empty;
    let payroll = null;
    
    if (exists) {
      const doc = snapshot.docs[0];
      payroll = { id: doc.id, ...doc.data() };
    }
    
    res.json({
      success: true,
      exists,
      payroll
    });
  } catch (error) {
    console.error('Error checking payroll existence:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking payroll existence',
      error: error.message
    });
  }
};

// Get payroll by ID
exports.getPayrollById = async (req, res) => {
  try {
    const payrollRef = db.collection('payrolls').doc(req.params.id);
    const payrollDoc = await payrollRef.get();
    
    if (!payrollDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Payroll not found or access denied'
      });
    }
    
    const payroll = { id: payrollDoc.id, ...payrollDoc.data() };
    
    if (payroll.store !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const staff = await findStaffById(payroll.staffId, req.user.id);
    if (staff) {
      payroll.staff = { id: staff.id, name: staff.name, position: staff.position, email: staff.email, phone: staff.phone };
    }
    
    res.json({
      success: true,
      payroll
    });
  } catch (error) {
    console.error('Error fetching payroll:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payroll',
      error: error.message
    });
  }
};