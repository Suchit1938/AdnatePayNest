const express = require('express');

const {
  getBusinessRules,
  sendManualMessage,
  updateBusinessRules,
} = require('../controllers/businessRuleController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.get('/', protect, authorize('admin', 'manager'), getBusinessRules);
router.patch('/', protect, authorize('admin'), updateBusinessRules);
router.post('/messages', protect, authorize('admin'), sendManualMessage);

module.exports = router;
