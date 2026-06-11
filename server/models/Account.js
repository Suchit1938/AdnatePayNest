const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    accountNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    ifsc: {
      type: String,
      required: true,
      trim: true,
    },
    bankName: {
      type: String,
      default: 'Adnate Bank',
    },
    accountType: {
      type: String,
      default: 'Savings',
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Account', accountSchema);
