const express = require('express');

const {
  decideDepositApprovalRequest,
  getDepositApprovalRequests,
} = require('../controllers/depositApprovalController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.get('/', protect, authorize('customer', 'manager', 'admin'), getDepositApprovalRequests);
router.patch('/:id', protect, authorize('manager', 'admin'), decideDepositApprovalRequest);

module.exports = router;
