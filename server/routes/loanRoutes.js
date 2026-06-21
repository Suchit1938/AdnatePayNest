const express = require('express');

const {
  acceptLoanAgreement,
  acceptSanctionLetter,
  createLoan,
  disburseLoan,
  forecloseLoan,
  getLoans,
  makePartPayment,
  payLoanEmi,
  processDueEmis,
  processMonthlyRepayments,
  reviewLoanDocument,
  reviewLoan,
} = require('../controllers/loanController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { uploadLoanDocuments } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/', protect, authorize('customer', 'manager', 'admin'), getLoans);
router.post('/', protect, authorize('customer'), uploadLoanDocuments.array('documents', 8), createLoan);
router.post('/process-due-emis', protect, authorize('manager', 'admin'), processDueEmis);
router.post('/process-monthly-repayments', protect, authorize('manager', 'admin'), processMonthlyRepayments);
router.patch('/:id/sanction/accept', protect, authorize('customer'), acceptSanctionLetter);
router.patch('/:id/agreement/accept', protect, authorize('customer'), acceptLoanAgreement);
router.patch('/:id/review', protect, authorize('manager'), reviewLoan);
router.patch('/:id/documents/:documentId', protect, authorize('manager'), reviewLoanDocument);
router.patch('/:id/disburse', protect, authorize('manager'), disburseLoan);
router.patch('/:id/emis/:emiNumber/pay', protect, authorize('customer'), payLoanEmi);
router.post('/:id/part-payments', protect, authorize('customer'), makePartPayment);
router.post('/:id/foreclose', protect, authorize('customer'), forecloseLoan);

module.exports = router;
