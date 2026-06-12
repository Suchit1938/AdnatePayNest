const mongoose = require('mongoose');

const BankAccount = require('../models/BankAccount');
const Tier = require('../models/Tier');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { calculateOverdraftInterest } = require('../utils/overdraftInterest');

const toWholeRupees = (value) => Math.round(Number(value || 0));

const getCustomerOverdraftUsed = (user, bankAccounts = []) => {
  const values = [
    user.account?.overdraftUsed,
    ...(user.accounts || []).map((account) => account.overdraftUsed),
    ...bankAccounts.map((account) => account.odUsed),
  ].map(toWholeRupees);

  return Math.max(...values, 0);
};

const toUserAccountSnapshot = (currentSnapshot, bankAccount, remainingOverdraft) => ({
  ...(currentSnapshot.toObject?.() || currentSnapshot),
  balance: toWholeRupees(bankAccount.walletBalance),
  overdraftLimit: toWholeRupees(bankAccount.odLimit || currentSnapshot.overdraftLimit),
  overdraftUsed: remainingOverdraft,
  odStartedAt: remainingOverdraft > 0 ? bankAccount.odStartedAt || currentSnapshot.odStartedAt || null : null,
  odCountThisMonth: bankAccount.odCountThisMonth || 0,
  odBlocked: bankAccount.odBlocked || false,
});

const syncOverdraftSnapshots = (user, bankAccounts, remainingOverdraft) => {
  const accountByNumber = new Map(
    bankAccounts.map((account) => [account.accountNumber, account])
  );

  user.accounts = (user.accounts || []).map((account) => {
    const bankAccount = accountByNumber.get(account.accountNumber);

    return bankAccount
      ? toUserAccountSnapshot(account, bankAccount, remainingOverdraft)
      : {
        ...(account.toObject?.() || account),
        overdraftUsed: remainingOverdraft,
        odStartedAt: remainingOverdraft > 0 ? account.odStartedAt || null : null,
      };
  });

  if (user.account?.accountNumber) {
    const bankAccount = accountByNumber.get(user.account.accountNumber);
    user.account = bankAccount
      ? toUserAccountSnapshot(user.account, bankAccount, remainingOverdraft)
      : {
        ...(user.account.toObject?.() || user.account),
        overdraftUsed: remainingOverdraft,
        odStartedAt: remainingOverdraft > 0 ? user.account.odStartedAt || null : null,
      };
  }
};

const payOffOverdraft = async (req, res) => {
  const { accountNumber, amount } = req.body || {};
  const requestedAmount = toWholeRupees(amount);
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(req.user._id).session(session);

    if (!user || user.role !== 'customer') {
      throw new Error('Customer not found');
    }

    const bankAccounts = await BankAccount.find({
      customerId: user.customerId,
      accountStatus: 'active',
    }).session(session);

    if (bankAccounts.length === 0) {
      throw new Error('Active bank account not found');
    }

    const overdraftUsed = getCustomerOverdraftUsed(user, bankAccounts);
    const tier = await Tier.findOne({ name: user.classification }).session(session);
    const activeOdAccount =
      bankAccounts.find((account) => toWholeRupees(account.odUsed) > 0 && account.odStartedAt) ||
      bankAccounts.find((account) => toWholeRupees(account.odUsed) > 0);
    const odStartedAt =
      activeOdAccount?.odStartedAt ||
      user.account?.odStartedAt ||
      (user.accounts || []).find((account) => account.odStartedAt)?.odStartedAt ||
      new Date();
    const interest = calculateOverdraftInterest({
      principal: overdraftUsed,
      monthlyInterestRate: tier?.lateFeeRate,
      startedAt: odStartedAt,
    });
    const totalDue = overdraftUsed + interest.interestAmount;

    if (overdraftUsed <= 0) {
      throw new Error('No active overdraft amount is due');
    }

    if (!requestedAmount || requestedAmount < 1) {
      throw new Error('Payoff amount must be greater than zero');
    }

    if (requestedAmount > totalDue) {
      throw new Error('Payoff amount cannot exceed the active overdraft due with interest');
    }

    const paymentAccount = accountNumber
      ? bankAccounts.find((account) => account.accountNumber === accountNumber)
      : bankAccounts.find((account) => account.accountNumber === user.account?.accountNumber) ||
      bankAccounts.find((account) => toWholeRupees(account.odUsed) > 0) ||
      bankAccounts[0];

    if (!paymentAccount) {
      throw new Error("Selected payoff account was not found");
    }

    const currentBalance = toWholeRupees(paymentAccount.walletBalance);

    if (currentBalance < requestedAmount) {
      throw new Error('Insufficient balance to pay off overdraft');
    }

    const interestPaid = Math.min(requestedAmount, interest.interestAmount);
    const principalPayment = Math.max(0, requestedAmount - interestPaid);
    const remainingOverdraft = Math.max(0, overdraftUsed - principalPayment);

    paymentAccount.walletBalance = currentBalance - requestedAmount;
    paymentAccount.availableBalance = paymentAccount.walletBalance;

    bankAccounts.forEach((account) => {
      account.odUsed = remainingOverdraft;
      account.odStartedAt = remainingOverdraft > 0 ? account.odStartedAt || odStartedAt : null;
    });

    syncOverdraftSnapshots(user, bankAccounts, remainingOverdraft);

    await Promise.all([
      ...bankAccounts.map((account) => account.save({ session })),
      user.save({ session }),
      Transaction.create(
        [
          {
            transactionId: `ODPAY${Date.now()}`,
            sender: user._id,
            receiver: user._id,
            senderName: user.name,
            receiverName: user.name,
            fromAccountNumber: paymentAccount.accountNumber,
            toAccountNumber: paymentAccount.accountNumber,
            amount: requestedAmount,
            remarks:
              remainingOverdraft > 0
                ? `Partial overdraft payoff. Interest paid: ${interestPaid}. Principal paid: ${principalPayment}. Remaining principal due: ${remainingOverdraft}`
                : `Overdraft payoff. Interest paid: ${interestPaid}`,
            status: 'success',
            type: 'overdraft-payoff',
          },
        ],
        { session }
      ),
    ]);

    await session.commitTransaction();

    res.json({
      message:
        remainingOverdraft > 0
          ? 'Partial overdraft payoff completed'
          : 'Overdraft paid off successfully',
      paidAmount: requestedAmount,
      interestAmount: interest.interestAmount,
      interestPaid,
      interestDays: interest.interestDays,
      principalPaid: principalPayment,
      totalDue,
      remainingOverdraft,
      balance: paymentAccount.walletBalance,
      account: user.account,
      accounts: user.accounts,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

module.exports = { payOffOverdraft };
