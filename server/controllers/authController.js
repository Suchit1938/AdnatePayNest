const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { syncCustomerAccounts } = require('../utils/customerAccounts');
const { sendEmail } = require('../utils/email');
const { isValidEmail, normalizeEmail } = require('../utils/emailValidation');

const createToken = (user) =>
  jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const PASSWORD_RESET_OTP_SENT_MESSAGE =
  'If the email is registered, an OTP has been sent.';

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const hashOtp = (otp) => bcrypt.hash(otp, 10);
const isOtpExpired = (expiresAt) => !expiresAt || new Date(expiresAt).getTime() < Date.now();

const sendOtpEmail = async ({ user, otp, subject, purpose }) =>
  sendEmail({
    to: user.email,
    subject,
    text: `Hello ${user.name},

Your OTP for ${purpose} is ${otp}.

This OTP expires in ${OTP_EXPIRY_MINUTES} minutes.

Regards,
Adnate PayNest`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;">
        <p>Hello ${user.name},</p>
        <p>Your OTP for ${purpose} is:</p>
        <p style="font-size:24px;font-weight:700;letter-spacing:4px;">${otp}</p>
        <p>This OTP expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
        <p>Regards,<br />Adnate PayNest</p>
      </div>
    `,
  });

const serializeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  customerId: user.customerId,
  employeeId: user.employeeId,
  branch: user.branch,
  phone: user.phone,
  accountType: user.accountType,
  panNumber: user.panNumber,
  aadhaarNumber: user.aadhaarNumber,
  assignedRegion: user.assignedRegion,
  branchId: user.branchId,
  branchName: user.branchName,
  managerLevel: user.managerLevel,
  createdBy: user.createdBy,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  dob: user.dob,
  address: user.address,
  isVerified: user.isVerified,
  lastLogin: user.lastLogin,
  classification: user.classification,
  pendingRequests: user.pendingRequests,
  totalTransfers: user.totalTransfers,
  account: user.account,
  accounts: user.accounts,
  permissions: user.permissions,
  mustChangePassword: user.mustChangePassword,
});

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ message: 'User is not active' });
  }

  user.lastLogin = new Date();
  await syncCustomerAccounts(user);

  res.json({
    token: createToken(user),
    user: serializeUser(user),
  });
};

const forgotPasswordSendOtp = async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Enter a valid email address' });
  }

  const user = await User.findOne({ email }).select(
    '+passwordResetOtpHash +passwordResetOtpExpiresAt +passwordResetOtpAttempts'
  );

  if (!user) {
    return res.json({ message: PASSWORD_RESET_OTP_SENT_MESSAGE });
  }

  const otp = generateOtp();
  user.passwordResetOtpHash = await hashOtp(otp);
  user.passwordResetOtpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);
  user.passwordResetOtpAttempts = 0;
  await user.save();

  const delivery = await sendOtpEmail({
    user,
    otp,
    subject: 'Reset your Adnate PayNest password',
    purpose: 'password reset',
  });

  if (!delivery?.sent) {
    return res.status(500).json({ message: delivery?.message || 'Unable to send OTP email' });
  }

  res.json({ message: PASSWORD_RESET_OTP_SENT_MESSAGE });
};

const forgotPasswordReset = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const otp = String(req.body.otp || '').trim();
  const newPassword = String(req.body.newPassword || '');

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ message: 'Email, OTP, and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  const user = await User.findOne({ email }).select(
    '+password +passwordResetOtpHash +passwordResetOtpExpiresAt +passwordResetOtpAttempts'
  );

  if (
    !user ||
    !user.passwordResetOtpHash ||
    isOtpExpired(user.passwordResetOtpExpiresAt)
  ) {
    return res.status(400).json({ message: 'OTP is invalid or expired' });
  }

  if (Number(user.passwordResetOtpAttempts || 0) >= MAX_OTP_ATTEMPTS) {
    return res.status(429).json({ message: 'Too many invalid OTP attempts. Request a new OTP.' });
  }

  const isValidOtp = await bcrypt.compare(otp, user.passwordResetOtpHash);

  if (!isValidOtp) {
    user.passwordResetOtpAttempts = Number(user.passwordResetOtpAttempts || 0) + 1;
    await user.save();

    if (user.passwordResetOtpAttempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({ message: 'Too many invalid OTP attempts. Request a new OTP.' });
    }

    return res.status(400).json({ message: 'Invalid OTP' });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  user.passwordResetOtpHash = undefined;
  user.passwordResetOtpExpiresAt = undefined;
  user.passwordResetOtpAttempts = 0;
  user.mustChangePassword = false;
  await user.save();

  await sendEmail({
    to: user.email,
    subject: 'Your Adnate PayNest password was changed',
    text: `Hello ${user.name},

Your password was reset successfully.

If you did not request this change, contact support immediately.

Regards,
Adnate PayNest`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;">
        <p>Hello ${user.name},</p>
        <p>Your password was reset successfully.</p>
        <p>If you did not request this change, contact support immediately.</p>
        <p>Regards,<br />Adnate PayNest</p>
      </div>
    `,
  });

  res.json({ message: 'Password reset successfully. You can now sign in.' });
};

const changePasswordSendOtp = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' });
  }

  if (String(newPassword).length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  const user = await User.findById(req.user._id).select(
    '+password +passwordChangeOtpHash +passwordChangeOtpExpiresAt +passwordChangeOtpAttempts +pendingPasswordHash'
  );

  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    return res.status(401).json({ message: 'Current password is incorrect' });
  }

  if (await bcrypt.compare(newPassword, user.password)) {
    return res.status(400).json({ message: 'New password must be different from the current password' });
  }

  const otp = generateOtp();
  user.passwordChangeOtpHash = await hashOtp(otp);
  user.passwordChangeOtpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);
  user.passwordChangeOtpAttempts = 0;
  user.pendingPasswordHash = await bcrypt.hash(newPassword, 10);
  await user.save();

  const delivery = await sendOtpEmail({
    user,
    otp,
    subject: 'Confirm your Adnate PayNest password change',
    purpose: 'password change',
  });

  if (!delivery?.sent) {
    return res.status(500).json({ message: delivery?.message || 'Unable to send OTP email' });
  }

  res.json({ message: 'OTP sent to your registered email.' });
};

const changePasswordVerifyOtp = async (req, res) => {
  const otp = String(req.body.otp || '').trim();

  if (!otp) {
    return res.status(400).json({ message: 'OTP is required' });
  }

  const user = await User.findById(req.user._id).select(
    '+password +passwordChangeOtpHash +passwordChangeOtpExpiresAt +passwordChangeOtpAttempts +pendingPasswordHash'
  );

  if (
    !user ||
    !user.passwordChangeOtpHash ||
    !user.pendingPasswordHash ||
    isOtpExpired(user.passwordChangeOtpExpiresAt)
  ) {
    return res.status(400).json({ message: 'OTP is invalid or expired' });
  }

  if (Number(user.passwordChangeOtpAttempts || 0) >= MAX_OTP_ATTEMPTS) {
    return res.status(429).json({ message: 'Too many invalid OTP attempts. Request a new OTP.' });
  }

  const isValidOtp = await bcrypt.compare(otp, user.passwordChangeOtpHash);

  if (!isValidOtp) {
    user.passwordChangeOtpAttempts = Number(user.passwordChangeOtpAttempts || 0) + 1;
    await user.save();

    if (user.passwordChangeOtpAttempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({ message: 'Too many invalid OTP attempts. Request a new OTP.' });
    }

    return res.status(400).json({ message: 'Invalid OTP' });
  }

  user.password = user.pendingPasswordHash;
  user.passwordChangeOtpHash = undefined;
  user.passwordChangeOtpExpiresAt = undefined;
  user.passwordChangeOtpAttempts = 0;
  user.pendingPasswordHash = undefined;
  user.mustChangePassword = false;
  await user.save();

  await sendEmail({
    to: user.email,
    subject: 'Your Adnate PayNest password was changed',
    text: `Hello ${user.name},

Your password was changed successfully.

If you did not make this change, contact support immediately.

Regards,
Adnate PayNest`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;">
        <p>Hello ${user.name},</p>
        <p>Your password was changed successfully.</p>
        <p>If you did not make this change, contact support immediately.</p>
        <p>Regards,<br />Adnate PayNest</p>
      </div>
    `,
  });

  res.json({ message: 'Password changed successfully.', user: serializeUser(user) });
};

const me = async (req, res) => {
  const user = await syncCustomerAccounts(req.user);
  res.json({ user: serializeUser(user) });
};

module.exports = {
  changePasswordSendOtp,
  changePasswordVerifyOtp,
  forgotPasswordReset,
  forgotPasswordSendOtp,
  login,
  me,
  serializeUser,
};
