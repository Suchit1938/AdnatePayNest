const mongoose = require('mongoose');

const accountTypeOdRuleSchema = new mongoose.Schema(
  {
    accountType: {
      type: String,
      enum: ['Savings', 'Current', 'Salary'],
      required: true,
    },
    odLimit: {
      type: Number,
      default: 0,
      min: 0,
    },
    minOpeningBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const tierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    perTxnLimit: {
      type: Number,
      required: true,
      min: 0,
    },
    dailyLimit: {
      type: Number,
      required: true,
      min: 0,
    },
    monthlyLimit: {
      type: Number,
      required: true,
      min: 0,
    },
    maxODLimit: {
      type: Number,
      required: true,
      min: 0,
    },
    minBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    penaltyAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lateFeeRate: {
      type: String,
      default: '',
      trim: true,
    },
    eligibility: {
      type: String,
      default: '',
      trim: true,
    },
    reviewNotes: {
      type: String,
      default: '',
      trim: true,
    },
    accountTypeOdRules: {
      type: [accountTypeOdRuleSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Tier', tierSchema);
