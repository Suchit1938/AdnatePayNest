const BankSettlementAccount = require('../models/BankSettlementAccount');
const Loan = require('../models/Loan');
const Transaction = require('../models/Transaction');

const SETTLEMENT_ACCOUNT_NUMBER =
  process.env.BANK_SETTLEMENT_ACCOUNT_NUMBER || 'BANK-SETTLEMENT-0001';
const SETTLEMENT_ACCOUNT_NAME =
  process.env.BANK_SETTLEMENT_ACCOUNT_NAME || 'Adnate Bank Settlement Account';
const OPENING_BALANCE = Math.round(Number(process.env.BANK_SETTLEMENT_OPENING_BALANCE || 500000000));
const MINIMUM_RESERVE = Math.round(Number(process.env.BANK_SETTLEMENT_MINIMUM_RESERVE || 50000000));

const toWholeRupees = (value) => Math.round(Number(value || 0));

const calculateHistoricalSettlementBalance = async ({ session } = {}) => {
  const [loans, odRecoveries] = await Promise.all([
    Loan.find({
      disbursedAt: { $exists: true, $ne: null },
      status: { $in: ['disbursed', 'closed'] },
    })
      .select('amount repaymentHistory')
      .session(session || null),
    Transaction.aggregate([
      { $match: { type: 'overdraft-payoff', status: 'success' } },
      { $group: { _id: null, amount: { $sum: '$amount' } } },
    ]).session(session || null),
  ]);

  const disbursedAmount = loans.reduce((sum, loan) => sum + toWholeRupees(loan.amount), 0);
  const loanCollectedAmount = loans.reduce(
    (sum, loan) =>
      sum +
      (loan.repaymentHistory || []).reduce(
        (entrySum, entry) =>
          entrySum + toWholeRupees(entry.status === 'success' ? entry.amount : 0),
        0
      ),
    0
  );
  const odRecoveredAmount = toWholeRupees(odRecoveries[0]?.amount);

  return Math.max(0, OPENING_BALANCE - disbursedAmount + loanCollectedAmount + odRecoveredAmount);
};

const ensureBankSettlementAccount = async ({ session } = {}) => {
  let account = await BankSettlementAccount.findOne({
    accountNumber: SETTLEMENT_ACCOUNT_NUMBER,
  }).session(session || null);

  if (!account) {
    const historicalBalance = await calculateHistoricalSettlementBalance({ session });
    const [createdAccount] = await BankSettlementAccount.create(
      [
        {
          accountNumber: SETTLEMENT_ACCOUNT_NUMBER,
          accountName: SETTLEMENT_ACCOUNT_NAME,
          openingBalance: OPENING_BALANCE,
          balance: historicalBalance,
          minimumReserve: MINIMUM_RESERVE,
          status: 'active',
        },
      ],
      session ? { session } : undefined
    );

    account = createdAccount;
  }

  return account;
};

const debitBankSettlement = async (amount, { session } = {}) => {
  const debitAmount = toWholeRupees(amount);
  const account = await ensureBankSettlementAccount({ session });

  if (account.status !== 'active') {
    throw new Error('Bank settlement account is not active');
  }

  if (debitAmount < 1) {
    throw new Error('Settlement debit amount must be greater than zero');
  }

  if (toWholeRupees(account.balance) - debitAmount < toWholeRupees(account.minimumReserve)) {
    throw new Error('Insufficient bank settlement funds for this disbursement');
  }

  account.balance = toWholeRupees(account.balance) - debitAmount;
  await account.save({ session });

  return account;
};

const creditBankSettlement = async (amount, { session } = {}) => {
  const creditAmount = toWholeRupees(amount);
  const account = await ensureBankSettlementAccount({ session });

  if (account.status !== 'active') {
    throw new Error('Bank settlement account is not active');
  }

  if (creditAmount < 1) {
    throw new Error('Settlement credit amount must be greater than zero');
  }

  account.balance = toWholeRupees(account.balance) + creditAmount;
  await account.save({ session });

  return account;
};

const serializeBankSettlementAccount = (account) => ({
  accountNumber: account.accountNumber,
  accountName: account.accountName,
  balance: toWholeRupees(account.balance),
  openingBalance: toWholeRupees(account.openingBalance),
  minimumReserve: toWholeRupees(account.minimumReserve),
  availableForDisbursement: Math.max(
    0,
    toWholeRupees(account.balance) - toWholeRupees(account.minimumReserve)
  ),
  status: account.status,
  updatedAt: account.updatedAt,
});

const getLoanMovementTitle = (transaction) => {
  const loanId = transaction.businessRefId || transaction.toAccountNumber || '';

  if (transaction.type === 'loan-emi-payment') {
    return transaction.status === 'failed'
      ? `Failed EMI payment for loan ${loanId}`
      : `Loan EMI payment for loan ${loanId}`;
  }

  if (transaction.type === 'loan-part-payment') {
    return `Loan part-payment for loan ${loanId}`;
  }

  if (transaction.type === 'loan-foreclosure') {
    return `Loan foreclosure for loan ${loanId}`;
  }

  return `Loan repayment for loan ${loanId}`;
};

const backfillRepaymentTransactions = async () => {
  const loanTransactions = await Transaction.find({
    type: { $in: ['loan-emi-payment', 'loan-part-payment', 'loan-foreclosure'] },
    $or: [
      { receiverType: { $ne: 'bank' } },
      { receiverName: { $ne: SETTLEMENT_ACCOUNT_NAME } },
      { category: { $ne: 'loan' } },
      { displayTitle: { $in: [null, ''] } },
    ],
  });

  for (const transaction of loanTransactions) {
    const loanId = transaction.businessRefId || transaction.toAccountNumber || '';

    transaction.receiver = undefined;
    transaction.receiverType = 'bank';
    transaction.receiverName = SETTLEMENT_ACCOUNT_NAME;
    transaction.category = 'loan';
    transaction.direction = 'debit';
    transaction.businessRefType = 'loan';
    transaction.businessRefId = loanId;
    transaction.displayTitle = getLoanMovementTitle(transaction);
    transaction.displaySubtitle =
      transaction.displaySubtitle || transaction.remarks || `Settlement movement for loan ${loanId}`;
    await transaction.save();
  }

  const overdraftTransactions = await Transaction.find({
    type: 'overdraft-payoff',
    $or: [
      { receiverType: { $ne: 'bank' } },
      { receiverName: { $ne: SETTLEMENT_ACCOUNT_NAME } },
      { category: { $ne: 'overdraft' } },
      { displayTitle: { $in: [null, ''] } },
    ],
  });

  for (const transaction of overdraftTransactions) {
    const overdraftAccountNumber =
      transaction.businessRefId ||
      (transaction.toAccountNumber === SETTLEMENT_ACCOUNT_NUMBER ? '' : transaction.toAccountNumber) ||
      transaction.fromAccountNumber ||
      '';

    transaction.receiver = undefined;
    transaction.receiverType = 'bank';
    transaction.receiverName = SETTLEMENT_ACCOUNT_NAME;
    transaction.toAccountNumber = SETTLEMENT_ACCOUNT_NUMBER;
    transaction.category = 'overdraft';
    transaction.direction = 'debit';
    transaction.businessRefType = 'overdraft';
    transaction.businessRefId = overdraftAccountNumber;
    transaction.displayTitle = 'Overdraft repayment';
    transaction.displaySubtitle =
      transaction.displaySubtitle || transaction.remarks || 'Overdraft recovery credited to settlement account';
    await transaction.save();
  }

  return {
    loanRepaymentsUpdated: loanTransactions.length,
    overdraftRepaymentsUpdated: overdraftTransactions.length,
  };
};

const backfillLoanDisbursementTransactions = async () => {
  const loans = await Loan.find({
    disbursedAt: { $exists: true, $ne: null },
    status: { $in: ['disbursed', 'closed'] },
  }).populate('customer', 'name');
  let created = 0;

  for (const loan of loans) {
    const existing = await Transaction.exists({
      type: 'loan-disbursement',
      businessRefId: loan.loanId,
    });

    if (existing) continue;

    await Transaction.create({
      transactionId: `LNDISBHIST${loan.loanId}`.replace(/[^A-Z0-9]/gi, '').slice(0, 48),
      receiver: loan.customer?._id || loan.customer,
      senderType: 'bank',
      receiverType: 'customer',
      senderName: SETTLEMENT_ACCOUNT_NAME,
      receiverName: loan.customer?.name || loan.customerName || 'Customer',
      fromAccountNumber: SETTLEMENT_ACCOUNT_NUMBER,
      toAccountNumber: loan.disbursementAccountNumber || '',
      amount: toWholeRupees(loan.amount),
      remarks: `Historical loan ${loan.loanId} disbursement reflected in settlement ledger`,
      status: 'success',
      type: 'loan-disbursement',
      category: 'loan',
      direction: 'credit',
      businessRefType: 'loan',
      businessRefId: loan.loanId,
      displayTitle: `Loan disbursement for loan ${loan.loanId}`,
      displaySubtitle: `${toWholeRupees(loan.amount).toLocaleString('en-IN')} credited to ${loan.disbursementAccountNumber || 'customer account'}`,
      createdAt: loan.disbursedAt,
      updatedAt: loan.disbursedAt,
    });
    created += 1;
  }

  return { loanDisbursementsCreated: created };
};

const backfillSettlementLedger = async () => {
  await ensureBankSettlementAccount();
  const [repaymentResult, disbursementResult] = await Promise.all([
    backfillRepaymentTransactions(),
    backfillLoanDisbursementTransactions(),
  ]);

  return {
    ...repaymentResult,
    ...disbursementResult,
  };
};

module.exports = {
  SETTLEMENT_ACCOUNT_NAME,
  SETTLEMENT_ACCOUNT_NUMBER,
  backfillSettlementLedger,
  creditBankSettlement,
  debitBankSettlement,
  ensureBankSettlementAccount,
  serializeBankSettlementAccount,
};
