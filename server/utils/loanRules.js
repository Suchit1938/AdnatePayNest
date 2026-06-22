const DEFAULT_LOAN_TYPE_RULES = [
  {
    key: 'personal',
    label: 'Personal Loan',
    annualInterestRate: 12,
    minAmount: 10000,
    maxAmount: 500000,
    minTenureMonths: 6,
    maxTenureMonths: 60,
  },
  {
    key: 'home',
    label: 'Home Loan',
    annualInterestRate: 8.5,
    minAmount: 100000,
    maxAmount: 10000000,
    minTenureMonths: 12,
    maxTenureMonths: 240,
  },
  {
    key: 'vehicle',
    label: 'Vehicle Loan',
    annualInterestRate: 10,
    minAmount: 50000,
    maxAmount: 2000000,
    minTenureMonths: 6,
    maxTenureMonths: 84,
  },
  {
    key: 'education',
    label: 'Education Loan',
    annualInterestRate: 9,
    minAmount: 25000,
    maxAmount: 4000000,
    minTenureMonths: 12,
    maxTenureMonths: 120,
  },
];

const DEFAULT_LOAN_SCORE_WEIGHTS = {
  incomeStrength: 20,
  liabilities: 30,
  classification: 20,
  employmentStability: 15,
  accountHistory: 10,
  overdraftUsage: 5,
};

const DEFAULT_LOAN_DECISION_BANDS = {
  highlyEligible: 80,
  eligible: 65,
  review: 50,
};

const DEFAULT_CLASSIFICATION_BENEFITS = {
  silver: {
    classificationScoreRatio: 0.5,
    interestDiscount: 0,
    maxAmountMultiplier: 1,
  },
  gold: {
    classificationScoreRatio: 0.75,
    interestDiscount: 0.5,
    maxAmountMultiplier: 1.25,
  },
  platinum: {
    classificationScoreRatio: 1,
    interestDiscount: 1,
    maxAmountMultiplier: 1.5,
  },
};

const DEFAULT_PART_PAYMENT_POLICY = {
  enabled: true,
  minimumAmount: 1000,
  minimumPrincipalPercentage: 1,
  lockInMonths: 0,
  chargePercentage: 0,
};

const normalizeLoanRules = (loanRules = {}) => ({
  loanTypes:
    Array.isArray(loanRules.loanTypes) && loanRules.loanTypes.length
      ? loanRules.loanTypes
      : DEFAULT_LOAN_TYPE_RULES,
  scoreWeights: {
    ...DEFAULT_LOAN_SCORE_WEIGHTS,
    ...(loanRules.scoreWeights?.toObject?.() || loanRules.scoreWeights || {}),
  },
  decisionBands: {
    ...DEFAULT_LOAN_DECISION_BANDS,
    ...(loanRules.decisionBands?.toObject?.() || loanRules.decisionBands || {}),
  },
  classificationBenefits: {
    ...DEFAULT_CLASSIFICATION_BENEFITS,
    ...(loanRules.classificationBenefits?.toObject?.() || loanRules.classificationBenefits || {}),
  },
  partPaymentPolicy: {
    ...DEFAULT_PART_PAYMENT_POLICY,
    ...(loanRules.partPaymentPolicy?.toObject?.() || loanRules.partPaymentPolicy || {}),
  },
});

const getLoanTypeRule = (loanRules, loanType) => {
  const normalized = normalizeLoanRules(loanRules);
  return (
    normalized.loanTypes.find((rule) => rule.key === loanType) ||
    normalized.loanTypes[0]
  );
};

module.exports = {
  DEFAULT_CLASSIFICATION_BENEFITS,
  DEFAULT_LOAN_DECISION_BANDS,
  DEFAULT_LOAN_SCORE_WEIGHTS,
  DEFAULT_LOAN_TYPE_RULES,
  DEFAULT_PART_PAYMENT_POLICY,
  getLoanTypeRule,
  normalizeLoanRules,
};
