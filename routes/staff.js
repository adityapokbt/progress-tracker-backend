// routes/staff.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const staffController = require('../controllers/staffController');
const attendanceController = require('../controllers/attendanceController');
const payrollController = require('../controllers/payrollController');
const leaveController = require('../controllers/leaveController');
const staffSettingsController = require('../controllers/staffSettingsController');

// ==================== STAFF ROUTES ====================
router.get('/', auth, staffController.getAllStaff);
router.get('/stats', auth, staffController.getStaffStats);
router.get('/:id', auth, staffController.getStaff);
router.post('/', auth, staffController.createStaff);
router.put('/:id', auth, staffController.updateStaff);
router.delete('/:id', auth, staffController.deleteStaff);

// ==================== STAFF SETTINGS ROUTES ====================
router.get('/settings', auth, staffSettingsController.getStaffSettings);
router.put('/settings', auth, staffSettingsController.updateStaffSettings);
router.post('/settings/reset', auth, staffSettingsController.resetStaffSettings);

// ==================== ATTENDANCE ROUTES ====================
// IMPORTANT: Specific routes must come BEFORE parameterized routes

// Get attendance report with filters (for all staff)
router.get('/attendance/report', auth, attendanceController.getAttendanceReport);

// Get today's attendance summary
router.get('/attendance/today', auth, attendanceController.getTodaysAttendance);

// Mark attendance
router.post('/attendance/mark', auth, attendanceController.markAttendance);

// Get attendance for a specific staff member (must be last)
router.get('/:id/attendance', auth, attendanceController.getStaffAttendanceReport);

// ==================== PAYROLL ROUTES ====================
router.get('/payroll/summary', auth, payrollController.getPayrollSummary);
router.get('/payroll/history', auth, payrollController.getPayrolls);
router.get('/payroll/check-exists', auth, payrollController.checkPayrollExists);
router.post('/payroll/generate', auth, payrollController.generatePayroll);
router.put('/payroll/:id', auth, payrollController.updatePayroll);
router.patch('/payroll/:id/status', auth, payrollController.updatePayrollStatus);
router.get('/payroll/:id', auth, payrollController.getPayrollById);

// ==================== LEAVE ROUTES ====================
router.get('/leave/requests', auth, leaveController.getLeaveRequests);
router.get('/leave/balance/:staffId', auth, leaveController.getLeaveBalance);
router.post('/leave/request', auth, leaveController.requestLeave);
router.patch('/leave/:id/status', auth, leaveController.updateLeaveStatus);

module.exports = router;