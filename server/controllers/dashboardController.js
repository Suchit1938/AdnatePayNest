const SystemLog = require('../models/SystemLog');
const Transaction = require('../models/Transaction');
const BankAccount = require('../models/BankAccount');
const User = require('../models/User');

const toWholeRupees = (value) => Math.round(Number(value || 0));

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
    bankAccounts,
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
        action: {
          $in: [
            'approval.approved',
            'approval.rejected',
            'customer.created',
            'transfer.completed',
            'transfer.own_account.completed',
          ],
        },
      })
        .sort({ createdAt: -1 })
        .limit(20),
    ]);

  const customerById = new Map(
    customers.map((customer) => [customer.customerId, customer])
  );
  const accountsByCustomerId = bankAccounts.reduce((map, account) => {
    if (!map.has(account.customerId)) {
      map.set(account.customerId, []);
    }

    map.get(account.customerId).push(account);
    return map;
  }, new Map());

  const overdraftCustomers = customers
    .map((customer) => {
      const accounts = accountsByCustomerId.get(customer.customerId) || [];
      const limitCandidates = [
        customer.account?.overdraftLimit,
        ...(customer.accounts || []).map((account) => account.overdraftLimit),
        ...accounts.map((account) => account.odLimit),
      ];
      const usedCandidates = [
        customer.account?.overdraftUsed,
        ...(customer.accounts || []).map((account) => account.overdraftUsed),
        ...accounts.map((account) => account.odUsed),
      ];
      const totalLimit = Math.max(0, ...limitCandidates.map(toWholeRupees));
      const used = Math.max(0, ...usedCandidates.map(toWholeRupees));
      const available = Math.max(0, totalLimit - used);
      const utilization = totalLimit > 0 ? Math.round((used / totalLimit) * 100) : 0;
      const odAttempts = Math.max(
        0,
        ...accounts.map((account) => toWholeRupees(account.odCountThisMonth))
      );
      const isBlocked = accounts.some((account) => account.odBlocked);
      const risk =
        isBlocked || utilization >= 90
          ? 'critical'
          : utilization >= 70
            ? 'high'
            : used > 0
              ? 'active'
              : 'unused';

      return {
        id: customer._id,
        customerId: customer.customerId,
        customer: customer.name,
        email: customer.email,
        classification: customer.classification || 'unassigned',
        status: customer.status,
        account: accounts[0]?.accountNumber || customer.account?.accountNumber,
        accountType: accounts[0]?.accountType || customer.account?.accountType || 'Account',
        accountCount: accounts.length || (customer.accounts || []).length || 1,
        limit: totalLimit,
        used,
        available,
        utilization,
        odAttempts,
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

  const recentOverdraftActivity = odActivityTransactions.map((transaction) => {
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
  const overdraftPayoffTransactions = payoffTransactions.map((transaction) => ({
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
    .filter(
      (account) =>
        account.odCountMonthKey === currentMonthKey &&
        toWholeRupees(account.odCountThisMonth) >= 3
    )
    .reduce((map, account) => {
      if (!map.has(account.customerId)) {
        const customer = customerById.get(account.customerId);
        map.set(account.customerId, {
          id: `OD3-${account.customerId}`,
          title: `${customer?.name || account.customerId} has used overdraft 3 times this month`,
          amount: account.odUsed || 0,
          severity: 'warning',
          time: 'Current month',
          metadata: {
            customerId: account.customerId,
            accountNumber: account.accountNumber,
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
    transactions: allTransactions.map((transaction) => ({
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
