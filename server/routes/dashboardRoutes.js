const express = require('express');

const {
  getAdminActivity,
  getAdminLoanAnalytics,
  getAdminLogs,
  getManagerDashboard,
} = require('../controllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.get('/admin/activity', protect, authorize('admin'), getAdminActivity);
router.get('/admin/loan-analytics', protect, authorize('admin'), getAdminLoanAnalytics);
router.get('/admin/logs', protect, authorize('admin'), getAdminLogs);
router.get('/manager', protect, authorize('manager'), getManagerDashboard);

module.exports = router;
