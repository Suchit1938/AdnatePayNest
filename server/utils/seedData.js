const bcrypt = require('bcryptjs');

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const seedTiers = require('./seedTiers');

const DEFAULT_BANK_IFSC = process.env.BANK_IFSC || 'ADNT0281237';
const DEFAULT_BRANCH_NAME = process.env.BANK_BRANCH_NAME || 'Jaipur';
const DEFAULT_ASSIGNED_REGION = process.env.BANK_REGION || 'Jaipur';

const systemUsers = [
  {
    name: 'Suchit Gupta',
    email: 'suchitgupta66@gmail.com',
    password: 'admin123',
    role: 'admin',
    employeeId: 'ADMIN001',
    permissions: [
      'manage-users',
      'manage-transactions',
      'manage-managers',
      'view-analytics',
      'system-control',
    ],
  },
  {
    name: 'Vikram Joshi',
    email: 'manager1@gmail.com',
    password: '123456',
    role: 'manager',
    employeeId: 'MGR9001',
    branch: DEFAULT_BRANCH_NAME,
    branchId: DEFAULT_BANK_IFSC,
    branchName: DEFAULT_BRANCH_NAME,
    assignedRegion: DEFAULT_ASSIGNED_REGION,
    managerLevel: 'level-3',
  },
];

const legacyDemoCustomerEmails = [
  'rahul@gmail.com',
  'priya@gmail.com',
  'amit@gmail.com',
  'sneha@gmail.com',
  'karan@gmail.com',
  'ananya@gmail.com',
];
const legacyAdminEmail = 'suchitguta66@gmail.com';

const seedDatabase = async () => {
  await seedTiers();

  const legacyCustomers = await User.find({
    role: 'customer',
    email: { $in: legacyDemoCustomerEmails },
  }).select('_id');

  if (legacyCustomers.length > 0) {
    const legacyCustomerIds = legacyCustomers.map((user) => user._id);

    await Transaction.deleteMany({
      $or: [{ sender: { $in: legacyCustomerIds } }, { receiver: { $in: legacyCustomerIds } }],
    });
    await User.deleteMany({ _id: { $in: legacyCustomerIds } });
  }

  const existingAdmin = await User.findOne({ email: systemUsers[0].email }).select('_id');

  if (!existingAdmin) {
    await User.updateOne(
      { email: legacyAdminEmail },
      { $set: { email: systemUsers[0].email } }
    );
  }

  await Promise.all(
    systemUsers.map(async (user) => {
      const password = await bcrypt.hash(user.password, 10);
      const { password: _plainPassword, ...profile } = user;

      await User.updateOne(
        { email: user.email },
        {
          $set: {
            ...profile,
            password,
            status: 'active',
          },
        },
        { upsert: true }
      );
    })
  );

  console.log('Seeded MongoDB with admin and default manager');
};

module.exports = seedDatabase;
