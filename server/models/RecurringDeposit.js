const mongoose = require('mongoose');

const rdInstallmentSchema = new mongoose.Schema(
  {
    installmentNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['paid', 'missed'],
      required: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    paidAt: Date,
    penaltyAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    transactionId: {
      type: String,
      trim: true,
    },
    remarks: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const recurringDepositSchema = new mongoose.Schema(
  {
    rdNumber: {
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
    linkedAccountNumber: {
      type: String,
      trim: true,
    },
    monthlyInstallmentAmount: {
      type: Number,
      required: true,
      min: 500,
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
    totalInvestment: {
      type: Number,
      required: true,
      min: 0,
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
    accumulatedValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    installmentsPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    missedInstallments: {
      type: Number,
      default: 0,
      min: 0,
    },
    penaltyAccrued: {
      type: Number,
      default: 0,
      min: 0,
    },
    installments: {
      type: [rdInstallmentSchema],
      default: [],
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
      ref: 'RecurringDeposit',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RecurringDeposit', recurringDepositSchema);
