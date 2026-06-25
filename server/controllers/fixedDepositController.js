const Counter = require('../models/Counter');
const BankAccount = require('../models/BankAccount');
const BusinessRuleConfig = require('../models/BusinessRuleConfig');
const FixedDeposit = require('../models/FixedDeposit');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { ensureBankAccountsForUser, syncCustomerAccounts, toWholeRupees } = require('../utils/customerAccounts');
const { writeSystemLog } = require('../utils/systemLog');

const toNumber = (value) => Number(value || 0);

const DEFAULT_DEPOSIT_RATE_CARDS = [
  {
    productType: 'fd',
    label: 'FD 1 year',
    minTenureMonths: 12,
    maxTenureMonths: 12,
    annualInterestRate: 7,
    minAmount: 1000,
  },
  {
    productType: 'fd',
    label: 'FD 2 years',
    minTenureMonths: 24,
    maxTenureMonths: 24,
    annualInterestRate: 7.25,
    minAmount: 1000,
  },
  {
    productType: 'fd',
    label: 'FD 5 years',
    minTenureMonths: 60,
    maxTenureMonths: 60,
    annualInterestRate: 7.75,
    minAmount: 1000,
  },
  {
    productType: 'rd',
    label: 'RD 6 months',
    minTenureMonths: 6,
    maxTenureMonths: 6,
    annualInterestRate: 6.25,
    minAmount: 500,
  },
  {
    productType: 'rd',
    label: 'RD 1 year',
    minTenureMonths: 12,
    maxTenureMonths: 12,
    annualInterestRate: 6.75,
    minAmount: 500,
  },
  {
    productType: 'rd',
    label: 'RD 2 years',
    minTenureMonths: 24,
    maxTenureMonths: 24,
    annualInterestRate: 7.25,
    minAmount: 500,
  },
];

const ALLOWED_FD_TENURE_MONTHS = [12, 24, 60];
const PREMATURE_WITHDRAWAL_PENALTY_RATE = 0.01;

const normalizeDepositRateCards = (rateCards = []) => {
  const sourceCards = Array.isArray(rateCards) && rateCards.length
    ? rateCards
    : DEFAULT_DEPOSIT_RATE_CARDS;

  return DEFAULT_DEPOSIT_RATE_CARDS.map((template) => {
    const matchingRule = sourceCards.find(
      (rule) =>
        (rule.productType === 'rd' ? 'rd' : 'fd') === template.productType &&
        Math.round(toNumber(rule.minTenureMonths)) === template.minTenureMonths
    );

    return {
      ...template,
      annualInterestRate: Math.max(
        0,
        toNumber(matchingRule?.annualInterestRate ?? template.annualInterestRate)
      ),
      minAmount: Math.max(
        0,
        Math.round(toNumber(matchingRule?.minAmount ?? template.minAmount))
      ),
    };
  });
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

const getHeldPeriodFdRate = (rateCards, heldMonths) =>
  normalizeDepositRateCards(rateCards)
    .filter((rule) => rule.productType === 'fd' && heldMonths >= rule.minTenureMonths)
    .sort((left, right) => right.minTenureMonths - left.minTenureMonths)[0] || null;

const calculatePrematureFdWithdrawal = (fixedDeposit, rateCards) => {
  const elapsedMonths = Math.max(
    1,
    Math.floor((Date.now() - new Date(fixedDeposit.startDate).getTime()) / (30 * 24 * 60 * 60 * 1000))
  );
  const heldMonths = Math.min(elapsedMonths, toNumber(fixedDeposit.tenureMonths));
  const heldPeriodRate = getHeldPeriodFdRate(rateCards, heldMonths);
  const applicableRate = heldPeriodRate?.annualInterestRate || 0;
  const penaltyRate = PREMATURE_WITHDRAWAL_PENALTY_RATE * 100;
  const elapsedYears = heldMonths / 12;
  const principal = toNumber(fixedDeposit.depositAmount);
  const valueBeforePenalty = Math.round(principal * (1 + (applicableRate / 100) * elapsedYears));
  const penaltyAmount = Math.round(principal * PREMATURE_WITHDRAWAL_PENALTY_RATE);
  const payoutAmount = Math.max(0, valueBeforePenalty - penaltyAmount);

  return {
    elapsedMonths,
    heldMonths,
    applicableRate,
    penaltyRate,
    valueBeforePenalty,
    penaltyAmount,
    payoutAmount,
  };
};

const addMonths = (value, months) => {
  const date = new Date(value);
  date.setMonth(date.getMonth() + Number(months || 0));
  return date;
};

const calculateFixedDeposit = ({
  depositAmount,
  interestRate,
  tenureMonths,
  startDate,
}) => {
  const principal = toNumber(depositAmount);
  const annualRate = toNumber(interestRate) / 100;
  const months = Math.max(1, Math.round(toNumber(tenureMonths)));
  const years = months / 12;
  const maturityDate = addMonths(startDate || new Date(), months);
  const compoundingFrequency = 4;
  const maturityAmount = Math.round(
    principal * ((1 + annualRate / compoundingFrequency) ** (compoundingFrequency * years))
  );

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
  linkedAccountNumber: fd.linkedAccountNumber,
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

const logFdEvent = (fd, customer, action, message, severity = 'info', metadata = {}) =>
  writeSystemLog({
    action,
    message,
    actor: customer._id,
    actorName: customer.name,
    recipient: customer._id,
    entityType: 'FixedDeposit',
    entityId: fd.fdNumber,
    severity,
    metadata: {
      fdNumber: fd.fdNumber,
      ...metadata,
    },
  });

const findCustomerPaymentAccount = async (customer, accountNumber, session) => {
  await ensureBankAccountsForUser(customer, { session });

  const query = {
    customerId: customer.customerId,
    accountStatus: 'active',
  };

  if (accountNumber) {
    query.accountNumber = String(accountNumber).trim();
  }

  return BankAccount.findOne(query).sort({ createdAt: 1 }).session(session);
};

const getFixedDeposits = async (req, res) => {
  const query = req.user.role === 'customer' ? { customer: req.user._id } : {};
  const fixedDeposits = await FixedDeposit.find(query)
    .sort({ createdAt: -1 })
    .populate('customer', 'name email customerId');

  res.json({ fixedDeposits: fixedDeposits.map(serializeFixedDeposit) });
};

const createFixedDeposit = async (req, res) => {
  const {
    bankName,
    depositAmount,
    interestRate,
    tenureMonths,
    startDate,
    linkedAccountNumber,
    nomineeName,
    notes,
  } = req.body;
  if (req.user.role !== 'customer') {
    return res.status(403).json({ message: 'Only customers can create fixed deposits' });
  }

  const customer = await User.findOne({ _id: req.user._id, role: 'customer' });

  if (!customer) {
    return res.status(404).json({ message: 'Customer not found' });
  }

  const numericTenureMonths = Math.round(toNumber(tenureMonths));

  if (!ALLOWED_FD_TENURE_MONTHS.includes(numericTenureMonths)) {
    return res.status(400).json({ message: 'FD tenure must be 1, 2, or 5 years' });
  }

  const rateConfig = await getDepositRuleConfig();
  const matchingRate = getApplicableDepositRate(
    rateConfig.depositRules?.rateCards,
    'fd',
    numericTenureMonths
  );
  const effectiveInterestRate = matchingRate?.annualInterestRate ?? toNumber(interestRate);
  const minimumDepositAmount = Math.max(0, Math.round(toNumber(matchingRate?.minAmount ?? 1000)));

  if (effectiveInterestRate <= 0) {
    return res.status(400).json({ message: 'Interest rate must be configured for this tenure' });
  }

  if (toNumber(depositAmount) < minimumDepositAmount) {
    return res.status(400).json({ message: `Minimum FD amount is ${minimumDepositAmount}` });
  }

  const openingDate = startDate ? new Date(startDate) : new Date();
  const calculation = calculateFixedDeposit({
    depositAmount,
    interestRate: effectiveInterestRate,
    tenureMonths: numericTenureMonths,
    startDate: openingDate,
  });

  const session = await FixedDeposit.startSession();

  try {
    let responsePayload;

    await session.withTransaction(async () => {
      const paymentAccount = await findCustomerPaymentAccount(customer, linkedAccountNumber, session);
      const roundedDepositAmount = Math.round(toNumber(depositAmount));

      if (!paymentAccount) throw new Error('Linked account not found');
      if (toWholeRupees(paymentAccount.walletBalance) < roundedDepositAmount) {
        throw new Error('Insufficient balance to create FD');
      }

      paymentAccount.walletBalance = toWholeRupees(paymentAccount.walletBalance) - roundedDepositAmount;
      paymentAccount.availableBalance = paymentAccount.walletBalance;
      await paymentAccount.save({ session });

      const [fixedDeposit] = await FixedDeposit.create(
        [
          {
            fdNumber: await getNextFdNumber(),
            customer: customer._id,
            customerName: customer.name,
            customerId: customer.customerId,
            bankName: bankName || 'Adnate Bank',
            linkedAccountNumber: paymentAccount.accountNumber,
            depositAmount: roundedDepositAmount,
            interestRate: effectiveInterestRate,
            tenureMonths: numericTenureMonths,
            startDate: openingDate,
            payoutType: 'cumulative',
            nomineeName,
            notes,
            ...calculation,
            createdBy: req.user._id,
          },
        ],
        { session }
      );

      await Transaction.create(
        [
          {
            transactionId: `FDPAY${Date.now()}`,
            sender: customer._id,
            senderName: customer.name,
            receiverName: 'Adnate Bank',
            receiverType: 'bank',
            fromAccountNumber: paymentAccount.accountNumber,
            toAccountNumber: fixedDeposit.fdNumber,
            amount: roundedDepositAmount,
            remarks: `FD created ${fixedDeposit.fdNumber}`,
            status: 'success',
            type: 'fd-creation',
            category: 'investment',
            businessRefType: 'FixedDeposit',
            businessRefId: fixedDeposit.fdNumber,
            displayTitle: `FD ${fixedDeposit.fdNumber}`,
            displaySubtitle: 'Fixed deposit amount debited',
          },
        ],
        { session }
      );

      await syncCustomerAccounts(customer, { session });

      await logFdEvent(
        fixedDeposit,
        customer,
        'fd.created.customer',
        `FD ${fixedDeposit.fdNumber} created successfully.`,
        'success',
        {
          depositAmount: fixedDeposit.depositAmount,
          interestRate: fixedDeposit.interestRate,
          tenureMonths: fixedDeposit.tenureMonths,
          maturityDate: fixedDeposit.maturityDate,
          maturityAmount: fixedDeposit.maturityAmount,
        }
      );

      responsePayload = { fixedDeposit: serializeFixedDeposit(fixedDeposit) };
    });

    res.status(201).json(responsePayload);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to create FD' });
  } finally {
    session.endSession();
  }
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

  const customer = await User.findById(fixedDeposit.customer);

  if (customer) {
    const actionByStatus = {
      matured: 'fd.matured.customer',
      closed: 'fd.premature_withdrawal.customer',
      renewed: 'fd.renewed.customer',
    };
    const messageByStatus = {
      matured: `FD ${fixedDeposit.fdNumber} matured.`,
      closed: `FD ${fixedDeposit.fdNumber} closed and amount credited back.`,
      renewed: `FD ${fixedDeposit.fdNumber} renewed at ${fixedDeposit.interestRate}% for ${fixedDeposit.tenureMonths} months.`,
    };

    if (actionByStatus[status]) {
      await logFdEvent(
        fixedDeposit,
        customer,
        actionByStatus[status],
        messageByStatus[status],
        status === 'closed' ? 'warning' : 'success',
        {
          interestRate: fixedDeposit.interestRate,
          tenureMonths: fixedDeposit.tenureMonths,
          maturityAmount: fixedDeposit.maturityAmount,
        }
      );
    }
  }

  res.json({ fixedDeposit: serializeFixedDeposit(fixedDeposit) });
};

const requestPrematureWithdrawal = async (req, res) => {
  const session = await FixedDeposit.startSession();

  try {
    let responsePayload;
    const rateConfig = await getDepositRuleConfig();

    await session.withTransaction(async () => {
      const [fixedDeposit, customer] = await Promise.all([
        FixedDeposit.findOne({ _id: req.params.id, customer: req.user._id }).session(session),
        User.findOne({ _id: req.user._id, role: 'customer' }).session(session),
      ]);

      if (!fixedDeposit) throw new Error('Fixed deposit not found');
      if (!customer) throw new Error('Customer not found');
      if (fixedDeposit.status !== 'active') throw new Error('Only active FDs can be withdrawn prematurely');

      const paymentAccount = await findCustomerPaymentAccount(
        customer,
        fixedDeposit.linkedAccountNumber,
        session
      );

      if (!paymentAccount) throw new Error('Linked account not found');

      const withdrawal = calculatePrematureFdWithdrawal(
        fixedDeposit,
        rateConfig.depositRules?.rateCards
      );

      paymentAccount.walletBalance = toWholeRupees(paymentAccount.walletBalance) + withdrawal.payoutAmount;
      paymentAccount.availableBalance = paymentAccount.walletBalance;
      await paymentAccount.save({ session });

      fixedDeposit.status = 'closed';
      fixedDeposit.closedAt = new Date();
      await fixedDeposit.save({ session });

      await Transaction.create(
        [
          {
            transactionId: `FDWD${Date.now()}`,
            sender: customer._id,
            senderName: 'Adnate Bank',
            receiver: customer._id,
            receiverName: customer.name,
            fromAccountNumber: fixedDeposit.fdNumber,
            toAccountNumber: paymentAccount.accountNumber,
            amount: withdrawal.payoutAmount,
            remarks: `FD premature withdrawal ${fixedDeposit.fdNumber}`,
            status: 'success',
            type: 'fd-premature-withdrawal',
            category: 'investment',
            businessRefType: 'FixedDeposit',
            businessRefId: fixedDeposit.fdNumber,
            displayTitle: `FD withdrawal ${fixedDeposit.fdNumber}`,
            displaySubtitle: `Fixed premature penalty ${withdrawal.penaltyRate}%`,
          },
        ],
        { session }
      );

      await syncCustomerAccounts(customer, { session });
      await logFdEvent(
        fixedDeposit,
        customer,
        'fd.premature_withdrawal.customer',
        `Premature withdrawal completed for FD ${fixedDeposit.fdNumber}.`,
        'warning',
        withdrawal
      );

      responsePayload = {
        message: 'FD premature withdrawal completed',
        ...withdrawal,
        fixedDeposit: serializeFixedDeposit(fixedDeposit),
      };
    });

    res.json(responsePayload);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to withdraw FD' });
  } finally {
    session.endSession();
  }
};

const requestMaturityPayout = async (req, res) => {
  const session = await FixedDeposit.startSession();

  try {
    let responsePayload;

    await session.withTransaction(async () => {
      const [fixedDeposit, customer] = await Promise.all([
        FixedDeposit.findOne({ _id: req.params.id, customer: req.user._id }).session(session),
        User.findOne({ _id: req.user._id, role: 'customer' }).session(session),
      ]);

      if (!fixedDeposit) throw new Error('Fixed deposit not found');
      if (!customer) throw new Error('Customer not found');
      if (!['active', 'matured'].includes(fixedDeposit.status)) {
        throw new Error('Only active or matured FDs can be paid out');
      }
      if (new Date(fixedDeposit.maturityDate) > new Date() && fixedDeposit.status !== 'matured') {
        throw new Error('FD has not reached maturity yet');
      }

      const paymentAccount = await findCustomerPaymentAccount(
        customer,
        fixedDeposit.linkedAccountNumber,
        session
      );

      if (!paymentAccount) throw new Error('Linked account not found');

      paymentAccount.walletBalance = toWholeRupees(paymentAccount.walletBalance) + toNumber(fixedDeposit.maturityAmount);
      paymentAccount.availableBalance = paymentAccount.walletBalance;
      await paymentAccount.save({ session });

      fixedDeposit.status = 'closed';
      fixedDeposit.closedAt = new Date();
      await fixedDeposit.save({ session });

      await Transaction.create(
        [
          {
            transactionId: `FDPAYOUT${Date.now()}`,
            sender: customer._id,
            senderName: 'Adnate Bank',
            receiver: customer._id,
            receiverName: customer.name,
            fromAccountNumber: fixedDeposit.fdNumber,
            toAccountNumber: paymentAccount.accountNumber,
            amount: fixedDeposit.maturityAmount,
            remarks: `FD maturity payout ${fixedDeposit.fdNumber}`,
            status: 'success',
            type: 'fd-maturity-payout',
            category: 'investment',
            businessRefType: 'FixedDeposit',
            businessRefId: fixedDeposit.fdNumber,
            displayTitle: `FD payout ${fixedDeposit.fdNumber}`,
            displaySubtitle: 'Maturity amount credited',
          },
        ],
        { session }
      );

      await syncCustomerAccounts(customer, { session });
      await logFdEvent(
        fixedDeposit,
        customer,
        'fd.maturity_credited.customer',
        `Maturity amount credited for FD ${fixedDeposit.fdNumber}.`,
        'success',
        {
          payoutAmount: fixedDeposit.maturityAmount,
        }
      );

      responsePayload = {
        message: 'Maturity Amount Credited',
        payoutAmount: fixedDeposit.maturityAmount,
        fixedDeposit: serializeFixedDeposit(fixedDeposit),
      };
    });

    res.json(responsePayload);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to credit FD maturity amount' });
  } finally {
    session.endSession();
  }
};

const renewFixedDeposit = async (req, res) => {
  const originalFd = await FixedDeposit.findOne({
    _id: req.params.id,
    customer: req.user._id,
  });

  if (!originalFd) {
    return res.status(404).json({ message: 'Fixed deposit not found' });
  }

  if (!['active', 'matured'].includes(originalFd.status)) {
    return res.status(400).json({ message: 'Only active or matured FDs can be renewed' });
  }

  if (new Date(originalFd.maturityDate) > new Date() && originalFd.status !== 'matured') {
    return res.status(400).json({ message: 'FD has not reached maturity yet' });
  }

  const customer = await User.findOne({ _id: req.user._id, role: 'customer' });

  if (!customer) {
    return res.status(404).json({ message: 'Customer not found' });
  }

  const rateConfig = await getDepositRuleConfig();
  const matchingRate = getApplicableDepositRate(
    rateConfig.depositRules?.rateCards,
    'fd',
    originalFd.tenureMonths
  );

  if (!matchingRate?.annualInterestRate) {
    return res.status(400).json({ message: 'Current FD rate is not configured for this tenure' });
  }

  const openingDate = new Date();
  const calculation = calculateFixedDeposit({
    depositAmount: originalFd.maturityAmount,
    interestRate: matchingRate.annualInterestRate,
    tenureMonths: originalFd.tenureMonths,
    startDate: openingDate,
  });

  const renewedFd = await FixedDeposit.create({
    fdNumber: await getNextFdNumber(),
    customer: customer._id,
    customerName: customer.name,
    customerId: customer.customerId,
    bankName: originalFd.bankName,
    linkedAccountNumber: originalFd.linkedAccountNumber,
    depositAmount: Math.round(toNumber(originalFd.maturityAmount)),
    interestRate: matchingRate.annualInterestRate,
    tenureMonths: originalFd.tenureMonths,
    startDate: openingDate,
    payoutType: 'cumulative',
    nomineeName: originalFd.nomineeName,
    notes: originalFd.notes,
    renewedFrom: originalFd._id,
    ...calculation,
    createdBy: req.user._id,
  });

  originalFd.status = 'renewed';
  originalFd.closedAt = new Date();
  await originalFd.save();

  await logFdEvent(
    renewedFd,
    customer,
    'fd.renewed.customer',
    `FD ${originalFd.fdNumber} renewed at ${matchingRate.annualInterestRate}% for ${originalFd.tenureMonths} months as ${renewedFd.fdNumber}.`,
    'success',
    {
      renewedFrom: originalFd.fdNumber,
      currentRate: matchingRate.annualInterestRate,
      tenureMonths: originalFd.tenureMonths,
    }
  );

  res.status(201).json({
    message: 'FD Renewed',
    fixedDeposit: serializeFixedDeposit(renewedFd),
  });
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
  renewFixedDeposit,
  requestMaturityPayout,
  requestPrematureWithdrawal,
  updateDepositRates,
  updateFixedDepositStatus,
};
