const express = require('express');

const {
  changePasswordSendOtp,
  changePasswordVerifyOtp,
  forgotPasswordReset,
  forgotPasswordSendOtp,
  login,
  me,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/login', login);
router.post('/forgot-password/send-otp', forgotPasswordSendOtp);
router.post('/forgot-password/reset', forgotPasswordReset);
router.get('/me', protect, me);
router.post('/password/send-otp', protect, changePasswordSendOtp);
router.post('/password/verify-otp', protect, changePasswordVerifyOtp);

module.exports = router;
