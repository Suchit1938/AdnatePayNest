const toNumber = (value) => Number(value || 0);
const roundMoney = (value) => Math.round(toNumber(value));
const MONTHLY_OD_USE_LIMIT = 3;

const calculateEmi = ({ principal, annualInterestRate, tenureMonths }) => {
  const amount = toNumber(principal);
  const months = Math.max(1, Math.round(toNumber(tenureMonths)));
  const monthlyRate = toNumber(annualInterestRate) / 12 / 100;

  if (amount <= 0) return 0;
  if (monthlyRate <= 0) return roundMoney(amount / months);

  const factor = (1 + monthlyRate) ** months;
  return roundMoney((amount * monthlyRate * factor) / (factor - 1));
};

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const buildAmortizationSchedule = ({
  principal,
  annualInterestRate,
  tenureMonths,
  startDate = new Date(),
}) => {
  const amount = roundMoney(principal);
  const months = Math.max(1, Math.round(toNumber(tenureMonths)));
  const monthlyRate = toNumber(annualInterestRate) / 12 / 100;
  const emi = calculateEmi({ principal: amount, annualInterestRate, tenureMonths: months });
  let outstanding = amount;

  return Array.from({ length: months }, (_, index) => {
    const interestComponent = index === months - 1
      ? Math.max(0, emi - outstanding)
      : roundMoney(outstanding * monthlyRate);
    const principalComponent = index === months - 1
      ? outstanding
      : Math.min(outstanding, Math.max(0, emi - interestComponent));

    outstanding = Math.max(0, outstanding - principalComponent);

    return {
      emiNumber: index + 1,
      dueDate: addMonths(startDate, index + 1),
      emiAmount: index === months - 1 ? principalComponent + interestComponent : emi,
      principalComponent,
      interestComponent,
      outstandingBalance: outstanding,
      status: 'pending',
    };
  });
};

const scoreByBands = (value, bands) => {
  for (const band of bands) {
    if (band.test(value)) return band.ratio;
  }
  return 0;
};

const getCurrentMonthKey = () => new Date().toISOString().slice(0, 7);

const getAccountOdLimit = (account) =>
  toNumber(account?.odLimit ?? account?.overdraftLimit);

const getAccountOdUsed = (account) =>
  toNumber(account?.odUsed ?? account?.overdraftUsed);

const getCurrentMonthOdCount = (account) => {
  if (account?.odCountMonthKey && account.odCountMonthKey !== getCurrentMonthKey()) {
    return 0;
  }

  return Math.max(0, Math.round(toNumber(account?.odCountThisMonth)));
};

const getOdFrequencyRatio = (accounts) => {
  if (!accounts.length) return 0.6;

  const highestOdUsesThisMonth = accounts.reduce(
    (maxUses, account) => Math.max(maxUses, getCurrentMonthOdCount(account)),
    0
  );
  const hasBlockedAccount = accounts.some((account) => {
    if (account?.odCountMonthKey && account.odCountMonthKey !== getCurrentMonthKey()) {
      return false;
    }

    return Boolean(account?.odBlocked);
  });

  if (hasBlockedAccount || highestOdUsesThisMonth >= MONTHLY_OD_USE_LIMIT) return 0.2;
  if (highestOdUsesThisMonth === 2) return 0.6;
  if (highestOdUsesThisMonth === 1) return 0.85;
  return 1;
};

const calculateEligibility = ({
  customer,
  bankAccounts,
  monthlyIncome,
  existingMonthlyLiabilities,
  employmentDurationMonths,
  loanAmount,
  emi,
  weights,
  classificationBenefits,
}) => {
  const income = toNumber(monthlyIncome);
  const liabilities = toNumber(existingMonthlyLiabilities);
  const amount = toNumber(loanAmount);
  const totalObligation = liabilities + toNumber(emi);
  const foir = income > 0 ? (totalObligation / income) * 100 : 100;
  const incomeRatio = income > 0 ? amount / income : Number.POSITIVE_INFINITY;
  const accounts = bankAccounts?.length
    ? bankAccounts
    : customer?.accounts?.length
      ? customer.accounts
      : [customer?.account].filter(Boolean);
  const totalOdLimit = accounts.reduce((sum, account) => sum + getAccountOdLimit(account), 0);
  const totalOdUsed = accounts.reduce((sum, account) => sum + getAccountOdUsed(account), 0);
  const odUsage = totalOdLimit > 0 ? (totalOdUsed / totalOdLimit) * 100 : null;
  const odUtilizationRatio =
    odUsage === null
      ? 0.6
      : scoreByBands(odUsage, [
        { test: (ratio) => ratio <= 30, ratio: 1 },
        { test: (ratio) => ratio <= 60, ratio: 0.6 },
        { test: () => true, ratio: 0.2 },
      ]);
  const odFrequencyRatio = getOdFrequencyRatio(accounts);
  const odScoreRatio = Math.min(odUtilizationRatio, odFrequencyRatio);
  const highestOdUsesThisMonth = accounts.reduce(
    (maxUses, account) => Math.max(maxUses, getCurrentMonthOdCount(account)),
    0
  );
  const odBlockedAccounts = accounts.filter((account) => {
    if (account?.odCountMonthKey && account.odCountMonthKey !== getCurrentMonthKey()) {
      return false;
    }

    return Boolean(account?.odBlocked);
  }).length;
  const accountAgeMonths = customer?.createdAt
    ? Math.max(0, Math.floor((Date.now() - new Date(customer.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000)))
    : 0;
  const classification = String(customer?.classification || '').toLowerCase();
  const classificationBenefit = classificationBenefits?.[classification] || {
    classificationScoreRatio: 0.4,
  };

  const componentScores = {
    incomeStrength: Math.round(
      weights.incomeStrength *
        scoreByBands(incomeRatio, [
          { test: (ratio) => ratio <= 12, ratio: 1 },
          { test: (ratio) => ratio <= 24, ratio: 0.75 },
          { test: (ratio) => ratio <= 36, ratio: 0.5 },
          { test: (ratio) => ratio <= 48, ratio: 0.25 },
        ])
    ),
    liabilities: Math.round(
      weights.liabilities *
        scoreByBands(foir, [
          { test: (ratio) => ratio < 35, ratio: 1 },
          { test: (ratio) => ratio <= 45, ratio: 0.8 },
          { test: (ratio) => ratio <= 55, ratio: 0.53 },
          { test: (ratio) => ratio <= 65, ratio: 0.27 },
        ])
    ),
    classification: Math.round(
      weights.classification * toNumber(classificationBenefit.classificationScoreRatio || 0.4)
    ),
    employmentStability: Math.round(
      weights.employmentStability *
        scoreByBands(toNumber(employmentDurationMonths), [
          { test: (months) => months >= 36, ratio: 1 },
          { test: (months) => months >= 12, ratio: 0.67 },
          { test: (months) => months >= 6, ratio: 0.33 },
        ])
    ),
    accountHistory: Math.round(
      weights.accountHistory *
        scoreByBands(accountAgeMonths, [
          { test: (months) => months >= 24, ratio: 1 },
          { test: (months) => months >= 12, ratio: 0.7 },
          { test: (months) => months >= 3, ratio: 0.5 },
          { test: () => true, ratio: 0.5 },
        ])
    ),
    overdraftUsage: Math.round(
      weights.overdraftUsage * odScoreRatio
    ),
  };

  const totalScore = Object.values(componentScores).reduce((sum, value) => sum + value, 0);

  return {
    totalScore: Math.max(0, Math.min(100, totalScore)),
    componentScores,
    foir: Number.isFinite(foir) ? Number(foir.toFixed(2)) : 100,
    odUsage: odUsage === null ? null : Number(odUsage.toFixed(2)),
    odUtilizationRatio: Number(odUtilizationRatio.toFixed(2)),
    odFrequencyRatio: Number(odFrequencyRatio.toFixed(2)),
    highestOdUsesThisMonth,
    monthlyOdUseLimit: MONTHLY_OD_USE_LIMIT,
    odBlockedAccounts,
    accountAgeMonths,
  };
};

module.exports = {
  buildAmortizationSchedule,
  calculateEligibility,
  calculateEmi,
};
