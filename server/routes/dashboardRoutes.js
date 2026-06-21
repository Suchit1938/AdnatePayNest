const express = require('express');

const {
  getAdminActivity,
  getAdminLoanAnalytics,
  getAdminLogs,
  getAdminSettlementSummary,
  getSettlementReport,
  getManagerDashboard,
} = require('../controllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.get('/admin/activity', protect, authorize('admin'), getAdminActivity);
router.get('/admin/loan-analytics', protect, authorize('admin'), getAdminLoanAnalytics);
router.get('/admin/logs', protect, authorize('admin'), getAdminLogs);
router.get('/admin/settlement', protect, authorize('admin'), getAdminSettlementSummary);
router.get('/settlement-report', protect, authorize('admin'), getSettlementReport);
router.get('/manager', protect, authorize('manager'), getManagerDashboard);

module.exports = router;
