const Attendance = require('../models/Attendance');
const Staff = require('../models/Staff');
const moment = require('moment');

// Get attendance records with filtering
exports.getAttendance = async (req, res) => {
  try {
    const { page = 1, limit = 10, date, staffId, status } = req.query;
    
    const query = { user: req.user._id };
    
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      query.date = { $gte: startDate, $lte: endDate };
    }
    
    if (staffId) query.staff = staffId;
    if (status) query.status = status;
    
    const attendance = await Attendance.find(query)
      .populate('staff', 'name position')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ date: -1, checkIn: -1 });
    
    const total = await Attendance.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        attendance,
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
      message: 'Error fetching attendance records',
      error: err.message
    });
  }
};

// Mark attendance
exports.markAttendance = async (req, res) => {
  try {
    const { staffId, date, checkIn, checkOut, status, notes } = req.body;
    
    // Validate staff exists and belongs to the same user
    const staff = await Staff.findOne({ _id: staffId, user: req.user._id });
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }
    
    // Parse dates
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);
   
const checkInTime = checkIn ? new Date(`${date}T${checkIn}:00`) : null;
const checkOutTime = checkOut ? new Date(`${date}T${checkOut}:00`) : null;
    
    // Check if attendance already exists for this date
    const existingAttendance = await Attendance.findOne({
      staff: staffId,
      date: attendanceDate
    });
    
    if (existingAttendance) {
      // Update existing attendance
      if (checkInTime) existingAttendance.checkIn = checkInTime;
      if (checkOutTime) existingAttendance.checkOut = checkOutTime;
      if (status) existingAttendance.status = status;
      if (notes) existingAttendance.notes = notes;
      
      const updatedAttendance = await existingAttendance.save();
      await updatedAttendance.populate('staff', 'name position');
      
      return res.status(200).json({
        success: true,
        message: 'Attendance updated successfully',
        data: { attendance: updatedAttendance }
      });
    }
    
    // Create new attendance record
    const attendanceData = {
      staff: staffId,
      date: attendanceDate,
      checkIn: checkInTime,
      checkOut: checkOutTime,
      status: status || (checkInTime ? 'present' : 'absent'),
      notes,
      user: req.user._id,
      createdBy: req.user._id
    };
    
    const newAttendance = await Attendance.create(attendanceData);
    await newAttendance.populate('staff', 'name position');
    
    res.status(201).json({
      success: true,
      message: 'Attendance marked successfully',
      data: { attendance: newAttendance }
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Attendance already marked for this date'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error marking attendance',
      error: err.message
    });
  }
};

// Get attendance report for a staff member
exports.getStaffAttendanceReport = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { month, year } = req.query;
    
    // Validate staff exists and belongs to the same user
    const staff = await Staff.findOne({ _id: staffId, user: req.user._id });
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }
    
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;
    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    
    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = new Date(currentYear, currentMonth, 0);
    
    const attendance = await Attendance.find({
      staff: staffId,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: 1 });
    
    // Calculate summary
    const presentDays = attendance.filter(a => a.status === 'present').length;
    const absentDays = attendance.filter(a => a.status === 'absent').length;
    const lateDays = attendance.filter(a => a.status === 'late').length;
    const leaveDays = attendance.filter(a => a.status === 'on_leave').length;
    const halfDays = attendance.filter(a => a.status === 'half_day').length;
    
    res.status(200).json({
      success: true,
      data: {
        staff: {
          name: staff.name,
          position: staff.position
        },
        attendance,
        summary: {
          present: presentDays,
          absent: absentDays,
          late: lateDays,
          on_leave: leaveDays,
          half_day: halfDays,
          totalDays: endDate.getDate()
        }
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance report',
      error: err.message
    });
  }
};

// Get today's attendance summary
exports.getTodaysAttendance = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const attendance = await Attendance.find({
      user: req.user._id,
      date: { $gte: today, $lt: tomorrow }
    }).populate('staff', 'name position');
    
    const totalStaff = await Staff.countDocuments({ 
      user: req.user._id, 
      status: 'active' 
    });
    
    const presentCount = attendance.filter(a => a.status === 'present').length;
    const absentCount = attendance.filter(a => a.status === 'absent').length;
    const lateCount = attendance.filter(a => a.status === 'late').length;
    const leaveCount = attendance.filter(a => a.status === 'on_leave').length;
    
    res.status(200).json({
      success: true,
      data: {
        date: today,
        totalStaff,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        onLeave: leaveCount,
        notMarked: totalStaff - (presentCount + absentCount + lateCount + leaveCount),
        attendance
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching today\'s attendance',
      error: err.message
    });
  }
};