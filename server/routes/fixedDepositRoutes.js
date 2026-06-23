const express = require('express');

const {
  createFixedDeposit,
  getDepositRates,
  getFixedDepositCustomers,
  getFixedDeposits,
  updateDepositRates,
  updateFixedDepositStatus,
} = require('../controllers/fixedDepositController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.get('/', protect, authorize('customer', 'admin'), getFixedDeposits);
router.post('/', protect, authorize('customer', 'admin'), createFixedDeposit);
router.get('/rates', protect, authorize('customer', 'admin'), getDepositRates);
router.patch('/rates', protect, authorize('admin'), updateDepositRates);
router.get('/customers', protect, authorize('admin'), getFixedDepositCustomers);
router.patch('/:id/status', protect, authorize('admin'), updateFixedDepositStatus);

module.exports = router;
