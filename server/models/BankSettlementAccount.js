const mongoose = require('mongoose');

const bankSettlementAccountSchema = new mongoose.Schema(
  {
    accountNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    accountName: {
      type: String,
      required: true,
      trim: true,
    },
    balance: {
      type: Number,
      required: true,
      min: 0,
    },
    openingBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    minimumReserve: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BankSettlementAccount', bankSettlementAccountSchema);
