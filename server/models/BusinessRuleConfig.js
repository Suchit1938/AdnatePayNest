const mongoose = require('mongoose');

const managerTierPermissionsSchema = new mongoose.Schema(
  {
    perTxnLimit: {
      type: Boolean,
      default: false,
    },
    dailyLimit: {
      type: Boolean,
      default: false,
    },
    monthlyLimit: {
      type: Boolean,
      default: false,
    },
    accountTypeOdRules: {
      type: Boolean,
      default: false,
    },
    penaltyAmount: {
      type: Boolean,
      default: false,
    },
    interestRate: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const loanTypeRuleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    annualInterestRate: {
      type: Number,
      default: 10,
      min: 0,
    },
    minAmount: {
      type: Number,
      default: 10000,
      min: 0,
    },
    maxAmount: {
      type: Number,
      default: 500000,
      min: 0,
    },
    minTenureMonths: {
      type: Number,
      default: 6,
      min: 1,
    },
    maxTenureMonths: {
      type: Number,
      default: 60,
      min: 1,
    },
  },
  { _id: false }
);

const loanScoreWeightsSchema = new mongoose.Schema(
  {
    incomeStrength: {
      type: Number,
      default: 20,
      min: 0,
    },
    liabilities: {
      type: Number,
      default: 30,
      min: 0,
    },
    classification: {
      type: Number,
      default: 20,
      min: 0,
    },
    employmentStability: {
      type: Number,
      default: 15,
      min: 0,
    },
    accountHistory: {
      type: Number,
      default: 10,
      min: 0,
    },
    overdraftUsage: {
      type: Number,
      default: 5,
      min: 0,
    },
  },
  { _id: false }
);

const loanDecisionBandsSchema = new mongoose.Schema(
  {
    highlyEligible: {
      type: Number,
      default: 80,
      min: 0,
      max: 100,
    },
    eligible: {
      type: Number,
      default: 65,
      min: 0,
      max: 100,
    },
    review: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },
  },
  { _id: false }
);

const classificationLoanBenefitSchema = new mongoose.Schema(
  {
    classificationScoreRatio: {
      type: Number,
      default: 0.5,
      min: 0,
      max: 1,
    },
    interestDiscount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxAmountMultiplier: {
      type: Number,
      default: 1,
      min: 0.1,
    },
  },
  { _id: false }
);

const classificationBenefitsSchema = new mongoose.Schema(
  {
    silver: {
      type: classificationLoanBenefitSchema,
      default: () => ({}),
    },
    gold: {
      type: classificationLoanBenefitSchema,
      default: () => ({
        classificationScoreRatio: 0.75,
        interestDiscount: 0.5,
        maxAmountMultiplier: 1.25,
      }),
    },
    platinum: {
      type: classificationLoanBenefitSchema,
      default: () => ({
        classificationScoreRatio: 1,
        interestDiscount: 1,
        maxAmountMultiplier: 1.5,
      }),
    },
  },
  { _id: false }
);

const partPaymentPolicySchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: true,
    },
    minimumAmount: {
      type: Number,
      default: 1000,
      min: 0,
    },
    minimumPrincipalPercentage: {
      type: Number,
      default: 1,
      min: 0,
      max: 100,
    },
    lockInMonths: {
      type: Number,
      default: 0,
      min: 0,
    },
    chargePercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  { _id: false }
);

const businessRuleConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'global',
      unique: true,
      immutable: true,
    },
    managerTierPermissions: {
      type: managerTierPermissionsSchema,
      default: () => ({}),
    },
    loanRules: {
      loanTypes: {
        type: [loanTypeRuleSchema],
        default: undefined,
      },
      scoreWeights: {
        type: loanScoreWeightsSchema,
        default: () => ({}),
      },
      decisionBands: {
        type: loanDecisionBandsSchema,
        default: () => ({}),
      },
      classificationBenefits: {
        type: classificationBenefitsSchema,
        default: () => ({}),
      },
      partPaymentPolicy: {
        type: partPaymentPolicySchema,
        default: () => ({}),
      },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedByName: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BusinessRuleConfig', businessRuleConfigSchema);
