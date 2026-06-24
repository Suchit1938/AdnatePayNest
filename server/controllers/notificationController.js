const SystemLog = require('../models/SystemLog');
const FixedDeposit = require('../models/FixedDeposit');
const RecurringDeposit = require('../models/RecurringDeposit');

const titlesByAction = {
  'approval.created': 'Approval Escalation',
  'approval.approved': 'Manager Approved Request',
  'approval.rejected': 'Manager Rejected Request',
  'approval.rejected.customer': 'Transfer Rejected',
  'business.rules.updated': 'Business Rules Updated',
  'customer.created': 'New Customer Registered',
  'manual.message': 'Message From Admin',
  'manual.message.admin': 'Manual Message Sent',
  'loan.submitted': 'Loan Application Submitted',
  'loan.approved.customer': 'Loan Approved',
  'loan.rejected.customer': 'Loan Rejected',
  'loan.info_requested.customer': 'Loan Information Requested',
  'loan.disbursed.customer': 'Loan Disbursed',
  'loan.emi.paid': 'EMI Paid',
  'loan.emi.failed.customer': 'EMI Payment Failed',
  'loan.foreclosed.customer': 'Loan Foreclosed',
  'loan.part_payment.customer': 'Part-Payment Posted',
  'loan.part_payment.manager': 'Customer Part-Payment',
  'loan.closed.customer': 'Loan Closed',
  'fd.created.customer': 'FD Created Successfully',
  'fd.maturity_soon.customer': 'FD Maturity Reminder',
  'fd.matured.customer': 'FD Matured',
  'fd.premature_withdrawal.customer': 'FD Premature Withdrawal',
  'fd.renewed.customer': 'FD Renewed',
  'fd.maturity_credited.customer': 'Maturity Amount Credited',
  'rd.created.customer': 'RD Created Successfully',
  'rd.maturity_soon.customer': 'RD Maturity Reminder',
  'rd.installment.paid.customer': 'RD Installment Paid',
  'rd.installment.missed.customer': 'Installment Missed',
  'rd.matured.customer': 'RD Matured',
  'rd.premature_withdrawal.customer': 'RD Premature Withdrawal',
  'rd.renewed.customer': 'RD Renewed',
  'rd.maturity_credited.customer': 'Maturity Amount Credited',
  'overdraft.payoff.completed': 'Overdraft Paid Off',
  'overdraft.payoff.partial': 'Overdraft Payoff Posted',
  'overdraft.used': 'Overdraft Used',
  'overdraft.third_attempt': 'Third OD Attempt Reached',
  'tier.policy.created.manager': 'New Tier Policy Added',
  'tier.policy.updated.admin': 'Manager Updated Tier Policy',
  'tier.policy.updated.customer': 'Tier Policy Updated',
  'tier.policy.updated.manager': 'Tier Policy Updated',
};

const typeBySeverity = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

const formatTime = (value) => {
  if (!value) return 'Recently';

  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
};

const serializeNotification = (log) => ({
  id: log._id,
  title: titlesByAction[log.action] || 'System Notification',
  message: log.message,
  type: typeBySeverity[log.severity] || 'info',
  time: formatTime(log.createdAt),
  createdAt: log.createdAt,
  action: log.action,
  entityType: log.entityType,
  entityId: log.entityId,
  metadata: log.metadata || {},
});

const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const ensureMaturityReminderLogs = async (user) => {
  if (user.role !== 'customer') return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  sevenDaysFromNow.setHours(23, 59, 59, 999);

  const [fds, rds] = await Promise.all([
    FixedDeposit.find({
      customer: user._id,
      status: 'active',
      maturityDate: { $gte: today, $lte: sevenDaysFromNow },
    }),
    RecurringDeposit.find({
      customer: user._id,
      status: 'active',
      maturityDate: { $gte: today, $lte: sevenDaysFromNow },
    }),
  ]);

  const rows = [
    ...fds.map((fd) => ({
      action: 'fd.maturity_soon.customer',
      entityType: 'FixedDeposit',
      entityId: fd.fdNumber,
      message: `Your FD matures on ${formatDate(fd.maturityDate)}.`,
      metadata: {
        fdNumber: fd.fdNumber,
        maturityDate: fd.maturityDate,
        maturityAmount: fd.maturityAmount,
      },
    })),
    ...rds.map((rd) => ({
      action: 'rd.maturity_soon.customer',
      entityType: 'RecurringDeposit',
      entityId: rd.rdNumber,
      message: `Your RD matures on ${formatDate(rd.maturityDate)}.`,
      metadata: {
        rdNumber: rd.rdNumber,
        maturityDate: rd.maturityDate,
        maturityAmount: rd.maturityAmount,
      },
    })),
  ];

  await Promise.all(
    rows.map(async (row) => {
      const existing = await SystemLog.exists({
        action: row.action,
        actor: user._id,
        entityId: row.entityId,
      });

      if (existing) return null;

      return SystemLog.create({
        ...row,
        actor: user._id,
        actorName: user.name,
        recipient: user._id,
        severity: 'warning',
      });
    })
  );
};

const getNotifications = async (req, res) => {
  await ensureMaturityReminderLogs(req.user);

  const adminActions = [
    'approval.created',
    'approval.approved',
    'approval.rejected',
    'business.rules.updated',
    'customer.created',
    'manual.message.admin',
    'overdraft.payoff.completed',
    'overdraft.payoff.partial',
    'overdraft.third_attempt',
    'tier.policy.updated.admin',
  ];
  const filter = req.user.role === 'admin'
    ? { action: { $in: adminActions } }
    : req.user.role === 'manager'
      ? { $or: [{ recipient: req.user._id }, { actor: req.user._id }] }
      : { actor: req.user._id, action: { $ne: 'loan.part_payment.manager' } };

  const logs = await SystemLog.find(filter).sort({ createdAt: -1 }).limit(50);

  res.json({
    notifications: logs.map(serializeNotification),
  });
};

module.exports = { getNotifications };
