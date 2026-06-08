const Payroll = require('../models/Payroll');
const Staff = require('../models/Staff');
const Attendance = require('../models/Attendance');

// Get payroll records
const getPayrolls = async (req, res) => {
  try {
    const { staffId, month, year, status, page = 1, limit = 10 } = req.query;
    
    const filter = { user: req.user._id };
    
    if (staffId) {
      filter.staff = staffId;
    }
    
    if (month) {
      filter.month = parseInt(month);
    }
    
    if (year) {
      filter.year = parseInt(year);
    }
    
    if (status && status !== 'all') {
      filter.status = status;
    }

    console.log('getPayrolls filter:', filter);

    const payrolls = await Payroll.find(filter)
      .populate('staff', 'name position email phone')
      .sort({ year: -1, month: -1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Payroll.countDocuments(filter);

    res.json({
      success: true,
      payrolls,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
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
// Generate payroll for staff member - SIMPLIFIED VERSION
const generatePayroll = async (req, res) => {
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
    console.log('Parsed month/year:', { parsedMonth, parsedYear });

    const staff = await Staff.findOne({ _id: staffId, user: req.user._id });
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

    console.log('Calculated values:', { basicSalary, allowanceAmount, deductionAmount, netSalary });

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Check for existing payroll
    const existingPayroll = await Payroll.findOne({
      staff: staffId,
      month: parsedMonth,
      year: parsedYear,
      user: req.user._id
    });

    if (existingPayroll) {
      console.log('Existing payroll found:', existingPayroll._id);
      return res.status(400).json({
        success: false,
        message: `Payroll already exists for ${staff.name} for ${parsedMonth}/${parsedYear}`
      });
    }

    console.log('No existing payroll found, proceeding to save');

    const payrollData = {
      staff: staffId,
      month: parsedMonth,
      year: parsedYear,
      basicSalary,
      allowance: allowanceAmount,
      deduction: deductionAmount,
      netSalary,
      status: status || 'pending',
      user: req.user._id,
      createdBy: req.user._id
    };

    console.log('Payroll object before save:', payrollData);

    const payroll = new Payroll(payrollData);
    await payroll.save();
    console.log('Save successful');

    await payroll.populate('staff', 'name position email phone');
    console.log('Populate successful');

    res.status(201).json({
      success: true,
      message: 'Payroll generated successfully',
      payroll
    });

  } catch (error) {
    console.error('Detailed error in generatePayroll:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      keyPattern: error.keyPattern,
      keyValue: error.keyValue
    });
    
    // Enhanced error handling
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: `Payroll already exists for this staff member and period.`
      });
    }
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(e => `${e.path}: ${e.message}`).join(', ');
      return res.status(400).json({
        success: false,
        message: 'Validation error: ' + validationErrors,
        error: error.message
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format',
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error generating payroll',
      error: error.message
    });
  }
};

// Update payroll (allowances and deductions only)
const updatePayroll = async (req, res) => {
  try {
    const payroll = await Payroll.findOne({ _id: req.params.id, user: req.user._id });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found or access denied'
      });
    }

    const { allowance, deduction, status } = req.body;

    if (Number.isFinite(allowance) && allowance >= 0) {
      payroll.allowance = allowance;
    }
    if (Number.isFinite(deduction) && deduction >= 0) {
      payroll.deduction = deduction;
    }
    if (status && ['pending', 'paid', 'cancelled'].includes(status)) {
      payroll.status = status;
    }

    await payroll.save();
    await payroll.populate('staff', 'name position email phone');

    res.status(200).json({
      success: true,
      message: 'Payroll updated successfully',
      data: { payroll }
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
const updatePayrollStatus = async (req, res) => {
  try {
    const { status, paymentDate } = req.body;
    
    const payroll = await Payroll.findOne({ _id: req.params.id, user: req.user._id })
      .populate('staff', 'name position');
    
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found or access denied'
      });
    }
    
    payroll.status = status;
    if (paymentDate) payroll.paymentDate = new Date(paymentDate);
    
    const updatedPayroll = await payroll.save();
    
    res.status(200).json({
      success: true,
      message: 'Payroll status updated successfully',
      data: { payroll: updatedPayroll }
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
const getPayrollSummary = async (req, res) => {
  try {
    const { month, year } = req.query;
    
    let query = { user: req.user._id };
    
    if (month && year) {
      query.month = parseInt(month);
      query.year = parseInt(year);
    }
    
    const payrolls = await Payroll.find(query)
      .populate('staff', 'name position');
    
    const totalBasicSalary = payrolls.reduce((sum, payroll) => sum + (payroll.basicSalary || 0), 0);
    const totalSalary = payrolls.reduce((sum, payroll) => sum + (payroll.netSalary || 0), 0);
    const totalAllowances = payrolls.reduce((sum, payroll) => sum + (payroll.allowance || 0), 0);
    const totalDeductions = payrolls.reduce((sum, payroll) => sum + (payroll.deduction || 0), 0);
    
    const uniqueStaffIds = new Set(payrolls.map(p => p.staff._id.toString()));
    const totalUniqueStaff = uniqueStaffIds.size;
    
    res.status(200).json({
      success: true,
      data: {
        ...(month && year ? { month: parseInt(month), year: parseInt(year) } : {}),
        payrolls,
        summary: {
          totalStaff: totalUniqueStaff,
          totalBasicSalary: Math.round(totalBasicSalary),
          totalAllowances: Math.round(totalAllowances),
          totalDeductions: Math.round(totalDeductions),
          totalSalary: Math.round(totalSalary),
          paid: payrolls.filter(p => p.status === 'paid').length,
          pending: payrolls.filter(p => p.status === 'pending').length
        }
      }
    });
  } catch (err) {
    console.error('Error fetching payroll summary:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching payroll summary',
      error: err.message
    });
  }
};

// Check if payroll exists for specific staff, month, year
const checkPayrollExists = async (req, res) => {
  try {
    const { staffId, month, year } = req.query;

    if (!staffId || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'staffId, month, and year are required'
      });
    }

    const parsedMonth = parseInt(month);
    const parsedYear = parseInt(year);
    console.log('checkPayrollExists query:', { staffId, parsedMonth, parsedYear, user: req.user._id });

    const existingPayroll = await Payroll.findOne({
      staff: staffId,
      month: parsedMonth,
      year: parsedYear,
      user: req.user._id
    });

    console.log('checkPayrollExists result:', !!existingPayroll ? 'EXISTS' : 'NOT FOUND');

    res.json({
      success: true,
      exists: !!existingPayroll,
      payroll: existingPayroll
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
const getPayrollById = async (req, res) => {
  try {
    const payroll = await Payroll.findOne({ _id: req.params.id, user: req.user._id })
      .populate('staff', 'name position email phone');

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll not found or access denied'
      });
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

module.exports = {
  getPayrolls,
  generatePayroll,
  updatePayroll,
  updatePayrollStatus,
  getPayrollSummary,
  checkPayrollExists,
  getPayrollById
};