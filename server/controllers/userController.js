const bcrypt = require('bcryptjs');

const User = require('../models/User');
const BankAccount = require('../models/BankAccount');
const Approval = require('../models/Approval');
const Tier = require('../models/Tier');
const { serializeUser } = require('./authController');
const {
  ensureBankAccountsForUser,
  syncCustomerAccounts,
  toWholeRupees,
} = require('../utils/customerAccounts');
const { getAccountTypeOdRule, getAccountTypeOdRules } = require('../utils/accountTypeOdPolicy');
const Counter = require('../models/Counter');
const { sendEmail } = require('../utils/email');
const { writeSystemLog } = require('../utils/systemLog');

const DEFAULT_BANK_IFSC = process.env.BANK_IFSC || 'ADNT0281237';
const DEFAULT_BRANCH_NAME = process.env.BANK_BRANCH_NAME || 'Jaipur';
const DEFAULT_ASSIGNED_REGION = process.env.BANK_REGION || 'Jaipur';
const GRACE_PERIOD_DAYS = 3;
const REVIEW_CYCLE = 'Monthly';

const getCustomers = async (req, res) => {
  const customers = await User.find({ role: 'customer' }).sort({ createdAt: -1 });
  const bankAccounts = await BankAccount.find({
    customerId: { $in: customers.map((customer) => customer.customerId).filter(Boolean) },
  }).sort({ createdAt: 1 });
  const accountByCustomerId = bankAccounts.reduce((map, account) => {
    if (!map.has(account.customerId)) {
      map.set(account.customerId, account);
    }

    return map;
  }, new Map());

  res.json({
    customers: customers.map((customer) => {
      const serializedCustomer = serializeUser(customer);
      const bankAccount = accountByCustomerId.get(customer.customerId);

      return {
        ...serializedCustomer,
        panNumber: serializedCustomer.panNumber || bankAccount?.panNumber,
      };
    }),
  });
};

const getUsers = async (req, res) => {
  const users = await User.find({ role: { $in: ['customer', 'manager'] } }).sort({
    createdAt: -1,
  });
  const customers = users.filter((user) => user.role === 'customer');
  const managers = users.filter((user) => user.role === 'manager');
  const bankAccounts = await BankAccount.find({
    customerId: { $in: customers.map((customer) => customer.customerId).filter(Boolean) },
  }).sort({ createdAt: 1 });
  const pendingApprovalCounts = await Approval.aggregate([
    {
      $match: {
        status: 'pending',
        assignedManager: { $in: managers.map((manager) => manager._id) },
      },
    },
    { $group: { _id: '$assignedManager', count: { $sum: 1 } } },
  ]);
  const pendingApprovalCountByManager = pendingApprovalCounts.reduce((map, entry) => {
    map.set(String(entry._id), entry.count);
    return map;
  }, new Map());
  const accountByCustomerId = bankAccounts.reduce((map, account) => {
    if (!map.has(account.customerId)) {
      map.set(account.customerId, account);
    }

    return map;
  }, new Map());
  const serializeCustomer = (customer) => {
    const serializedCustomer = serializeUser(customer);
    const bankAccount = accountByCustomerId.get(customer.customerId);

    return {
      ...serializedCustomer,
      panNumber: serializedCustomer.panNumber || bankAccount?.panNumber,
    };
  };

  res.json({
    customers: customers.map(serializeCustomer),
    managers: managers.map((manager) => ({
      ...serializeUser(manager),
      pendingApprovals: pendingApprovalCountByManager.get(String(manager._id)) || 0,
    })),
  });
};

const getNextSequence = async (key, startValue) => {
  const existingCounter = await Counter.findOne({ key });

  if (!existingCounter) {
    try {
      await Counter.create({ key, value: startValue });
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }
    }
  } else if (existingCounter.value < startValue) {
    await Counter.updateOne(
      { key, value: { $lt: startValue } },
      { $set: { value: startValue } }
    );
  }

  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { new: true }
  );

  return counter.value;
};

const generateCustomerId = async () => {
  const existingCustomers = await User.find({
    customerId: /^CUST\d+$/,
  }).select('customerId');
  const maxExistingNumber = existingCustomers.reduce((max, user) => {
    const match = String(user.customerId || '').match(/^CUST(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 1000);
  const nextNumber = await getNextSequence('customerId', maxExistingNumber);

  return `CUST${nextNumber}`;
};

const generateAccountNumber = async () => {
  const existingAccounts = await BankAccount.find({
    accountNumber: /^\d+$/,
  }).select('accountNumber');
  const maxExistingNumber = existingAccounts.reduce((max, account) => {
    const accountNumber = String(account.accountNumber || '');
    return /^\d+$/.test(accountNumber)
      ? Math.max(max, Number(accountNumber))
      : max;
  }, 1000000000);
  const nextNumber = await getNextSequence('accountNumber', maxExistingNumber);

  return String(nextNumber);
};

const generateEmployeeId = async () => {
  const existingManagers = await User.find({
    employeeId: /^MGR\d+$/,
  }).select('employeeId');
  const maxExistingNumber = existingManagers.reduce((max, user) => {
    const match = String(user.employeeId || '').match(/^MGR(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 9000);
  const nextNumber = await getNextSequence('employeeId', maxExistingNumber);

  return `MGR${nextNumber}`;
};

const getPendingApprovalCountForManagers = async (managerIds = []) => {
  const normalizedIds = managerIds.filter(Boolean);

  if (normalizedIds.length === 0) return 0;

  return Approval.countDocuments({
    status: 'pending',
    assignedManager: { $in: normalizedIds },
  });
};

const activateManagerAccess = async ({ manager, actor }) => {
  const previousManagers = await User.find({
    _id: { $ne: manager._id },
    role: 'manager',
    status: 'active',
  }).select('_id name employeeId status');
  const previousManagerIds = previousManagers.map((entry) => entry._id);
  const pendingApprovalOwnershipFilters = [
    { assignedManager: { $exists: false } },
    { assignedManager: null },
  ];

  if (previousManagerIds.length > 0) {
    await User.updateMany(
      { _id: { $in: previousManagerIds } },
      { $set: { status: 'inactive' } }
    );
    pendingApprovalOwnershipFilters.unshift({
      assignedManager: { $in: previousManagerIds },
    });
  }

  manager.status = 'active';
  await manager.save();

  const approvalUpdate = await Approval.updateMany(
    {
      status: 'pending',
      $or: pendingApprovalOwnershipFilters,
    },
    { $set: { assignedManager: manager._id } }
  );
  const managerReplacement = {
    replacedManagers: previousManagerIds.length,
    reassignedPendingApprovals: approvalUpdate.modifiedCount || approvalUpdate.nModified || 0,
    replacedManagerIds: previousManagerIds.map((id) => String(id)),
  };

  if (
    managerReplacement.replacedManagers > 0 ||
    managerReplacement.reassignedPendingApprovals > 0
  ) {
    await writeSystemLog({
      action: 'manager.replaced',
      message: `${manager.name} replaced ${previousManagers.length} active manager(s) for ${manager.branchName}`,
      actor: actor?._id,
      actorName: actor?.name || 'Admin',
      entityType: 'User',
      entityId: manager.employeeId,
      severity: 'warning',
      metadata: {
        newManager: {
          id: manager._id,
          name: manager.name,
          employeeId: manager.employeeId,
        },
        replacedManagers: previousManagers.map((entry) => ({
          id: entry._id,
          name: entry.name,
          employeeId: entry.employeeId,
        })),
        reassignedPendingApprovals: managerReplacement.reassignedPendingApprovals,
        branchId: manager.branchId,
        branchName: manager.branchName,
      },
    });
  }

  return managerReplacement;
};

const deactivateManagerAccess = async ({ manager, status }) => {
  const pendingApprovals = await getPendingApprovalCountForManagers([manager._id]);
  const replacementManager = await User.findOne({
    _id: { $ne: manager._id },
    role: 'manager',
    status: 'active',
  }).select('_id');

  if (pendingApprovals > 0 && !replacementManager) {
    const error = new Error(
      `${manager.name} has ${pendingApprovals} pending approval(s). Enable or create another manager first so pending work can be transferred.`
    );
    error.statusCode = 409;
    throw error;
  }

  if (pendingApprovals > 0 && replacementManager) {
    await Approval.updateMany(
      { status: 'pending', assignedManager: manager._id },
      { $set: { assignedManager: replacementManager._id } }
    );
  }

  manager.status = status;
  await manager.save();

  return {
    reassignedPendingApprovals: pendingApprovals,
    replacementManagerId: replacementManager ? String(replacementManager._id) : null,
  };
};


const validationPatterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  phone: /^[6-9]\d{9}$/,
  panNumber: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  aadhaarNumber: /^\d{12}$/,
  customerId: /^CUST\d{4,}$/,
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  accountNumber: /^\d{9,18}$/,
  name: /^[A-Za-z ]{2,}$/,
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getAutoPassword = (fullName, phone) => {
  const firstName = String(fullName || '').trim().split(/\s+/)[0] || '';
  const namePart = firstName.replace(/[^a-z]/gi, '').slice(0, 5).toUpperCase();
  const phonePart = String(phone || '').replace(/\D/g, '').slice(-5);

  return namePart && phonePart.length === 5 ? `${namePart}@${phonePart}` : '';
};

const formatCurrency = (value) =>
  `Rs. ${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;

const buildTierDetails = (tier) => {
  const details = [
    ['Per Transfer Limit', formatCurrency(tier.perTxnLimit)],
    ['Daily Transfer Limit', formatCurrency(tier.dailyLimit)],
    ['Monthly Transfer Limit', formatCurrency(tier.monthlyLimit)],
    ['Maximum Overdraft Limit', formatCurrency(tier.maxODLimit)],
    ['Overdraft Due Rule', 'Clear used overdraft before month-end'],
    ['Interest Charging Rule', 'Minimum 1 day interest on any overdraft usage'],
    ['Grace Window', `${GRACE_PERIOD_DAYS} days after month-end`],
    ['Review Cycle', REVIEW_CYCLE],
  ];

  if (Number(tier.penaltyAmount || 0) > 0) {
    details.push(['Penalty After Grace', formatCurrency(tier.penaltyAmount)]);
  }

  if (tier.lateFeeRate) {
    details.push(['Overdraft Interest Rate', tier.lateFeeRate]);
  }

  if (tier.eligibility) {
    details.push(['Eligibility', tier.eligibility]);
  }

  if (tier.reviewNotes) {
    details.push(['Review Notes', tier.reviewNotes]);
  }

  return details;
};

const buildPlainDetails = (details) =>
  details.map(([label, value]) => `${label}: ${value}`).join('\n');

const buildHtmlDetails = (details) =>
  details
    .map(
      ([label, value]) =>
        `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`
    )
    .join('');

const buildAccountTypeOdDetails = (tier) =>
  getAccountTypeOdRules(tier).map((rule) => [
    `${rule.accountType} Account OD`,
    [
      `Limit ${formatCurrency(rule.odLimit)}`,
      `Minimum Opening Balance ${formatCurrency(rule.minOpeningBalance)}`,
      `${rule.monthlyOdUses} monthly uses`,
    ].join(' | '),
  ]);

const isAdult = (dob) => {
  if (!dob) return true;

  const birthDate = new Date(dob);
  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age >= 18;
};

const serializeSavedBeneficiary = (entry) => {
  const user = entry.beneficiaryUser;

  return {
    id: entry._id,
    beneficiaryUserId: user?._id,
    name: user?.name,
    customerId: user?.customerId,
    account: entry.accountNumber,
    accountType: entry.accountType,
    verificationStatus: entry.verificationStatus || 'verified',
    verifiedAt: entry.verifiedAt,
    accounts: [
      {
        accountNumber: entry.accountNumber,
        accountType: entry.accountType,
      },
    ],
  };
};

const maskName = (value) => {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);

  return parts
    .map((part, index) => {
      if (part.length <= 2) return part;
      return index === 0
        ? `${part.slice(0, 1)}${'*'.repeat(Math.max(2, part.length - 1))}`
        : `${part.slice(0, 1)}${'*'.repeat(Math.max(2, part.length - 1))}`;
    })
    .join(' ');
};

const maskAccountNumber = (value) => {
  const accountNumber = String(value || '').trim();

  return accountNumber.length <= 4
    ? accountNumber
    : `XXXX${accountNumber.slice(-4)}`;
};

const hasActiveSnapshotAccount = (user, accountNumber) => {
  const snapshots = [user?.account, ...(user?.accounts || [])].filter(Boolean);

  return snapshots.some(
    (account) =>
      String(account.accountNumber || '').trim() === accountNumber &&
      (account.accountStatus || 'active') === 'active'
  );
};

const getSavedBeneficiaries = async (userId) => {
  const currentUser = await User.findById(userId).populate({
    path: 'savedBeneficiaries.beneficiaryUser',
    match: {
      role: 'customer',
      status: 'active',
      _id: { $ne: userId },
    },
  });

  const beneficiaryEntries = (currentUser?.savedBeneficiaries || []).filter(
    (entry) => entry.beneficiaryUser
  );

  await Promise.all(
    beneficiaryEntries.map((entry) =>
      ensureBankAccountsForUser(entry.beneficiaryUser)
    )
  );

  const activeAccounts = await BankAccount.find({
    accountNumber: {
      $in: beneficiaryEntries.map((entry) => String(entry.accountNumber || '').trim()),
    },
    accountStatus: 'active',
  }).select('accountNumber customerId');
  const activeAccountNumbers = new Set(
    activeAccounts.map((account) => String(account.accountNumber || '').trim())
  );

  return beneficiaryEntries.filter((entry) =>
    activeAccountNumbers.has(String(entry.accountNumber || '').trim()) ||
    hasActiveSnapshotAccount(entry.beneficiaryUser, String(entry.accountNumber || '').trim())
  );
};

const getBeneficiaries = async (req, res) => {
  const beneficiaries = await getSavedBeneficiaries(req.user._id);

  res.json({
    beneficiaries: beneficiaries.map(serializeSavedBeneficiary),
  });
};

const resolveBeneficiaryAccount = async (accountNumber, currentUser) => {
  let bankAccount = await BankAccount.findOne({
    accountNumber,
    accountStatus: 'active',
  });

  if (!bankAccount) {
    const legacyBeneficiary = await User.findOne({
      role: 'customer',
      status: 'active',
      $or: [
        { 'account.accountNumber': accountNumber },
        { 'accounts.accountNumber': accountNumber },
      ],
    });

    if (legacyBeneficiary) {
      await ensureBankAccountsForUser(legacyBeneficiary);
      bankAccount = await BankAccount.findOne({
        accountNumber,
        accountStatus: 'active',
      });
    }
  }

  if (!bankAccount) {
    const error = new Error('Active beneficiary account not found');
    error.statusCode = 404;
    throw error;
  }

  if (bankAccount.customerId === currentUser.customerId) {
    const error = new Error('You cannot add your own account as a beneficiary');
    error.statusCode = 409;
    throw error;
  }

  const beneficiary = await User.findOne({
    role: 'customer',
    status: 'active',
    customerId: bankAccount.customerId,
  });

  if (!beneficiary) {
    const error = new Error('This bank account is not linked to an active customer app user');
    error.statusCode = 404;
    throw error;
  }

  return { bankAccount, beneficiary };
};

const verifyBeneficiary = async (req, res) => {
  const accountNumber = String(req.body.account || req.body.accountNumber || '').trim();

  if (!accountNumber) {
    return res.status(400).json({ message: 'Beneficiary account number is required' });
  }

  try {
    const { bankAccount, beneficiary } = await resolveBeneficiaryAccount(accountNumber, req.user);

    res.json({
      message: 'Beneficiary account verified. Confirm this payee before saving.',
      beneficiary: {
        name: maskName(beneficiary.name),
        customerId: beneficiary.customerId,
        accountNumber,
        maskedAccountNumber: maskAccountNumber(accountNumber),
        accountType: bankAccount.accountType,
        bankName: bankAccount.bankName || 'Adnate Bank',
        ifsc: bankAccount.ifsc,
        verificationStatus: 'verified',
      },
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message });
  }
};

const addBeneficiary = async (req, res) => {
  const accountNumber = String(req.body.account || req.body.accountNumber || '').trim();
  const confirmed = req.body.confirmed === true || req.body.confirmed === 'true';

  if (!accountNumber) {
    return res.status(400).json({ message: 'Beneficiary account number is required' });
  }

  if (!confirmed) {
    return res.status(400).json({ message: 'Confirm verified beneficiary details before saving' });
  }

  let bankAccount;
  let beneficiary;

  try {
    ({ bankAccount, beneficiary } = await resolveBeneficiaryAccount(accountNumber, req.user));
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }

  const currentUser = await User.findById(req.user._id);

  const alreadyAdded = currentUser.savedBeneficiaries.some(
    (entry) => entry.accountNumber === accountNumber
  );

  if (!alreadyAdded) {
    currentUser.savedBeneficiaries.push({
      beneficiaryUser: beneficiary._id,
      accountNumber,
      accountType: bankAccount.accountType,
      verificationStatus: 'verified',
      verifiedAt: new Date(),
    });

    await currentUser.save();
  }

  const beneficiaries = await getSavedBeneficiaries(req.user._id);

  res.status(201).json({
    message: `${beneficiary.name} added as beneficiary`,
    beneficiaries: beneficiaries.map(serializeSavedBeneficiary),
  });
};

const removeBeneficiary = async (req, res) => {
  await User.updateOne(
    { _id: req.user._id },
    { $pull: { savedBeneficiaries: { _id: req.params.id } } }
  );

  const beneficiaries = await getSavedBeneficiaries(req.user._id);

  res.json({
    message: 'Beneficiary removed',
    beneficiaries: beneficiaries.map(serializeSavedBeneficiary),
  });
};

const createUser = async (req, res) => {
  const {
    name,
    fullName,
    email,
    role = 'customer',
    status = 'active',
    phone,
    classification,
    customerId,
    accountType,
    panNumber,
    aadhaarNumber,
    dob,
    address,
    account,
    branch,
    permissions = [],
    createdBy,
  } = req.body;

  const displayName = name || fullName;
  const normalizedEmail = email?.toLowerCase().trim();
  let emailDelivery = null;

  if (!displayName || !normalizedEmail) {
    return res.status(400).json({ message: 'Name and email are required' });
  }

  const normalizedPhone = phone?.trim();
  const normalizedPan = panNumber?.trim().toUpperCase();
  const normalizedAadhaar = aadhaarNumber?.trim();
  const normalizedIfsc = account?.ifsc?.trim().toUpperCase();
  const generatedPassword = getAutoPassword(displayName, normalizedPhone);

  if (!validationPatterns.name.test(displayName.trim())) {
    return res.status(400).json({
      message: 'Full name must contain only letters and spaces',
    });
  }

  if (!validationPatterns.email.test(normalizedEmail)) {
    return res.status(400).json({
      message: 'Enter a valid email address',
    });
  }

  if (!validationPatterns.phone.test(normalizedPhone || '')) {
    return res.status(400).json({
      message: 'Phone number must be a valid 10 digit Indian mobile number',
    });
  }

  if (!generatedPassword) {
    return res.status(400).json({
      message: 'A valid first name and 10 digit mobile number are required to generate a password',
    });
  }

  const existingUser = await User.findOne({ email: normalizedEmail });

  if (existingUser) {
    return res.status(409).json({ message: 'Email already exists' });
  }

  const isCustomer = role === 'customer';
  let tier;
  let generatedCustomerId;
  let generatedAccountNumber;
  let generatedEmployeeId;

  if (!panNumber || !aadhaarNumber || !address) {
    return res.status(400).json({
      message: 'PAN, Aadhaar, and address are required',
    });
  }

  if (!validationPatterns.panNumber.test(normalizedPan)) {
    return res.status(400).json({
      message: 'PAN number must be in valid format, like ABCDE1234F',
    });
  }

  if (!validationPatterns.aadhaarNumber.test(normalizedAadhaar)) {
    return res.status(400).json({
      message: 'Aadhaar number must be 12 digits',
    });
  }

  const duplicateKycUser = await User.findOne({
    $or: [
      { panNumber: normalizedPan },
      { aadhaarNumber: normalizedAadhaar },
    ],
  });

  if (duplicateKycUser) {
    return res.status(409).json({
      message: 'PAN or Aadhaar is already linked to an app user',
    });
  }

  if (isCustomer) {
    if (
      !phone ||
      !classification ||
      !accountType ||
      !dob ||
      account?.balance === undefined ||
      account?.balance === null ||
      String(account.balance).trim() === '' ||
      !account?.ifsc ||
      !account?.bankName
    ) {
      return res.status(400).json({
        message: 'Phone, PAN, Aadhaar, tier, account type, DOB, address, wallet balance, IFSC, and bank name are required',
      });
    }

    if (!validationPatterns.ifsc.test(normalizedIfsc)) {
      return res.status(400).json({
        message: 'IFSC must be in valid format, like HDFC0001234',
      });
    }

    if (!isAdult(dob)) {
      return res.status(400).json({
        message: 'Customer must be at least 18 years old',
      });
    }


    tier = await Tier.findOne({ name: classification });

    if (!tier) {
      return res.status(404).json({
        message: 'Selected customer tier was not found',
      });
    }

    const openingBalance = Number(account.balance || 0);
    const accountRule = getAccountTypeOdRule(tier, accountType);
    const minOpeningBalance = Number(accountRule.minOpeningBalance || 0);

    if (openingBalance < minOpeningBalance) {
      return res.status(400).json({
        message: `${accountType} account requires a minimum opening balance of ${formatCurrency(minOpeningBalance)} for the selected tier`,
      });
    }

    generatedCustomerId = await generateCustomerId();
    generatedAccountNumber = await generateAccountNumber();
  } else if (
    !phone
  ) {
    return res.status(400).json({
      message: 'Phone is required for manager creation',
    });
  } else {
    generatedEmployeeId = await generateEmployeeId();
  }

  const initialOdRule = getAccountTypeOdRule(tier, accountType);
  const overdraftLimit = Number(initialOdRule.odLimit || 0);
  const userAccount = isCustomer
    ? {
      accountNumber: generatedAccountNumber,
      bankName: account?.bankName,
      ifsc: normalizedIfsc,
      accountType,
      accountStatus: account.accountStatus || 'active',
      balance: Number(account?.balance || 0),
      transferLimit: Number(tier?.perTxnLimit || 0),
      overdraftLimit,
      overdraftUsed: 0,
    }
    : undefined;
  const managerReplacement = {
    replacedManagers: 0,
    reassignedPendingApprovals: 0,
  };

  const user = await User.create({
    name: displayName,
    email: normalizedEmail,
    password: await bcrypt.hash(generatedPassword, 10),
    role,
    status,
    phone: normalizedPhone,
    accountType,
    panNumber: normalizedPan,
    aadhaarNumber: normalizedAadhaar,
    classification: isCustomer ? classification : undefined,
    dob: isCustomer ? dob : undefined,
    address,
    isVerified: false,
    lastLogin: null,
    customerId: isCustomer ? generatedCustomerId : undefined,
    employeeId: isCustomer ? undefined : generatedEmployeeId,
    branch: isCustomer ? branch : DEFAULT_BRANCH_NAME,
    assignedRegion: isCustomer ? undefined : DEFAULT_ASSIGNED_REGION,
    branchId: isCustomer ? undefined : DEFAULT_BANK_IFSC,
    branchName: isCustomer ? undefined : DEFAULT_BRANCH_NAME,
    permissions,
    createdBy,
    accounts: isCustomer ? [userAccount] : [],
  });

  if (!isCustomer) {
    const replacementResult = await activateManagerAccess({
      manager: user,
      actor: req.user || { name: createdBy || 'Admin' },
    });

    managerReplacement.replacedManagers = replacementResult.replacedManagers;
    managerReplacement.reassignedPendingApprovals =
      replacementResult.reassignedPendingApprovals;
    managerReplacement.replacedManagerIds = replacementResult.replacedManagerIds;
  }

  if (isCustomer) {
    await BankAccount.create({
      customerId: generatedCustomerId,
      panNumber: normalizedPan,
      accountNumber: generatedAccountNumber,
      accountType,
      walletBalance: Number(account.balance || 0),
      availableBalance: Number(account.balance || 0),
      transferLimit: Number(tier.perTxnLimit || 0),
      withdrawalLimit: Number(tier.dailyLimit || 0),
      accountStatus: account.accountStatus || 'active',
      odLimit: overdraftLimit,
      odUsed: 0,
    });

    await writeSystemLog({
      action: 'customer.created',
      message: `New customer ${user.name} registered with customer ID ${generatedCustomerId}`,
      actor: req.user?._id,
      actorName: req.user?.name || createdBy || 'Admin',
      entityType: 'User',
      entityId: generatedCustomerId,
      severity: 'info',
      metadata: {
        customerId: generatedCustomerId,
        customerName: user.name,
        email: user.email,
        classification,
      },
    });

    const tierDisplayName = tier.label || classification;
    const tierDetails = buildTierDetails(tier);
    const accountTypeOdDetails = buildAccountTypeOdDetails(tier);
    const selectedAccountOdDetail = accountTypeOdDetails.find(
      ([label]) => label.startsWith(`${accountType} Account`)
    );
    const plainTierDetails = buildPlainDetails(tierDetails);
    const htmlTierDetails = buildHtmlDetails(tierDetails);
    const plainAccountTypeOdDetails = buildPlainDetails(accountTypeOdDetails);
    const htmlAccountTypeOdDetails = buildHtmlDetails(accountTypeOdDetails);
    const passwordFormat =
      'First 5 letters of your first name + @ + Last 5 digits of your registered mobile number';

    const delivery = await sendEmail({
      to: user.email,
      subject: 'Welcome to AdnatePayNest - Your Account Details',
      text: `Dear ${user.name},

Welcome to AdnatePayNest.

Your account has been successfully created. Please find your account details below:

Customer ID: ${generatedCustomerId}
Registered Mobile Number: ${normalizedPhone}
Account Number: ${generatedAccountNumber}
Account Type: ${accountType}
Account Tier: ${tierDisplayName}
Opening Balance: ${formatCurrency(account.balance)}
${selectedAccountOdDetail ? `${selectedAccountOdDetail[0]}: ${selectedAccountOdDetail[1]}` : ''}

Your ${tierDisplayName} Tier Details:
${plainTierDetails}

Account Type OD Policy:
${plainAccountTypeOdDetails}

Your temporary password has been generated using the following format:
${passwordFormat}

Example:
If your first name is XYZPQR and your registered mobile number is 1234567890, your temporary password will be XYZPQ@67890.

For security reasons, please log in and change your password immediately after your first login.

If any of the above details are incorrect, please contact the AdnatePayNest support team.

Regards,
Team AdnatePayNest
Our Technology, Your Trust`,
      html: `
        <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
          <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <div style="background:#0f172a;color:#ffffff;padding:18px 22px;">
              <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#bfdbfe;">Adnate PayNest</p>
              <h1 style="margin:6px 0 0;font-size:22px;line-height:1.3;">Your account has been created</h1>
            </div>
            <div style="padding:22px;">
              <p>Dear ${escapeHtml(user.name)},</p>
              <p>Welcome to <strong>AdnatePayNest</strong>.</p>
              <p>Your account has been successfully created. Please find your account details below:</p>
              <ul style="line-height:1.8;">
                <li><strong>Customer ID:</strong> ${escapeHtml(generatedCustomerId)}</li>
                <li><strong>Registered Mobile Number:</strong> ${escapeHtml(normalizedPhone)}</li>
                <li><strong>Account Number:</strong> ${escapeHtml(generatedAccountNumber)}</li>
                <li><strong>Account Type:</strong> ${escapeHtml(accountType)}</li>
                <li><strong>Account Tier:</strong> ${escapeHtml(tierDisplayName)}</li>
                <li><strong>Opening Balance:</strong> ${escapeHtml(formatCurrency(account.balance))}</li>
              </ul>
              ${selectedAccountOdDetail ? `
                <div style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:10px;padding:14px 16px;margin:16px 0;">
                  <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1d4ed8;text-transform:uppercase;">Selected account OD facility</p>
                  <p style="margin:0;font-size:15px;color:#0f172a;"><strong>${escapeHtml(selectedAccountOdDetail[0])}:</strong> ${escapeHtml(selectedAccountOdDetail[1])}</p>
                </div>
              ` : ''}
              <p>Your account is classified under the <strong>${escapeHtml(tierDisplayName)} Tier</strong>. Please find your tier details below:</p>
              <ul style="line-height:1.8;">
                ${htmlTierDetails}
              </ul>
              <p><strong>Account Type OD Policy</strong></p>
              <ul style="line-height:1.8;">
                ${htmlAccountTypeOdDetails}
              </ul>
              <p>Your temporary password has been generated using the following format:</p>
              <p style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;padding:12px 14px;"><strong>First 5 letters of your first name + @ + Last 5 digits of your registered mobile number</strong></p>
              <p><strong>Example:</strong> If your first name is <strong>XYZPQR</strong> and your registered mobile number is <strong>1234567890</strong>, your temporary password will be <strong>XYZPQ@67890</strong>.</p>
              <p>For security reasons, please log in and change your password immediately after your first login.</p>
              <p>If any of the above details are incorrect, please contact the AdnatePayNest support team.</p>
              <p>Regards,<br /><strong>Team AdnatePayNest</strong><br />Our Technology, Your Trust</p>
            </div>
          </div>
        </div>
      `,
    });
    emailDelivery = delivery.sent
      ? {
        sent: true,
        message: 'Welcome email sent.',
      }
      : {
        sent: false,
        message: delivery.message || 'Welcome email was not sent.',
      };
  }

  res.status(201).json({
    user: serializeUser(user),
    email: emailDelivery,
    managerReplacement: isCustomer ? undefined : managerReplacement,
  });
};

const addCustomerAccount = async (req, res) => {
  const {
    accountType,
    openingBalance = 0,
    accountStatus = 'active',
  } = req.body;

  if (!['Savings', 'Current', 'Salary'].includes(accountType)) {
    return res.status(400).json({ message: 'Select a valid account type' });
  }

  if (!['active', 'inactive', 'blocked'].includes(accountStatus)) {
    return res.status(400).json({ message: 'Select a valid account status' });
  }

  const balance = toWholeRupees(openingBalance);

  if (!Number.isFinite(balance)) {
    return res.status(400).json({ message: 'Opening balance must be a valid number' });
  }

  if (balance < 0) {
    return res.status(400).json({ message: 'Opening balance cannot be negative' });
  }

  const user = await User.findOne({
    _id: req.params.id,
    role: 'customer',
  });

  if (!user) {
    return res.status(404).json({ message: 'Customer not found' });
  }

  if (user.status !== 'active') {
    return res.status(400).json({ message: 'Account can be added only for active customers' });
  }

  const tier = await Tier.findOne({ name: user.classification });
  const existingAccount = await BankAccount.findOne({
    customerId: user.customerId,
    accountType,
  });

  if (existingAccount) {
    return res.status(409).json({
      message: `${user.name} already has a ${accountType} account`,
    });
  }

  const accountNumber = await generateAccountNumber();
  const odRule = getAccountTypeOdRule(tier, accountType);
  const odLimit = Number(odRule.odLimit || 0);
  const minOpeningBalance = Number(odRule.minOpeningBalance || 0);

  if (balance < minOpeningBalance) {
    return res.status(400).json({
      message: `${accountType} account requires a minimum opening balance of ${formatCurrency(minOpeningBalance)} for ${tier?.label || user.classification} tier`,
    });
  }

  try {
    await BankAccount.create({
      customerId: user.customerId,
      panNumber: user.panNumber || `LEGACY${String(user.customerId).replace(/[^a-z0-9]/gi, '')}`,
      accountNumber,
      accountType,
      walletBalance: balance,
      availableBalance: balance,
      transferLimit: Number(tier?.perTxnLimit || 0),
      withdrawalLimit: Number(tier?.dailyLimit || 0),
      accountOpenedAt: new Date(),
      accountStatus,
      odLimit,
      odUsed: 0,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: `${user.name} already has a ${accountType} account`,
      });
    }

    throw error;
  }

  await syncCustomerAccounts(user);

  res.status(201).json({
    message: `${accountType} account added for ${user.name}`,
    user: serializeUser(user),
  });
};

const getMyProfile = async (req, res) => {
  const user =
    req.user.role === 'customer'
      ? await syncCustomerAccounts(req.user)
      : req.user;

  res.json({ user: serializeUser(user) });
};

const updateMyProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const trimValue = (value) => String(value || '').trim();

  if (req.body.name !== undefined) {
    const name = trimValue(req.body.name);

    if (!validationPatterns.name.test(name)) {
      return res.status(400).json({
        message: 'Full name must contain only letters and spaces',
      });
    }

    user.name = name;
  }

  if (req.body.phone !== undefined) {
    const phone = trimValue(req.body.phone);

    if (phone && !validationPatterns.phone.test(phone)) {
      return res.status(400).json({
        message: 'Phone number must be a valid 10 digit Indian mobile number',
      });
    }

    user.phone = phone;
  }

  if (req.body.address !== undefined) {
    user.address = trimValue(req.body.address);
  }

  await user.save();

  res.json({
    message: 'Profile updated successfully.',
    user: serializeUser(user),
  });
};

const updateUserStatus = async (req, res) => {
  const { status } = req.body;

  if (!['active', 'inactive', 'suspended'].includes(status)) {
    return res.status(400).json({ message: 'Status must be active, inactive, or suspended' });
  }

  const user = await User.findOne({
    _id: req.params.id,
    role: { $in: ['customer', 'manager'] },
  });

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  let managerReplacement;

  try {
    if (user.role === 'manager' && status === 'active') {
      managerReplacement = await activateManagerAccess({
        manager: user,
        actor: req.user,
      });
    } else if (user.role === 'manager' && ['inactive', 'suspended'].includes(status)) {
      managerReplacement = await deactivateManagerAccess({ manager: user, status });
    } else {
      user.status = status;
      await user.save();
    }
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }

  res.json({ user: serializeUser(user), managerReplacement });
};

const updateUser = async (req, res) => {
  const user = await User.findOne({
    _id: req.params.id,
    role: { $in: ['customer', 'manager'] },
  });

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const allowedStatuses = ['active', 'inactive', 'suspended'];
  const trimValue = (value) => String(value || '').trim();
  let requestedStatus;

  if (req.body.status !== undefined) {
    if (!allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({ message: 'Status must be active, inactive, or suspended' });
    }
    requestedStatus = req.body.status;
  }

  if (req.body.phone !== undefined) {
    const phone = trimValue(req.body.phone);
    if (!validationPatterns.phone.test(phone)) {
      return res.status(400).json({
        message: 'Phone number must be a valid 10 digit Indian mobile number',
      });
    }
    user.phone = phone;
  }

  if (user.role === 'customer') {
    if (req.body.name !== undefined) {
      const name = trimValue(req.body.name);

      if (!validationPatterns.name.test(name)) {
        return res.status(400).json({
          message: 'Full name must contain only letters and spaces',
        });
      }

      user.name = name;
    }

    if (req.body.email !== undefined) {
      const email = trimValue(req.body.email).toLowerCase();

      if (!validationPatterns.email.test(email)) {
        return res.status(400).json({
          message: 'Enter a valid email address',
        });
      }

      const duplicateEmail = await User.findOne({
        _id: { $ne: user._id },
        email,
      }).select('_id');

      if (duplicateEmail) {
        return res.status(409).json({ message: 'Email already exists' });
      }

      user.email = email;
    }

    if (req.body.dob !== undefined) {
      const dob = trimValue(req.body.dob);

      if (!dob || !isAdult(dob)) {
        return res.status(400).json({
          message: 'Customer must be at least 18 years old',
        });
      }

      user.dob = dob;
    }

    if (req.body.classification !== undefined) {
      const classification = trimValue(req.body.classification);
      const tier = await Tier.findOne({ name: classification });

      if (!tier) {
        return res.status(404).json({ message: 'Selected customer tier was not found' });
      }

      user.classification = classification;
      const transferLimit = Number(tier.perTxnLimit || 0);
      const ruleByType = new Map(
        getAccountTypeOdRules(tier).map((rule) => [rule.accountType, rule])
      );

      if (user.account) {
        const rule = ruleByType.get(user.account.accountType);
        user.account.overdraftLimit = Number(rule?.odLimit || 0);
        user.account.transferLimit = transferLimit;
      }

      user.accounts = (user.accounts || []).map((account) => ({
        ...(account.toObject?.() || account),
        overdraftLimit: Number(ruleByType.get(account.accountType)?.odLimit || 0),
        transferLimit,
      }));

      await Promise.all(
        getAccountTypeOdRules(tier).map((rule) =>
          BankAccount.updateMany(
            { customerId: user.customerId, accountType: rule.accountType },
            {
              odLimit: Number(rule.odLimit || 0),
              transferLimit,
              withdrawalLimit: Number(tier.dailyLimit || 0),
            }
          )
        )
      );
    }

    if (req.body.address !== undefined) {
      user.address = trimValue(req.body.address);
    }

    if (req.body.accountStatus !== undefined) {
      const accountStatus = trimValue(req.body.accountStatus);

      if (!['active', 'inactive', 'blocked'].includes(accountStatus)) {
        return res.status(400).json({
          message: 'Account status must be active, inactive, or blocked',
        });
      }

      if (user.account) {
        user.account.accountStatus = accountStatus;
      }

      user.accounts = (user.accounts || []).map((account) => ({
        ...(account.toObject?.() || account),
        accountStatus,
      }));

      await BankAccount.updateMany({ customerId: user.customerId }, { accountStatus });
    }
  }

  if (user.role === 'manager') {
    if (req.body.assignedRegion !== undefined) {
      user.assignedRegion = trimValue(req.body.assignedRegion);
    }

    if (req.body.branchId !== undefined) {
      user.branchId = trimValue(req.body.branchId);
    }

    if (req.body.branchName !== undefined) {
      user.branchName = trimValue(req.body.branchName);
      user.branch = trimValue(req.body.branchName);
    }

  }

  let managerReplacement;

  try {
    if (user.role === 'manager' && requestedStatus === 'active') {
      managerReplacement = await activateManagerAccess({
        manager: user,
        actor: req.user,
      });
    } else if (
      user.role === 'manager' &&
      ['inactive', 'suspended'].includes(requestedStatus)
    ) {
      managerReplacement = await deactivateManagerAccess({
        manager: user,
        status: requestedStatus,
      });
    } else {
      if (requestedStatus !== undefined) {
        user.status = requestedStatus;
      }
      await user.save();
    }
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }

  res.json({ user: serializeUser(user), managerReplacement });
};

module.exports = {
  getUsers,
  getCustomers,
  getBeneficiaries,
  addBeneficiary,
  removeBeneficiary,
  createUser,
  addCustomerAccount,
  getMyProfile,
  updateMyProfile,
  updateUser,
  updateUserStatus,
};
