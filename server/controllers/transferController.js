const mongoose = require('mongoose');

const BankAccount = require('../models/BankAccount');
const Approval = require('../models/Approval');
const Tier = require('../models/Tier');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { ensureBankAccountsForUser, syncCustomerAccounts } = require('../utils/customerAccounts');
const { DEFAULT_MONTHLY_OD_USES, getAccountTypeOdRule } = require('../utils/accountTypeOdPolicy');
const { sendEmail } = require('../utils/email');
const { writeSystemLog } = require('../utils/systemLog');

const serializeTransaction = (transaction) => ({
  id: transaction.transactionId,
  sender: transaction.senderName,
  receiver: transaction.receiverName,
  fromAccountNumber: transaction.fromAccountNumber,
  toAccountNumber: transaction.toAccountNumber,
  amount: transaction.amount,
  status: transaction.status,
  type: transaction.type,
  date: transaction.createdAt?.toISOString().slice(0, 10),
  remarks: transaction.remarks,
  createdAt: transaction.createdAt,
});

const formatMoney = (value) => `INR ${toWholeRupees(value).toLocaleString('en-IN')}`;
const maskAccount = (value) => {
  const account = String(value || '');
  if (account.length <= 4) return account;
  return `XXXX${account.slice(-4)}`;
};

const sendTransferEmail = async ({ to, subject, lines }) => {
  if (!to) return null;

  const text = [...lines, '', 'Regards,', 'Adnate PayNest'].join('\n');
  const htmlLines = lines.map((line) => `<p>${line}</p>`).join('');

  return sendEmail({
    to,
    subject,
    text,
    html: `${htmlLines}<p>Regards,<br />Adnate PayNest</p>`,
  });
};

const toWholeRupees = (value) => Math.round(Number(value || 0));
const normalizeAccountNumber = (value) => String(value || '').trim();
const makeId = (prefix) => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
const getCurrentMonthKey = () => new Date().toISOString().slice(0, 7);
const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);
const getTodayBounds = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
};

const refreshMonthlyOverdraftCounter = (bankAccount) => {
  const currentMonthKey = getCurrentMonthKey();

  if (bankAccount.odCountMonthKey !== currentMonthKey) {
    bankAccount.odCountThisMonth = 0;
    bankAccount.odBlocked = false;
    bankAccount.odCountMonthKey = currentMonthKey;
  }
};

const getAccountSnapshot = (user, accountNumber) =>
  (user.accounts || []).find((account) => account.accountNumber === accountNumber) ||
  (user.account?.accountNumber === accountNumber ? user.account : null);

const syncUserAccountSnapshot = (user, bankAccount) => {
  const bankName =
    user.account?.bankName ||
    user.accounts?.[0]?.bankName ||
    process.env.BANK_NAME ||
    'Adnate Bank';
  const ifsc =
    user.account?.ifsc ||
    user.accounts?.[0]?.ifsc ||
    process.env.BANK_IFSC ||
    'ADNT0004521';
  const nextSnapshot = {
    accountNumber: bankAccount.accountNumber,
    bankName,
    ifsc,
    accountType: bankAccount.accountType,
    balance: toWholeRupees(bankAccount.walletBalance),
    transferLimit: bankAccount.transferLimit || 0,
    overdraftLimit: firstDefined(bankAccount.odLimit, user.account?.overdraftLimit, 0),
    overdraftUsed: firstDefined(bankAccount.odUsed, 0),
    odStartedAt: bankAccount.odStartedAt || null,
    odCountThisMonth: bankAccount.odCountThisMonth || 0,
    odBlocked: bankAccount.odBlocked || false,
  };

  user.accounts = (user.accounts || []).map((account) =>
    account.accountNumber === bankAccount.accountNumber
      ? { ...(account.toObject?.() || account), ...nextSnapshot }
      : account
  );

};

const getTransactions = async (req, res) => {
  const filter =
    req.user.role === 'customer'
      ? { $or: [{ sender: req.user._id }, { receiver: req.user._id }] }
      : {};
  const transactions = await Transaction.find(filter).sort({ createdAt: -1 });

  res.json({ transactions: transactions.map(serializeTransaction) });
};

const createTransfer = async (req, res) => {
  const { beneficiaryId, amount, remarks = '', fromAccountNumber, toAccountNumber } = req.body;
  const transferAmount = toWholeRupees(amount);

  if (!beneficiaryId || !transferAmount || transferAmount < 1) {
    return res.status(400).json({ message: 'Beneficiary and amount are required' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const sender = await User.findById(req.user._id).session(session);

    if (!sender) {
      throw new Error('Sender not found');
    }

    const savedBeneficiary = sender.savedBeneficiaries.id(beneficiaryId);

    if (!savedBeneficiary) {
      throw new Error('Beneficiary not found');
    }

    const receiver = await User.findById(savedBeneficiary.beneficiaryUser).session(session);

    if (!sender || !receiver || receiver.role !== 'customer') {
      throw new Error('Beneficiary not found');
    }

    if (receiver.status !== 'active') {
      throw new Error('Beneficiary is inactive and cannot receive new transfers');
    }

    await Promise.all([
      ensureBankAccountsForUser(sender, { session }),
      ensureBankAccountsForUser(receiver, { session }),
    ]);

    const senderAccountNumber = normalizeAccountNumber(
      fromAccountNumber || sender.account?.accountNumber
    );
    const requestedReceiverAccountNumber = normalizeAccountNumber(
      toAccountNumber || savedBeneficiary.accountNumber
    );
    const savedReceiverAccountNumber = normalizeAccountNumber(savedBeneficiary.accountNumber);
    const receiverAccountNumber = requestedReceiverAccountNumber;

    if (!senderAccountNumber || !receiverAccountNumber) {
      throw new Error('Sender and beneficiary accounts are required');
    }

    if (receiverAccountNumber !== savedReceiverAccountNumber) {
      throw new Error('Selected beneficiary account is not saved for this beneficiary');
    }

    const [senderBankAccount, receiverBankAccount, senderTier] = await Promise.all([
      BankAccount.findOne({
        customerId: sender.customerId,
        accountNumber: senderAccountNumber,
        accountStatus: 'active',
      }).session(session),
      BankAccount.findOne({
        customerId: receiver.customerId,
        accountNumber: receiverAccountNumber,
        accountStatus: 'active',
      }).session(session),
      Tier.findOne({ name: sender.classification }).session(session),
    ]);

    if (!senderBankAccount) {
      throw new Error('Selected sender bank account is not active or was not found');
    }

    if (!receiverBankAccount) {
      throw new Error('Selected beneficiary bank account is not active or was not found');
    }

    const senderSnapshot = getAccountSnapshot(sender, senderBankAccount.accountNumber);
    const currentBalance = toWholeRupees(senderBankAccount.walletBalance);
    const odRule = getAccountTypeOdRule(senderTier, senderBankAccount.accountType);
    const overdraftLimit = toWholeRupees(
      firstDefined(senderBankAccount.odLimit, senderSnapshot?.overdraftLimit, odRule.odLimit)
    );
    const monthlyOdUses = toWholeRupees(odRule.monthlyOdUses ?? DEFAULT_MONTHLY_OD_USES);
    const overdraftUsed = toWholeRupees(senderBankAccount.odUsed);
    const overdraftAvailable = Math.max(0, overdraftLimit - overdraftUsed);
    const overdraftNeeded = Math.max(0, transferAmount - currentBalance);
    const canUseOverdraft = overdraftNeeded > 0 && overdraftNeeded <= overdraftAvailable;

    const transferLimit = toWholeRupees(
      senderBankAccount.transferLimit || senderTier?.perTxnLimit
    );
    const dailyLimit = toWholeRupees(
      senderBankAccount.withdrawalLimit || senderTier?.dailyLimit
    );
    const { start: todayStart, end: tomorrowStart } = getTodayBounds();
    const todayTransfers = await Transaction.aggregate([
      {
        $match: {
          sender: sender._id,
          fromAccountNumber: senderBankAccount.accountNumber,
          status: 'success',
          createdAt: { $gte: todayStart, $lt: tomorrowStart },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).session(session);
    const transferredToday = toWholeRupees(todayTransfers[0]?.total);
    const wouldExceedTransferLimit = transferLimit > 0 && transferAmount > transferLimit;
    const wouldExceedDailyLimit =
      dailyLimit > 0 && transferredToday + transferAmount > dailyLimit;

    if ((wouldExceedTransferLimit || wouldExceedDailyLimit) && !canUseOverdraft) {
      const assignedManager = await User.findOne({
        role: 'manager',
        status: 'active',
      })
        .sort({ createdAt: 1 })
        .session(session);

      if (!assignedManager) {
        throw new Error('No active manager is available for approval');
      }

      const transaction = await Transaction.create(
        [
          {
            transactionId: makeId('TXN'),
            sender: sender._id,
            receiver: receiver._id,
            senderName: sender.name,
            receiverName: receiver.name,
            fromAccountNumber: senderBankAccount.accountNumber,
            toAccountNumber: receiverBankAccount.accountNumber,
            amount: transferAmount,
            remarks:
              remarks ||
              `${senderBankAccount.accountNumber} to ${receiverBankAccount.accountNumber}`,
            status: 'pending',
          },
        ],
        { session }
      );

      const transferLimitRatio =
        wouldExceedTransferLimit && transferLimit > 0 ? transferAmount / transferLimit : 1;
      const dailyLimitRatio =
        wouldExceedDailyLimit && dailyLimit > 0
          ? (transferredToday + transferAmount) / dailyLimit
          : 1;
      const limitRatio = Math.max(transferLimitRatio, dailyLimitRatio);
      const approvalReasons = [
        wouldExceedTransferLimit ? 'per-transaction limit' : null,
        wouldExceedDailyLimit ? 'daily limit' : null,
      ].filter(Boolean);
      const approval = await Approval.create(
        [
          {
            requestId: makeId('APR'),
            transaction: transaction[0]._id,
            customer: sender._id,
            assignedManager: assignedManager._id,
            amount: transferAmount,
            risk: limitRatio >= 2 ? 'high' : 'medium',
          },
        ],
        { session }
      );

      sender.pendingRequests = toWholeRupees(sender.pendingRequests) + 1;
      await writeSystemLog(
        {
          action: 'approval.created',
          message: `Approval escalation ${approval[0].requestId} created for ${sender.name}'s beneficiary transfer of INR ${transferAmount.toLocaleString('en-IN')} above ${approvalReasons.join(' and ')}`,
          actor: sender._id,
          actorName: sender.name,
          entityType: 'Approval',
          entityId: approval[0].requestId,
          severity: limitRatio >= 2 ? 'danger' : 'warning',
          metadata: {
            transactionId: transaction[0].transactionId,
            amount: transferAmount,
            assignedManager: assignedManager.name,
            approvalReasons,
            transferLimit,
            dailyLimit,
            transferredToday,
            projectedDailyTotal: transferredToday + transferAmount,
          },
        },
        { session }
      );
      await sender.save({ session });
      await syncCustomerAccounts(sender, { session });
      await session.commitTransaction();

      await Promise.all([
        sendTransferEmail({
          to: assignedManager.email,
          subject: `Approval required for ${formatMoney(transferAmount)} transfer`,
          lines: [
            `Hello ${assignedManager.name},`,
            `${sender.name}'s transfer of ${formatMoney(transferAmount)} requires approval.`,
            `Approval ID: ${approval[0].requestId}`,
            `Reason: ${approvalReasons.join(' and ')}`,
          ],
        }),
        sendTransferEmail({
          to: sender.email,
          subject: 'Transfer pending approval',
          lines: [
            `Hello ${sender.name},`,
            `Your transfer of ${formatMoney(transferAmount)} to ${receiver.name} is pending manager approval.`,
            `Approval ID: ${approval[0].requestId}`,
          ],
        }),
      ]);

      return res.status(202).json({
        message: 'Transfer is pending manager approval',
        approval: {
          id: approval[0].requestId,
          status: approval[0].status,
          risk: approval[0].risk,
          amount: approval[0].amount,
          manager: assignedManager.name,
        },
        transaction: serializeTransaction(transaction[0]),
        account: sender.account,
        accounts: sender.accounts,
      });
    }

    if (overdraftNeeded > 0) {
      refreshMonthlyOverdraftCounter(senderBankAccount);
    }

    if (
      overdraftNeeded > 0 &&
      (senderBankAccount.odBlocked ||
        toWholeRupees(senderBankAccount.odCountThisMonth) >= monthlyOdUses)
    ) {
      throw new Error(`Monthly overdraft attempt limit reached for this ${senderBankAccount.accountType} account. You can use overdraft only ${monthlyOdUses} times in a month`);
    }

    if (overdraftNeeded > overdraftAvailable) {
      throw new Error('Insufficient balance and overdraft limit');
    }

    const nextOverdraftUsed = overdraftUsed + overdraftNeeded;

    senderBankAccount.walletBalance = Math.max(0, currentBalance - transferAmount);

    senderBankAccount.availableBalance = senderBankAccount.walletBalance;
    senderBankAccount.odLimit = overdraftLimit;
    senderBankAccount.odUsed = nextOverdraftUsed;

    if (overdraftNeeded > 0) {
      senderBankAccount.odStartedAt = senderBankAccount.odStartedAt || new Date();
      senderBankAccount.odCountThisMonth = toWholeRupees(senderBankAccount.odCountThisMonth) + 1;
      senderBankAccount.odCountMonthKey = getCurrentMonthKey();
      senderBankAccount.odBlocked = senderBankAccount.odCountThisMonth >= monthlyOdUses;
    }

    receiverBankAccount.walletBalance = toWholeRupees(receiverBankAccount.walletBalance) + transferAmount;

    receiverBankAccount.availableBalance =
      toWholeRupees(receiverBankAccount.availableBalance) + transferAmount;
    sender.totalTransfers += 1;

    syncUserAccountSnapshot(sender, senderBankAccount);
    syncUserAccountSnapshot(receiver, receiverBankAccount);

    await Promise.all([
      senderBankAccount.save({ session }),
      receiverBankAccount.save({ session }),
    ]);
    await sender.save({ session });
    await receiver.save({ session });

    const transaction = await Transaction.create(
      [
        {
          transactionId: `TXN${Date.now()}`,
          sender: sender._id,
          receiver: receiver._id,
          senderName: sender.name,
          receiverName: receiver.name,
          fromAccountNumber: senderBankAccount.accountNumber,
          toAccountNumber: receiverBankAccount.accountNumber,
          amount: transferAmount,
          remarks:
            remarks ||
            `${senderBankAccount.accountNumber} to ${receiverBankAccount.accountNumber}`,
          status: 'success',
        },
      ],
      { session }
    );

    await writeSystemLog(
      {
        action: 'transfer.completed',
        message: `Transfer ${transaction[0].transactionId} completed from ${sender.name} to ${receiver.name}`,
        actor: sender._id,
        actorName: sender.name,
        entityType: 'Transaction',
        entityId: transaction[0].transactionId,
        severity: 'success',
        metadata: {
          amount: transferAmount,
          customerName: sender.name,
          receiverName: receiver.name,
          fromAccountNumber: senderBankAccount.accountNumber,
          toAccountNumber: receiverBankAccount.accountNumber,
        },
      },
      { session }
    );

    if (overdraftNeeded > 0 && senderBankAccount.odCountThisMonth >= 3) {
      await writeSystemLog(
        {
          action: 'overdraft.third_attempt',
          message: `${sender.name} has used overdraft ${senderBankAccount.odCountThisMonth} times this month. Monthly OD usage is now blocked until next month.`,
          actor: sender._id,
          actorName: sender.name,
          entityType: 'Transaction',
          entityId: transaction[0].transactionId,
          severity: 'warning',
          metadata: {
          customerId: sender.customerId,
          customerName: sender.name,
          amount: transferAmount,
          overdraftUsed: nextOverdraftUsed,
            accountType: senderBankAccount.accountType,
            accountNumber: senderBankAccount.accountNumber,
            odCountThisMonth: senderBankAccount.odCountThisMonth,
          },
        },
        { session }
      );
    }

    await syncCustomerAccounts(sender, { session });

    await session.commitTransaction();

    await Promise.all([
      sendTransferEmail({
        to: sender.email,
        subject: 'Transfer completed',
        lines: [
          `Hello ${sender.name},`,
          `Your transfer of ${formatMoney(transferAmount)} to ${receiver.name} was completed successfully.`,
          `Transaction ID: ${transaction[0].transactionId}`,
          `From account: ${maskAccount(senderBankAccount.accountNumber)}`,
          `To account: ${maskAccount(receiverBankAccount.accountNumber)}`,
        ],
      }),
      sendTransferEmail({
        to: receiver.email,
        subject: 'Amount credited to your account',
        lines: [
          `Hello ${receiver.name},`,
          `${formatMoney(transferAmount)} was credited to your account from ${sender.name}.`,
          `Transaction ID: ${transaction[0].transactionId}`,
          `Credited account: ${maskAccount(receiverBankAccount.accountNumber)}`,
        ],
      }),
      overdraftNeeded > 0 && senderBankAccount.odCountThisMonth >= 3
        ? sendTransferEmail({
          to: sender.email,
          subject: 'Overdraft usage limit reached',
          lines: [
            `Hello ${sender.name},`,
            `Your ${senderBankAccount.accountType} account monthly overdraft usage count has reached ${senderBankAccount.odCountThisMonth}.`,
            'Overdraft usage for this account is now blocked until next month.',
          ],
        })
        : null,
    ].filter(Boolean));

    res.status(201).json({
      message: 'Transfer completed',
      transaction: serializeTransaction(transaction[0]),
      balance: senderBankAccount.walletBalance,
      account: sender.account,
      accounts: sender.accounts,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

const createOwnAccountTransfer = async (req, res) => {
  const { amount, remarks = '', fromAccountNumber, toAccountNumber } = req.body;
  const transferAmount = toWholeRupees(amount);
  const senderAccountNumber = normalizeAccountNumber(fromAccountNumber);
  const receiverAccountNumber = normalizeAccountNumber(toAccountNumber);

  if (!senderAccountNumber || !receiverAccountNumber || !transferAmount || transferAmount < 1) {
    return res.status(400).json({ message: 'From account, to account, and amount are required' });
  }

  if (senderAccountNumber === receiverAccountNumber) {
    return res.status(400).json({ message: 'From and to accounts cannot be the same' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const customer = await User.findById(req.user._id).session(session);

    if (!customer || customer.role !== 'customer') {
      throw new Error('Customer not found');
    }

    await ensureBankAccountsForUser(customer, { session });

    const [senderBankAccount, receiverBankAccount] = await Promise.all([
      BankAccount.findOne({
        customerId: customer.customerId,
        accountNumber: senderAccountNumber,
        accountStatus: 'active',
      }).session(session),
      BankAccount.findOne({
        customerId: customer.customerId,
        accountNumber: receiverAccountNumber,
        accountStatus: 'active',
      }).session(session),
    ]);

    if (!senderBankAccount) {
      throw new Error('Selected from account is not active or was not found');
    }

    if (!receiverBankAccount) {
      throw new Error('Selected to account is not active or was not found');
    }

    const currentBalance = toWholeRupees(senderBankAccount.walletBalance);

    if (transferAmount > currentBalance) {
      throw new Error('Insufficient balance. Overdraft is not allowed for own account transfers');
    }

    senderBankAccount.walletBalance = currentBalance - transferAmount;
    senderBankAccount.availableBalance = senderBankAccount.walletBalance;
    receiverBankAccount.walletBalance =
      toWholeRupees(receiverBankAccount.walletBalance) + transferAmount;
    receiverBankAccount.availableBalance = receiverBankAccount.walletBalance;
    customer.totalTransfers = toWholeRupees(customer.totalTransfers) + 1;

    syncUserAccountSnapshot(customer, senderBankAccount);
    syncUserAccountSnapshot(customer, receiverBankAccount);

    await senderBankAccount.save({ session });
    await receiverBankAccount.save({ session });
    await customer.save({ session });

    const transaction = await Transaction.create(
      [
        {
          transactionId: makeId('OWN'),
          sender: customer._id,
          receiver: customer._id,
          senderName: customer.name,
          receiverName: customer.name,
          fromAccountNumber: senderBankAccount.accountNumber,
          toAccountNumber: receiverBankAccount.accountNumber,
          amount: transferAmount,
          remarks:
            remarks ||
            `Own account transfer from ${senderBankAccount.accountType} to ${receiverBankAccount.accountType}`,
          status: 'success',
          type: 'own-account',
        },
      ],
      { session }
    );

    await writeSystemLog(
      {
        action: 'transfer.own_account.completed',
        message: `Own account transfer ${transaction[0].transactionId} completed for ${customer.name}`,
        actor: customer._id,
        actorName: customer.name,
        entityType: 'Transaction',
        entityId: transaction[0].transactionId,
        severity: 'success',
        metadata: {
          amount: transferAmount,
          customerName: customer.name,
          fromAccountNumber: senderBankAccount.accountNumber,
          toAccountNumber: receiverBankAccount.accountNumber,
        },
      },
      { session }
    );

    await syncCustomerAccounts(customer, { session });

    await session.commitTransaction();

    await sendTransferEmail({
      to: customer.email,
      subject: 'Own account transfer completed',
      lines: [
        `Hello ${customer.name},`,
        `Your own account transfer of ${formatMoney(transferAmount)} was completed successfully.`,
        `Transaction ID: ${transaction[0].transactionId}`,
        `From account: ${maskAccount(senderBankAccount.accountNumber)}`,
        `To account: ${maskAccount(receiverBankAccount.accountNumber)}`,
      ],
    });

    res.status(201).json({
      message: 'Own account transfer completed',
      transaction: serializeTransaction(transaction[0]),
      balance: senderBankAccount.walletBalance,
      account: customer.account,
      accounts: customer.accounts,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

module.exports = { getTransactions, createOwnAccountTransfer, createTransfer };
