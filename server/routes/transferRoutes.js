const express = require('express');

const {
  createOwnAccountTransfer,
  createTransfer,
  downloadStatementPdf,
  emailStatement,
  getTransactions,
} = require('../controllers/transferController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.get('/transactions', protect, getTransactions);
router.post('/statement/pdf', protect, authorize('customer'), downloadStatementPdf);
router.post('/statement/email', protect, authorize('customer'), emailStatement);
router.post('/own-account', protect, authorize('customer'), createOwnAccountTransfer);
router.post('/', protect, authorize('customer'), createTransfer);

module.exports = router;
