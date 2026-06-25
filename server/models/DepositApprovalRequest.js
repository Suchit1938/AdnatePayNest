const mongoose = require('mongoose');

const depositApprovalRequestSchema = new mongoose.Schema(
  {
    requestId: {
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
      default: '',
    },
    productType: {
      type: String,
      enum: ['fd', 'rd'],
      required: true,
    },
    actionType: {
      type: String,
      enum: ['create', 'premature_withdrawal'],
      required: true,
    },
    depositRef: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'depositModel',
      default: null,
    },
    depositModel: {
      type: String,
      enum: ['FixedDeposit', 'RecurringDeposit'],
      default: null,
    },
    depositNumber: {
      type: String,
      trim: true,
      default: '',
    },
    linkedAccountNumber: {
      type: String,
      trim: true,
      default: '',
    },
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    calculation: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
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
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

depositApprovalRequestSchema.index({
  customer: 1,
  productType: 1,
  actionType: 1,
  status: 1,
});

module.exports = mongoose.model('DepositApprovalRequest', depositApprovalRequestSchema);
