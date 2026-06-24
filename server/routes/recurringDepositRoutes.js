const express = require('express');

const {
  createRecurringDeposit,
  getRecurringDeposits,
  postMonthlyInstallment,
  renewRecurringDeposit,
  requestMaturityPayout,
  requestPrematureWithdrawal,
} = require('../controllers/recurringDepositController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.get('/', protect, authorize('customer', 'admin'), getRecurringDeposits);
router.post('/', protect, authorize('customer'), createRecurringDeposit);
router.post('/:id/installments/auto-debit', protect, authorize('customer'), postMonthlyInstallment);
router.post('/:id/premature-withdrawal', protect, authorize('customer'), requestPrematureWithdrawal);
router.post('/:id/renew', protect, authorize('customer'), renewRecurringDeposit);
router.post('/:id/payout', protect, authorize('customer'), requestMaturityPayout);

module.exports = router;
