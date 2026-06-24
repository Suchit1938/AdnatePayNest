const BusinessRuleConfig = require('../models/BusinessRuleConfig');
const BankAccount = require('../models/BankAccount');
const Counter = require('../models/Counter');
const RecurringDeposit = require('../models/RecurringDeposit');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { ensureBankAccountsForUser, syncCustomerAccounts, toWholeRupees } = require('../utils/customerAccounts');
const { writeSystemLog } = require('../utils/systemLog');

const DEFAULT_RD_RATE_CARDS = [
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
  ...DEFAULT_RD_RATE_CARDS,
];

const ALLOWED_RD_TENURE_MONTHS = [6, 12, 24];
const MISSED_INSTALLMENT_PENALTY_RATE = 0.02;
const PREMATURE_WITHDRAWAL_PENALTY_RATE = 0.01;

const toNumber = (value) => Number(value || 0);

const addMonths = (value, months) => {
  const date = new Date(value || new Date());
  date.setMonth(date.getMonth() + Number(months || 0));
  return date;
};

const normalizeDepositRateCards = (rateCards = []) => {
  const sourceCards = Array.isArray(rateCards) && rateCards.length
    ? rateCards
    : DEFAULT_DEPOSIT_RATE_CARDS;

  return DEFAULT_DEPOSIT_RATE_CARDS.map((template) => {
    const matchingRule = sourceCards.find(
      (rule) =>
        (rule.productType === 'fd' ? 'fd' : 'rd') === template.productType &&
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

const getApplicableRdRate = (rateCards, tenureMonths) =>
  normalizeDepositRateCards(rateCards).find(
    (rule) =>
      rule.productType === 'rd' &&
      tenureMonths >= rule.minTenureMonths &&
      tenureMonths <= rule.maxTenureMonths
  );

const calculateRecurringDeposit = ({
  monthlyInstallmentAmount,
  interestRate,
  tenureMonths,
  startDate,
}) => {
  const installment = Math.round(toNumber(monthlyInstallmentAmount));
  const months = Math.max(1, Math.round(toNumber(tenureMonths)));
  const monthlyRate = toNumber(interestRate) / 1200;
  const totalInvestment = installment * months;
  const maturityAmount = monthlyRate > 0
    ? Math.round(installment * (((1 + monthlyRate) ** months - 1) / monthlyRate))
    : totalInvestment;

  return {
    maturityDate: addMonths(startDate || new Date(), months),
    totalInvestment,
    maturityAmount,
    interestEarned: Math.max(0, maturityAmount - totalInvestment),
  };
};

const calculateAccumulatedValue = (rd, paidCount = rd.installmentsPaid) => {
  const installment = toNumber(rd.monthlyInstallmentAmount);
  const monthlyRate = toNumber(rd.interestRate) / 1200;

  if (paidCount <= 0) return 0;
  if (monthlyRate <= 0) return Math.round(installment * paidCount);

  return Math.round(installment * (((1 + monthlyRate) ** paidCount - 1) / monthlyRate));
};

const getNextRdNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { key: 'recurringDeposit' },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  const year = new Date().getFullYear().toString().slice(-2);
  return `RD-${year}${String(counter.value).padStart(5, '0')}`;
};

const serializeRecurringDeposit = (rd) => ({
  id: rd._id,
  rdNumber: rd.rdNumber,
  customer: rd.customer,
  customerName: rd.customerName,
  customerId: rd.customerId,
  bankName: rd.bankName,
  linkedAccountNumber: rd.linkedAccountNumber,
  monthlyInstallmentAmount: rd.monthlyInstallmentAmount,
  interestRate: rd.interestRate,
  tenureMonths: rd.tenureMonths,
  startDate: rd.startDate,
  maturityDate: rd.maturityDate,
  totalInvestment: rd.totalInvestment,
  maturityAmount: rd.maturityAmount,
  interestEarned: rd.interestEarned,
  accumulatedValue: rd.accumulatedValue,
  installmentsPaid: rd.installmentsPaid,
  missedInstallments: rd.missedInstallments,
  penaltyAccrued: rd.penaltyAccrued,
  installments: rd.installments,
  status: rd.status,
  closedAt: rd.closedAt,
  renewedFrom: rd.renewedFrom,
  createdAt: rd.createdAt,
  updatedAt: rd.updatedAt,
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

const logRdEvent = (rd, customer, action, message, severity = 'info', metadata = {}, session) =>
  writeSystemLog(
    {
      action,
      message,
      actor: customer._id,
      actorName: customer.name,
      recipient: customer._id,
      entityType: 'RecurringDeposit',
      entityId: rd.rdNumber,
      severity,
      metadata: {
        rdNumber: rd.rdNumber,
        ...metadata,
      },
    },
    { session }
  );

const getRecurringDeposits = async (req, res) => {
  const query = req.user.role === 'customer' ? { customer: req.user._id } : {};
  const recurringDeposits = await RecurringDeposit.find(query)
    .sort({ createdAt: -1 });

  res.json({ recurringDeposits: recurringDeposits.map(serializeRecurringDeposit) });
};

const createRecurringDeposit = async (req, res) => {
  const {
    monthlyInstallmentAmount,
    tenureMonths,
    startDate,
    linkedAccountNumber,
  } = req.body;

  const installment = Math.round(toNumber(monthlyInstallmentAmount));
  const numericTenureMonths = Math.round(toNumber(tenureMonths));

  if (!ALLOWED_RD_TENURE_MONTHS.includes(numericTenureMonths)) {
    return res.status(400).json({ message: 'RD tenure must be 6 months, 1 year, or 2 years' });
  }

  const rateConfig = await getDepositRuleConfig();
  const matchingRate = getApplicableRdRate(rateConfig.depositRules?.rateCards, numericTenureMonths);

  if (!matchingRate?.annualInterestRate) {
    return res.status(400).json({ message: 'Interest rate must be configured for this RD tenure' });
  }

  const minimumInstallmentAmount = Math.max(0, Math.round(toNumber(matchingRate.minAmount ?? 500)));

  if (installment < minimumInstallmentAmount) {
    return res.status(400).json({ message: `Minimum RD installment is ${minimumInstallmentAmount}` });
  }

  const customer = await User.findOne({ _id: req.user._id, role: 'customer' });

  if (!customer) {
    return res.status(404).json({ message: 'Customer not found' });
  }

  const openingDate = startDate ? new Date(startDate) : new Date();
  const calculation = calculateRecurringDeposit({
    monthlyInstallmentAmount: installment,
    interestRate: matchingRate.annualInterestRate,
    tenureMonths: numericTenureMonths,
    startDate: openingDate,
  });

  const rd = await RecurringDeposit.create({
    rdNumber: await getNextRdNumber(),
    customer: customer._id,
    customerName: customer.name,
    customerId: customer.customerId,
    linkedAccountNumber,
    monthlyInstallmentAmount: installment,
    interestRate: matchingRate.annualInterestRate,
    tenureMonths: numericTenureMonths,
    startDate: openingDate,
    ...calculation,
    createdBy: req.user._id,
  });

  await logRdEvent(
    rd,
    customer,
    'rd.created.customer',
    `RD ${rd.rdNumber} created successfully.`,
    'success',
    {
      monthlyInstallmentAmount: installment,
      tenureMonths: numericTenureMonths,
      maturityAmount: calculation.maturityAmount,
    }
  );

  res.status(201).json({ recurringDeposit: serializeRecurringDeposit(rd) });
};

const postMonthlyInstallment = async (req, res) => {
  const session = await RecurringDeposit.startSession();

  try {
    let responsePayload;

    await session.withTransaction(async () => {
      const [rd, customer] = await Promise.all([
        RecurringDeposit.findOne({ _id: req.params.id, customer: req.user._id }).session(session),
        User.findOne({ _id: req.user._id, role: 'customer' }).session(session),
      ]);

      if (!rd) throw new Error('Recurring deposit not found');
      if (!customer) throw new Error('Customer not found');
      if (rd.status !== 'active') throw new Error('Only active RDs can accept installments');
      if (rd.installmentsPaid >= rd.tenureMonths) throw new Error('All RD installments are already completed');

      const paymentAccount = await findCustomerPaymentAccount(
        customer,
        rd.linkedAccountNumber,
        session
      );

      if (!paymentAccount) throw new Error('Linked account not found');

      const installmentNumber = rd.installments.length + 1;
      const amountDue = Math.round(toNumber(rd.monthlyInstallmentAmount));
      const dueDate = addMonths(rd.startDate, installmentNumber - 1);
      const currentBalance = toWholeRupees(paymentAccount.walletBalance);

      if (currentBalance < amountDue) {
        const penaltyAmount = Math.round(amountDue * MISSED_INSTALLMENT_PENALTY_RATE);
        const [transaction] = await Transaction.create(
          [
            {
              transactionId: `RDFAIL${Date.now()}`,
              sender: customer._id,
              senderName: customer.name,
              receiverName: 'Adnate Bank',
              receiverType: 'bank',
              fromAccountNumber: paymentAccount.accountNumber,
              toAccountNumber: rd.rdNumber,
              amount: amountDue,
              remarks: `RD installment ${installmentNumber} missed for ${rd.rdNumber}`,
              status: 'failed',
              failureReason: 'Insufficient balance',
              type: 'rd-installment',
              category: 'investment',
              businessRefType: 'RecurringDeposit',
              businessRefId: rd.rdNumber,
              displayTitle: `Missed RD installment ${installmentNumber}`,
              displaySubtitle: `Penalty applied for ${rd.rdNumber}`,
            },
          ],
          { session }
        );

        rd.missedInstallments += 1;
        rd.penaltyAccrued += penaltyAmount;
        rd.installments.push({
          installmentNumber,
          amount: amountDue,
          status: 'missed',
          dueDate,
          penaltyAmount,
          transactionId: transaction.transactionId,
          remarks: 'Insufficient balance. Penalty applied.',
        });
        await rd.save({ session });
        await logRdEvent(
          rd,
          customer,
          'rd.installment.missed.customer',
          `Installment missed for RD ${rd.rdNumber}; penalty applied.`,
          'warning',
          {
            installmentNumber,
            penaltyAmount,
            transactionId: transaction.transactionId,
          },
          session
        );

        responsePayload = {
          message: 'Installment missed, penalty applied',
          recurringDeposit: serializeRecurringDeposit(rd),
        };
        return;
      }

      paymentAccount.walletBalance = currentBalance - amountDue;
      paymentAccount.availableBalance = paymentAccount.walletBalance;
      await paymentAccount.save({ session });

      const [transaction] = await Transaction.create(
        [
          {
            transactionId: `RDPAY${Date.now()}`,
            sender: customer._id,
            senderName: customer.name,
            receiverName: 'Adnate Bank',
            receiverType: 'bank',
            fromAccountNumber: paymentAccount.accountNumber,
            toAccountNumber: rd.rdNumber,
            amount: amountDue,
            remarks: `RD installment ${installmentNumber} auto-debit for ${rd.rdNumber}`,
            status: 'success',
            type: 'rd-installment',
            category: 'investment',
            businessRefType: 'RecurringDeposit',
            businessRefId: rd.rdNumber,
            displayTitle: `RD installment ${installmentNumber}`,
            displaySubtitle: `Auto-debit successful for ${rd.rdNumber}`,
          },
        ],
        { session }
      );

      rd.installmentsPaid += 1;
      rd.accumulatedValue = calculateAccumulatedValue(rd, rd.installmentsPaid);
      rd.installments.push({
        installmentNumber,
        amount: amountDue,
        status: 'paid',
        dueDate,
        paidAt: new Date(),
        transactionId: transaction.transactionId,
        remarks: 'Auto-debit successful.',
      });

      if (rd.installmentsPaid >= rd.tenureMonths) {
        rd.status = 'matured';
      }

      await rd.save({ session });
      await syncCustomerAccounts(customer, { session });
      await logRdEvent(
        rd,
        customer,
        rd.status === 'matured' ? 'rd.matured.customer' : 'rd.installment.paid.customer',
        rd.status === 'matured'
          ? `RD ${rd.rdNumber} matured.`
          : `Installment ${installmentNumber} paid for RD ${rd.rdNumber}.`,
        'success',
        {
          installmentNumber,
          transactionId: transaction.transactionId,
          installmentsPaid: rd.installmentsPaid,
          tenureMonths: rd.tenureMonths,
        },
        session
      );

      responsePayload = {
        message: rd.status === 'matured' ? 'RD Matured' : 'Installment success',
        recurringDeposit: serializeRecurringDeposit(rd),
      };
    });

    res.json(responsePayload);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to post RD installment' });
  } finally {
    session.endSession();
  }
};

const requestPrematureWithdrawal = async (req, res) => {
  const session = await RecurringDeposit.startSession();

  try {
    let responsePayload;

    await session.withTransaction(async () => {
      const [rd, customer] = await Promise.all([
        RecurringDeposit.findOne({ _id: req.params.id, customer: req.user._id }).session(session),
        User.findOne({ _id: req.user._id, role: 'customer' }).session(session),
      ]);

      if (!rd) throw new Error('Recurring deposit not found');
      if (!customer) throw new Error('Customer not found');
      if (rd.status !== 'active') throw new Error('Only active RDs can be withdrawn prematurely');

      const paymentAccount = await findCustomerPaymentAccount(customer, rd.linkedAccountNumber, session);
      if (!paymentAccount) throw new Error('Linked account not found');

      const accumulatedAmount = calculateAccumulatedValue(rd);
      const penaltyAmount = Math.round(accumulatedAmount * PREMATURE_WITHDRAWAL_PENALTY_RATE);
      const payoutAmount = Math.max(0, accumulatedAmount - penaltyAmount - toNumber(rd.penaltyAccrued));

      paymentAccount.walletBalance = toWholeRupees(paymentAccount.walletBalance) + payoutAmount;
      paymentAccount.availableBalance = paymentAccount.walletBalance;
      await paymentAccount.save({ session });

      rd.status = 'closed';
      rd.closedAt = new Date();
      rd.accumulatedValue = accumulatedAmount;
      rd.penaltyAccrued += penaltyAmount;
      await rd.save({ session });
      await syncCustomerAccounts(customer, { session });

      await logRdEvent(
        rd,
        customer,
        'rd.premature_withdrawal.customer',
        `Premature withdrawal completed for RD ${rd.rdNumber}.`,
        'warning',
        {
          accumulatedAmount,
          penaltyAmount,
          payoutAmount,
        },
        session
      );

      responsePayload = {
        message: 'RD premature withdrawal completed',
        penaltyAmount,
        payoutAmount,
        recurringDeposit: serializeRecurringDeposit(rd),
      };
    });

    res.json(responsePayload);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to withdraw RD' });
  } finally {
    session.endSession();
  }
};

const requestMaturityPayout = async (req, res) => {
  const session = await RecurringDeposit.startSession();

  try {
    let responsePayload;

    await session.withTransaction(async () => {
      const [rd, customer] = await Promise.all([
        RecurringDeposit.findOne({ _id: req.params.id, customer: req.user._id }).session(session),
        User.findOne({ _id: req.user._id, role: 'customer' }).session(session),
      ]);

      if (!rd) throw new Error('Recurring deposit not found');
      if (!customer) throw new Error('Customer not found');
      if (rd.status !== 'matured') throw new Error('Only matured RDs can be paid out');

      const paymentAccount = await findCustomerPaymentAccount(customer, rd.linkedAccountNumber, session);
      if (!paymentAccount) throw new Error('Linked account not found');

      paymentAccount.walletBalance = toWholeRupees(paymentAccount.walletBalance) + toNumber(rd.maturityAmount);
      paymentAccount.availableBalance = paymentAccount.walletBalance;
      await paymentAccount.save({ session });

      rd.status = 'closed';
      rd.closedAt = new Date();
      await rd.save({ session });
      await syncCustomerAccounts(customer, { session });

      await logRdEvent(
        rd,
        customer,
        'rd.maturity_credited.customer',
        `Maturity amount credited for RD ${rd.rdNumber}.`,
        'success',
        {
          payoutAmount: rd.maturityAmount,
        },
        session
      );

      responsePayload = {
        message: 'Maturity Amount Credited',
        payoutAmount: rd.maturityAmount,
        recurringDeposit: serializeRecurringDeposit(rd),
      };
    });

    res.json(responsePayload);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to credit RD maturity amount' });
  } finally {
    session.endSession();
  }
};

const renewRecurringDeposit = async (req, res) => {
  const originalRd = await RecurringDeposit.findOne({
    _id: req.params.id,
    customer: req.user._id,
  });

  if (!originalRd) {
    return res.status(404).json({ message: 'Recurring deposit not found' });
  }

  if (originalRd.status !== 'matured') {
    return res.status(400).json({ message: 'Only matured RDs can be renewed' });
  }

  const customer = await User.findOne({ _id: req.user._id, role: 'customer' });

  if (!customer) {
    return res.status(404).json({ message: 'Customer not found' });
  }

  const rateConfig = await getDepositRuleConfig();
  const matchingRate = getApplicableRdRate(rateConfig.depositRules?.rateCards, originalRd.tenureMonths);

  if (!matchingRate?.annualInterestRate) {
    return res.status(400).json({ message: 'Current RD rate is not configured for this tenure' });
  }

  const openingDate = new Date();
  const calculation = calculateRecurringDeposit({
    monthlyInstallmentAmount: originalRd.monthlyInstallmentAmount,
    interestRate: matchingRate.annualInterestRate,
    tenureMonths: originalRd.tenureMonths,
    startDate: openingDate,
  });

  const renewedRd = await RecurringDeposit.create({
    rdNumber: await getNextRdNumber(),
    customer: customer._id,
    customerName: customer.name,
    customerId: customer.customerId,
    linkedAccountNumber: originalRd.linkedAccountNumber,
    monthlyInstallmentAmount: originalRd.monthlyInstallmentAmount,
    interestRate: matchingRate.annualInterestRate,
    tenureMonths: originalRd.tenureMonths,
    startDate: openingDate,
    renewedFrom: originalRd._id,
    ...calculation,
    createdBy: req.user._id,
  });

  originalRd.status = 'renewed';
  originalRd.closedAt = new Date();
  await originalRd.save();

  await logRdEvent(
    renewedRd,
    customer,
    'rd.renewed.customer',
    `RD ${originalRd.rdNumber} renewed at ${matchingRate.annualInterestRate}% for ${originalRd.tenureMonths} months as ${renewedRd.rdNumber}.`,
    'success',
    {
      renewedFrom: originalRd.rdNumber,
      currentRate: matchingRate.annualInterestRate,
      tenureMonths: originalRd.tenureMonths,
    }
  );

  res.status(201).json({
    message: 'RD Renewed',
    recurringDeposit: serializeRecurringDeposit(renewedRd),
  });
};

module.exports = {
  createRecurringDeposit,
  getRecurringDeposits,
  postMonthlyInstallment,
  renewRecurringDeposit,
  requestMaturityPayout,
  requestPrematureWithdrawal,
};
