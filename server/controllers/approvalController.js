const mongoose = require('mongoose');

const Approval = require('../models/Approval');
const BankAccount = require('../models/BankAccount');
const Tier = require('../models/Tier');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { ensureBankAccountsForUser } = require('../utils/customerAccounts');
const { DEFAULT_MONTHLY_OD_USES, getAccountTypeOdRule } = require('../utils/accountTypeOdPolicy');
const { sendEmail } = require('../utils/email');
const { writeSystemLog } = require('../utils/systemLog');

const toWholeRupees = (value) => Math.round(Number(value || 0));
const formatMoney = (value) => `INR ${toWholeRupees(value).toLocaleString('en-IN')}`;
const maskAccount = (value) => {
  const account = String(value || '');
  if (account.length <= 4) return account;
  return `XXXX${account.slice(-4)}`;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sendDetailedTransferEmail = async ({
  to,
  subject,
  greetingName,
  intro,
  amountLabel,
  amount,
  details,
  balanceRows,
}) => {
  if (!to) return null;

  const detailLines = details.filter(Boolean);
  const balanceLines = balanceRows.filter(Boolean);
  const text = [
    `Hello ${greetingName},`,
    intro,
    `${amountLabel}: ${formatMoney(amount)}`,
    '',
    'Transaction details:',
    ...detailLines.map((line) => `- ${line.label}: ${line.value}`),
    '',
    'Balance tracking:',
    ...balanceLines.map((line) => `- ${line.label}: ${line.value}`),
    '',
    'Regards,',
    'Adnate PayNest',
  ].join('\n');

  const makeRows = (rows) =>
    rows
      .map(
        (line) => `
          <tr>
            <td style="padding:8px 10px;color:#64748b;border-bottom:1px solid #e2e8f0;">${escapeHtml(line.label)}</td>
            <td style="padding:8px 10px;color:#0f172a;font-weight:700;border-bottom:1px solid #e2e8f0;">${escapeHtml(line.value)}</td>
          </tr>`
      )
      .join('');

  return sendEmail({
    to,
    subject,
    text,
    html: `
      <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:22px;color:#0f172a;">
        <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
          <div style="background:#0f172a;color:#ffffff;padding:18px 22px;">
            <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#bfdbfe;">AdnatePayNest Transaction Alert</p>
            <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;">${escapeHtml(subject)}</h1>
          </div>
          <div style="padding:22px;">
            <p style="margin:0 0 10px;">Hello ${escapeHtml(greetingName)},</p>
            <p style="margin:0 0 16px;color:#334155;line-height:1.6;">${escapeHtml(intro)}</p>
            <div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin:18px 0;">
              <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#047857;font-weight:700;">${escapeHtml(amountLabel)}</div>
              <div style="font-size:28px;line-height:1.25;color:#047857;font-weight:800;margin-top:4px;">${escapeHtml(formatMoney(amount))}</div>
            </div>
            <h2 style="font-size:16px;margin:20px 0 8px;color:#0f172a;">Transaction Details</h2>
            <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">${makeRows(detailLines)}</table>
            <h2 style="font-size:16px;margin:22px 0 8px;color:#0f172a;">Balance Tracking</h2>
            <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">${makeRows(balanceLines)}</table>
            <p style="margin:18px 0 0;color:#475569;line-height:1.6;">This balance view is specific to your account for this transaction.</p>
            <p style="margin:18px 0 0;">Regards,<br /><strong>Team AdnatePayNest</strong></p>
          </div>
        </div>
      </div>
    `,
  });
};

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

const sendApprovedTransferEmails = async ({ transaction, approval, managerName, executionSummary }) => {
  const [sender, receiver] = await Promise.all([
    User.findById(transaction.sender).select('name email'),
    User.findById(transaction.receiver).select('name email'),
  ]);

  return Promise.all([
    sender?.email
      ? sendDetailedTransferEmail({
        to: sender.email,
        subject: 'Transfer approved and completed',
        greetingName: sender.name,
        intro: `Your transfer to ${transaction.receiverName} was approved by ${managerName} and completed successfully.`,
        amountLabel: 'Amount Debited',
        amount: transaction.amount,
        details: [
          { label: 'Transaction ID', value: transaction.transactionId },
          { label: 'Approval ID', value: approval.requestId },
          { label: 'Reviewed by', value: managerName },
          { label: 'Receiver', value: transaction.receiverName },
          { label: 'From account', value: maskAccount(transaction.fromAccountNumber) },
          { label: 'To account', value: maskAccount(transaction.toAccountNumber) },
          { label: 'Remarks', value: transaction.remarks || 'Bank transfer' },
        ],
        balanceRows: [
          { label: 'Opening wallet balance', value: formatMoney(executionSummary?.senderOpeningBalance) },
          { label: 'Amount debited', value: `- ${formatMoney(transaction.amount)}` },
          executionSummary?.overdraftNeeded > 0
            ? { label: 'Overdraft used in this transfer', value: formatMoney(executionSummary.overdraftNeeded) }
            : null,
          { label: 'Closing wallet balance', value: formatMoney(executionSummary?.senderClosingBalance) },
          { label: 'Total overdraft outstanding', value: formatMoney(executionSummary?.senderOverdraftUsed) },
        ],
      })
      : null,
    receiver?.email
      ? sendDetailedTransferEmail({
        to: receiver.email,
        subject: 'Amount credited to your account',
        greetingName: receiver.name,
        intro: `You have received a credit from ${transaction.senderName}.`,
        amountLabel: 'Amount Credited',
        amount: transaction.amount,
        details: [
          { label: 'Transaction ID', value: transaction.transactionId },
          { label: 'Approval ID', value: approval.requestId },
          { label: 'Sender', value: transaction.senderName },
          { label: 'From account', value: maskAccount(transaction.fromAccountNumber) },
          { label: 'Credited account', value: maskAccount(transaction.toAccountNumber) },
          { label: 'Remarks', value: transaction.remarks || 'Bank transfer' },
        ],
        balanceRows: [
          { label: 'Opening wallet balance', value: formatMoney(executionSummary?.receiverOpeningBalance) },
          { label: 'Amount credited', value: `+ ${formatMoney(transaction.amount)}` },
          { label: 'Closing wallet balance', value: formatMoney(executionSummary?.receiverClosingBalance) },
        ],
      })
      : null,
  ]);
};
const getCurrentMonthKey = () => new Date().toISOString().slice(0, 7);
const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);
const getCurrentMonthOdCount = (bankAccount) =>
  bankAccount.odCountMonthKey === getCurrentMonthKey()
    ? toWholeRupees(bankAccount.odCountThisMonth)
    : 0;
const isCurrentMonthOdBlocked = (bankAccount) =>
  bankAccount.odCountMonthKey === getCurrentMonthKey() && Boolean(bankAccount.odBlocked);

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
    odDrawdowns: bankAccount.odDrawdowns || [],
    odCountThisMonth: getCurrentMonthOdCount(bankAccount),
    odBlocked: isCurrentMonthOdBlocked(bankAccount),
  };

  user.accounts = (user.accounts || []).map((account) =>
    account.accountNumber === bankAccount.accountNumber
      ? { ...(account.toObject?.() || account), ...nextSnapshot }
      : account
  );

};

const serializeApproval = (approval) => ({
  id: approval.requestId,
  customer: approval.customer?.name,
  manager: approval.assignedManager?.name || approval.reviewedBy?.name,
  managerEmail: approval.assignedManager?.email || approval.reviewedBy?.email,
  managerEmployeeId: approval.assignedManager?.employeeId || approval.reviewedBy?.employeeId,
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
  const senderTier = await Tier.findOne({ name: sender.classification }).session(session);
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
  const senderOpeningBalance = currentBalance;
  const receiverOpeningBalance = toWholeRupees(receiverBankAccount.walletBalance);

  if (overdraftNeeded > 0) {
    refreshMonthlyOverdraftCounter(senderBankAccount);
  }

  if (
    overdraftNeeded > 0 &&
    (senderBankAccount.odBlocked ||
      toWholeRupees(senderBankAccount.odCountThisMonth) >= monthlyOdUses)
  ) {
    throw new Error(`Monthly overdraft attempt limit reached for this ${senderBankAccount.accountType} account. Customer can use overdraft only ${monthlyOdUses} times in a month`);
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
    const usedAt = new Date();
    senderBankAccount.odStartedAt = senderBankAccount.odStartedAt || usedAt;
    senderBankAccount.odDrawdowns = [
      ...(senderBankAccount.odDrawdowns || []),
      { amount: overdraftNeeded, usedAt },
    ];
    senderBankAccount.odCountThisMonth = toWholeRupees(senderBankAccount.odCountThisMonth) + 1;
    senderBankAccount.odCountMonthKey = getCurrentMonthKey();
    senderBankAccount.odBlocked = senderBankAccount.odCountThisMonth >= monthlyOdUses;
  }

  receiverBankAccount.walletBalance = receiverOpeningBalance + transferAmount;
  receiverBankAccount.availableBalance =
    toWholeRupees(receiverBankAccount.availableBalance) + transferAmount;

  sender.totalTransfers = toWholeRupees(sender.totalTransfers) + 1;
  sender.pendingRequests = Math.max(0, toWholeRupees(sender.pendingRequests) - 1);

  syncUserAccountSnapshot(sender, senderBankAccount);
  syncUserAccountSnapshot(receiver, receiverBankAccount);

  transaction.status = 'success';

  if (overdraftNeeded > 0 && senderBankAccount.odCountThisMonth >= 3) {
    await writeSystemLog(
      {
        action: 'overdraft.third_attempt',
        message: `${sender.name} has used overdraft ${senderBankAccount.odCountThisMonth} times this month on ${senderBankAccount.accountType} account. Monthly OD usage is now blocked until next month.`,
        actor: sender._id,
        actorName: sender.name,
        entityType: 'Transaction',
        entityId: transaction.transactionId,
        severity: 'warning',
        metadata: {
          customerId: sender.customerId,
          amount: transferAmount,
          overdraftUsed: nextOverdraftUsed,
          accountType: senderBankAccount.accountType,
          accountNumber: senderBankAccount.accountNumber,
          odCountThisMonth: senderBankAccount.odCountThisMonth,
          source: 'manager-approved-transfer',
        },
      },
      { session }
    );
  } else if (overdraftNeeded > 0) {
    await writeSystemLog(
      {
        action: 'overdraft.used',
        message: `${sender.name} used ${formatMoney(overdraftNeeded)} overdraft from ${senderBankAccount.accountType} account for manager-approved transfer ${transaction.transactionId}. OD usage count this month: ${senderBankAccount.odCountThisMonth}.`,
        actor: sender._id,
        actorName: sender.name,
        entityType: 'Transaction',
        entityId: transaction.transactionId,
        severity: 'warning',
        metadata: {
          customerId: sender.customerId,
          amount: transferAmount,
          overdraftUsed: nextOverdraftUsed,
          overdraftNeeded,
          accountType: senderBankAccount.accountType,
          accountNumber: senderBankAccount.accountNumber,
          odCountThisMonth: senderBankAccount.odCountThisMonth,
          source: 'manager-approved-transfer',
        },
      },
      { session }
    );
  }

  await Promise.all([
    senderBankAccount.save({ session }),
    receiverBankAccount.save({ session }),
  ]);
  await sender.save({ session });
  await receiver.save({ session });
  await transaction.save({ session });

  return {
    senderOpeningBalance,
    senderClosingBalance: senderBankAccount.walletBalance,
    senderOverdraftUsed: senderBankAccount.odUsed,
    receiverOpeningBalance,
    receiverClosingBalance: receiverBankAccount.walletBalance,
    overdraftNeeded,
  };
};

const getApprovals = async (req, res) => {
  const filter =
    req.user.role === 'manager'
      ? { $or: [{ assignedManager: req.user._id }, { assignedManager: { $exists: false } }] }
      : {};
  const approvals = await Approval.find(filter)
    .populate('customer', 'name account')
    .populate('assignedManager', 'name email employeeId')
    .populate('reviewedBy', 'name email employeeId')
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
    let executionSummary = null;

    if (!transaction || transaction.status !== 'pending') {
      throw new Error('Pending transaction not found for this approval');
    }

    let customer = await User.findById(approval.customer).session(session);

    if (status === 'approved') {
      executionSummary = await executePendingTransaction(transaction, session);
    } else {
      transaction.status = 'failed';
      transaction.failureReason = rejectionReason;
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

    if (status === 'approved') {
      await sendApprovedTransferEmails({
        transaction,
        approval,
        managerName: req.user.name,
        executionSummary,
      });
    } else {
      await sendApprovalDecisionEmail({
        customer,
        approval,
        transaction,
        status,
        rejectionReason,
        managerName: req.user.name,
      });
    }

    const responseApproval = await Approval.findById(approval._id)
      .populate('customer', 'name account')
      .populate('assignedManager', 'name email employeeId')
      .populate('reviewedBy', 'name email employeeId')
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
