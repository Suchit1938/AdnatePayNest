const Counter = require('../models/Counter');
const BusinessRuleConfig = require('../models/BusinessRuleConfig');
const FixedDeposit = require('../models/FixedDeposit');
const User = require('../models/User');

const toNumber = (value) => Number(value || 0);

const DEFAULT_DEPOSIT_RATE_CARDS = [
  {
    productType: 'fd',
    label: 'FD 6 to 11 months',
    minTenureMonths: 6,
    maxTenureMonths: 11,
    annualInterestRate: 6.5,
    minAmount: 1000,
  },
  {
    productType: 'fd',
    label: 'FD 12 to 23 months',
    minTenureMonths: 12,
    maxTenureMonths: 23,
    annualInterestRate: 7,
    minAmount: 1000,
  },
  {
    productType: 'fd',
    label: 'FD 24 to 60 months',
    minTenureMonths: 24,
    maxTenureMonths: 60,
    annualInterestRate: 7.5,
    minAmount: 1000,
  },
  {
    productType: 'rd',
    label: 'RD 6 to 11 months',
    minTenureMonths: 6,
    maxTenureMonths: 11,
    annualInterestRate: 6.25,
    minAmount: 500,
  },
  {
    productType: 'rd',
    label: 'RD 12 to 23 months',
    minTenureMonths: 12,
    maxTenureMonths: 23,
    annualInterestRate: 6.75,
    minAmount: 500,
  },
  {
    productType: 'rd',
    label: 'RD 24 to 60 months',
    minTenureMonths: 24,
    maxTenureMonths: 60,
    annualInterestRate: 7.25,
    minAmount: 500,
  },
];

const normalizeDepositRateCards = (rateCards = []) => {
  const sourceCards = Array.isArray(rateCards) && rateCards.length
    ? rateCards
    : DEFAULT_DEPOSIT_RATE_CARDS;

  return sourceCards
    .map((rule) => ({
      productType: rule.productType === 'rd' ? 'rd' : 'fd',
      label: String(rule.label || '').trim() || `${rule.productType === 'rd' ? 'RD' : 'FD'} rate`,
      minTenureMonths: Math.max(1, Math.round(toNumber(rule.minTenureMonths || 1))),
      maxTenureMonths: Math.max(1, Math.round(toNumber(rule.maxTenureMonths || 1))),
      annualInterestRate: Math.max(0, toNumber(rule.annualInterestRate)),
      minAmount: Math.max(0, Math.round(toNumber(rule.minAmount || 0))),
    }))
    .map((rule) => ({
      ...rule,
      maxTenureMonths: Math.max(rule.minTenureMonths, rule.maxTenureMonths),
    }))
    .sort((a, b) =>
      a.productType.localeCompare(b.productType) ||
      a.minTenureMonths - b.minTenureMonths
    );
};

const getDepositRuleConfig = async () => {
  const config = await BusinessRuleConfig.findOneAndUpdate(
    { key: 'global' },
    {
      $setOnInsert: {
        key: 'global',
        depositRules: {
          rateCards: DEFAULT_DEPOSIT_RATE_CARDS,
        },
      },
    },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );

  if (!config.depositRules?.rateCards?.length) {
    config.depositRules = {
      ...(config.depositRules || {}),
      rateCards: DEFAULT_DEPOSIT_RATE_CARDS,
    };
    await config.save();
  }

  return config;
};

const getApplicableDepositRate = (rateCards, productType, tenureMonths) =>
  normalizeDepositRateCards(rateCards).find(
    (rule) =>
      rule.productType === productType &&
      tenureMonths >= rule.minTenureMonths &&
      tenureMonths <= rule.maxTenureMonths
  );

const addMonths = (value, months) => {
  const date = new Date(value);
  date.setMonth(date.getMonth() + Number(months || 0));
  return date;
};

const payoutFrequencyByType = {
  monthly: 12,
  quarterly: 4,
  yearly: 1,
  on_maturity: 4,
};

const calculateFixedDeposit = ({
  depositAmount,
  interestRate,
  tenureMonths,
  startDate,
  payoutType = 'on_maturity',
}) => {
  const principal = toNumber(depositAmount);
  const annualRate = toNumber(interestRate) / 100;
  const months = Math.max(1, Math.round(toNumber(tenureMonths)));
  const years = months / 12;
  const maturityDate = addMonths(startDate || new Date(), months);
  const frequency = payoutFrequencyByType[payoutType] || payoutFrequencyByType.on_maturity;
  const maturityAmount =
    payoutType === 'on_maturity'
      ? Math.round(principal * ((1 + annualRate / frequency) ** (frequency * years)))
      : Math.round(principal + principal * annualRate * years);

  return {
    maturityDate,
    maturityAmount,
    interestEarned: Math.max(0, maturityAmount - principal),
  };
};

const getNextFdNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { key: 'fixedDeposit' },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  const year = new Date().getFullYear().toString().slice(-2);
  return `FD-${year}${String(counter.value).padStart(5, '0')}`;
};

const serializeFixedDeposit = (fd) => ({
  id: fd._id,
  fdNumber: fd.fdNumber,
  customer: fd.customer,
  customerName: fd.customerName,
  customerId: fd.customerId,
  bankName: fd.bankName,
  depositAmount: fd.depositAmount,
  interestRate: fd.interestRate,
  tenureMonths: fd.tenureMonths,
  startDate: fd.startDate,
  maturityDate: fd.maturityDate,
  payoutType: fd.payoutType,
  maturityAmount: fd.maturityAmount,
  interestEarned: fd.interestEarned,
  nomineeName: fd.nomineeName,
  notes: fd.notes,
  status: fd.status,
  closedAt: fd.closedAt,
  createdAt: fd.createdAt,
  updatedAt: fd.updatedAt,
});

const getFixedDeposits = async (req, res) => {
  const query = req.user.role === 'customer' ? { customer: req.user._id } : {};
  const fixedDeposits = await FixedDeposit.find(query)
    .sort({ createdAt: -1 })
    .populate('customer', 'name email customerId');

  res.json({ fixedDeposits: fixedDeposits.map(serializeFixedDeposit) });
};

const createFixedDeposit = async (req, res) => {
  const {
    customerId,
    bankName,
    depositAmount,
    interestRate,
    tenureMonths,
    startDate,
    payoutType,
    nomineeName,
    notes,
  } = req.body;
  const targetCustomerId = req.user.role === 'admin' ? customerId : req.user._id;
  const customer = await User.findOne({ _id: targetCustomerId, role: 'customer' });

  if (!customer) {
    return res.status(404).json({ message: 'Customer not found' });
  }

  if (toNumber(depositAmount) < 1000) {
    return res.status(400).json({ message: 'Minimum FD amount is 1000' });
  }

  const numericTenureMonths = Math.round(toNumber(tenureMonths));

  if (numericTenureMonths < 1) {
    return res.status(400).json({ message: 'Tenure must be at least one month' });
  }

  const rateConfig = await getDepositRuleConfig();
  const matchingRate = getApplicableDepositRate(
    rateConfig.depositRules?.rateCards,
    'fd',
    numericTenureMonths
  );
  const effectiveInterestRate = matchingRate?.annualInterestRate ?? toNumber(interestRate);

  if (effectiveInterestRate <= 0) {
    return res.status(400).json({ message: 'Interest rate must be configured for this tenure' });
  }

  const openingDate = startDate ? new Date(startDate) : new Date();
  const calculation = calculateFixedDeposit({
    depositAmount,
    interestRate: effectiveInterestRate,
    tenureMonths: numericTenureMonths,
    startDate: openingDate,
    payoutType,
  });

  const fixedDeposit = await FixedDeposit.create({
    fdNumber: await getNextFdNumber(),
    customer: customer._id,
    customerName: customer.name,
    customerId: customer.customerId,
    bankName: bankName || 'Adnate Bank',
    depositAmount: Math.round(toNumber(depositAmount)),
    interestRate: effectiveInterestRate,
    tenureMonths: numericTenureMonths,
    startDate: openingDate,
    payoutType: payoutType || 'on_maturity',
    nomineeName,
    notes,
    ...calculation,
    createdBy: req.user._id,
  });

  res.status(201).json({ fixedDeposit: serializeFixedDeposit(fixedDeposit) });
};

const getDepositRates = async (req, res) => {
  const config = await getDepositRuleConfig();

  res.json({
    rateCards: normalizeDepositRateCards(config.depositRules?.rateCards),
  });
};

const updateDepositRates = async (req, res) => {
  const nextRateCards = normalizeDepositRateCards(req.body.rateCards);

  const config = await BusinessRuleConfig.findOneAndUpdate(
    { key: 'global' },
    {
      $set: {
        depositRules: {
          rateCards: nextRateCards,
        },
        updatedBy: req.user._id,
        updatedByName: req.user.name,
      },
    },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );

  res.json({
    message: 'Deposit rates updated.',
    rateCards: normalizeDepositRateCards(config.depositRules?.rateCards),
  });
};

const updateFixedDepositStatus = async (req, res) => {
  const { status } = req.body;
  const allowedStatuses = ['active', 'matured', 'closed', 'renewed'];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid FD status' });
  }

  const fixedDeposit = await FixedDeposit.findById(req.params.id);

  if (!fixedDeposit) {
    return res.status(404).json({ message: 'Fixed deposit not found' });
  }

  fixedDeposit.status = status;
  fixedDeposit.closedAt = ['closed', 'renewed'].includes(status) ? new Date() : null;
  await fixedDeposit.save();

  res.json({ fixedDeposit: serializeFixedDeposit(fixedDeposit) });
};

const getFixedDepositCustomers = async (req, res) => {
  const customers = await User.find({ role: 'customer', status: 'active' })
    .select('name email customerId accounts account')
    .sort({ name: 1 });

  res.json({
    customers: customers.map((customer) => ({
      id: customer._id,
      name: customer.name,
      email: customer.email,
      customerId: customer.customerId,
      accounts: customer.accounts?.length ? customer.accounts : [customer.account].filter(Boolean),
    })),
  });
};

module.exports = {
  createFixedDeposit,
  getDepositRates,
  getFixedDepositCustomers,
  getFixedDeposits,
  updateDepositRates,
  updateFixedDepositStatus,
};
