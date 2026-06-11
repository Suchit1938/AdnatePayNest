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
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
    type: {
      type: String,
      default: 'bank-transfer',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transaction', transactionSchema);
