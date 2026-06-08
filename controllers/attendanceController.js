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

// Helper function to get date range (start and end of day)
const getDateRange = (dateParam) => {
  let targetDate;
  if (dateParam) {
    targetDate = new Date(dateParam);
  } else {
    targetDate = new Date();
  }
  
  const startDate = new Date(targetDate);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(targetDate);
  endDate.setHours(23, 59, 59, 999);
  
  return { startDate, endDate };
};

// Get attendance records with filtering
exports.getAttendance = async (req, res) => {
  try {
    const { page = 1, limit = 10, date, staffId, status } = req.query;
    
    let query = db.collection('attendance')
      .where('store', '==', req.user.id);
    
    if (date) {
      const { startDate, endDate } = getDateRange(date);
      query = query.where('date', '>=', startDate)
                   .where('date', '<=', endDate);
    }
    
    if (staffId) query = query.where('staffId', '==', staffId);
    if (status) query = query.where('status', '==', status);
    
    const snapshot = await query
      .orderBy('date', 'desc')
      .orderBy('checkIn', 'desc')
      .limit(parseInt(limit))
      .get();
    
    const attendance = [];
    for (const doc of snapshot.docs) {
      const record = { id: doc.id, ...doc.data() };
      
      if (record.staffId) {
        const staff = await findStaffById(record.staffId, req.user.id);
        if (staff) {
          record.staff = {
            _id: staff.id,
            id: staff.id,
            name: staff.name,
            position: staff.position
          };
        }
      }
      
      if (record.date && record.date.toDate) record.date = record.date.toDate();
      if (record.checkIn && record.checkIn.toDate) record.checkIn = record.checkIn.toDate();
      if (record.checkOut && record.checkOut.toDate) record.checkOut = record.checkOut.toDate();
      
      attendance.push(record);
    }
    
    const totalSnapshot = await db.collection('attendance')
      .where('store', '==', req.user.id)
      .get();
    const total = totalSnapshot.size;
    
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
    console.error('Error fetching attendance:', err);
    res.status(200).json({
      success: true,
      data: { attendance: [], pagination: { current: 1, pages: 0, total: 0 } }
    });
  }
};

// Get attendance report with filters (for all staff or specific date)
exports.getAttendanceReport = async (req, res) => {
  try {
    const { date, startDate, endDate, staffId, status } = req.query;
    
    let query = db.collection('attendance')
      .where('store', '==', req.user.id);
    
    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      query = query.where('date', '>=', startOfDay)
                   .where('date', '<=', endOfDay);
    }
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      query = query.where('date', '>=', start)
                   .where('date', '<=', end);
    }
    
    if (staffId) query = query.where('staffId', '==', staffId);
    if (status) query = query.where('status', '==', status);
    
    const snapshot = await query.orderBy('date', 'desc').get();
    
    const attendance = [];
    for (const doc of snapshot.docs) {
      const record = { id: doc.id, ...doc.data() };
      
      if (record.date && record.date.toDate) record.date = record.date.toDate();
      if (record.checkIn && record.checkIn.toDate) record.checkIn = record.checkIn.toDate();
      if (record.checkOut && record.checkOut.toDate) record.checkOut = record.checkOut.toDate();
      
      if (record.staffId) {
        const staff = await findStaffById(record.staffId, req.user.id);
        if (staff) {
          record.staff = {
            _id: staff.id,
            id: staff.id,
            name: staff.name,
            position: staff.position,
            email: staff.email,
            phone: staff.phone
          };
        }
      }
      
      attendance.push(record);
    }
    
    let totalStaff = 0;
    try {
      const staffSnapshot = await db.collection('staff')
        .where('store', '==', req.user.id)
        .where('status', '==', 'active')
        .get();
      totalStaff = staffSnapshot.size;
    } catch (staffErr) {
      console.error('Error fetching staff count:', staffErr);
    }
    
    const presentCount = attendance.filter(a => a.status === 'present').length;
    const absentCount = attendance.filter(a => a.status === 'absent').length;
    const lateCount = attendance.filter(a => a.status === 'late').length;
    const leaveCount = attendance.filter(a => a.status === 'on_leave').length;
    const halfDayCount = attendance.filter(a => a.status === 'half_day').length;
    
    res.status(200).json({
      success: true,
      data: {
        attendance,
        summary: {
          totalStaff,
          present: presentCount,
          absent: absentCount,
          late: lateCount,
          onLeave: leaveCount,
          halfDay: halfDayCount,
          notMarked: Math.max(0, totalStaff - (presentCount + absentCount + lateCount + leaveCount + halfDayCount))
        }
      }
    });
  } catch (err) {
    console.error('Error fetching attendance report:', err);
    res.status(200).json({
      success: true,
      data: {
        attendance: [],
        summary: { totalStaff: 0, present: 0, absent: 0, late: 0, onLeave: 0, halfDay: 0, notMarked: 0 }
      }
    });
  }
};

// Mark attendance
exports.markAttendance = async (req, res) => {
  try {
    const { staffId, date, checkIn, checkOut, status, notes } = req.body;
    
    if (!staffId) {
      return res.status(400).json({
        success: false,
        message: 'Staff ID is required'
      });
    }
    
    const staff = await findStaffById(staffId, req.user.id);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }
    
    let attendanceDate;
    if (date) {
      attendanceDate = new Date(date);
      attendanceDate.setHours(0, 0, 0, 0);
    } else {
      attendanceDate = new Date();
      attendanceDate.setHours(0, 0, 0, 0);
    }
    
    let checkInTime = null;
    let checkOutTime = null;
    
    if (checkIn) {
      if (typeof checkIn === 'string') {
        checkInTime = new Date(`${attendanceDate.toISOString().split('T')[0]}T${checkIn}:00`);
      } else {
        checkInTime = new Date(checkIn);
      }
    }
    
    if (checkOut) {
      if (typeof checkOut === 'string') {
        checkOutTime = new Date(`${attendanceDate.toISOString().split('T')[0]}T${checkOut}:00`);
      } else {
        checkOutTime = new Date(checkOut);
      }
    }
    
    const existingSnapshot = await db.collection('attendance')
      .where('staffId', '==', staffId)
      .where('store', '==', req.user.id)
      .where('date', '==', attendanceDate)
      .limit(1)
      .get();
    
    if (!existingSnapshot.empty) {
      const attendanceDoc = existingSnapshot.docs[0];
      const updateData = { updatedAt: new Date() };
      
      if (checkInTime) updateData.checkIn = checkInTime;
      if (checkOutTime) updateData.checkOut = checkOutTime;
      if (status) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;
      
      await attendanceDoc.ref.update(updateData);
      const updatedDoc = await attendanceDoc.ref.get();
      let updatedAttendance = { id: updatedDoc.id, ...updatedDoc.data() };
      
      if (updatedAttendance.date && updatedAttendance.date.toDate) updatedAttendance.date = updatedAttendance.date.toDate();
      if (updatedAttendance.checkIn && updatedAttendance.checkIn.toDate) updatedAttendance.checkIn = updatedAttendance.checkIn.toDate();
      if (updatedAttendance.checkOut && updatedAttendance.checkOut.toDate) updatedAttendance.checkOut = updatedAttendance.checkOut.toDate();
      
      updatedAttendance.staff = {
        _id: staff.id,
        id: staff.id,
        name: staff.name,
        position: staff.position
      };
      
      return res.status(200).json({
        success: true,
        message: 'Attendance updated successfully',
        data: { attendance: updatedAttendance }
      });
    }
    
    const attendanceData = {
      staffId,
      staffName: staff.name,
      store: req.user.id,
      date: attendanceDate,
      checkIn: checkInTime,
      checkOut: checkOutTime,
      status: status || (checkInTime ? 'present' : 'absent'),
      notes: notes || '',
      createdBy: req.user.id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const attendanceRef = db.collection('attendance');
    const docRef = await attendanceRef.add(attendanceData);
    const newAttendance = { id: docRef.id, ...attendanceData };
    
    if (newAttendance.date && newAttendance.date.toDate) newAttendance.date = newAttendance.date.toDate();
    
    newAttendance.staff = {
      _id: staff.id,
      id: staff.id,
      name: staff.name,
      position: staff.position
    };
    
    res.status(201).json({
      success: true,
      message: 'Attendance marked successfully',
      data: { attendance: newAttendance }
    });
  } catch (err) {
    console.error('Error marking attendance:', err);
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
    
    if (!staffId) {
      return res.status(400).json({
        success: false,
        message: 'Staff ID is required'
      });
    }
    
    const staff = await findStaffById(staffId, req.user.id);
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
    endDate.setHours(23, 59, 59, 999);
    
    const snapshot = await db.collection('attendance')
      .where('staffId', '==', staffId)
      .where('store', '==', req.user.id)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .orderBy('date', 'asc')
      .get();
    
    const attendance = [];
    snapshot.forEach(doc => {
      const record = doc.data();
      if (record.date && record.date.toDate) record.date = record.date.toDate();
      if (record.checkIn && record.checkIn.toDate) record.checkIn = record.checkIn.toDate();
      if (record.checkOut && record.checkOut.toDate) record.checkOut = record.checkOut.toDate();
      attendance.push({ id: doc.id, ...record });
    });
    
    const presentDays = attendance.filter(a => a.status === 'present').length;
    const absentDays = attendance.filter(a => a.status === 'absent').length;
    const lateDays = attendance.filter(a => a.status === 'late').length;
    const leaveDays = attendance.filter(a => a.status === 'on_leave').length;
    const halfDays = attendance.filter(a => a.status === 'half_day').length;
    
    res.status(200).json({
      success: true,
      data: {
        staff: {
          _id: staff.id,
          id: staff.id,
          name: staff.name,
          position: staff.position,
          email: staff.email,
          phone: staff.phone
        },
        attendance,
        summary: {
          present: presentDays,
          absent: absentDays,
          late: lateDays,
          on_leave: leaveDays,
          half_day: halfDays,
          totalDays: endDate.getDate(),
          month: currentMonth,
          year: currentYear
        }
      }
    });
  } catch (err) {
    console.error('Error fetching staff attendance report:', err);
    res.status(200).json({
      success: true,
      data: {
        staff: null,
        attendance: [],
        summary: { present: 0, absent: 0, late: 0, on_leave: 0, half_day: 0, totalDays: 0, month: 0, year: 0 }
      }
    });
  }
};

// Get today's attendance summary - FIXED (error variable was undefined)
exports.getTodaysAttendance = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    let attendance = [];
    try {
      const snapshot = await db.collection('attendance')
        .where('store', '==', req.user.id)
        .where('date', '>=', today)
        .where('date', '<', tomorrow)
        .get();
      
      for (const doc of snapshot.docs) {
        const record = { id: doc.id, ...doc.data() };
        
        if (record.date && record.date.toDate) record.date = record.date.toDate();
        if (record.checkIn && record.checkIn.toDate) record.checkIn = record.checkIn.toDate();
        if (record.checkOut && record.checkOut.toDate) record.checkOut = record.checkOut.toDate();
        
        if (record.staffId) {
          const staff = await findStaffById(record.staffId, req.user.id);
          if (staff) {
            record.staff = {
              _id: staff.id,
              id: staff.id,
              name: staff.name,
              position: staff.position
            };
          }
        }
        
        attendance.push(record);
      }
    } catch (attErr) {
      console.error('Error fetching attendance records:', attErr);
    }
    
    let totalStaff = 0;
    try {
      const staffSnapshot = await db.collection('staff')
        .where('store', '==', req.user.id)
        .where('status', '==', 'active')
        .get();
      totalStaff = staffSnapshot.size;
    } catch (staffErr) {
      console.error('Error fetching staff count:', staffErr);
    }
    
    const presentCount = attendance.filter(a => a.status === 'present').length;
    const absentCount = attendance.filter(a => a.status === 'absent').length;
    const lateCount = attendance.filter(a => a.status === 'late').length;
    const leaveCount = attendance.filter(a => a.status === 'on_leave').length;
    const halfDayCount = attendance.filter(a => a.status === 'half_day').length;
    
    res.status(200).json({
      success: true,
      data: {
        date: today,
        totalStaff,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        onLeave: leaveCount,
        halfDay: halfDayCount,
        notMarked: Math.max(0, totalStaff - (presentCount + absentCount + lateCount + leaveCount + halfDayCount)),
        attendance
      }
    });
  } catch (err) {
    console.error('Error fetching today\'s attendance:', err);
    res.status(200).json({
      success: true,
      data: {
        date: new Date(),
        totalStaff: 0,
        present: 0,
        absent: 0,
        late: 0,
        onLeave: 0,
        halfDay: 0,
        notMarked: 0,
        attendance: []
      }
    });
  }
};