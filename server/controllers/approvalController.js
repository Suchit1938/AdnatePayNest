const mongoose = require('mongoose');

const Approval = require('../models/Approval');
const BankAccount = require('../models/BankAccount');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { ensureBankAccountsForUser } = require('../utils/customerAccounts');
const { sendEmail } = require('../utils/email');
const { writeSystemLog } = require('../utils/systemLog');

const toWholeRupees = (value) => Math.round(Number(value || 0));
const formatMoney = (value) => `INR ${toWholeRupees(value).toLocaleString('en-IN')}`;
const sendApprovalDecisionEmail = async ({ customer, approval, transaction, status, rejectionReason, managerName }) => {
  if (!customer?.email) return null;

  const approved = status === 'approved';
  const subject = approved ? 'Transfer approved and completed' : 'Transfer rejected';
  const decisionLine = approved
    ? `Your transfer of ${formatMoney(transaction.amount)} has been approved and completed.`
    : `Your transfer of ${formatMoney(transaction.amount)} was rejected.`;
  const reasonLine = !approved && rejectionReason ? `Reason: ${rejectionReason}` : '';
  const lines = [
    `Hello ${customer.name},`,
    decisionLine,
    `Approval ID: ${approval.requestId}`,
    `Transaction ID: ${transaction.transactionId}`,
    `Reviewed by: ${managerName}`,
    reasonLine,
  ].filter(Boolean);

  return sendEmail({
    to: customer.email,
    subject,
    text: [...lines, '', 'Regards,', 'Adnate PayNest'].join('\n'),
    html: `${lines.map((line) => `<p>${line}</p>`).join('')}<p>Regards,<br />Adnate PayNest</p>`,
  });
};
const getCurrentMonthKey = () => new Date().toISOString().slice(0, 7);
const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);

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

const getCustomerOverdraftUsed = (user, bankAccounts = []) => {
  const sourceValues = bankAccounts.length
    ? bankAccounts.map((account) => account.odUsed)
    : [
        user.account?.overdraftUsed,
        ...(user.accounts || []).map((account) => account.overdraftUsed),
      ];

  return Math.max(0, ...sourceValues.map(toWholeRupees));
};

const setCustomerOverdraftUsed = (user, overdraftUsed) => {
  user.accounts = (user.accounts || []).map((account) => ({
    ...(account.toObject?.() || account),
    overdraftUsed,
  }));

  if (user.account?.accountNumber) {
    user.account = {
      ...(user.account.toObject?.() || user.account),
      overdraftUsed,
    };
  }
};

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

  if (
    !user.account?.accountNumber ||
    user.account.accountNumber === bankAccount.accountNumber
  ) {
    user.account = nextSnapshot;
  }
};

const serializeApproval = (approval) => ({
  id: approval.requestId,
  customer: approval.customer?.name,
  manager: approval.assignedManager?.name,
  managerEmail: approval.assignedManager?.email,
  managerEmployeeId: approval.assignedManager?.employeeId,
  amount: approval.amount,
  account:
    approval.transaction?.fromAccountNumber ||
    approval.customer?.account?.accountNumber,
  toAccount: approval.transaction?.toAccountNumber,
  type: approval.transaction?.type || 'bank-transfer',
  risk: approval.risk,
  status: approval.status,
  rejectionReason: approval.rejectionReason || '',
  requestedOn: approval.createdAt,
  reviewedAt: approval.reviewedAt,
  updatedAt: approval.updatedAt,
});

const executePendingTransaction = async (transaction, session) => {
  const [sender, receiver] = await Promise.all([
    User.findById(transaction.sender).session(session),
    User.findById(transaction.receiver).session(session),
  ]);

  if (!sender || !receiver || receiver.role !== 'customer') {
    throw new Error('Transfer participants could not be found');
  }

  if (receiver.status !== 'active') {
    throw new Error('Beneficiary is inactive and cannot receive new transfers');
  }

  await Promise.all([
    ensureBankAccountsForUser(sender, { session }),
    ensureBankAccountsForUser(receiver, { session }),
  ]);

  const [senderBankAccount, receiverBankAccount] = await Promise.all([
    BankAccount.findOne({
      customerId: sender.customerId,
      accountNumber: transaction.fromAccountNumber,
      accountStatus: 'active',
    }).session(session),
    BankAccount.findOne({
      customerId: receiver.customerId,
      accountNumber: transaction.toAccountNumber,
      accountStatus: 'active',
    }).session(session),
  ]);

  if (!senderBankAccount) {
    throw new Error('Selected sender bank account is not active or was not found');
  }

  if (!receiverBankAccount) {
    throw new Error('Selected beneficiary bank account is not active or was not found');
  }

  const transferAmount = toWholeRupees(transaction.amount);
  const senderSnapshot = getAccountSnapshot(sender, senderBankAccount.accountNumber);
  const activeSenderBankAccounts = await BankAccount.find({
    customerId: sender.customerId,
    accountStatus: 'active',
  }).session(session);
  const senderBankAccounts = activeSenderBankAccounts.map((account) =>
    account.accountNumber === senderBankAccount.accountNumber ? senderBankAccount : account
  );
  const currentBalance = toWholeRupees(senderBankAccount.walletBalance);
  const overdraftLimit = toWholeRupees(
    firstDefined(senderBankAccount.odLimit, senderSnapshot?.overdraftLimit, sender.account?.overdraftLimit)
  );
  const overdraftUsed = getCustomerOverdraftUsed(sender, senderBankAccounts);
  const overdraftAvailable = Math.max(0, overdraftLimit - overdraftUsed);
  const overdraftNeeded = Math.max(0, transferAmount - currentBalance);

  if (overdraftNeeded > 0) {
    refreshMonthlyOverdraftCounter(senderBankAccount);
  }

  if (
    overdraftNeeded > 0 &&
    (senderBankAccount.odBlocked || toWholeRupees(senderBankAccount.odCountThisMonth) >= 3)
  ) {
    throw new Error('Monthly overdraft attempt limit reached. Customer can use overdraft only 3 times in a month');
  }

  if (overdraftNeeded > overdraftAvailable) {
    throw new Error('Insufficient balance and overdraft limit');
  }

  const nextOverdraftUsed = overdraftUsed + overdraftNeeded;

  senderBankAccount.walletBalance = Math.max(0, currentBalance - transferAmount);
  senderBankAccount.availableBalance = senderBankAccount.walletBalance;
    senderBankAccount.odLimit = overdraftLimit;
    senderBankAccount.odUsed = nextOverdraftUsed;
    senderBankAccounts.forEach((account) => {
      account.odUsed = nextOverdraftUsed;
    });

    if (overdraftNeeded > 0) {
      const odStartedAt = senderBankAccount.odStartedAt || new Date();
      senderBankAccounts.forEach((account) => {
        account.odStartedAt = account.odStartedAt || odStartedAt;
      });
      senderBankAccount.odCountThisMonth = toWholeRupees(senderBankAccount.odCountThisMonth) + 1;
      senderBankAccount.odCountMonthKey = getCurrentMonthKey();
      senderBankAccount.odBlocked = senderBankAccount.odCountThisMonth >= 3;
  }

  receiverBankAccount.walletBalance =
    toWholeRupees(receiverBankAccount.walletBalance) + transferAmount;
  receiverBankAccount.availableBalance =
    toWholeRupees(receiverBankAccount.availableBalance) + transferAmount;

  sender.totalTransfers = toWholeRupees(sender.totalTransfers) + 1;
  sender.pendingRequests = Math.max(0, toWholeRupees(sender.pendingRequests) - 1);

  syncUserAccountSnapshot(sender, senderBankAccount);
  setCustomerOverdraftUsed(sender, nextOverdraftUsed);
  syncUserAccountSnapshot(receiver, receiverBankAccount);

  transaction.status = 'success';

  if (overdraftNeeded > 0 && senderBankAccount.odCountThisMonth >= 3) {
    await writeSystemLog(
      {
        action: 'overdraft.third_attempt',
        message: `${sender.name} has used overdraft ${senderBankAccount.odCountThisMonth} times this month. Monthly OD usage is now blocked until next month.`,
        actor: sender._id,
        actorName: sender.name,
        entityType: 'Transaction',
        entityId: transaction.transactionId,
        severity: 'warning',
        metadata: {
          customerId: sender.customerId,
          amount: transferAmount,
          overdraftUsed: nextOverdraftUsed,
          odCountThisMonth: senderBankAccount.odCountThisMonth,
          source: 'manager-approved-transfer',
        },
      },
      { session }
    );
  }

  await Promise.all([
    ...senderBankAccounts.map((account) => account.save({ session })),
    receiverBankAccount.save({ session }),
  ]);
  await sender.save({ session });
  await receiver.save({ session });
  await transaction.save({ session });
};

const getApprovals = async (req, res) => {
  const filter =
    req.user.role === 'manager'
      ? { $or: [{ assignedManager: req.user._id }, { assignedManager: { $exists: false } }] }
      : {};
  const approvals = await Approval.find(filter)
    .populate('customer', 'name account')
    .populate('assignedManager', 'name email employeeId')
    .populate('transaction', 'fromAccountNumber toAccountNumber type')
    .sort({ createdAt: -1 });

  res.json({
    approvals: approvals.map(serializeApproval),
  });
};

const updateApproval = async (req, res) => {
  const { status } = req.body;
  const rejectionReason =
    typeof req.body.rejectionReason === 'string' ? req.body.rejectionReason.trim() : '';

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Approval status must be approved or rejected' });
  }

  if (status === 'rejected' && !rejectionReason) {
    return res.status(400).json({ message: 'Rejection reason is required' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const approval = await Approval.findOne({ requestId: req.params.id })
      .populate('transaction')
      .session(session);

    if (!approval) {
      throw new Error('Approval request not found');
    }

    if (!approval.assignedManager) {
      if (req.user.role === 'manager') {
        approval.assignedManager = req.user._id;
      } else {
        const assignedManager = await User.findOne({
          role: 'manager',
          status: 'active',
        })
          .sort({ createdAt: 1 })
          .session(session);

        if (!assignedManager) {
          throw new Error('No active manager is available for approval');
        }

        approval.assignedManager = assignedManager._id;
      }
    }

    if (
      req.user.role === 'manager' &&
      approval.assignedManager &&
      String(approval.assignedManager) !== String(req.user._id)
    ) {
      throw new Error('This approval request is assigned to another manager');
    }

    if (approval.status !== 'pending') {
      throw new Error('Approval request has already been reviewed');
    }

    const transaction = approval.transaction;

    if (!transaction || transaction.status !== 'pending') {
      throw new Error('Pending transaction not found for this approval');
    }

    let customer = await User.findById(approval.customer).session(session);

    if (status === 'approved') {
      await executePendingTransaction(transaction, session);
    } else {
      transaction.status = 'failed';
      await transaction.save({ session });
      if (customer) {
        customer.pendingRequests = Math.max(0, toWholeRupees(customer.pendingRequests) - 1);
        await customer.save({ session });
      }
    }

    approval.status = status;
    approval.rejectionReason = status === 'rejected' ? rejectionReason : '';
    approval.reviewedBy = req.user._id;
    approval.reviewedAt = new Date();
    await writeSystemLog(
      {
        action: `approval.${status}`,
        message:
          status === 'rejected'
            ? `Approval ${approval.requestId} rejected by ${req.user.name}: ${rejectionReason}`
            : `Approval ${approval.requestId} approved by ${req.user.name}`,
        actor: req.user._id,
        actorName: req.user.name,
        entityType: 'Approval',
        entityId: approval.requestId,
        severity: status === 'approved' ? 'success' : 'danger',
        metadata: {
          transactionId: transaction.transactionId,
          amount: transaction.amount,
          customer: transaction.senderName,
          customerName: transaction.senderName,
          rejectionReason: status === 'rejected' ? rejectionReason : undefined,
        },
      },
      { session }
    );

    if (status === 'rejected' && customer) {
      await writeSystemLog(
        {
          action: 'approval.rejected.customer',
          message: `Your transfer of INR ${toWholeRupees(transaction.amount).toLocaleString('en-IN')} was rejected. Reason: ${rejectionReason}`,
          actor: customer._id,
          actorName: customer.name,
          entityType: 'Approval',
          entityId: approval.requestId,
          severity: 'danger',
          metadata: {
            transactionId: transaction.transactionId,
            amount: transaction.amount,
            customerName: customer.name,
            rejectionReason,
            reviewedBy: req.user.name,
          },
        },
        { session }
      );
    }
    await approval.save({ session });

    await session.commitTransaction();

    await sendApprovalDecisionEmail({
      customer,
      approval,
      transaction,
      status,
      rejectionReason,
      managerName: req.user.name,
    });

    const responseApproval = await Approval.findById(approval._id)
      .populate('customer', 'name account')
      .populate('assignedManager', 'name email employeeId')
      .populate('transaction', 'fromAccountNumber toAccountNumber type');

    res.json({
      message:
        status === 'approved'
          ? 'Transfer approved and completed'
          : 'Transfer rejected',
      approval: serializeApproval(responseApproval),
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

module.exports = { getApprovals, updateApproval };
