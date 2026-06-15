const mongoose = require('mongoose');

const BankAccount = require('../models/BankAccount');
const Tier = require('../models/Tier');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { calculateOverdraftInterest } = require('../utils/overdraftInterest');
const { syncCustomerAccounts } = require('../utils/customerAccounts');

const toWholeRupees = (value) => Math.round(Number(value || 0));

const payOffOverdraft = async (req, res) => {
  const { accountNumber, odAccountNumber, paymentAccountNumber, amount } = req.body || {};
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

    const targetAccountNumber = odAccountNumber || accountNumber;
    const overdraftAccount = targetAccountNumber
      ? bankAccounts.find((account) => account.accountNumber === targetAccountNumber)
      : bankAccounts.find((account) => toWholeRupees(account.odUsed) > 0);

    if (!overdraftAccount) {
      throw new Error('Selected overdraft account was not found');
    }

    const overdraftUsed = toWholeRupees(overdraftAccount.odUsed);
    const tier = await Tier.findOne({ name: user.classification }).session(session);
    const odStartedAt =
      overdraftAccount.odStartedAt ||
      user.accounts?.find((account) => account.accountNumber === overdraftAccount.accountNumber)?.odStartedAt ||
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

    const paymentAccount = paymentAccountNumber
      ? bankAccounts.find((account) => account.accountNumber === paymentAccountNumber)
      : overdraftAccount;

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

    overdraftAccount.odUsed = remainingOverdraft;
    overdraftAccount.odStartedAt = remainingOverdraft > 0 ? overdraftAccount.odStartedAt || odStartedAt : null;

    await Promise.all([
      paymentAccount.save({ session }),
      paymentAccount.accountNumber === overdraftAccount.accountNumber
        ? null
        : overdraftAccount.save({ session }),
      Transaction.create(
        [
          {
            transactionId: `ODPAY${Date.now()}`,
            sender: user._id,
            receiver: user._id,
            senderName: user.name,
            receiverName: user.name,
            fromAccountNumber: paymentAccount.accountNumber,
            toAccountNumber: overdraftAccount.accountNumber,
            amount: requestedAmount,
            remarks:
              remainingOverdraft > 0
                ? `Partial ${overdraftAccount.accountType} overdraft payoff. Interest paid: ${interestPaid}. Principal paid: ${principalPayment}. Remaining principal due: ${remainingOverdraft}`
                : `${overdraftAccount.accountType} overdraft payoff. Interest paid: ${interestPaid}`,
            status: 'success',
            type: 'overdraft-payoff',
          },
        ],
        { session }
      ),
    ].filter(Boolean));

    await syncCustomerAccounts(user, { session });

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
