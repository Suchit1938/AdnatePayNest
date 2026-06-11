const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { syncCustomerAccounts } = require('../utils/customerAccounts');

const createToken = (user) =>
  jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

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

const me = async (req, res) => {
  const user = await syncCustomerAccounts(req.user);
  res.json({ user: serializeUser(user) });
};

module.exports = { login, me, serializeUser };
