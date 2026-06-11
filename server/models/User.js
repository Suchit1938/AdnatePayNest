const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
  {
    accountNumber: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    bankName: {
      type: String,
      default: 'Adnate Bank',
    },
    ifsc: {
      type: String,
      trim: true,
    },
    accountType: {
      type: String,
      default: 'Savings',
    },
    accountStatus: {
      type: String,
      enum: ['active', 'inactive', 'blocked'],
      default: 'active',
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    overdraftLimit: {
      type: Number,
      default: 0,
      min: 0,
    },
    transferLimit: {
      type: Number,
      default: 0,
      min: 0,
    },
    overdraftUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    odCountThisMonth: {
      type: Number,
      default: 0,
      min: 0,
    },
    odBlocked: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ['customer', 'manager', 'admin'],
      default: 'customer',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
    },
    customerId: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    employeeId: String,
    branch: String,
    phone: {
      type: String,
      trim: true,
    },
    accountType: String,
    panNumber: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      unique: true,
    },
    aadhaarNumber: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    assignedRegion: String,
    branchId: String,
    branchName: String,
    dob: Date,
    address: String,
    isVerified: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    managerLevel: String,
    createdBy: String,
    classification: {
      type: String,
      trim: true,
      lowercase: true,
    },
    pendingRequests: {
      type: Number,
      default: 0,
    },
    totalTransfers: {
      type: Number,
      default: 0,
    },
    account: accountSchema,
    accounts: {
      type: [accountSchema],
      default: [],
    },
    savedBeneficiaries: {
      type: [
        {
          beneficiaryUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
          },
          accountNumber: {
            type: String,
            required: true,
            trim: true,
          },
          accountType: {
            type: String,
            trim: true,
          },
        },
      ],
      default: [],
    },
    permissions: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
