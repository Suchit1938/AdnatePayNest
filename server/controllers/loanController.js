const mongoose = require('mongoose');

const BankAccount = require('../models/BankAccount');
const Loan = require('../models/Loan');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { getBusinessRuleConfig } = require('./businessRuleController');
const {
  buildAmortizationSchedule,
  calculateEligibility,
  calculateEmi,
} = require('../utils/loanCalculator');
const { getLoanTypeRule, normalizeLoanRules } = require('../utils/loanRules');
const { syncCustomerAccounts } = require('../utils/customerAccounts');
const { sendEmail } = require('../utils/email');
const { writeSystemLog } = require('../utils/systemLog');

const toNumber = (value) => Number(value || 0);
const money = (value) => `INR ${Math.round(toNumber(value)).toLocaleString('en-IN')}`;
const MISSED_EMI_FIXED_PENALTY = 500;
const MISSED_EMI_PENALTY_RATE = 0.02;
const FORECLOSURE_FEE_RATE = 0.02;

const calculateMissedEmiPenalty = (emiAmount) =>
  Math.round(Math.max(MISSED_EMI_FIXED_PENALTY, toNumber(emiAmount) * MISSED_EMI_PENALTY_RATE));

const calculateForeclosureFee = (outstandingPrincipal) =>
  Math.round(Math.max(0, toNumber(outstandingPrincipal) * FORECLOSURE_FEE_RATE));

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const buildReducedTenureSchedule = ({
  principal,
  annualInterestRate,
  emiAmount,
  startDate = new Date(),
  startingEmiNumber = 1,
}) => {
  const rows = [];
  const monthlyRate = toNumber(annualInterestRate) / 12 / 100;
  const emi = Math.max(1, Math.round(toNumber(emiAmount)));
  let outstanding = Math.max(0, Math.round(toNumber(principal)));
  let index = 0;

  while (outstanding > 0 && index < 600) {
    const interestComponent = Math.round(outstanding * monthlyRate);
    const principalComponent = Math.min(outstanding, Math.max(1, emi - interestComponent));
    const rowAmount = principalComponent + interestComponent;

    outstanding = Math.max(0, outstanding - principalComponent);
    rows.push({
      emiNumber: startingEmiNumber + index,
      dueDate: addMonths(startDate, index + 1),
      emiAmount: rowAmount,
      principalComponent,
      interestComponent,
      outstandingBalance: outstanding,
      status: 'pending',
    });
    index += 1;
  }

  return rows;
};

const getLoanOutstandingPrincipal = (loan) => {
  const paidPrincipal = (loan.repaymentHistory || []).reduce(
    (sum, entry) => sum + toNumber(entry.status === 'success' ? entry.principalPaid : 0),
    0
  );
  const calculatedPrincipal = Math.max(0, Math.round(toNumber(loan.amount) - paidPrincipal));
  const storedPrincipal = Math.max(0, Math.round(toNumber(loan.outstandingPrincipal)));

  if (loan.status === 'closed') return 0;

  if (
    loan.outstandingPrincipal !== undefined &&
    loan.outstandingPrincipal !== null &&
    (storedPrincipal > 0 || paidPrincipal > 0)
  ) {
    return storedPrincipal;
  }

  return calculatedPrincipal;
};

const getLastLoanPaymentDate = (loan) => {
  const paidDates = (loan.repaymentHistory || [])
    .filter((entry) => entry.status === 'success' && entry.paidAt)
    .map((entry) => new Date(entry.paidAt).getTime())
    .filter(Number.isFinite);

  if (paidDates.length > 0) return new Date(Math.max(...paidDates));
  return loan.lastInterestCalculatedAt || loan.disbursedAt || loan.createdAt || new Date();
};

const calculateAccruedInterest = (loan, now = new Date()) => {
  const outstandingPrincipal = getLoanOutstandingPrincipal(loan);
  const annualRate = toNumber(loan.annualInterestRate) / 100;
  const anchor = getLastLoanPaymentDate(loan);
  const days = Math.max(0, Math.floor((now.getTime() - new Date(anchor).getTime()) / 86400000));

  if (outstandingPrincipal <= 0 || annualRate <= 0 || days <= 0) return 0;
  return Math.round(outstandingPrincipal * annualRate * (days / 365));
};

const getTotalAccruedInterest = (loan, now = new Date()) =>
  Math.max(0, Math.round(toNumber(loan.accruedInterest) + calculateAccruedInterest(loan, now)));

const buildForeclosureQuote = (loan, now = new Date()) => {
  const outstandingPrincipal = getLoanOutstandingPrincipal(loan);
  const accruedInterest = getTotalAccruedInterest(loan, now);
  const unpaidPenalties = Math.max(0, Math.round(toNumber(loan.accruedPenalty)));
  const foreclosureFee = calculateForeclosureFee(outstandingPrincipal);

  return {
    outstandingPrincipal,
    accruedInterest,
    unpaidPenalties,
    foreclosureFee,
    totalPayable: outstandingPrincipal + accruedInterest + unpaidPenalties + foreclosureFee,
  };
};

const appendRepaymentHistory = (loan, entry) => {
  loan.repaymentHistory = [
    ...(loan.repaymentHistory || []),
    {
      ...entry,
      paidAt: entry.paidAt || new Date(),
    },
  ];
};

const sendLoanEmail = async ({ customer, subject, text, html }) => {
  if (!customer?.email) return;
  await sendEmail({ to: customer.email, subject, text, html });
};

const getRecommendation = (score, decisionBands) => {
  if (score >= decisionBands.highlyEligible) return 'Highly eligible';
  if (score >= decisionBands.eligible) return 'Eligible';
  if (score >= decisionBands.review) return 'Manager review recommended';
  return 'Not recommended';
};

const makeLoanId = () =>
  `LN-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;

const getCustomerId = (loan) => loan.customer?.customerId || '';

const buildEligibilitySnapshot = (loan, loanRules, bankAccounts = []) => {
  const classification = String(
    loan.customerClassification || loan.customer?.classification || ''
  ).toLowerCase();
  const typeRule = getLoanTypeRule(loanRules, loan.loanType);
  const classificationBenefit = loanRules.classificationBenefits[classification] || {
    classificationScoreRatio: 0.4,
    interestDiscount: 0,
    maxAmountMultiplier: 1,
  };
  const effectiveMaxAmount = Math.round(
    Number(typeRule?.maxAmount || loan.amount || 0) *
      Number(classificationBenefit.maxAmountMultiplier || 1)
  );
  const eligibility = calculateEligibility({
    customer: loan.customer,
    bankAccounts,
    monthlyIncome: loan.monthlyIncome,
    existingMonthlyLiabilities: loan.existingMonthlyLiabilities,
    employmentDurationMonths: loan.employmentDurationMonths,
    loanAmount: loan.amount,
    emi: loan.emiAmount,
    weights: loanRules.scoreWeights,
    classificationBenefits: loanRules.classificationBenefits,
  });

  return {
    score: eligibility.totalScore,
    recommendation: getRecommendation(eligibility.totalScore, loanRules.decisionBands),
    details: {
      ...eligibility,
      scoreWeights: loanRules.scoreWeights,
      classificationBenefit: {
        classification,
        baseInterestRate: typeRule?.annualInterestRate ?? loan.annualInterestRate,
        effectiveInterestRate: loan.annualInterestRate,
        interestDiscount: Number(classificationBenefit.interestDiscount || 0),
        maxAmount: effectiveMaxAmount,
        maxAmountMultiplier: Number(classificationBenefit.maxAmountMultiplier || 1),
      },
    },
  };
};

const shouldRefreshEligibility = (loan) =>
  ['submitted', 'under_review'].includes(loan.status);

const refreshLoanEligibility = async (loan, loanRules, bankAccounts = []) => {
  if (!shouldRefreshEligibility(loan)) return loan;

  const snapshot = buildEligibilitySnapshot(loan, loanRules, bankAccounts);
  const currentScores = loan.eligibilityDetails?.componentScores || {};
  const nextScores = snapshot.details.componentScores || {};
  const hasChanged =
    Number(loan.eligibilityScore || 0) !== snapshot.score ||
    loan.eligibilityRecommendation !== snapshot.recommendation ||
    JSON.stringify(currentScores) !== JSON.stringify(nextScores) ||
    Number(loan.eligibilityDetails?.highestOdUsesThisMonth || 0) !==
      Number(snapshot.details.highestOdUsesThisMonth || 0) ||
    Number(loan.eligibilityDetails?.odBlockedAccounts || 0) !==
      Number(snapshot.details.odBlockedAccounts || 0);

  if (!hasChanged) return loan;

  loan.eligibilityScore = snapshot.score;
  loan.eligibilityRecommendation = snapshot.recommendation;
  loan.eligibilityDetails = snapshot.details;
  await loan.save();

  return loan;
};

const serializeLoan = (loan) => ({
  id: loan.loanId,
  customerId: loan.customer?._id || loan.customer,
  customerName: loan.customer?.name,
  customerCode: loan.customer?.customerId,
  customerClassification: loan.customerClassification,
  loanType: loan.loanType,
  loanTypeLabel: loan.loanTypeLabel,
  purpose: loan.purpose,
  supportingDetails: loan.supportingDetails || {},
  amount: loan.amount,
  tenureMonths: loan.tenureMonths,
  annualInterestRate: loan.annualInterestRate,
  monthlyIncome: loan.monthlyIncome,
  existingMonthlyLiabilities: loan.existingMonthlyLiabilities,
  employmentType: loan.employmentType,
  employmentDurationMonths: loan.employmentDurationMonths,
  disbursementAccountNumber: loan.disbursementAccountNumber,
  disbursementAccountType: loan.disbursementAccountType,
  emiAmount: loan.emiAmount,
  totalInterest: loan.totalInterest,
  totalRepayment: loan.totalRepayment,
  outstandingPrincipal: getLoanOutstandingPrincipal(loan),
  accruedInterest: getTotalAccruedInterest(loan),
  accruedPenalty: loan.accruedPenalty || 0,
  foreclosureFee: calculateForeclosureFee(getLoanOutstandingPrincipal(loan)),
  foreclosureQuote: buildForeclosureQuote(loan),
  repaymentHistory: loan.repaymentHistory || [],
  eligibilityScore: loan.eligibilityScore,
  eligibilityRecommendation: loan.eligibilityRecommendation,
  eligibilityDetails: loan.eligibilityDetails || {},
  status: loan.status,
  additionalInfoRequested: loan.additionalInfoRequested,
  managerNote: loan.managerNote,
  rejectionReason: loan.rejectionReason,
  reviewedBy: loan.reviewedBy?.name,
  reviewedAt: loan.reviewedAt,
  disbursedAt: loan.disbursedAt,
  closedAt: loan.closedAt,
  createdAt: loan.createdAt,
  updatedAt: loan.updatedAt,
  amortizationSchedule: loan.amortizationSchedule || [],
  documents: (loan.documents || []).map((document) => ({
    id: document._id,
    documentType: document.documentType,
    fileName: document.fileName,
    mimeType: document.mimeType,
    size: document.size,
    fileUrl: document.fileUrl,
    filePath: document.filePath,
    storedFileName: document.storedFileName,
    dataUrl: document.dataUrl,
    reviewStatus: document.reviewStatus,
    managerNote: document.managerNote,
    reviewedBy: document.reviewedBy?.name,
    reviewedAt: document.reviewedAt,
    uploadedAt: document.uploadedAt,
  })),
});

const getLoans = async (req, res) => {
  const filter = req.user.role === 'customer' ? { customer: req.user._id } : {};
  const loans = await Loan.find(filter)
    .populate('customer', 'name customerId classification accounts account')
    .populate('reviewedBy', 'name')
    .sort({ createdAt: -1 });
  const config = await getBusinessRuleConfig();
  const loanRules = normalizeLoanRules(config.loanRules);
  const customerIds = [
    ...new Set(loans.map(getCustomerId).filter(Boolean)),
  ];
  const bankAccounts = customerIds.length
    ? await BankAccount.find({
      customerId: { $in: customerIds },
      accountStatus: 'active',
    })
    : [];
  const bankAccountsByCustomerId = bankAccounts.reduce((map, account) => {
    const rows = map.get(account.customerId) || [];

    rows.push(account);
    map.set(account.customerId, rows);

    return map;
  }, new Map());
  const refreshedLoans = await Promise.all(
    loans.map((loan) =>
      refreshLoanEligibility(
        loan,
        loanRules,
        bankAccountsByCustomerId.get(getCustomerId(loan)) || []
      )
    )
  );

  res.json({
    loans: refreshedLoans.map(serializeLoan),
    loanRules,
  });
};

const createLoan = async (req, res) => {
  const customer = await User.findById(req.user._id);

  if (!customer || customer.role !== 'customer') {
    return res.status(403).json({ message: 'Only customers can submit loan applications' });
  }

  const config = await getBusinessRuleConfig();
  const loanRules = normalizeLoanRules(config.loanRules);
  const loanType = String(req.body.loanType || '').trim();
  const typeRule = getLoanTypeRule(loanRules, loanType);

  if (!typeRule || typeRule.key !== loanType) {
    return res.status(400).json({ message: 'Select a valid loan type' });
  }

  const classification = String(customer.classification || '').toLowerCase();
  const classificationBenefit = loanRules.classificationBenefits[classification] || {
    classificationScoreRatio: 0.4,
    interestDiscount: 0,
    maxAmountMultiplier: 1,
  };
  const effectiveInterestRate = Math.max(
    0,
    Number(typeRule.annualInterestRate || 0) - Number(classificationBenefit.interestDiscount || 0)
  );
  const effectiveMaxAmount = Math.round(
    Number(typeRule.maxAmount || 0) * Number(classificationBenefit.maxAmountMultiplier || 1)
  );
  const amount = toNumber(req.body.amount);
  const tenureMonths = Math.round(toNumber(req.body.tenureMonths));
  const monthlyIncome = toNumber(req.body.monthlyIncome);
  const existingMonthlyLiabilities = toNumber(req.body.existingMonthlyLiabilities);
  const employmentDurationMonths = Math.round(toNumber(req.body.employmentDurationMonths));
  const employmentType = String(req.body.employmentType || '').trim();
  const accounts = customer.accounts?.length ? customer.accounts : [customer.account].filter(Boolean);
  const requestedDisbursementAccount = String(req.body.disbursementAccountNumber || '').trim();
  const disbursementAccount =
    accounts.find((account) => account.accountNumber === requestedDisbursementAccount) ||
    accounts[0];

  if (!disbursementAccount?.accountNumber) {
    return res.status(400).json({ message: 'Select a valid account for loan disbursement' });
  }

  if (amount < typeRule.minAmount || amount > effectiveMaxAmount) {
    return res.status(400).json({
      message: `${typeRule.label} amount must be between ${money(typeRule.minAmount)} and ${money(effectiveMaxAmount)} for ${customer.classification || 'customer'} classification`,
    });
  }

  if (tenureMonths < typeRule.minTenureMonths || tenureMonths > typeRule.maxTenureMonths) {
    return res.status(400).json({
      message: `${typeRule.label} tenure must be between ${typeRule.minTenureMonths} and ${typeRule.maxTenureMonths} months`,
    });
  }

  if (monthlyIncome <= 0) {
    return res.status(400).json({ message: 'Monthly income is required' });
  }

  if (existingMonthlyLiabilities < 0) {
    return res.status(400).json({ message: 'Existing monthly liabilities cannot be negative' });
  }

  const minimumEmploymentDurationByType = {
    salaried: 6,
    'self-employed': 12,
    business: 12,
  };
  const requiredEmploymentDuration = minimumEmploymentDurationByType[employmentType] || 0;

  if (requiredEmploymentDuration > 0 && employmentDurationMonths <= 0) {
    return res.status(400).json({
      message: 'Employment duration is required for this employment type',
    });
  }

  if (requiredEmploymentDuration > 0 && employmentDurationMonths < requiredEmploymentDuration) {
    return res.status(400).json({
      message: `Minimum employment duration is ${requiredEmploymentDuration} months`,
    });
  }

  let documentTypes = [];
  let supportingDetails = {};

  try {
    documentTypes = JSON.parse(req.body.documentTypes || '[]');
  } catch {
    documentTypes = [];
  }

  try {
    supportingDetails = JSON.parse(req.body.supportingDetails || '{}');
  } catch {
    supportingDetails = {};
  }

  if (!documentTypes.includes('Bank Statement')) {
    return res.status(400).json({ message: 'Bank Statement is required for loan review' });
  }

  if (
    employmentType === 'student' &&
    !documentTypes.includes('Co-applicant Income Proof')
  ) {
    return res.status(400).json({
      message: 'Co-applicant income proof is required when employment type is student',
    });
  }

  const purpose = String(req.body.purpose || '').trim();

  if (purpose.length < 20) {
    return res.status(400).json({ message: 'Purpose must be at least 20 characters' });
  }

  if (
    loanType === 'education' &&
    supportingDetails.admissionStatus &&
    !['Confirmed', 'Provisional', 'Awaiting Result'].includes(supportingDetails.admissionStatus)
  ) {
    return res.status(400).json({ message: 'Select a valid admission status' });
  }

  const emiAmount = calculateEmi({
    principal: amount,
    annualInterestRate: effectiveInterestRate,
    tenureMonths,
  });

  if (emiAmount > monthlyIncome * 0.5) {
    return res.status(400).json({
      message: 'EMI is above 50% of monthly income. Reduce amount or increase tenure.',
    });
  }

  if (existingMonthlyLiabilities + emiAmount > monthlyIncome * 0.6) {
    return res.status(400).json({
      message: 'Existing liabilities plus EMI should stay within 60% of monthly income.',
    });
  }

  const documents = (req.files || []).map((file, index) => {
    const documentType =
      String(documentTypes[index] || '').trim() || `Document ${index + 1}`;
    const relativeUrl = `/uploads/loan-documents/${file.filename}`;

    return {
      documentType,
      fileName: file.originalname,
      storedFileName: file.filename,
      mimeType: file.mimetype,
      size: file.size,
      filePath: file.path,
      fileUrl: relativeUrl,
    };
  });

  const totalRepayment = emiAmount * tenureMonths;
  const totalInterest = Math.max(0, totalRepayment - amount);
  const bankAccounts = customer.customerId
    ? await BankAccount.find({
      customerId: customer.customerId,
      accountStatus: 'active',
    })
    : [];
  const eligibility = calculateEligibility({
    customer,
    bankAccounts,
    monthlyIncome,
    existingMonthlyLiabilities,
    employmentDurationMonths,
    loanAmount: amount,
    emi: emiAmount,
    weights: loanRules.scoreWeights,
    classificationBenefits: loanRules.classificationBenefits,
  });

  const loan = await Loan.create({
    loanId: makeLoanId(),
    customer: customer._id,
    loanType,
    loanTypeLabel: typeRule.label,
    purpose,
    supportingDetails,
    amount,
    tenureMonths,
    annualInterestRate: effectiveInterestRate,
    monthlyIncome,
    existingMonthlyLiabilities,
    employmentType,
    employmentDurationMonths,
    customerClassification: customer.classification,
    disbursementAccountNumber: disbursementAccount.accountNumber,
    disbursementAccountType: disbursementAccount.accountType || '',
    emiAmount,
    totalInterest,
    totalRepayment,
    outstandingPrincipal: amount,
    accruedInterest: 0,
    accruedPenalty: 0,
    foreclosureFee: 0,
    eligibilityScore: eligibility.totalScore,
    eligibilityRecommendation: getRecommendation(eligibility.totalScore, loanRules.decisionBands),
    eligibilityDetails: {
      ...eligibility,
      scoreWeights: loanRules.scoreWeights,
      classificationBenefit: {
        classification,
        baseInterestRate: typeRule.annualInterestRate,
        effectiveInterestRate,
        interestDiscount: Number(classificationBenefit.interestDiscount || 0),
        maxAmount: effectiveMaxAmount,
        maxAmountMultiplier: Number(classificationBenefit.maxAmountMultiplier || 1),
      },
    },
    amortizationSchedule: buildAmortizationSchedule({
      principal: amount,
      annualInterestRate: effectiveInterestRate,
      tenureMonths,
    }),
    documents,
  });

  await writeSystemLog({
    action: 'loan.submitted',
    message: `${customer.name} submitted ${typeRule.label} application ${loan.loanId} for ${money(amount)}.`,
    actor: customer._id,
    actorName: customer.name,
    entityType: 'Loan',
    entityId: loan.loanId,
    severity: 'info',
    metadata: {
      loanId: loan.loanId,
      amount,
      loanType,
      eligibilityScore: eligibility.totalScore,
    },
  });

  const responseLoan = await Loan.findById(loan._id).populate('customer', 'name customerId');

  res.status(201).json({
    message: 'Loan application submitted to manager review.',
    loan: serializeLoan(responseLoan),
  });
};

const reviewLoan = async (req, res) => {
  const action = String(req.body.action || '').trim();
  const note = String(req.body.note || '').trim();

  if (!['approve', 'reject', 'request_info'].includes(action)) {
    return res.status(400).json({ message: 'Select a valid loan review action' });
  }

  if (['reject', 'request_info'].includes(action) && !note) {
    return res.status(400).json({ message: 'Manager note is required for this action' });
  }

  const loan = await Loan.findOne({ loanId: req.params.id }).populate(
    'customer',
    'name customerId classification accounts account'
  );

  if (!loan) return res.status(404).json({ message: 'Loan application not found' });
  if (!['submitted', 'under_review'].includes(loan.status)) {
    return res.status(400).json({ message: 'Only submitted or under-review loans can be reviewed' });
  }

  const config = await getBusinessRuleConfig();
  const loanRules = normalizeLoanRules(config.loanRules);
  const bankAccounts = loan.customer?.customerId
    ? await BankAccount.find({
      customerId: loan.customer.customerId,
      accountStatus: 'active',
    })
    : [];

  await refreshLoanEligibility(loan, loanRules, bankAccounts);

  loan.status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'under_review';
  loan.assignedManager = req.user._id;
  loan.reviewedBy = req.user._id;
  loan.reviewedAt = new Date();
  loan.additionalInfoRequested = action === 'request_info';
  loan.managerNote = note;
  loan.rejectionReason = action === 'reject' ? note : '';
  await loan.save();

  await writeSystemLog({
    action: `loan.${action}`,
    message: `${req.user.name} ${action.replace('_', ' ')} for loan ${loan.loanId}.`,
    actor: req.user._id,
    actorName: req.user.name,
    entityType: 'Loan',
    entityId: loan.loanId,
    severity: action === 'approve' ? 'success' : action === 'reject' ? 'danger' : 'warning',
    metadata: {
      loanId: loan.loanId,
      amount: loan.amount,
      customerName: loan.customer?.name,
      note,
    },
  });

  if (loan.customer?._id) {
    await writeSystemLog({
      action:
        action === 'approve'
          ? 'loan.approved.customer'
          : action === 'reject'
            ? 'loan.rejected.customer'
            : 'loan.info_requested.customer',
      message:
        action === 'approve'
          ? `Your ${loan.loanTypeLabel} application ${loan.loanId} was approved by ${req.user.name}.`
          : action === 'reject'
            ? `Your ${loan.loanTypeLabel} application ${loan.loanId} was rejected. Reason: ${note}`
            : `Manager requested more information for loan ${loan.loanId}: ${note}`,
      actor: loan.customer._id,
      actorName: loan.customer.name,
      entityType: 'Loan',
      entityId: loan.loanId,
      severity: action === 'approve' ? 'success' : action === 'reject' ? 'danger' : 'warning',
      metadata: {
        loanId: loan.loanId,
        amount: loan.amount,
        reviewedBy: req.user.name,
        note,
      },
    });
  }

  const responseLoan = await Loan.findById(loan._id)
    .populate('customer', 'name customerId')
    .populate('reviewedBy', 'name');

  res.json({
    message:
      action === 'approve'
        ? 'Loan application approved.'
        : action === 'reject'
          ? 'Loan application rejected.'
          : 'Additional information requested.',
    loan: serializeLoan(responseLoan),
  });
};

const reviewLoanDocument = async (req, res) => {
  const reviewStatus = String(req.body.reviewStatus || '').trim();
  const managerNote = String(req.body.managerNote || '').trim();

  if (!['pending', 'verified', 'mismatch', 'rejected', 'additional_info_required'].includes(reviewStatus)) {
    return res.status(400).json({ message: 'Select a valid document review status' });
  }

  if (['mismatch', 'rejected', 'additional_info_required'].includes(reviewStatus) && !managerNote) {
    return res.status(400).json({ message: 'Manager note is required for this document status' });
  }

  const loan = await Loan.findOne({ loanId: req.params.id })
    .populate('customer', 'name customerId')
    .populate('reviewedBy', 'name');

  if (!loan) return res.status(404).json({ message: 'Loan application not found' });

  const document = loan.documents.id(req.params.documentId);

  if (!document) {
    return res.status(404).json({ message: 'Loan document not found' });
  }

  document.reviewStatus = reviewStatus;
  document.managerNote = managerNote;
  document.reviewedBy = req.user._id;
  document.reviewedAt = new Date();
  loan.assignedManager = loan.assignedManager || req.user._id;
  if (loan.status === 'submitted') loan.status = 'under_review';
  await loan.save();

  await writeSystemLog({
    action: 'loan.document.reviewed',
    message: `${req.user.name} marked ${document.documentType} for loan ${loan.loanId} as ${reviewStatus.replaceAll('_', ' ')}.`,
    actor: req.user._id,
    actorName: req.user.name,
    entityType: 'Loan',
    entityId: loan.loanId,
    severity: reviewStatus === 'verified' ? 'success' : reviewStatus === 'pending' ? 'info' : 'warning',
    metadata: {
      loanId: loan.loanId,
      documentId: document._id,
      documentType: document.documentType,
      reviewStatus,
      managerNote,
    },
  });

  const responseLoan = await Loan.findById(loan._id)
    .populate('customer', 'name customerId')
    .populate('reviewedBy', 'name')
    .populate('documents.reviewedBy', 'name');

  res.json({
    message: 'Document review updated.',
    loan: serializeLoan(responseLoan),
  });
};

const attemptLoanEmiDeduction = async ({
  loan,
  customer,
  paymentAccount,
  emiNumber,
  paymentType = 'emi',
  markMissedOnFailure = false,
  session,
}) => {
  const emiRow = emiNumber
    ? loan.amortizationSchedule.find((row) => row.emiNumber === emiNumber)
    : loan.amortizationSchedule.find((row) => row.status !== 'paid' && row.status !== 'foreclosed');

  if (!emiRow) throw new Error('EMI installment not found');
  if (emiRow.status === 'paid') throw new Error('This EMI is already paid');

  const firstPendingEmi = loan.amortizationSchedule.find(
    (row) => row.status !== 'paid' && row.status !== 'foreclosed'
  );

  if (firstPendingEmi && firstPendingEmi.emiNumber !== emiRow.emiNumber) {
    throw new Error(`Please pay EMI ${firstPendingEmi.emiNumber} before later installments`);
  }

  const unpaidPenalty = Math.max(0, toNumber(emiRow.penaltyAmount) - toNumber(emiRow.penaltyPaid));
  const amountDue = Math.round(toNumber(emiRow.emiAmount) + unpaidPenalty);
  const currentBalance = toNumber(paymentAccount.walletBalance);

  emiRow.attemptCount = toNumber(emiRow.attemptCount) + 1;

  if (currentBalance < amountDue) {
    if (!markMissedOnFailure) {
      throw new Error('Insufficient balance to pay this EMI');
    }

    const penaltyAmount = toNumber(emiRow.penaltyAmount) || calculateMissedEmiPenalty(emiRow.emiAmount);

    emiRow.status = 'missed';
    emiRow.missedAt = emiRow.missedAt || new Date();
    emiRow.penaltyAmount = penaltyAmount;
    loan.accruedPenalty = Math.max(0, toNumber(loan.accruedPenalty) + Math.max(0, penaltyAmount - unpaidPenalty));

    const [transaction] = await Transaction.create(
      [
        {
          transactionId: `LNEMIFAIL${Date.now()}`,
          sender: customer._id,
          receiver: customer._id,
          senderName: customer.name,
          receiverName: customer.name,
          fromAccountNumber: paymentAccount.accountNumber,
          toAccountNumber: loan.loanId,
          amount: Math.max(1, amountDue),
          remarks: `Failed EMI ${emiRow.emiNumber} auto deduction for loan ${loan.loanId}`,
          status: 'failed',
          failureReason: 'Insufficient balance',
          type: 'loan-emi-payment',
        },
      ],
      { session }
    );

    appendRepaymentHistory(loan, {
      emiNumber: emiRow.emiNumber,
      paymentType: 'failed_emi',
      amount: amountDue,
      status: 'failed',
      transactionId: transaction.transactionId,
      accountNumber: paymentAccount.accountNumber,
      remarks: 'Insufficient balance. EMI marked missed and penalty initiated.',
    });

    await loan.save({ session });
    await writeSystemLog(
      {
        action: 'loan.emi.failed.customer',
        message: `EMI ${emiRow.emiNumber} for loan ${loan.loanId} failed because the repayment account had insufficient balance. Penalty added: ${money(penaltyAmount)}.`,
        actor: customer._id,
        actorName: customer.name,
        entityType: 'Loan',
        entityId: loan.loanId,
        severity: 'danger',
        metadata: {
          loanId: loan.loanId,
          emiNumber: emiRow.emiNumber,
          amount: amountDue,
          penaltyAmount,
          transactionId: transaction.transactionId,
          paymentAccountNumber: paymentAccount.accountNumber,
        },
      },
      { session }
    );

    await sendLoanEmail({
      customer,
      subject: `EMI payment failed for loan ${loan.loanId}`,
      text: `Your EMI ${emiRow.emiNumber} payment failed due to insufficient balance. Penalty added: ${money(penaltyAmount)}.`,
      html: `<p>Your EMI <strong>${emiRow.emiNumber}</strong> payment for loan <strong>${loan.loanId}</strong> failed due to insufficient balance.</p><p>Penalty added: <strong>${money(penaltyAmount)}</strong>.</p>`,
    });

    return { paid: false, emiRow, transaction, amountDue, penaltyAmount };
  }

  paymentAccount.walletBalance = currentBalance - amountDue;
  paymentAccount.availableBalance = paymentAccount.walletBalance;

  const principalPaid = Math.min(getLoanOutstandingPrincipal(loan), toNumber(emiRow.principalComponent));
  const interestPaid = toNumber(emiRow.interestComponent);
  const penaltyPaid = unpaidPenalty;

  emiRow.status = 'paid';
  emiRow.paidAt = new Date();
  emiRow.penaltyPaid = toNumber(emiRow.penaltyPaid) + penaltyPaid;

  loan.outstandingPrincipal = Math.max(0, getLoanOutstandingPrincipal(loan) - principalPaid);
  loan.accruedPenalty = Math.max(0, toNumber(loan.accruedPenalty) - penaltyPaid);
  loan.accruedInterest = 0;
  loan.lastInterestCalculatedAt = emiRow.paidAt;
  loan.foreclosureFee = calculateForeclosureFee(loan.outstandingPrincipal);

  const isFullyPaid = loan.amortizationSchedule.every((row) =>
    ['paid', 'foreclosed'].includes(row.status)
  );

  if (isFullyPaid || loan.outstandingPrincipal <= 0) {
    loan.status = 'closed';
    loan.closedAt = new Date();
    loan.outstandingPrincipal = 0;
  }

  await paymentAccount.save({ session });

  const [transaction] = await Transaction.create(
    [
      {
        transactionId: `LNEMI${Date.now()}`,
        sender: customer._id,
        receiver: customer._id,
        senderName: customer.name,
        receiverName: customer.name,
        fromAccountNumber: paymentAccount.accountNumber,
        toAccountNumber: loan.loanId,
        amount: amountDue,
        remarks: `EMI ${emiRow.emiNumber} payment for loan ${loan.loanId}`,
        status: 'success',
        type: 'loan-emi-payment',
      },
    ],
    { session }
  );

  appendRepaymentHistory(loan, {
    emiNumber: emiRow.emiNumber,
    paymentType,
    amount: amountDue,
    principalPaid,
    interestPaid,
    penaltyPaid,
    status: 'success',
    transactionId: transaction.transactionId,
    accountNumber: paymentAccount.accountNumber,
    remarks: `EMI ${emiRow.emiNumber} paid successfully.`,
  });

  await loan.save({ session });
  await writeSystemLog(
    {
      action: isFullyPaid ? 'loan.closed.customer' : 'loan.emi.paid',
      message: isFullyPaid
        ? `${customer.name} paid the final EMI and closed loan ${loan.loanId}.`
        : `${customer.name} paid EMI ${emiRow.emiNumber} for loan ${loan.loanId}.`,
      actor: customer._id,
      actorName: customer.name,
      entityType: 'Loan',
      entityId: loan.loanId,
      severity: 'success',
      metadata: {
        loanId: loan.loanId,
        transactionId: transaction.transactionId,
        emiNumber: emiRow.emiNumber,
        amount: amountDue,
        principalPaid,
        interestPaid,
        penaltyPaid,
        outstandingPrincipal: loan.outstandingPrincipal,
        status: loan.status,
        paymentAccountNumber: paymentAccount.accountNumber,
      },
    },
    { session }
  );

  await sendLoanEmail({
    customer,
    subject: `EMI paid for loan ${loan.loanId}`,
    text: `EMI ${emiRow.emiNumber} of ${money(amountDue)} was paid successfully. Outstanding principal: ${money(loan.outstandingPrincipal)}.`,
    html: `<p>EMI <strong>${emiRow.emiNumber}</strong> of <strong>${money(amountDue)}</strong> was paid successfully.</p><p>Outstanding principal: <strong>${money(loan.outstandingPrincipal)}</strong>.</p>`,
  });

  return { paid: true, emiRow, transaction, amountDue };
};

const disburseLoan = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findOne({ loanId: req.params.id }).session(session);

    if (!loan) throw new Error('Loan application not found');
    if (loan.status !== 'approved') throw new Error('Only approved loans can be disbursed');

    const customer = await User.findById(loan.customer).session(session);
    if (!customer) throw new Error('Customer not found');

    const accounts = customer.accounts?.length ? customer.accounts : [customer.account].filter(Boolean);
    const targetAccount =
      accounts.find((account) => account.accountNumber === loan.disbursementAccountNumber) ||
      accounts[0];

    if (!targetAccount?.accountNumber) {
      throw new Error('Customer does not have an active account for disbursement');
    }

    const bankAccount = await BankAccount.findOne({
      customerId: customer.customerId,
      accountNumber: targetAccount.accountNumber,
    }).session(session);

    if (bankAccount) {
      bankAccount.walletBalance = toNumber(bankAccount.walletBalance) + loan.amount;
      bankAccount.availableBalance = toNumber(bankAccount.availableBalance) + loan.amount;
      await bankAccount.save({ session });
    }

    if (customer.accounts?.length) {
      customer.accounts = customer.accounts.map((account) =>
        account.accountNumber === targetAccount.accountNumber
          ? { ...(account.toObject?.() || account), balance: toNumber(account.balance) + loan.amount }
          : account
      );
    }

    if (customer.account?.accountNumber === targetAccount.accountNumber) {
      customer.account.balance = toNumber(customer.account.balance) + loan.amount;
    }

    const disbursedAt = new Date();

    loan.status = 'disbursed';
    loan.disbursedAt = disbursedAt;
    loan.outstandingPrincipal = loan.amount;
    loan.accruedInterest = 0;
    loan.accruedPenalty = 0;
    loan.foreclosureFee = calculateForeclosureFee(loan.amount);
    loan.lastInterestCalculatedAt = disbursedAt;
    loan.amortizationSchedule = buildAmortizationSchedule({
      principal: loan.amount,
      annualInterestRate: loan.annualInterestRate,
      tenureMonths: loan.tenureMonths,
      startDate: disbursedAt,
    });
    loan.assignedManager = req.user._id;
    await customer.save({ session });
    await loan.save({ session });

    await writeSystemLog(
      {
        action: 'loan.disbursed',
        message: `${req.user.name} disbursed loan ${loan.loanId} for ${money(loan.amount)}.`,
        actor: req.user._id,
        actorName: req.user.name,
        entityType: 'Loan',
        entityId: loan.loanId,
        severity: 'success',
        metadata: {
          loanId: loan.loanId,
          amount: loan.amount,
          customerName: customer.name,
          accountNumber: targetAccount.accountNumber,
        },
      },
      { session }
    );

    await writeSystemLog(
      {
        action: 'loan.disbursed.customer',
        message: `${money(loan.amount)} was disbursed for loan ${loan.loanId} to your account.`,
        actor: customer._id,
        actorName: customer.name,
        entityType: 'Loan',
        entityId: loan.loanId,
        severity: 'success',
        metadata: {
          loanId: loan.loanId,
          amount: loan.amount,
          accountNumber: targetAccount.accountNumber,
        },
      },
      { session }
    );

    await session.commitTransaction();

    const responseLoan = await Loan.findById(loan._id)
      .populate('customer', 'name customerId')
      .populate('reviewedBy', 'name');

    res.json({
      message: 'Loan amount disbursed to customer account.',
      loan: serializeLoan(responseLoan),
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

const payLoanEmi = async (req, res) => {
  const emiNumber = Math.round(toNumber(req.params.emiNumber));
  const paymentAccountNumber = String(req.body.paymentAccountNumber || '').trim();
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findOne({ loanId: req.params.id }).session(session);

    if (!loan) throw new Error('Loan application not found');
    if (String(loan.customer) !== String(req.user._id)) {
      throw new Error('You can pay EMI only for your own loan');
    }
    if (loan.status !== 'disbursed') {
      throw new Error('EMI payment is available only after loan disbursal');
    }
    if (!emiNumber || emiNumber < 1) {
      throw new Error('Select a valid EMI number');
    }

    const customer = await User.findById(req.user._id).session(session);

    if (!customer || customer.role !== 'customer') {
      throw new Error('Customer not found');
    }

    const bankAccounts = await BankAccount.find({
      customerId: customer.customerId,
      accountStatus: 'active',
    }).session(session);
    const paymentAccount =
      (paymentAccountNumber
        ? bankAccounts.find((account) => account.accountNumber === paymentAccountNumber)
        : null) ||
      bankAccounts.find((account) => account.accountNumber === loan.disbursementAccountNumber) ||
      bankAccounts[0];

    if (!paymentAccount) throw new Error('Active payment account not found');

    const result = await attemptLoanEmiDeduction({
      loan,
      customer,
      paymentAccount,
      emiNumber,
      paymentType: 'emi',
      session,
    });

    await syncCustomerAccounts(customer, { session });
    await session.commitTransaction();

    const responseLoan = await Loan.findById(loan._id)
      .populate('customer', 'name customerId classification accounts account')
      .populate('reviewedBy', 'name');

    res.json({
      message: responseLoan.status === 'closed'
        ? 'Final EMI paid. Loan closed successfully.'
        : `EMI ${result.emiRow.emiNumber} paid successfully.`,
      loan: serializeLoan(responseLoan),
      transaction: result.transaction,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

const runDueEmiProcessing = async ({ now = new Date() } = {}) => {
  const dueLoans = await Loan.find({
    status: 'disbursed',
    amortizationSchedule: {
      $elemMatch: {
        status: { $in: ['pending', 'missed', 'overdue'] },
        dueDate: { $lte: now },
      },
    },
  }).populate('customer', 'name email customerId classification accounts account');
  const results = [];

  for (const loan of dueLoans) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const customer = await User.findById(loan.customer?._id || loan.customer).session(session);

      if (!customer) throw new Error('Customer not found');

      const dueEmi = loan.amortizationSchedule.find(
        (row) =>
          ['pending', 'missed', 'overdue'].includes(row.status) &&
          row.dueDate &&
          new Date(row.dueDate) <= now
      );

      if (!dueEmi) {
        await session.abortTransaction();
        continue;
      }

      const bankAccounts = await BankAccount.find({
        customerId: customer.customerId,
        accountStatus: 'active',
      }).session(session);
      const paymentAccount =
        bankAccounts.find((account) => account.accountNumber === loan.disbursementAccountNumber) ||
        bankAccounts[0];

      if (!paymentAccount) throw new Error('Active repayment account not found');

      const result = await attemptLoanEmiDeduction({
        loan,
        customer,
        paymentAccount,
        emiNumber: dueEmi.emiNumber,
        paymentType: 'auto_emi',
        markMissedOnFailure: true,
        session,
      });

      await syncCustomerAccounts(customer, { session });
      await session.commitTransaction();
      results.push({
        loanId: loan.loanId,
        emiNumber: dueEmi.emiNumber,
        status: result.paid ? 'paid' : 'missed',
        amount: result.amountDue,
      });
    } catch (error) {
      await session.abortTransaction();
      results.push({
        loanId: loan.loanId,
        status: 'failed',
        message: error.message,
      });
    } finally {
      session.endSession();
    }
  }

  return results;
};

const processDueEmis = async (req, res) => {
  const results = await runDueEmiProcessing();

  res.json({
    message: `Processed ${results.length} due EMI item(s).`,
    results,
  });
};

const forecloseLoan = async (req, res) => {
  const paymentAccountNumber = String(req.body.paymentAccountNumber || '').trim();
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findOne({ loanId: req.params.id }).session(session);

    if (!loan) throw new Error('Loan application not found');
    if (String(loan.customer) !== String(req.user._id)) {
      throw new Error('You can foreclose only your own loan');
    }
    if (loan.status !== 'disbursed') {
      throw new Error('Foreclosure is available only after loan disbursal');
    }

    const customer = await User.findById(req.user._id).session(session);
    if (!customer) throw new Error('Customer not found');

    const bankAccounts = await BankAccount.find({
      customerId: customer.customerId,
      accountStatus: 'active',
    }).session(session);
    const paymentAccount =
      (paymentAccountNumber
        ? bankAccounts.find((account) => account.accountNumber === paymentAccountNumber)
        : null) ||
      bankAccounts.find((account) => account.accountNumber === loan.disbursementAccountNumber) ||
      bankAccounts[0];

    if (!paymentAccount) throw new Error('Active payment account not found');

    const quote = buildForeclosureQuote(loan);
    if (quote.totalPayable <= 0) throw new Error('No foreclosure amount is due');
    if (toNumber(paymentAccount.walletBalance) < quote.totalPayable) {
      throw new Error('Insufficient balance to foreclose this loan');
    }

    paymentAccount.walletBalance = toNumber(paymentAccount.walletBalance) - quote.totalPayable;
    paymentAccount.availableBalance = paymentAccount.walletBalance;
    await paymentAccount.save({ session });

    const [transaction] = await Transaction.create(
      [
        {
          transactionId: `LNFORE${Date.now()}`,
          sender: customer._id,
          receiver: customer._id,
          senderName: customer.name,
          receiverName: customer.name,
          fromAccountNumber: paymentAccount.accountNumber,
          toAccountNumber: loan.loanId,
          amount: quote.totalPayable,
          remarks: `Foreclosure payment for loan ${loan.loanId}`,
          status: 'success',
          type: 'loan-foreclosure',
        },
      ],
      { session }
    );

    loan.amortizationSchedule = loan.amortizationSchedule.map((row) =>
      row.status === 'paid' ? row : { ...(row.toObject?.() || row), status: 'foreclosed' }
    );
    loan.outstandingPrincipal = 0;
    loan.accruedInterest = 0;
    loan.accruedPenalty = 0;
    loan.foreclosureFee = quote.foreclosureFee;
    loan.lastInterestCalculatedAt = new Date();
    loan.status = 'closed';
    loan.closedAt = new Date();
    appendRepaymentHistory(loan, {
      paymentType: 'foreclosure',
      amount: quote.totalPayable,
      principalPaid: quote.outstandingPrincipal,
      interestPaid: quote.accruedInterest,
      penaltyPaid: quote.unpaidPenalties,
      foreclosureFeePaid: quote.foreclosureFee,
      status: 'success',
      transactionId: transaction.transactionId,
      accountNumber: paymentAccount.accountNumber,
      remarks: 'Loan foreclosed by customer.',
    });
    await loan.save({ session });

    await writeSystemLog(
      {
        action: 'loan.foreclosed.customer',
        message: `${customer.name} foreclosed loan ${loan.loanId} by paying ${money(quote.totalPayable)}.`,
        actor: customer._id,
        actorName: customer.name,
        entityType: 'Loan',
        entityId: loan.loanId,
        severity: 'success',
        metadata: {
          loanId: loan.loanId,
          transactionId: transaction.transactionId,
          amount: quote.totalPayable,
          ...quote,
        },
      },
      { session }
    );

    await sendLoanEmail({
      customer,
      subject: `Loan ${loan.loanId} foreclosed`,
      text: `Your loan was foreclosed. Total paid: ${money(quote.totalPayable)}.`,
      html: `<p>Your loan <strong>${loan.loanId}</strong> was foreclosed.</p><p>Total paid: <strong>${money(quote.totalPayable)}</strong>.</p>`,
    });

    await syncCustomerAccounts(customer, { session });
    await session.commitTransaction();

    const responseLoan = await Loan.findById(loan._id)
      .populate('customer', 'name customerId classification accounts account')
      .populate('reviewedBy', 'name');

    res.json({
      message: 'Loan foreclosed successfully.',
      loan: serializeLoan(responseLoan),
      transaction,
      quote,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

const makePartPayment = async (req, res) => {
  const paymentAccountNumber = String(req.body.paymentAccountNumber || '').trim();
  const amount = Math.round(toNumber(req.body.amount));
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findOne({ loanId: req.params.id }).session(session);

    if (!loan) throw new Error('Loan application not found');
    if (String(loan.customer) !== String(req.user._id)) {
      throw new Error('You can make part-payments only for your own loan');
    }
    if (loan.status !== 'disbursed') {
      throw new Error('Part-payment is available only after loan disbursal');
    }
    if (amount <= 0) throw new Error('Enter a valid part-payment amount');

    const outstandingPrincipal = getLoanOutstandingPrincipal(loan);
    if (amount >= outstandingPrincipal) {
      throw new Error('Use foreclosure to clear the full outstanding principal');
    }

    const customer = await User.findById(req.user._id).session(session);
    if (!customer) throw new Error('Customer not found');

    const bankAccounts = await BankAccount.find({
      customerId: customer.customerId,
      accountStatus: 'active',
    }).session(session);
    const paymentAccount =
      (paymentAccountNumber
        ? bankAccounts.find((account) => account.accountNumber === paymentAccountNumber)
        : null) ||
      bankAccounts.find((account) => account.accountNumber === loan.disbursementAccountNumber) ||
      bankAccounts[0];

    if (!paymentAccount) throw new Error('Active payment account not found');
    if (toNumber(paymentAccount.walletBalance) < amount) {
      throw new Error('Insufficient balance for this part-payment');
    }

    paymentAccount.walletBalance = toNumber(paymentAccount.walletBalance) - amount;
    paymentAccount.availableBalance = paymentAccount.walletBalance;
    await paymentAccount.save({ session });

    const [transaction] = await Transaction.create(
      [
        {
          transactionId: `LNPART${Date.now()}`,
          sender: customer._id,
          receiver: customer._id,
          senderName: customer.name,
          receiverName: customer.name,
          fromAccountNumber: paymentAccount.accountNumber,
          toAccountNumber: loan.loanId,
          amount,
          remarks: `Part-payment for loan ${loan.loanId}`,
          status: 'success',
          type: 'loan-part-payment',
        },
      ],
      { session }
    );

    const paidRows = loan.amortizationSchedule.filter((row) => row.status === 'paid');
    const nextDueDate =
      loan.amortizationSchedule.find((row) => row.status !== 'paid')?.dueDate || new Date();
    const nextOutstandingPrincipal = Math.max(0, outstandingPrincipal - amount);
    const rebuiltRows = buildReducedTenureSchedule({
      principal: nextOutstandingPrincipal,
      annualInterestRate: loan.annualInterestRate,
      emiAmount: loan.emiAmount,
      startDate: addMonths(nextDueDate, -1),
      startingEmiNumber: paidRows.length + 1,
    });

    loan.outstandingPrincipal = nextOutstandingPrincipal;
    loan.foreclosureFee = calculateForeclosureFee(nextOutstandingPrincipal);
    loan.accruedInterest = getTotalAccruedInterest(loan);
    loan.lastInterestCalculatedAt = new Date();
    loan.amortizationSchedule = [
      ...paidRows.map((row) => row.toObject?.() || row),
      ...rebuiltRows,
    ];
    appendRepaymentHistory(loan, {
      paymentType: 'part_payment',
      amount,
      principalPaid: amount,
      status: 'success',
      transactionId: transaction.transactionId,
      accountNumber: paymentAccount.accountNumber,
      remarks: 'Part-payment reduced outstanding principal and future tenure.',
    });
    await loan.save({ session });

    await writeSystemLog(
      {
        action: 'loan.part_payment.customer',
        message: `${customer.name} made a part-payment of ${money(amount)} for loan ${loan.loanId}.`,
        actor: customer._id,
        actorName: customer.name,
        entityType: 'Loan',
        entityId: loan.loanId,
        severity: 'success',
        metadata: {
          loanId: loan.loanId,
          transactionId: transaction.transactionId,
          amount,
          outstandingPrincipal: nextOutstandingPrincipal,
        },
      },
      { session }
    );

    await sendLoanEmail({
      customer,
      subject: `Part-payment posted for loan ${loan.loanId}`,
      text: `Your part-payment of ${money(amount)} was posted. Outstanding principal: ${money(nextOutstandingPrincipal)}.`,
      html: `<p>Your part-payment of <strong>${money(amount)}</strong> was posted for loan <strong>${loan.loanId}</strong>.</p><p>Outstanding principal: <strong>${money(nextOutstandingPrincipal)}</strong>.</p>`,
    });

    await syncCustomerAccounts(customer, { session });
    await session.commitTransaction();

    const responseLoan = await Loan.findById(loan._id)
      .populate('customer', 'name customerId classification accounts account')
      .populate('reviewedBy', 'name');

    res.json({
      message: 'Part-payment posted successfully. Future schedule has been recalculated.',
      loan: serializeLoan(responseLoan),
      transaction,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

module.exports = {
  createLoan,
  disburseLoan,
  forecloseLoan,
  getLoans,
  makePartPayment,
  payLoanEmi,
  processDueEmis,
  runDueEmiProcessing,
  reviewLoanDocument,
  reviewLoan,
};
