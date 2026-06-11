const express = require('express');

const { payOffOverdraft } = require('../controllers/overdraftController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.post('/payoff', protect, authorize('customer'), payOffOverdraft);

module.exports = router;
