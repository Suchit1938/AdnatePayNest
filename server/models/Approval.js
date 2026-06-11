const mongoose = require('mongoose');

const approvalSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
    },
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    risk: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low',
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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Approval', approvalSchema);
