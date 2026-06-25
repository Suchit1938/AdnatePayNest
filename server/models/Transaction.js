const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    senderType: {
      type: String,
      enum: ['customer', 'bank', 'system'],
      default: 'customer',
    },
    receiverType: {
      type: String,
      enum: ['customer', 'bank', 'system'],
      default: 'customer',
    },
    senderName: {
      type: String,
      required: true,
    },
    receiverName: {
      type: String,
      required: true,
    },
    fromAccountNumber: {
      type: String,
      trim: true,
    },
    toAccountNumber: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    principalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    feeAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['success', 'pending', 'failed'],
      default: 'success',
    },
    failureReason: {
      type: String,
      trim: true,
      default: '',
    },
    type: {
      type: String,
      default: 'bank-transfer',
    },
    category: {
      type: String,
      default: 'transfer',
      trim: true,
    },
    direction: {
      type: String,
      enum: ['debit', 'credit', 'internal'],
      default: 'debit',
    },
    businessRefType: {
      type: String,
      trim: true,
      default: '',
    },
    businessRefId: {
      type: String,
      trim: true,
      default: '',
    },
    displayTitle: {
      type: String,
      trim: true,
      default: '',
    },
    displaySubtitle: {
      type: String,
      trim: true,
      default: '',
    },
    idempotencyKey: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

transactionSchema.index(
  { sender: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string', $gt: '' } },
  }
);

module.exports = mongoose.model('Transaction', transactionSchema);
