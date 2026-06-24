const express = require('express');

const { downloadReportPdf } = require('../controllers/reportPdfController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.post('/pdf', protect, authorize('admin'), downloadReportPdf);

module.exports = router;
