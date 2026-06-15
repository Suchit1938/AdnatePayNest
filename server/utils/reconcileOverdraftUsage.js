require('dotenv').config();

const connectDB = require('../config/db');
const BankAccount = require('../models/BankAccount');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { syncCustomerAccounts } = require('./customerAccounts');

const toAmount = (value) => Math.max(0, Math.round(Number(value || 0)));

const getSuccessfulDebitTransactions = async (accountNumber) =>
  Transaction.find({
    fromAccountNumber: accountNumber,
    status: { $in: ['success', 'completed'] },
    type: { $ne: 'overdraft-payoff' },
  }).sort({ createdAt: 1 });

const getSuccessfulPayoffTransactions = async (accountNumber) =>
  Transaction.find({
    fromAccountNumber: accountNumber,
    status: { $in: ['success', 'completed'] },
    type: 'overdraft-payoff',
  }).sort({ createdAt: 1 });

const calculateOverdraftUsedFromTransactions = async (account) => {
  const debits = await getSuccessfulDebitTransactions(account.accountNumber);
  const payoffs = await getSuccessfulPayoffTransactions(account.accountNumber);
  let runningBalance = toAmount(account.walletBalance);
  let odUsed = 0;

  for (const transaction of debits) {
    const amount = toAmount(transaction.amount);
    const overdraftNeeded = Math.max(0, amount - runningBalance);

    runningBalance = Math.max(0, runningBalance - amount);
    odUsed += overdraftNeeded;
  }

  for (const transaction of payoffs) {
    odUsed = Math.max(0, odUsed - toAmount(transaction.amount));
  }

  return odUsed;
};

const reconcileOverdraftUsage = async () => {
  await connectDB();

  const accounts = await BankAccount.find();
  let updated = 0;

  for (const account of accounts) {
    const recalculatedOdUsed = await calculateOverdraftUsedFromTransactions(account);

    if (toAmount(account.odUsed) !== recalculatedOdUsed) {
      account.odUsed = recalculatedOdUsed;
      account.odStartedAt = recalculatedOdUsed > 0 ? account.odStartedAt || new Date() : null;
      await account.save();
      updated += 1;
    }
  }

  const customers = await User.find({ role: 'customer' });
  await Promise.all(customers.map((customer) => syncCustomerAccounts(customer)));

  console.log(`Reconciled overdraft usage. Updated ${updated} bank account(s).`);
  process.exit(0);
};

reconcileOverdraftUsage().catch((error) => {
  console.error(error);
  process.exit(1);
});
