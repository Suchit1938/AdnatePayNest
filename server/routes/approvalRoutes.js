const express = require('express');

const { getApprovals, updateApproval } = require('../controllers/approvalController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.get('/', protect, authorize('manager', 'admin'), getApprovals);
router.patch('/:id', protect, authorize('manager', 'admin'), updateApproval);

module.exports = router;
