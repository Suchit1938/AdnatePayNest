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
