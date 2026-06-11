const express = require('express');

const {
  createOwnAccountTransfer,
  createTransfer,
  getTransactions,
} = require('../controllers/transferController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.get('/transactions', protect, getTransactions);
router.post('/own-account', protect, authorize('customer'), createOwnAccountTransfer);
router.post('/', protect, authorize('customer'), createTransfer);

module.exports = router;
