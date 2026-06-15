const SystemLog = require('../models/SystemLog');
const Transaction = require('../models/Transaction');
const BankAccount = require('../models/BankAccount');
const Tier = require('../models/Tier');
const User = require('../models/User');
const {
  DEFAULT_MONTHLY_OD_USES,
  getAccountTypeOdRule,
  getAccountTypeOdRules,
} = require('../utils/accountTypeOdPolicy');

const toWholeRupees = (value) => Math.round(Number(value || 0));

const serializeTierPolicy = (tier) => ({
  id: tier._id,
  key: tier.name,
  label: tier.label,
  perTxnLimit: tier.perTxnLimit,
  dailyLimit: tier.dailyLimit,
  monthlyLimit: tier.monthlyLimit,
  maxODLimit: tier.maxODLimit,
  accountTypeOdRules: getAccountTypeOdRules(tier),
  minBalance: tier.minBalance,
  penaltyAmount: tier.penaltyAmount,
  interestRate: tier.lateFeeRate,
  eligibility: tier.eligibility,
  reviewNotes: tier.reviewNotes,
  updatedAt: tier.updatedAt,
});

const getCustomerNameFromLog = (log) => {
  const metadata = log.metadata || {};

  if (metadata.customerName || metadata.customer) {
    return metadata.customerName || metadata.customer;
  }

  if (log.actor?.role === 'customer') {
    return log.actor.name;
  }

  const customerMatch = String(log.message || '').match(
    /(?:New customer|for|from)\s+([A-Za-z][A-Za-z ]+?)(?:\s+(?:registered|to|has|of|above)|$)/
  );

  return customerMatch?.[1]?.trim() || '';
};

const serializeLog = (log) => {
  const metadata = log.metadata || {};

  return {
    id: log._id,
    action: log.action,
    message: log.message,
    actor: log.actorName || log.actor?.name,
    actorRole: log.actor?.role || '',
    customerName: getCustomerNameFromLog(log),
    entityType: log.entityType,
    entityId: log.entityId,
    severity: log.severity,
    amount: metadata.amount || 0,
    transactionId: metadata.transactionId || '',
    fromAccountNumber: metadata.fromAccountNumber || '',
    toAccountNumber: metadata.toAccountNumber || '',
    metadata,
    createdAt: log.createdAt,
    time: log.createdAt ? new Date(log.createdAt).toLocaleString() : 'Recently',
  };
};

const getAdminLogs = async (req, res) => {
  const logs = await SystemLog.find()
    .populate('actor', 'name email role')
    .sort({ createdAt: -1 })
    .limit(10);

  res.json({ logs: logs.map(serializeLog) });
};

const getAdminActivity = async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const transactions = await Transaction.find({
    createdAt: { $gte: startOfDay },
  }).select('createdAt');
  const buckets = Array(8).fill(0);

  transactions.forEach((transaction) => {
    const hour = new Date(transaction.createdAt).getHours();
    const bucketIndex = Math.min(7, Math.floor(hour / 3));
    buckets[bucketIndex] += 1;
  });

  const maxBucket = Math.max(...buckets, 1);
  const activityPoints = buckets.map((count) =>
    count === 0 ? 0 : Math.max(12, Math.round((count / maxBucket) * 100))
  );

  res.json({ activityPoints });
};

const getManagerDashboard = async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const currentMonthKey = new Date().toISOString().slice(0, 7);

  const [
    customers,
    tierPolicies,
    fetchedBankAccounts,
    transactionsToday,
    odActivityTransactions,
    allTransactions,
    payoffTransactions,
    escalationLogs,
    notificationLogs,
  ] =
    await Promise.all([
      User.find({ role: 'customer' }).select(
        'name email customerId classification account accounts status'
      ),
      Tier.find().sort({ createdAt: -1, _id: -1 }),
      BankAccount.find().sort({ odUsed: -1, updatedAt: -1 }),
      Transaction.countDocuments({ createdAt: { $gte: startOfDay } }),
      Transaction.find({
        $or: [{ type: 'overdraft-payoff' }, { remarks: /overdraft|OD/i }],
      })
        .sort({ createdAt: -1 })
        .limit(8),
      Transaction.find()
        .populate('sender', 'name customerId email role')
        .populate('receiver', 'name customerId email role')
        .sort({ createdAt: -1 })
        .limit(100),
      Transaction.find({ type: 'overdraft-payoff' })
        .populate('sender', 'name customerId email')
        .sort({ createdAt: -1 })
        .limit(25),
      SystemLog.find({
        action: { $in: ['overdraft.third_attempt'] },
      })
        .sort({ createdAt: -1 })
        .limit(12),
      SystemLog.find({
        $or: [
          {
            action: {
              $in: [
                'approval.approved',
                'approval.rejected',
                'customer.created',
                'transfer.completed',
                'transfer.own_account.completed',
              ],
            },
          },
          {
            action: {
              $in: ['manual.message', 'tier.policy.created.manager', 'tier.policy.updated.manager'],
            },
            actor: req.user._id,
          },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(20),
    ]);

  const customerById = new Map(
    customers.map((customer) => [customer.customerId, customer])
  );
  const validCustomerIds = new Set(customers.map((customer) => customer.customerId).filter(Boolean));
  const validCustomerObjectIds = new Set(customers.map((customer) => String(customer._id)));
  const bankAccounts = fetchedBankAccounts.filter((account) =>
    validCustomerIds.has(account.customerId)
  );
  const hasExistingCustomer = (transaction) =>
    validCustomerObjectIds.has(String(transaction.sender)) ||
    validCustomerObjectIds.has(String(transaction.receiver)) ||
    validCustomerObjectIds.has(String(transaction.sender?._id)) ||
    validCustomerObjectIds.has(String(transaction.receiver?._id));
  const visibleOdActivityTransactions = odActivityTransactions.filter(hasExistingCustomer);
  const visiblePayoffTransactions = payoffTransactions.filter(hasExistingCustomer);
  const visibleTransactions = allTransactions.filter(hasExistingCustomer);
  const tierByName = new Map(tierPolicies.map((tier) => [tier.name, tier]));
  const accountsByCustomerId = bankAccounts.reduce((map, account) => {
    if (!map.has(account.customerId)) {
      map.set(account.customerId, []);
    }

    map.get(account.customerId).push(account);
    return map;
  }, new Map());

  const overdraftCustomers = bankAccounts
    .map((account) => {
      const customer = customerById.get(account.customerId);
      const accountRule = getAccountTypeOdRule(
        tierByName.get(customer?.classification),
        account.accountType
      );
      const limit = toWholeRupees(account.odLimit);
      const used = toWholeRupees(account.odUsed);
      const available = Math.max(0, limit - used);
      const utilization = limit > 0 ? Math.round((used / limit) * 100) : 0;
      const odAttempts = toWholeRupees(account.odCountThisMonth);
      const isBlocked = Boolean(account.odBlocked);
      const risk =
        isBlocked || utilization >= 90
          ? 'critical'
          : utilization >= 70
            ? 'high'
            : used > 0
              ? 'active'
              : 'unused';

      return {
        id: account._id,
        customerId: account.customerId,
        customer: customer?.name || account.customerId,
        email: customer?.email,
        classification: customer?.classification || 'unassigned',
        status: customer?.status || account.accountStatus,
        account: account.accountNumber,
        accountType: account.accountType || 'Account',
        accountCount: (accountsByCustomerId.get(account.customerId) || []).length || 1,
        limit,
        used,
        available,
        utilization,
        odAttempts,
        monthlyOdUses: accountRule?.monthlyOdUses ?? DEFAULT_MONTHLY_OD_USES,
        isBlocked,
        risk,
      };
    })
    .filter((row) => row.limit > 0 || row.used > 0)
    .sort((left, right) => right.used - left.used);

  const totalOdLimit = overdraftCustomers.reduce((sum, row) => sum + row.limit, 0);
  const utilizedOd = overdraftCustomers.reduce((sum, row) => sum + row.used, 0);
  const odPercent =
    totalOdLimit > 0 ? Math.round((utilizedOd / totalOdLimit) * 100) : 0;
  const activeOdCustomers = overdraftCustomers.filter((row) => row.used > 0);
  const criticalOdCustomers = overdraftCustomers.filter(
    (row) => row.risk === 'critical' || row.risk === 'high'
  );
  const averageUtilization =
    overdraftCustomers.length > 0
      ? Math.round(
        overdraftCustomers.reduce((sum, row) => sum + row.utilization, 0) /
          overdraftCustomers.length
      )
      : 0;

  const riskCounts = ['critical', 'high', 'active', 'unused'].map((risk) => ({
    label: risk,
    value: overdraftCustomers.filter((row) => row.risk === risk).length,
  }));

  const exposureByAccountType = Array.from(
    overdraftCustomers.reduce((map, row) => {
      const key = row.accountType || 'Account';
      map.set(key, (map.get(key) || 0) + row.used);
      return map;
    }, new Map()),
    ([label, value]) => ({ label, value })
  ).sort((left, right) => right.value - left.value);

  const odUtilizers = overdraftCustomers
    .filter((row) => row.used > 0)
    .slice(0, 6)
    .map((row) => ({
      customer: row.customer,
      used: row.used,
      limit: row.limit,
      utilization: row.utilization,
      count: row.odAttempts,
      risk: row.risk,
    }));

  const recentOverdraftActivity = visibleOdActivityTransactions.map((transaction) => {
    const customer =
      customers.find((item) => String(item._id) === String(transaction.sender));

    return {
      id: transaction.transactionId,
      customer: customer?.name || transaction.senderName,
      type: transaction.type,
      amount: transaction.amount,
      status: transaction.status,
      createdAt: transaction.createdAt,
    };
  });
  const overdraftPayoffTransactions = visiblePayoffTransactions.map((transaction) => ({
    id: transaction.transactionId,
    customer: transaction.sender?.name || transaction.senderName,
    customerId: transaction.sender?.customerId,
    email: transaction.sender?.email,
    fromAccountNumber: transaction.fromAccountNumber,
    amount: transaction.amount,
    status: transaction.status,
    remarks: transaction.remarks,
    createdAt: transaction.createdAt,
  }));
  const thirdOdEscalationsByCustomer = bankAccounts
    .filter((account) => {
      const customer = customerById.get(account.customerId);
      const accountRule = getAccountTypeOdRule(
        tierByName.get(customer?.classification),
        account.accountType
      );
      const monthlyOdUses = accountRule?.monthlyOdUses ?? DEFAULT_MONTHLY_OD_USES;

      return (
        account.odCountMonthKey === currentMonthKey &&
        toWholeRupees(account.odCountThisMonth) >= monthlyOdUses
      );
    })
    .reduce((map, account) => {
      if (!map.has(account.customerId)) {
        const customer = customerById.get(account.customerId);
        map.set(account.customerId, {
          id: `OD3-${account.customerId}`,
          title: `${customer?.name || account.customerId} ${account.accountType} account reached monthly overdraft use limit`,
          amount: account.odUsed || 0,
          severity: 'warning',
          time: 'Current month',
          metadata: {
            customerId: account.customerId,
            accountNumber: account.accountNumber,
            accountType: account.accountType,
            odCountThisMonth: account.odCountThisMonth,
            odBlocked: account.odBlocked,
          },
        });
      }

      return map;
    }, new Map());
  const thirdOdEscalations = Array.from(thirdOdEscalationsByCustomer.values());

  res.json({
    stats: {
      pendingApprovals: 0,
      highValueTransactions: 0,
      odCases: activeOdCustomers.length,
      transactionsToday,
      odPercent,
      totalOdLimit,
      utilizedOd,
      availableOd: Math.max(0, totalOdLimit - utilizedOd),
      averageOdUtilization: averageUtilization,
      criticalOdCustomers: criticalOdCustomers.length,
      recentAlertCount: notificationLogs.length,
      notificationCount: notificationLogs.length,
    },
    profile: {
      name: req.user.name,
      role: 'Manager',
      branch: req.user.branchName || req.user.branch,
      assignedRegion: req.user.assignedRegion,
      employeeId: req.user.employeeId,
    },
    odUtilizers,
    overdraftCustomers,
    overdraftRisk: riskCounts,
    overdraftExposureByType: exposureByAccountType,
    tierPolicies: tierPolicies.map(serializeTierPolicy),
    recentOverdraftActivity,
    overdraftPayoffTransactions,
    escalations: [
      ...thirdOdEscalations,
      ...escalationLogs.map((log) => ({
        id: log._id,
        title: log.message,
        amount: log.metadata?.amount || 0,
        severity: log.severity,
        time: log.createdAt ? new Date(log.createdAt).toLocaleString() : 'Recently',
        metadata: log.metadata || {},
      })),
    ],
    transactions: visibleTransactions.map((transaction) => ({
      id: transaction.transactionId,
      customer: transaction.sender?.name || transaction.senderName,
      customerId: transaction.sender?.customerId,
      receiver: transaction.receiver?.name || transaction.receiverName,
      fromAccountNumber: transaction.fromAccountNumber,
      toAccountNumber: transaction.toAccountNumber,
      type: transaction.type,
      amount: transaction.amount,
      status: transaction.status,
      remarks: transaction.remarks,
      createdAt: transaction.createdAt,
    })),
    notifications: notificationLogs.map((log) => ({
      id: log._id,
      title: log.action
        .split('.')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
      message: log.message,
      type: log.severity,
      action: log.action,
      amount: log.metadata?.amount || 0,
      time: log.createdAt ? new Date(log.createdAt).toLocaleString() : 'Recently',
      metadata: log.metadata || {},
    })),
  });
};

module.exports = { getAdminActivity, getAdminLogs, getManagerDashboard };
