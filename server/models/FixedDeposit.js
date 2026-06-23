const mongoose = require('mongoose');

const fixedDepositSchema = new mongoose.Schema(
  {
    fdNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerId: {
      type: String,
      trim: true,
    },
    bankName: {
      type: String,
      default: 'Adnate Bank',
      trim: true,
    },
    depositAmount: {
      type: Number,
      required: true,
      min: 1000,
    },
    interestRate: {
      type: Number,
      required: true,
      min: 0,
    },
    tenureMonths: {
      type: Number,
      required: true,
      min: 1,
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    maturityDate: {
      type: Date,
      required: true,
    },
    payoutType: {
      type: String,
      enum: ['on_maturity', 'monthly', 'quarterly', 'yearly'],
      default: 'on_maturity',
    },
    maturityAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    interestEarned: {
      type: Number,
      required: true,
      min: 0,
    },
    nomineeName: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'matured', 'closed', 'renewed'],
      default: 'active',
    },
    closedAt: {
      type: Date,
      default: null,
    },
    renewedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FixedDeposit',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FixedDeposit', fixedDepositSchema);
