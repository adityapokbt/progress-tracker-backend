// routes/staff.js - No changes needed, but included for completeness
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const staffController = require('../controllers/staffController');
const attendanceController = require('../controllers/attendanceController');
const payrollController = require('../controllers/payrollController');
const leaveController = require('../controllers/leaveController');
const staffSettingsController = require('../controllers/staffSettingsController');

// Staff routes
router.get('/', auth, staffController.getAllStaff);
router.get('/stats', auth, staffController.getStaffStats);
router.get('/:id', auth, staffController.getStaff);
router.post('/', auth, staffController.createStaff);
router.put('/:id', auth, staffController.updateStaff);
router.delete('/:id', auth, staffController.deleteStaff);

// Staff Settings routes
router.get('/settings', auth, staffSettingsController.getStaffSettings);
router.put('/settings', auth, staffSettingsController.updateStaffSettings);
router.post('/settings/reset', auth, staffSettingsController.resetStaffSettings);

// Attendance routes
router.get('/:id/attendance', auth, attendanceController.getStaffAttendanceReport);
router.get('/attendance/today', auth, attendanceController.getTodaysAttendance);
router.post('/attendance/mark', auth, attendanceController.markAttendance);
router.get('/attendance/report', auth, attendanceController.getAttendance);

// Payroll routes
router.get('/payroll/summary', auth, payrollController.getPayrollSummary);
router.get('/payroll/history', auth, payrollController.getPayrolls);
router.get('/payroll/check-exists', auth, payrollController.checkPayrollExists);
router.post('/payroll/generate', auth, payrollController.generatePayroll);
router.put('/payroll/:id', auth, payrollController.updatePayroll);
router.patch('/payroll/:id/status', auth, payrollController.updatePayrollStatus);

// Leave routes
router.get('/leave/requests', auth, leaveController.getLeaveRequests);
router.get('/leave/balance/:staffId', auth, leaveController.getLeaveBalance);
router.post('/leave/request', auth, leaveController.requestLeave);
router.patch('/leave/:id/status', auth, leaveController.updateLeaveStatus);

module.exports = router;