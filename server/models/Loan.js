const mongoose = require('mongoose');

const amortizationRowSchema = new mongoose.Schema(
  {
    emiNumber: Number,
    dueDate: Date,
    emiAmount: Number,
    principalComponent: Number,
    interestComponent: Number,
    outstandingBalance: Number,
    status: {
      type: String,
      enum: ['pending', 'paid', 'missed', 'overdue', 'part_paid', 'foreclosed'],
      default: 'pending',
    },
    paidAt: Date,
    missedAt: Date,
    penaltyAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    penaltyPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const repaymentHistorySchema = new mongoose.Schema(
  {
    emiNumber: Number,
    paymentType: {
      type: String,
      enum: ['emi', 'auto_emi', 'part_payment', 'foreclosure', 'failed_emi'],
      required: true,
    },
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    principalPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    interestPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    penaltyPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    foreclosureFeePaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['success', 'failed'],
      default: 'success',
    },
    transactionId: {
      type: String,
      trim: true,
      default: '',
    },
    idempotencyKey: {
      type: String,
      trim: true,
      default: '',
    },
    accountNumber: {
      type: String,
      trim: true,
      default: '',
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    repaymentImpact: {
      type: String,
      enum: ['reduce_emi', 'reduce_tenure'],
    },
    previousEmiAmount: {
      type: Number,
      min: 0,
    },
    revisedEmiAmount: {
      type: Number,
      min: 0,
    },
    previousRemainingTenure: {
      type: Number,
      min: 0,
    },
    revisedRemainingTenure: {
      type: Number,
      min: 0,
    },
    projectedInterestSaved: {
      type: Number,
      min: 0,
    },
    partPaymentCharge: {
      type: Number,
      min: 0,
    },
    totalDebited: {
      type: Number,
      min: 0,
    },
    policySnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    receiptFileName: {
      type: String,
      trim: true,
      default: '',
    },
    receiptFileUrl: {
      type: String,
      trim: true,
      default: '',
    },
    receiptFilePath: {
      type: String,
      trim: true,
      default: '',
    },
    receiptGeneratedAt: Date,
    paidAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const loanDocumentSchema = new mongoose.Schema(
  {
    documentType: {
      type: String,
      required: true,
      trim: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      trim: true,
      default: '',
    },
    size: {
      type: Number,
      default: 0,
      min: 0,
    },
    fileUrl: {
      type: String,
      trim: true,
      default: '',
    },
    filePath: {
      type: String,
      trim: true,
      default: '',
    },
    storedFileName: {
      type: String,
      trim: true,
      default: '',
    },
    dataUrl: {
      type: String,
      default: '',
    },
    reviewStatus: {
      type: String,
      enum: ['pending', 'verified', 'mismatch', 'rejected', 'additional_info_required'],
      default: 'pending',
    },
    managerNote: {
      type: String,
      trim: true,
      default: '',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: Date,
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  }
);

const sanctionLetterSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'generated', 'sent', 'accepted'],
      default: 'pending',
    },
    fileName: {
      type: String,
      trim: true,
      default: '',
    },
    fileUrl: {
      type: String,
      trim: true,
      default: '',
    },
    filePath: {
      type: String,
      trim: true,
      default: '',
    },
    generatedAt: Date,
    sentAt: Date,
    acceptedAt: Date,
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    emailStatus: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false }
);

const loanAgreementSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'generated', 'sent', 'accepted'],
      default: 'pending',
    },
    fileName: {
      type: String,
      trim: true,
      default: '',
    },
    fileUrl: {
      type: String,
      trim: true,
      default: '',
    },
    filePath: {
      type: String,
      trim: true,
      default: '',
    },
    generatedAt: Date,
    sentAt: Date,
    acceptedAt: Date,
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    emailStatus: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false }
);

const repaymentScheduleDocumentSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'generated', 'sent'],
      default: 'pending',
    },
    fileName: {
      type: String,
      trim: true,
      default: '',
    },
    fileUrl: {
      type: String,
      trim: true,
      default: '',
    },
    filePath: {
      type: String,
      trim: true,
      default: '',
    },
    generatedAt: Date,
    sentAt: Date,
    emailStatus: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false }
);

const loanSchema = new mongoose.Schema(
  {
    loanId: {
      type: String,
      required: true,
      unique: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    loanType: {
      type: String,
      enum: ['personal', 'home', 'vehicle', 'education'],
      required: true,
    },
    loanTypeLabel: {
      type: String,
      trim: true,
    },
    purpose: {
      type: String,
      trim: true,
      default: '',
    },
    supportingDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    tenureMonths: {
      type: Number,
      required: true,
      min: 1,
    },
    annualInterestRate: {
      type: Number,
      required: true,
      min: 0,
    },
    monthlyIncome: {
      type: Number,
      required: true,
      min: 0,
    },
    existingMonthlyLiabilities: {
      type: Number,
      default: 0,
      min: 0,
    },
    employmentType: {
      type: String,
      trim: true,
      default: '',
    },
    employmentDurationMonths: {
      type: Number,
      default: 0,
      min: 0,
    },
    customerClassification: {
      type: String,
      trim: true,
      lowercase: true,
    },
    disbursementAccountNumber: {
      type: String,
      trim: true,
      default: '',
    },
    disbursementAccountType: {
      type: String,
      trim: true,
      default: '',
    },
    emiAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    totalInterest: {
      type: Number,
      required: true,
      min: 0,
    },
    totalRepayment: {
      type: Number,
      required: true,
      min: 0,
    },
    outstandingPrincipal: {
      type: Number,
      default: 0,
      min: 0,
    },
    accruedInterest: {
      type: Number,
      default: 0,
      min: 0,
    },
    accruedPenalty: {
      type: Number,
      default: 0,
      min: 0,
    },
    foreclosureFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastInterestCalculatedAt: Date,
    eligibilityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    eligibilityRecommendation: {
      type: String,
      trim: true,
    },
    eligibilityDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    applicationAcknowledgements: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['submitted', 'under_review', 'approved', 'rejected', 'disbursed', 'closed'],
      default: 'submitted',
    },
    additionalInfoRequested: {
      type: Boolean,
      default: false,
    },
    managerNote: {
      type: String,
      trim: true,
      default: '',
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: Date,
    disbursedAt: Date,
    closedAt: Date,
    sanctionLetter: {
      type: sanctionLetterSchema,
      default: () => ({ status: 'pending' }),
    },
    loanAgreement: {
      type: loanAgreementSchema,
      default: () => ({ status: 'pending' }),
    },
    repaymentScheduleDocument: {
      type: repaymentScheduleDocumentSchema,
      default: () => ({ status: 'pending' }),
    },
    amortizationSchedule: {
      type: [amortizationRowSchema],
      default: [],
    },
    repaymentHistory: {
      type: [repaymentHistorySchema],
      default: [],
    },
    documents: {
      type: [loanDocumentSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Loan', loanSchema);
