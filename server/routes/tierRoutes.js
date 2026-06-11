const express = require('express');

const { createTier, deleteTier, getCustomerPolicy, listTiers, updateTier } = require('../controllers/tierController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.get('/', protect, authorize('admin', 'manager'), listTiers);
router.get('/policy', protect, authorize('customer', 'admin', 'manager'), getCustomerPolicy);
router.post('/', protect, authorize('admin'), createTier);
router.patch('/:name', protect, authorize('admin'), updateTier);
router.delete('/:name', protect, authorize('admin'), deleteTier);

module.exports = router;
