const SystemLog = require('../models/SystemLog');
const Transaction = require('../models/Transaction');
const BankAccount = require('../models/BankAccount');
const Loan = require('../models/Loan');
const Tier = require('../models/Tier');
const User = require('../models/User');
const {
  DEFAULT_MONTHLY_OD_USES,
  getAccountTypeOdRule,
  getAccountTypeOdRules,
} = require('../utils/accountTypeOdPolicy');

const toWholeRupees = (value) => Math.round(Number(value || 0));
const ACTIVE_LOAN_STATUSES = ['approved', 'disbursed'];
const DELINQUENT_EMI_STATUSES = ['missed', 'overdue'];

const getLoanOutstandingPrincipal = (loan) => {
  if (loan.status === 'closed') return 0;

  const paidPrincipal = (loan.repaymentHistory || []).reduce(
    (sum, entry) => sum + toWholeRupees(entry.status === 'success' ? entry.principalPaid : 0),
    0
  );
  const calculatedPrincipal = Math.max(0, toWholeRupees(loan.amount) - paidPrincipal);
  const storedPrincipal = Math.max(0, toWholeRupees(loan.outstandingPrincipal));

  return storedPrincipal > 0 || paidPrincipal > 0 ? storedPrincipal : calculatedPrincipal;
};

const monthKeyFromDate = (value) => {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) return 'Unscheduled';

  return date.toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
  });
};

const serializeLoanAnalyticsRow = (loan) => {
  const outstandingPrincipal = getLoanOutstandingPrincipal(loan);
  const accruedInterest = toWholeRupees(loan.accruedInterest);
  const accruedPenalty = toWholeRupees(loan.accruedPenalty);
  const paidAmount = (loan.repaymentHistory || []).reduce(
    (sum, entry) => sum + toWholeRupees(entry.status === 'success' ? entry.amount : 0),
    0
  );
  const delinquentEmis = (loan.amortizationSchedule || []).filter((row) =>
    DELINQUENT_EMI_STATUSES.includes(row.status)
  );
  const nextDueEmi = (loan.amortizationSchedule || []).find((row) =>
    ['pending', 'missed', 'overdue', 'part_paid'].includes(row.status)
  );

  return {
    id: loan.loanId,
    customerName: loan.customer?.name || 'Customer',
    customerCode: loan.customer?.customerId || '',
    loanType: loan.loanType,
    loanTypeLabel: loan.loanTypeLabel || loan.loanType,
    status: loan.status,
    amount: toWholeRupees(loan.amount),
    emiAmount: toWholeRupees(loan.emiAmount),
    tenureMonths: toWholeRupees(loan.tenureMonths),
    outstandingPrincipal,
    accruedInterest,
    accruedPenalty,
    outstandingBalance: outstandingPrincipal + accruedInterest + accruedPenalty,
    totalRepayment: toWholeRupees(loan.totalRepayment),
    paidAmount,
    delinquentEmiCount: delinquentEmis.length,
    delinquentAmount: delinquentEmis.reduce((sum, row) => sum + toWholeRupees(row.emiAmount), 0),
    nextDueDate: nextDueEmi?.dueDate,
    disbursedAt: loan.disbursedAt,
    closedAt: loan.closedAt,
    createdAt: loan.createdAt,
    updatedAt: loan.updatedAt,
  };
};

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

const getAdminLoanAnalytics = async (req, res) => {
  const loans = await Loan.find()
    .populate('customer', 'name customerId classification')
    .sort({ createdAt: -1 });
  const loanRows = loans.map(serializeLoanAnalyticsRow);
  const repaymentRows = loans.flatMap((loan) =>
    (loan.repaymentHistory || []).map((entry, index) => ({
      id: `${loan.loanId}-${entry.transactionId || index}`,
      loanId: loan.loanId,
      customerName: loan.customer?.name || 'Customer',
      customerCode: loan.customer?.customerId || '',
      loanType: loan.loanType,
      loanTypeLabel: loan.loanTypeLabel || loan.loanType,
      paymentType: entry.paymentType,
      amount: toWholeRupees(entry.amount),
      principalPaid: toWholeRupees(entry.principalPaid),
      interestPaid: toWholeRupees(entry.interestPaid),
      penaltyPaid: toWholeRupees(entry.penaltyPaid),
      foreclosureFeePaid: toWholeRupees(entry.foreclosureFeePaid),
      status: entry.status,
      transactionId: entry.transactionId || '',
      accountNumber: entry.accountNumber || '',
      paidAt: entry.paidAt,
      remarks: entry.remarks || '',
    }))
  );
  const emiRows = loans.flatMap((loan) =>
    (loan.amortizationSchedule || []).map((row) => ({
      loanId: loan.loanId,
      customerName: loan.customer?.name || 'Customer',
      customerCode: loan.customer?.customerId || '',
      loanType: loan.loanType,
      loanTypeLabel: loan.loanTypeLabel || loan.loanType,
      emiNumber: row.emiNumber,
      dueDate: row.dueDate,
      emiAmount: toWholeRupees(row.emiAmount),
      principalComponent: toWholeRupees(row.principalComponent),
      interestComponent: toWholeRupees(row.interestComponent),
      outstandingBalance: toWholeRupees(row.outstandingBalance),
      status: row.status,
      penaltyAmount: toWholeRupees(row.penaltyAmount),
      paidAt: row.paidAt,
    }))
  );
  const activeLoans = loanRows.filter((loan) => ACTIVE_LOAN_STATUSES.includes(loan.status));
  const delinquentRows = loanRows.filter((loan) => loan.delinquentEmiCount > 0);
  const collectedAmount = repaymentRows.reduce(
    (sum, row) => sum + toWholeRupees(row.status === 'success' ? row.amount : 0),
    0
  );
  const expectedEmiAmount = emiRows
    .filter((row) => row.status !== 'foreclosed')
    .reduce((sum, row) => sum + toWholeRupees(row.emiAmount), 0);

  res.json({
    summary: {
      totalLoans: loanRows.length,
      activeLoans: activeLoans.length,
      disbursedLoans: loanRows.filter((loan) => loan.status === 'disbursed').length,
      outstandingBalance: activeLoans.reduce((sum, loan) => sum + loan.outstandingBalance, 0),
      repaymentCount: repaymentRows.length,
      delinquentAccounts: delinquentRows.length,
      delinquentAmount: delinquentRows.reduce((sum, loan) => sum + loan.delinquentAmount, 0),
      expectedEmiAmount,
      collectedAmount,
      collectionRate:
        expectedEmiAmount > 0 ? Math.round((collectedAmount / expectedEmiAmount) * 100) : 0,
    },
    loanRows,
    repaymentRows,
    emiRows,
    delinquentRows,
    distributionRows: ['personal', 'home', 'vehicle', 'education'].map((loanType) => ({
      label: loanType.charAt(0).toUpperCase() + loanType.slice(1),
      value: loanRows.filter((loan) => loan.loanType === loanType).length,
    })),
    statusRows: ['submitted', 'under_review', 'approved', 'rejected', 'disbursed', 'closed'].map(
      (status) => ({
        label: status.replaceAll('_', ' '),
        value: loanRows.filter((loan) => loan.status === status).length,
      })
    ),
    emiTrendRows: Array.from(
      emiRows.reduce((map, row) => {
        const key = monthKeyFromDate(row.dueDate);
        const current = map.get(key) || { label: key, due: 0, collected: 0, delinquent: 0 };
        const collectedForEmi = repaymentRows
          .filter(
            (entry) =>
              entry.loanId === row.loanId &&
              entry.status === 'success' &&
              (entry.paymentType === 'emi' || entry.paymentType === 'auto_emi') &&
              monthKeyFromDate(entry.paidAt) === key
          )
          .reduce((sum, entry) => sum + entry.amount, 0);

        current.due += row.emiAmount;
        current.collected += collectedForEmi;
        current.delinquent += DELINQUENT_EMI_STATUSES.includes(row.status) ? row.emiAmount : 0;
        map.set(key, current);
        return map;
      }, new Map()).values()
    ).slice(-8),
  });
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
    tierDecisionLogs,
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
      SystemLog.find({
        action: 'tier.policy.updated.manager',
        'metadata.updatedById': req.user._id,
      })
        .sort({ createdAt: -1 })
        .limit(50),
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
      failureReason: transaction.failureReason || '',
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
      createdAt: log.createdAt,
      metadata: log.metadata || {},
    })),
    tierDecisionHistory: tierDecisionLogs.map((log) => ({
      id: log._id,
      action: log.action,
      message: log.message,
      tierName: log.metadata?.tierName || log.entityId,
      tierLabel: log.metadata?.tierLabel || log.entityId,
      customerCount: log.metadata?.customerCount || 0,
      changes: log.metadata?.changes || [],
      severity: log.severity,
      createdAt: log.createdAt,
      time: log.createdAt ? new Date(log.createdAt).toLocaleString() : 'Recently',
    })),
  });
};

module.exports = {
  getAdminActivity,
  getAdminLoanAnalytics,
  getAdminLogs,
  getManagerDashboard,
};
