const bcrypt = require('bcryptjs');

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Approval = require('../models/Approval');
const seedTiers = require('./seedTiers');

const systemUsers = [
  {
    name: 'Suchit Gupta',
    email: 'suchitguta66@gmail.com',
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
    branch: 'Mumbai Main Branch',
    managerLevel: 'level-3',
  },
];

const primaryManagerEmail = 'manager1@gmail.com';

const legacyDemoCustomerEmails = [
  'rahul@gmail.com',
  'priya@gmail.com',
  'amit@gmail.com',
  'sneha@gmail.com',
  'karan@gmail.com',
  'ananya@gmail.com',
];

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

  await User.deleteMany({
    role: 'manager',
    email: { $ne: primaryManagerEmail },
  });

  await Promise.all(
    systemUsers.map(async (user) => {
      const password = await bcrypt.hash(user.password, 10);
      const { password: _plainPassword, ...profile } = user;

      await User.updateOne(
        { email: user.email },
        {
          $set: profile,
          $setOnInsert: {
            password,
            status: 'active',
          },
        },
        { upsert: true }
      );
    })
  );

  const primaryManager = await User.findOne({ email: primaryManagerEmail, role: 'manager' });

  if (primaryManager) {
    await Approval.updateMany(
      { assignedManager: { $ne: primaryManager._id } },
      { $set: { assignedManager: primaryManager._id } }
    );
  }

  console.log('Seeded MongoDB with admin and one manager only');
};

module.exports = seedDatabase;
