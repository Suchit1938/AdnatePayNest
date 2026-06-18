const mongoose = require('mongoose');

const accountTypes = ['Savings', 'Current', 'Salary'];

const bankAccountSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      required: true,
      trim: true,
    },
    panNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    accountNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    accountType: {
      type: String,
      enum: accountTypes,
      required: true,
    },
    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    availableBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    transferLimit: {
      type: Number,
      default: 0,
      min: 0,
    },
    withdrawalLimit: {
      type: Number,
      default: 0,
      min: 0,
    },
    accountOpenedAt: Date,
    accountStatus: {
      type: String,
      enum: ['active', 'inactive', 'blocked'],
      default: 'active',
    },
    odLimit: {
      type: Number,
      default: 0,
      min: 0,
    },
    odUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    odStartedAt: {
      type: Date,
      default: null,
    },
    odDrawdowns: {
      type: [
        {
          amount: {
            type: Number,
            required: true,
            min: 0,
          },
          usedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },
    odCountThisMonth: {
      type: Number,
      default: 0,
      min: 0,
    },
    odCountMonthKey: {
      type: String,
      trim: true,
      default: '',
    },
    odBlocked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

bankAccountSchema.index({ customerId: 1, accountType: 1 }, { unique: true });
bankAccountSchema.index({ panNumber: 1 });

module.exports = mongoose.model('BankAccount', bankAccountSchema);
